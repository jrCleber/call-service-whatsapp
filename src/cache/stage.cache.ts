import { Stages } from '@prisma/client';
import NodeCache from 'node-cache';
import { Logger } from '../common/logger';
import { PrismaService } from '../prisma/prisma.service';

type ChatStage = {
  stageId?: number;
  wuid?: string;
  stage?: Stages;
  customerId?: number | null;
};

export class StageCache {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cache: NodeCache,
  ) {
    //
  }

  private readonly logger = new Logger(StageCache.name);

  public async create(data: ChatStage) {
    // Checking if a stage already exists generated for this client.
    let chatStage = this.cache.get<ChatStage>(data.wuid);
    if (!chatStage) {
      /**
       * Not existing:
       * ├> we create the stage in the database;
       * └> we insert the stage into the cache.
       */
      chatStage = await this.prismaService.chatStage.upsert({
        where: { wuid: data.wuid },
        create: { wuid: data.wuid, stage: data.stage, customerId: data.customerId },
        update: { stage: data.stage },
      });
      // Insert client stage into cache.
      this.cache.set(chatStage.wuid, chatStage.stage);
    }

    return { wuid: chatStage.wuid, stage: this.cache.get<Stages>(chatStage.wuid) };
  }

  public update(where: Pick<ChatStage, 'wuid'>, data: ChatStage) {
    let stage: Stages;
    // Updating stage.
    for (const [_, value] of Object.entries(data)) {
      if (value) {
        stage = value as Stages;
        break;
      }
    }
    // Reinserting stage into cache.
    this.cache.set(where.wuid, stage);
    // Updating stage in database.
    this.prismaService.chatStage
      .update({
        where: { ...where },
        data: { ...data },
      })
      .then()
      .catch((error) =>
        this.logger.error({
          local: StageCache.name + '.' + StageCache.prototype.update.name,
          message: `Could not update chatStage - wuid: ${where.wuid}`,
          ...error,
        }),
      );

    return { wuid: where.wuid, stage: this.cache.get(where.wuid) };
  }

  public async find(where: Pick<ChatStage, 'wuid'>) {
    // Retrieving stage reference in memory.
    let stage = this.cache.get<Stages>(where.wuid);
    // Not existing:
    if (!stage) {
      // We seek this internship at the bank.
      const chatStage = await this.prismaService.chatStage.findUnique({
        where: { wuid: where.wuid },
        select: { stage: true, wuid: true },
      });
      // Eexisting:
      if (chatStage) {
        // insert client stage into cache if condition is satisfied;
        chatStage.stage !== 'finishedChat'
          ? this.cache.set(chatStage.wuid, chatStage.stage)
          : undefined;
        // We assign the stage value to the variable.
        stage = chatStage.stage;
      }
    }

    return { wuid: where.wuid, stage };
  }

  public remove(where: Pick<ChatStage, 'wuid'>) {
    // Removing cache stage.
    this.cache.del(where.wuid);
  }
}
