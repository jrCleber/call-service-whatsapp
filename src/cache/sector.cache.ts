import { CompanySector } from '@prisma/client';
import NodeCache from 'node-cache';
import { PrismaService } from '../prisma/prisma.service';

export class SectorCache {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cache: NodeCache,
  ) {
    this.observer();
  }

  /**
   * criando um observer simples para carregar os setores a cada minuto
   */
  private observer() {
    setInterval(async () => {
      const sectors = await this.prismaService.companySector.findMany();
      this.cache.set(SectorCache.name, [...sectors]);
    }, 60000);
  }

  public async findMany() {
    // recuperando todos os setores do cahce
    let sectors = this.cache.get<CompanySector[]>(SectorCache.name) || [];
    if (sectors.length === 0) {
      sectors = await this.prismaService.companySector.findMany();
      this.cache.set(SectorCache.name, [...sectors]);
    }
    return sectors;
  }
}
