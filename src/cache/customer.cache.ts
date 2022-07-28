import { Prisma } from '@prisma/client';
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

type Query = {
  field: keyof Customer;
  value: string | number;
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
    // Recuperando a referência da lista de clientes no cache.
    const customers = this.cache.get<Customer[]>(CustomerCache.name) || [];
    // Verificando se o cliente já existe no cache.
    const customer = customers.find(
      (c) => c?.wuid === data?.wuid || c?.customerId === data?.customerId,
    );
    // Não existindo:
    if (!customer || Object.keys(customer).length === 0) {
      // criamos um cliente no banco de dados;
      const customerCreate = await this.prismaService.customer.create({
        data: { ...data } as Prisma.CustomerCreateInput,
      });
      // adicionamos este cliente à lista;
      customers.push(customerCreate);
      // inserimos a lista no cache.
      this.cache.set(CustomerCache.name, [...customers]);

      return customerCreate;
    }

    return customer;
  }

  public async find(where: Query) {
    // Tecuperando a referência da lista de clientes no cache.
    const customers = this.cache.get<Customer[]>(CustomerCache.name) || [];
    // Buscando o cliente no cache.
    const customer = customers.find((c) => c[where.field] === where.value);
    // Não existindo:
    if (!customer || Object.keys(customer).length === 0) {
      // recuperamos o cliente diretamente do banco;
      // const customerDb = await this.prismaService.customer.findUnique({
      //   where: { [where.field]: where.value },
      // });
      const customerDb = await this.prismaService.customer.findFirst({
        where: { [where.field]: where.value },
      });
      if (customerDb) {
        // inserimos o cliente no array;
        customers.push(customerDb);
        // reinserimos a lista no cache.
        this.cache.set(CustomerCache.name, [...customers]);
        // Zerando lista.
        customers.length = 0;

        return customerDb;
      }
    }

    return customer;
  }

  public async update(update: Query, data: Customer): Promise<Customer> {
    // Recuperando a referência da lista de clientes no cache.
    const customers = this.cache.get<Customer[]>(CustomerCache.name);
    // Buscando cliente na lista.
    const customer = customers.find((c) => c[update.field] === update.value);
    // Recuperando o index do cliente selecionado.
    const index = customers.indexOf(customer);
    // Realizando atualização para o cache.
    for (const [key, value] of Object.entries(data)) {
      if (value) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        customer[key] = value;
      }
    }
    // Reinserindo cliente na lista.
    customers[index] = customer;
    // Reinserindo lista no cache.
    this.cache.set(CustomerCache.name, customers);
    // Atualizando cliente no bando.
    this.prismaService.customer
      .update({
        where: { [update.field]: update.value },
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

    // Retornando o cliente atualizado
    return customer;
  }

  public async remove(del: Query) {
    // Recuperando o cliente.
    const customer = await this.find({ field: del.field, value: del.value });
    // Recuperando a referência da lista de clientes no cache.
    const customers = this.cache.get<Customer[]>(CustomerCache.name);
    // Recuperando o index do atendente a ser removido.
    const index = customers.indexOf(customer);
    // Atribuindo atendente removido à uma variável e removendo atendente da lista.
    const customertRemoved = customers.splice(index, 1);
    // Reinserindo lista no cache.
    this.cache.set(CustomerCache.name, [...customers]);

    // Retornando cliente removido.
    return customertRemoved;
  }
}
