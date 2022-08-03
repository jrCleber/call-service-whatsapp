import { AttendantStatus, Prisma } from '@prisma/client';
import NodeCache from 'node-cache';
import { PrismaService } from '../prisma/prisma.service';

export type Attendant = {
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

type Query = {
  field: keyof Attendant;
  value: number | string | AttendantStatus;
  sectorId?: number;
};

export class AttendantCache {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cache: NodeCache,
  ) {
    this.snapshot();
  }

  private attendants: Pick<Attendant, 'wuid' | 'attendantId'>[];

  public getAttendant(wuid: string) {
    return this.attendants?.find((a) => a.wuid === wuid);
  }

  private snapshot() {
    const select = { attendantId: true, wuid: true };
    setInterval(
      async () =>
        (this.attendants = await this.prismaService.attendant.findMany({ select })),
      1000,
    );
  }

  public async find(where: Query) {
    // Retrieving the list of listeners reference from the cache.
    const attendants = this.cache.get<Attendant[]>(AttendantCache.name) || [];
    // Assigning selected attendant to a variable.
    const attendant = attendants.find((a) => {
      if (where?.sectorId) {
        return (
          a[where.field] === where.value &&
          a.companySectorId === where.sectorId &&
          a.status === 'ACTIVE'
        );
      } else {
        return a[where.field] === where.value && a.status === 'ACTIVE';
      }
    });
    // Checking if the attendant exists.
    if (!attendant) {
      const findAttendant = await this.prismaService.attendant.findFirst({
        where: {
          [where.field]: where.value as number,
          companySectorId: where?.sectorId,
          status: 'ACTIVE',
        },
      });
      attendants.push(findAttendant);
      this.cache.set(AttendantCache.name, [...attendants]);
      return findAttendant;
    }

    // Returning selected attendant.
    return attendant;
  }

  // Searching the database for the available attendant.
  public async realise({ where }: Prisma.AttendantFindFirstArgs) {
    return await this.prismaService.attendant.findFirst({ where });
  }

  public async remove(del: Query) {
    // Fetching the attendant to be removed.
    const attendant = await this.find({ field: del.field, value: del.value });
    // Fetching the list of attendants.
    const attendants = this.cache.get<Attendant[]>(AttendantCache.name);
    // Retrieving the index of the listener to be removed.
    const index = attendants.indexOf(attendant);
    // Assigning removed attendant to a variable and removing attendant from the list.
    const attendantRemoved = { ...attendants.splice(index, 1) };
    // Reinserting list into cache.
    this.cache.set(AttendantCache.name, attendants);
    // Returning the removed attendant.
    return attendantRemoved;
  }
}
