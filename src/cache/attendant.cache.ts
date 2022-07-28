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
};

export class AttendantCache {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cache: NodeCache,
  ) {
    this.snapshot();
  }

  private attendants: Pick<Attendant, 'wuid' | 'attendantId'>[];

  public getAttendants(wuid: string) {
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

  public find(where: Query) {
    // Recuperando a referência da lista de atendentes no cache.
    const attendants = this.cache.get<Attendant[]>(AttendantCache.name) || [];
    // Atribuindo atendente selecionado à uma variável.
    const attendant = attendants.find((a) => a[where.field] === where.value);

    // Retornando attendente selecionado.
    return attendant;
  }

  public async set({ where }: Prisma.AttendantFindFirstArgs) {
    // Buscando atendente no banco.
    const attendant = await this.prismaService.attendant.findFirst({ where });
    // Buscando lista de atendentes no cache, se houver, se não, iniciamos com um array vazio.
    const attendants = this.cache.get<Attendant[]>(AttendantCache.name) || [];
    // Recuperando o index do atendente.
    const index = attendants.indexOf(attendant);
    if (!index) {
      // Inserindo atendente no array.
      attendants.push(attendant);
      // Reinserindo atendentes no cache.
      this.cache.set(AttendantCache.name, attendants);
      // Retornando atendente selecionado.
      return attendant;
    }

    return attendant;
  }

  public remove(del: Query) {
    // Buscando o atendente a ser removido.
    const attendant = this.find({ field: del.field, value: del.value });
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
