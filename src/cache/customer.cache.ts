import { Prisma } from '@prisma/client';
import { channel } from 'diagnostics_channel';
import NodeCache from 'node-cache';
import { Logger } from '../common/logger';
import { PrismaService } from '../prisma/prisma.service';

export type Customer = {
  customerId?: number;
  name?: string | null;
  pushName?: string;
  profilePictureUrl?: string;
  wuid?: string;
  phoneNumber?: string;
  otherPhones?: Prisma.JsonValue | null;
  createAt?: string;
  updateAt?: string | null;
};

export class CustomerCache {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cache: NodeCache,
  ) {
    //
  }

  private readonly logger = new Logger(CustomerCache.name);

  public async create(data: Customer) {
    // recuperando a lista de clientes no cache
    const customers = this.cache.get<Customer[]>(CustomerCache.name) || [];
    // verificando se o cliente já existe no cache
    let customer = customers.find(
      (c) => c?.wuid === data?.wuid || c?.customerId === data?.customerId,
    );
    // não existindo
    if (!customer) {
      // criamos um cliente no banco de dados
      customer = await this.prismaService.customer.create({
        data: { ...data } as any,
      });
      // adicionamos este cliente à lista
      customers.push(customer);
      // inserimos a lista no cache
      this.cache.set(CustomerCache.name, [...customers]);
      // zerando o array
      customers.length = 0;
    }
    return customer;
  }

  public async find(where: Pick<Customer, 'wuid' | 'customerId'>) {
    // recuperando a lista de clientes no cache
    const customers = this.cache.get<Customer[]>(CustomerCache.name);
    // buscando o cliente no cache
    let customer = {
      ...customers.find(
        (c) => c.wuid === where.wuid || c.customerId === where.customerId,
      ),
    };
    // não existindo
    if (!customer) {
      // recuperamos o cliente diretamente do banco
      // customer = await this.prismaService.customer.findUnique({
      //   where: { wuid },
      // });
      customer = await this.prismaService.customer.findFirst({
        where: { ...where } as any,
      });
      // inserimos o cliente no array
      customers.push({ ...customer });
      // reinserimos a lista no cache
      this.cache.set(CustomerCache.name, [...customers]);
      // zerando o array
      customers.length = 0;
    }
    return customer;
  }

  public async update(
    where: Pick<Customer, 'wuid' | 'customerId'>,
    data: Customer,
  ): Promise<Customer> {
    // recuperando a lista de clientes no cache
    const customers = this.cache.get<Customer[]>(CustomerCache.name);
    // buscando cliente na lista
    let customer = {
      ...customers.find((c) => c.wuid === data.wuid || c.customerId === data.customerId),
    };
    // decalrando variável de update
    let update: any;
    // recuperando o index do cliente selecionado
    const index = customers.indexOf(customer);
    for (const [key, value] of Object.entries(data)) {
      if (value) {
        update = { [key]: value };
      }
    }
    // atualizando o cliente
    customer = { ...customer, ...update };
    // reinserindo cliente na lista
    customers[index] = customer;
    // reinserindo lista no cache
    this.cache.set(CustomerCache.name, [...customers]);
    // atualizando cliente no bando
    this.prismaService.customer
      .update({
        where: { customerId: where.customerId },
        data: { ...data },
      })
      .then()
      .catch((error) =>
        this.logger.error({
          local: CustomerCache.name + '.' + CustomerCache.prototype.update.name,
          message: `Could not update client id: ${data.customerId}`,
          ...error,
        }),
      );
    // zerando o array
    customers.length = 0;
    // retornando o cliente atualizado
    return customer;
  }

  public async remove(where: Pick<Customer, 'wuid' | 'customerId'>) {
    // recuperando o cliente
    const customer = await this.find(where);
    // recuperando a lista de clientes no cache
    const customers = this.cache.get<Customer[]>(CustomerCache.name);
    // recuperando o index do atendente a ser removido
    const index = customers.indexOf(customer);
    // atribuindo atendente removido à uma variável e removendo atendente da lista
    const customertRemoved = { ...customers.splice(index, 1) };
    // reinserindo lista no cache
    this.cache.set(CustomerCache.name, [...customers]);
    // zerando variável
    customers.length = 0;
    // retornando cliente removido
    return customertRemoved;
  }
}
