import { Prisma } from '@prisma/client';
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
  // eslint-disable-next-line prettier/prettier
  constructor(private readonly prismaService: PrismaService) { }

  private readonly customers: Record<string, Customer> = {};

  private readonly logger = new Logger(CustomerCache.name);

  public async create(data: Customer) {
    if (!this.customers[data.wuid]) {
      this.customers[data.wuid] = await this.prismaService.customer.create({
        data: { ...data } as any,
      });
    }
  }

  public async find({ where }: Prisma.CustomerFindFirstArgs) {
    if (!this.customers[where.wuid as string]) {
      // this.customers[wuid] = await this.prismaService.customer.findUnique({
      //   where: { wuid },
      // });
      this.customers[where.wuid as string] = await this.prismaService.customer.findFirst({
        where: { ...where } as any,
      });
    }
    return this.customers[where.wuid as string];
  }

  public update(data: Customer) {
    for (const [key, value] of Object.entries(data)) {
      if (value) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.customers[data.wuid][key] = value;
      }
    }

    this.prismaService.customer
      .update({
        where: { customerId: data.customerId },
        data: { ...data },
      })
      .then()
      .catch((error) =>
        this.logger.error({
          local: CustomerCache.name + '.loadCustomer',
          message: `Could not update client id: ${data.customerId}`,
          ...error,
        }),
      );

    return this.customers[data.wuid];
  }

  public remove(data: Customer) {
    delete this.customers[data.wuid];
  }
}
