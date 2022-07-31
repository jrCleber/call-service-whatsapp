import { CallCenter } from '@prisma/client';
import { AttendantCache } from '../cache/attendant.cache';
import { CustomerCache } from '../cache/customer.cache';
import { SectorCache } from '../cache/sector.cache';
import { StageCache } from '../cache/stage.cache';
import { TransactionCache } from '../cache/transaction.cache';
import { PrismaService } from '../prisma/prisma.service';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type Operation = {
  operation: {
    open: number;
    closed: number;
    weekday: Weekday[];
    desc?: string;
  };
};

export type CallCenterService = CallCenter & Operation;

export class CacheService {
  constructor(
    private readonly prismaService: PrismaService,
    public readonly customer: CustomerCache,
    public readonly attendant: AttendantCache,
    public readonly sector: SectorCache,
    public readonly chatStage: StageCache,
    public readonly transaction: TransactionCache,
  ) {
    //
  }

  private callCenter: CallCenterService;

  public async getCallCenter(phoneNumber: string) {
    if (!this.callCenter) {
      this.callCenter = (await this.prismaService.callCenter.findUnique({
        where: { phoneNumber },
      })) as CallCenterService;
    }
    return this.callCenter;
  }
}
