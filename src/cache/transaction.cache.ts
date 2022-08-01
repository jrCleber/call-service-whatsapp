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
    // Recuperando todas as transações no cache.
    const transactions = this.cache.get<Transaction[]>(TransactionCache.name) || [];
    // Verificando se a transação a ser criada já existe
    const find = transactions.find((t) => t?.customerId === data?.customerId);
    if (!find || Object.keys(find).length === 0) {
      // Verificando se a transação existe no banco.
      const transaction = await this.prismaService.transaction.findFirst({
        where: { customerId: data?.customerId, status: { in: ['ACTIVE', 'PROCESSING'] } },
      });
      // Existindo:
      if (transaction) {
        // a inserimos no array;
        transactions.push(transaction);
        // e reinserimos o array no cache.
        this.cache.set(TransactionCache.name, transactions);
        // Zerando lista.
        transactions.length = 0;

        return transaction;
      }
      // Não existindo, criamos uma transação no banco.
      const transactionCreate = await this.prismaService.transaction.create({
        data: { ...data } as Prisma.TransactionCreateInput,
      });
      // Inserimos a transação no array.
      transactions.push(transactionCreate);
      // E reinserimos o array no cache.
      this.cache.set(TransactionCache.name, transactions);

      return transactionCreate;
    }
  }

  public async find(
    where: Query,
    select?: Prisma.TransactionSelect,
  ): Promise<Transaction> {
    // Recuperando a referencia do array de transações no cache.
    const transactions = this.cache.get<Transaction[]>(TransactionCache.name) || [];
    // Buscando transação no array.
    const transaction = transactions.find(
      (t) => t.status === where.status && t[where.field] === where.value,
    );
    // Não existindo:
    if (!transaction || Object.keys(transaction).length === 0) {
      // buscamos a transação no bando
      const transactionDb = await this.prismaService.transaction.findFirst({
        where: { [where.field]: where.value, status: where.status },
        select,
      });
      if (transactionDb) {
        // iserimos transação no array;
        transactions.push(transactionDb);
        // reinserimos o array no cache.
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
    // Recuperando do banco uma lista com uma query específica.
    return (await this.prismaService.transaction.findMany({
      where,
      select,
    })) as Transaction[];
  }

  public async update(update: Query, data: Transaction): Promise<Transaction> {
    // Recuperando a referencia do array de transações no cache.
    const transactions = this.cache.get<Transaction[]>(TransactionCache.name);
    // Buscando transação a ser atualizada.
    const transaction = transactions.find((t) => t[update.field] === update.value);
    // Recuperando o index desta transação.
    const index = transactions.indexOf(transaction);
    // Realizando atualização para o cache.
    for (const [key, value] of Object.entries(data)) {
      if (value) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        transaction[key] = value;
      }
    }
    // Reinserindo transação no array.
    transactions[index] = transaction;
    // Reinserindo array no cache.
    this.cache.set(TransactionCache.name, transactions);
    // Atualizando transação no banco.
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
    // Retornando transação atualizada.
    return transaction;
  }

  public async remove(del: Query) {
    // Recuperando o cliente.
    const transaction = await this.find({
      field: del.field,
      value: del.value,
      status: del.status,
    });
    // Recuperando o array de clientes no cache.
    const transactions = this.cache.get<Transaction[]>(TransactionCache.name);
    // Recuperando o index do atendente a ser removido.
    const index = transactions.indexOf(transaction);
    // Atribuindo atendente removido à uma variável e removendo atendente da lista.
    const transactiontRemoved = { ...transactions.splice(index, 1) };
    // Reinserindo o array no cache.
    this.cache.set(TransactionCache.name, [...transactions]);
    // Retornando cliente removido.
    return transactiontRemoved;
  }
}
