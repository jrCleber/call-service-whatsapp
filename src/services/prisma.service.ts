import { PrismaClient } from '@prisma/client';

export class PrismaService extends PrismaClient {
  constructor() {
    super();
    this.onModuleInit();
    this.enableShutdownHooks();
  }
  async onModuleInit() {
    await this.$connect();
  }

  async enableShutdownHooks() {
    this.$on('beforeExit', async () => {
      await this.$disconnect();
    });
  }
}
