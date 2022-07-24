import { CompanySector } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export class SectorCache {
  // eslint-disable-next-line prettier/prettier
  constructor(private readonly prismaService: PrismaService) { }

  private sectors: CompanySector[] = [];

  public async findMany() {
    this.sectors = await this.prismaService.companySector.findMany();
    return this.sectors;
  }
}
