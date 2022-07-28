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
    // verificando se já existe um estágio gerado para esse cliente
    let chatStage = this.cache.get<ChatStage>(data.wuid);
    if (!chatStage) {
      /**
       * não existindo:
       * ├> criamos o estágio no banco de dados;
       * └> inserimos o estágio no cache.
       */
      chatStage = await this.prismaService.chatStage.upsert({
        where: { wuid: data.wuid },
        create: { wuid: data.wuid, stage: data.stage },
        update: { stage: data.stage },
      });

      this.cache.set(chatStage.wuid, chatStage.stage);
    }
    return this.cache.get<Stages>(chatStage.wuid);
  }

  public update(where: Pick<ChatStage, 'wuid'>, data: ChatStage) {
    let stage: Stages;
    for (const [_, value] of Object.entries(data)) {
      if (value) {
        stage = value as Stages;
        break;
      }
    }

    // reinserindo estágio no cache
    this.cache.set(where.wuid, stage);

    // atualizando estágio no banco de dados
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
    let stage = this.cache.get(where.wuid);
    if (!stage) {
      const chatStage = await this.prismaService.chatStage.findUnique({
        where: { wuid: where.wuid },
        select: { stage: true, wuid: true },
      });
      this.cache.set(chatStage.wuid, chatStage.stage);
      stage = chatStage.stage;
    }
    return { wuid: where.wuid, stage };
  }

  public remove(where: Pick<ChatStage, 'wuid'>) {
    this.cache.del(where.wuid);
  }
}
