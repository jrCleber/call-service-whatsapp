import { Prisma, Responsible, TarnsactionStatus } from '@prisma/client';
import NodeCache from 'node-cache';
import { Logger } from '../common/logger';
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

type Query = {
  field: keyof Transaction;
  value: number | string | Responsible | TarnsactionStatus | Customer;
  status?: TarnsactionStatus;
};

export class TransactionCache {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cache: NodeCache,
  ) {
    //
  }

  private readonly logger = new Logger(TransactionCache.name);

  public async create(data: Transaction) {
    // Retrieving all transactions in the cache.
    const transactions = this.cache.get<Transaction[]>(TransactionCache.name) || [];
    // Checking if the transaction to be created already exists.
    const find = transactions.find((t) => t?.customerId === data?.customerId);
    if (!find || Object.keys(find).length === 0) {
      // Checking if the transaction exists in the bank.
      const transaction = await this.prismaService.transaction.findFirst({
        where: { customerId: data?.customerId, status: { in: ['ACTIVE', 'PROCESSING'] } },
      });
      // Existing:
      if (transaction) {
        // we insert it into the array;
        transactions.push(transaction);
        // and we reinsert the array into the cache.
        this.cache.set(TransactionCache.name, transactions);

        return transaction;
      }
      // If it doesn't exist, we create a transaction in the bank.
      const transactionCreate = await this.prismaService.transaction.create({
        data: { ...data } as Prisma.TransactionCreateInput,
      });
      // We insert the transaction into the array.
      transactions.push(transactionCreate);
      // And we reinsert the array into the cache.
      this.cache.set(TransactionCache.name, transactions);

      return transactionCreate;
    }
  }

  public async find(
    where: Query,
    select?: Prisma.TransactionSelect,
  ): Promise<Transaction> {
    // Retrieving the transaction array reference from the cache.
    const transactions = this.cache.get<Transaction[]>(TransactionCache.name) || [];
    // Fetching transaction in array.
    const transaction = transactions.find((t) => {
      if (where?.status) {
        return t.status === where.status && t[where.field] === where.value;
      }
      return t[where.field] === where.value;
    });
    // Not existing:
    if (!transaction || Object.keys(transaction).length === 0) {
      // we fetch the transaction in the database
      const transactionDb = await this.prismaService.transaction.findFirst({
        where: { [where.field]: where.value, status: where.status },
        select,
      });
      if (transactionDb) {
        // we insert transaction in the array;
        transactions.push(transactionDb);
        // we reinsert the array into the cache.
        this.cache.set(TransactionCache.name, transactions);

        return transactionDb;
      }
    }

    return transaction;
  }

  public async findMany(
    { where }: Prisma.TransactionFindManyArgs,
    select?: Prisma.TransactionSelect,
  ) {
    // Retrieving from the database a list with a specific query.
    return (await this.prismaService.transaction.findMany({
      where,
      select,
    })) as Transaction[];
  }

  public async update(update: Query, data: Transaction): Promise<Transaction> {
    // Retrieving the transaction array reference from the cache.
    const transactions = this.cache.get<Transaction[]>(TransactionCache.name);
    // Fetching transaction to be updated.
    const transaction = transactions.find((t) => t[update.field] === update.value);
    // Retrieving the index of this transaction.
    const index = transactions.indexOf(transaction);
    // Performing update to cache.
    for (const [key, value] of Object.entries(data)) {
      if (value) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        transaction[key] = value;
      }
    }
    // Reinserting transaction into array.
    transactions[index] = transaction;
    // Reinserting array into cache.
    this.cache.set(TransactionCache.name, transactions);
    // Updating transaction in the database.
    this.prismaService.transaction
      .update({
        where: { [update.field]: update.value },
        data: { ...data } as Prisma.TransactionUpdateInput,
      })
      .then()
      .catch((error) =>
        this.logger.error({
          local: TransactionCache.name + '.' + TransactionCache.prototype.update.name,
          error,
        }),
      );
    // Returning updated transaction.
    return transaction;
  }

  public async remove(del: Query) {
    //Retrieving the transaction.
    const transaction = await this.find({
      field: del.field,
      value: del.value,
      status: del.status,
    });
    // Retrieving the array of transactions in the cache.
    const transactions = this.cache.get<Transaction[]>(TransactionCache.name);
    // Retrieving the index of the listener to be removed.
    const index = transactions.indexOf(transaction);
    // AAssigning removed transaction to a variable and removing the transaction from the list.
    const transactiontRemoved = { ...transactions.splice(index, 1) };
    // Reinserting the array into the cache.
    this.cache.set(TransactionCache.name, [...transactions]);
    // Returning removed transaction.
    return transactiontRemoved;
  }
}
