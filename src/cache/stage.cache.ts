import { Prisma, Stages } from '@prisma/client';
import { Logger } from '../common/logger';
import { PrismaService } from '../prisma/prisma.service';

type ChatStage = {
  stageId?: number;
  wuid?: string;
  stage?: Stages;
  customerId?: number | null;
};

export class StageCache {
  // eslint-disable-next-line prettier/prettier
  constructor(private readonly prismaService: PrismaService) { }

  private readonly logger = new Logger(StageCache.name);
  private readonly chatStages: Record<string, ChatStage> = {};

  public async create(data: ChatStage) {
    if (!this.chatStages[data.wuid]) {
      this.chatStages[data.wuid] = await this.prismaService.chatStage.create({
        data: { wuid: data.wuid, stage: data.stage },
      });
    }
    this.prismaService.chatStage
      .update({
        where: { wuid: data.wuid },
        data: { stage: data.stage },
      })
      .then()
      .catch((error) =>
        this.logger.error({
          local: StageCache.name + '.create',
          message: `Could not update client id: ${data.customerId}`,
          ...error,
        }),
      );
    this.chatStages[data.wuid].stage = data.stage;
    return this.chatStages[data.wuid];
  }

  public update(where: Prisma.ChatStageWhereUniqueInput, data: ChatStage) {
    for (const [key, value] of Object.entries(data)) {
      if (value) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.chatStages[customer.wuid][key] = value;
      }
    }

    this.prismaService.chatStage
      .update({
        where: { ...where },
        data: { ...data },
      })
      .then()
      .catch((error) =>
        this.logger.error({
          local: StageCache.name + '.loadCustomer',
          message: `Could not update client id: ${data.customerId}`,
          ...error,
        }),
      );

    return this.chatStages[data.wuid];
  }

  public async find({ where }: Prisma.ChatStageFindFirstArgs) {
    if (!this.chatStages[where.wuid as string]) {
      this.chatStages[where as string] = await this.prismaService.chatStage.findUnique({
        where: { wuid: where.wuid as string },
      });
    }
    return this.chatStages[where.wuid as string];
  }

  public remove(data: ChatStage) {
    delete this.chatStages[data.wuid];
  }
}
