import { CompanySector, prisma } from '@prisma/client';
import NodeCache from 'node-cache';
import { PrismaService } from '../prisma/prisma.service';

export class SectorCache {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cache: NodeCache,
  ) {
    this.snapshot();
  }

  // Criando um observer simples para carregar os setores a cada minuto.
  private snapshot() {
    setInterval(async () => {
      const sectors = await this.prismaService.companySector.findMany();
      this.cache.set(SectorCache.name, [...sectors]);
    }, 1000);
  }

  public async findMany() {
    // Recuperando todos os setores do cahce.
    let sectors = this.cache.get<CompanySector[]>(SectorCache.name) || [];
    if (sectors.length === 0) {
      // Buscando todos os setores onde existem atendentes vinculados.
      const findSectors = await this.prismaService.attendant.findMany({
        distinct: 'companySectorId',
        select: {
          CompanySector: true,
        },
      });
      sectors = findSectors.map(({ CompanySector }) => CompanySector);
      this.cache.set(SectorCache.name, [...sectors]);
    }

    return sectors;
  }
}
