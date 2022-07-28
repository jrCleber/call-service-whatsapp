import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../services/cache.service';

export class Commands {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cacheService: CacheService,
  ) {
    //
  }

  public async '&end'() {
    //
  }
}
