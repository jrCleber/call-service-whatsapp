import { AttendantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Attendant = {
  attendantId: number;
  shortName: string;
  fullName: string | null;
  phoneNumber: string;
  wuid: string;
  email: string | null;
  status: AttendantStatus;
  manager: boolean;
  createAt: string;
  updateAt: string | null;
  companySectorId: number;
  callCenterId: number;
};

export class AttendantCache {
  // eslint-disable-next-line prettier/prettier
  constructor(private readonly prismaService: PrismaService) { }

  private readonly attendants: Record<string, Attendant> = {};

  public async find(data: Attendant) {
    if (!data) {
      this.attendants[data.wuid] = await this.prismaService.attendant.findFirst({
        where: { wuid: data.wuid },
      });
    }
    return this.attendants[data.wuid];
  }

  public remove(data: Attendant) {
    delete this.attendants[data.wuid];
  }
}
