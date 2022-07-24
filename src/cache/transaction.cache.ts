import { Attendant, Prisma, Responsible, TarnsactionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type Transaction = {
  transactionId?: number;
  subject?: Prisma.JsonValue | null;
  status?: TarnsactionStatus;
  initiated?: string;
  startProcessing?: string | null;
  finished?: string | null;
  protocol?: string | null;
  finisher?: Responsible | null;
  customerId?: number;
  attendantId?: number | null;
  sectorId?: number | null;
  Attendant?: Attendant;
};

export class TransactionCache {
  // eslint-disable-next-line prettier/prettier
  constructor(private readonly prismaService: PrismaService) { }

  private readonly transactions: Transaction[] = [];

  public async create(data: Transaction) {
    const t = await this.prismaService.transaction.create({
      data: { ...data } as any,
    });
    this.transactions.push(t);
    return t;
  }

  public async find({ where }: Prisma.TransactionFindFirstArgs, select?: any) {
    let transaction = this.transactions.find(
      (t) => t.customerId === where.customerId || t.transactionId === where.transactionId,
    );

    if (!transaction) {
      transaction = await this.prismaService.transaction.findFirst({ where, select });
      this.transactions.push(transaction);
    }

    return transaction;
  }

  public async findMany(
    { where }: Prisma.TransactionFindManyArgs,
    select: Prisma.TransactionSelect,
  ) {
    return (await this.prismaService.transaction.findMany({
      where,
      select,
    })) as Transaction[];
  }

  public async update({ where }: Prisma.TransactionFindFirstArgs, data: Transaction) {
    const transaction = this.transactions.find((t) => t.customerId === data.customerId);
    const index = this.transactions.indexOf(transaction);
    for (const [key, value] of Object.entries(data)) {
      if (value) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        transaction[key] = value;
      }
    }
    this.transactions[index] = transaction;
    this.prismaService.transaction
      .update({
        where: { ...where } as any,
        data: { ...data } as any,
      })
      .then()
      .catch();
    return transaction;
  }
}
