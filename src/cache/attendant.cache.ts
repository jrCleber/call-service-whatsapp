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
    setInterval(
      async () =>
        (this.attendants = await this.prismaService.attendant.findMany({
          select: { attendantId: true, wuid: true },
        })),
      1000,
    );
  }

  public async find(where: Query) {
    // Recuperando a referência da lista de atendentes no cache.
    const attendants = this.cache.get<Attendant[]>(AttendantCache.name) || [];
    // Atribuindo atendente selecionado à uma variável.
    const attendant = attendants.find((a) => {
      if (where?.sectorId) {
        return a[where.field] === where.value && a.companySectorId === where.sectorId;
      } else {
        return a[where.field] === where.value;
      }
    });
    // Verificando se o atendente existe,
    if (!attendant) {
      // const findAttendant = await this.prismaService.attendant.findUnique({
      //   where: { [where.field]: where.value as any },
      // });
      const findAttendant = await this.prismaService.attendant.findFirst({
        where: { [where.field]: where.value as number, companySectorId: where?.sectorId },
      });
      attendants.push(findAttendant);
      this.cache.set(AttendantCache.name, [...attendants]);
      return findAttendant;
    }

    // Retornando attendente selecionado.
    return attendant;
  }

  // Buscando no banco de dados o atendente disponível.
  public async realise({ where }: Prisma.AttendantFindFirstArgs) {
    return await this.prismaService.attendant.findFirst({ where });
  }

  public async remove(del: Query) {
    // Buscando o atendente a ser removido.
    const attendant = await this.find({ field: del.field, value: del.value });
    // Buscando a lista de atendentes.
    const attendants = this.cache.get<Attendant[]>(AttendantCache.name);
    // Recuperando o index do atendente a ser removido.
    const index = attendants.indexOf(attendant);
    // Atribuindo atendente removido à uma variável e removendo atendente da lista.
    const attendantRemoved = { ...attendants.splice(index, 1) };
    // Reinserindo lista no cache.
    this.cache.set(AttendantCache.name, attendants);
    // Retornando o atendente removido.
    return attendantRemoved;
  }
}
