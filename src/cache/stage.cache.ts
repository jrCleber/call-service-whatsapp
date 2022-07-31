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
    // Verificando se já existe um estágio gerado para esse cliente.
    let chatStage = this.cache.get<ChatStage>(data.wuid);
    if (!chatStage) {
      /**
       * Não existindo:
       * ├> criamos o estágio no banco de dados;
       * └> inserimos o estágio no cache.
       */
      chatStage = await this.prismaService.chatStage.upsert({
        where: { wuid: data.wuid },
        create: { wuid: data.wuid, stage: data.stage, customerId: data.customerId },
        update: { stage: data.stage },
      });
      // Inserinfo estágio do cliente no cache.
      this.cache.set(chatStage.wuid, chatStage.stage);
    }

    return { wuid: chatStage.wuid, stage: this.cache.get<Stages>(chatStage.wuid) };
  }

  public update(where: Pick<ChatStage, 'wuid'>, data: ChatStage) {
    let stage: Stages;
    // Atualizando estágio.
    for (const [_, value] of Object.entries(data)) {
      if (value) {
        stage = value as Stages;
        break;
      }
    }
    // Reinserindo estágio no cache.
    this.cache.set(where.wuid, stage);
    // Atualizando estágio no banco de dados.
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
    // Recuperando referência do estágio na memória.
    let stage = this.cache.get<Stages>(where.wuid);
    // Não existindo:
    if (!stage) {
      // buscamos esse estágio no banco.
      const chatStage = await this.prismaService.chatStage.findUnique({
        where: { wuid: where.wuid },
        select: { stage: true, wuid: true },
      });
      // Existindo:
      if (chatStage) {
        // inserimos estágio do cliente no cache se a condição for satisfeita;
        chatStage.stage !== 'finishedChat'
          ? this.cache.set(chatStage.wuid, chatStage.stage)
          : undefined;
        // Atribuimos o valor do estágio na variável.
        stage = chatStage.stage;
      }
    }

    return { wuid: where.wuid, stage };
  }

  public remove(where: Pick<ChatStage, 'wuid'>) {
    // Removendo estágio do cache.
    this.cache.del(where.wuid);
  }
}
