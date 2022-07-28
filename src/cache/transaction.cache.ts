import { Prisma, Responsible, TarnsactionStatus } from '@prisma/client';
import NodeCache from 'node-cache';
import { PrismaService } from '../prisma/prisma.service';
import { Attendant } from './attendant.cache';
import { Customer } from './customer.cache';

export type Transaction = {
  transactionId?: number;
  subject?: Prisma.JsonValue | null;
  status?: TarnsactionStatus | Prisma.EnumTarnsactionStatusFilter;
  initiated?: string;
  startProcessing?: string | null;
  finished?: string | null;
  protocol?: string | null;
  finisher?: Responsible | null;
  customerId?: number;
  attendantId?: number | null;
  sectorId?: number | null;
  Attendant?: Attendant;
  Customer?: Customer;
};

export class TransactionCache {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cache: NodeCache,
  ) {
    //
  }

  public async create(data: Transaction) {
    const transactions = this.cache.get<Transaction[]>(TransactionCache.name) || [];
    const find = transactions.find((t) => t?.customerId === data?.customerId);
    if (!find) {
      const find = await this.prismaService.transaction.findFirst({
        where: { customerId: data?.customerId, status: { in: ['ACTIVE', 'PROCESSING'] } },
      });
      if (find) {
        transactions.push(find);
        return find;
      }
      const transaction = await this.prismaService.transaction.create({
        data: { ...data } as any,
      });
      transactions.push(transaction);
      this.cache.set(TransactionCache.name, [...transactions]);
      transactions.length = 0;
      return transaction;
    }
    return find;
  }

  public async find(where: Transaction, select?: Prisma.TransactionSelect) {
    const transactions = this.cache.get<Transaction[]>(TransactionCache.name);
    let transaction = transactions.find(
      (t) =>
        (t.status === where.status && t.customerId === where.customerId) ||
        (t.status === where.status && t.transactionId === where.transactionId),
    );

    if (!transaction) {
      transaction = await this.prismaService.transaction.findFirst({
        where: { ...where } as any,
        select,
      });
      transactions.push(transaction);
      this.cache.set(TransactionCache.name, [...transactions]);
      transactions.length = 0;
    }

    return transaction;
  }

  public async findMany(
    { where }: Prisma.TransactionFindManyArgs,
    select?: Prisma.TransactionSelect,
  ) {
    return (await this.prismaService.transaction.findMany({
      where,
      select,
    })) as Transaction[];
  }

  public async update(where: Transaction, data: Transaction): Promise<Transaction> {
    const transactions = this.cache.get<Transaction[]>(TransactionCache.name);
    let transaction = {
      ...transactions.find((t) => t.customerId === data.customerId),
    };
    const index = transactions.indexOf(transaction);
    for (const [key, value] of Object.entries(data)) {
      if (value) {
        transaction = { ...transaction, [key]: value };
      }
    }

    transactions[index] = transaction;

    this.cache.set(TransactionCache.name, [...transactions]);

    transactions.length = 0;

    this.prismaService.transaction
      .update({
        where: { ...where } as any,
        data: { ...data } as any,
      })
      .then()
      .catch();

    return transaction;
  }

  public async remove(where: Pick<Transaction, 'customerId' | 'transactionId'>) {
    // recuperando o cliente
    const transaction = await this.find(where);
    // recuperando a lista de clientes no cache
    const transactions = this.cache.get<Transaction[]>(TransactionCache.name);
    // recuperando o index do atendente a ser removido
    const index = transactions.indexOf(transaction);
    // atribuindo atendente removido à uma variável e removendo atendente da lista
    const transactiontRemoved = { ...transactions.splice(index, 1) };
    // reinserindo lista no cache
    this.cache.set(TransactionCache.name, [...transactions]);
    // zerando variável
    transactions.length = 0;
    // retornando cliente removido
    return transactiontRemoved;
  }
}
