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
    // Retrieving the client list reference from the cache.
    const customers = this.cache.get<Customer[]>(CustomerCache.name) || [];
    // Checking if the client already exists in the cache.
    const customer = customers.find(
      (c) => c?.wuid === data?.wuid || c?.customerId === data?.customerId,
    );
    // Not existing:
    if (!customer || Object.keys(customer).length === 0) {
      // create a customer in the database;
      const customerCreate = await this.prismaService.customer.create({
        data: { ...data } as Prisma.CustomerCreateInput,
      });
      // we add this customer to the list;
      customers.push(customerCreate);
      // insert the list into the cache.
      this.cache.set(CustomerCache.name, [...customers]);

      return customerCreate;
    }

    return customer;
  }

  public async find(where: Query) {
    // Retrieving the client list reference in the cache.
    const customers = this.cache.get<Customer[]>(CustomerCache.name) || [];
    // Fetching the client in the cache.
    const customer = customers.find((c) => c[where.field] === where.value);
    // Not existing:
    if (!customer || Object.keys(customer).length === 0) {
      const customerDb = await this.prismaService.customer.findFirst({
        where: { [where.field]: where.value },
      });
      if (customerDb) {
        // Insert the customer into the array;
        customers.push(customerDb);
        // We reinsert the list into the cache.
        this.cache.set(CustomerCache.name, customers);

        return customerDb;
      }
    }

    return customer;
  }

  public async update(update: Query, data: Customer): Promise<Customer> {
    // Retrieving the client list reference from the cache.
    const customers = this.cache.get<Customer[]>(CustomerCache.name);
    // Looking for customer in the list.
    const customer = customers.find((c) => c[update.field] === update.value);
    // Retrieving the selected client's index.
    const index = customers.indexOf(customer);
    // Performing update to cache.
    for (const [key, value] of Object.entries(data)) {
      if (value) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        customer[key] = value;
      }
    }
    // Reinserting client into the list.
    customers[index] = customer;
    // Reinserting list into cache.
    this.cache.set(CustomerCache.name, customers);
    // Updating client in the flock.
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

    // Returning the updated client
    return customer;
  }

  public async remove(del: Query) {
    // Retrieving the client.
    const customer = await this.find({ field: del.field, value: del.value });
    // Retrieving the client list reference from the cache.
    const customers = this.cache.get<Customer[]>(CustomerCache.name);
    // Retrieving the index of the listener to be removed.
    const index = customers.indexOf(customer);
    //Assigning removed attendant to a variable and removing attendant from the list.
    const customertRemoved = customers.splice(index, 1);
    // Reinserting list into cache.
    this.cache.set(CustomerCache.name, customers);
    // Returning removed client.
    return customertRemoved;
  }
}
