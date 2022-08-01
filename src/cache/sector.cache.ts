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

  // Creating a simple observer to load the sectors every minute.
  private snapshot() {
    setInterval(async () => {
      const sectors = await this.prismaService.attendant.findMany({
        distinct: 'companySectorId',
        select: {
          CompanySector: true,
        },
      });
      this.cache.set(SectorCache.name, [
        ...sectors.map(({ CompanySector }) => CompanySector),
      ]);
    }, 1000);
  }

  public async findMany() {
    // Retrieving all sectors from the cache.
    let sectors = this.cache.get<CompanySector[]>(SectorCache.name) || [];
    if (sectors.length === 0) {
      // Searching all sectors where there are linked attendants.
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
