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

export class AttendantCache {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cache: NodeCache,
  ) {
    //
  }

  public find(where: Pick<Attendant, 'wuid' | 'attendantId'>) {
    // recuperando a lista de atendentes no cache
    const attendants = this.cache.get<Attendant[]>(AttendantCache.name);
    // atribuindo atendente selecionado à uma variável
    const attendant = {
      ...attendants.find(
        (a) => a.wuid === where.wuid || a.attendantId === where.attendantId,
      ),
    };
    // zerando lista
    attendants.length = 0;
    // retornando attendente selecionado
    return attendant;
  }

  public async set({ where }: Prisma.AttendantFindFirstArgs) {
    // buscando atendente no banco
    const attendant = await this.prismaService.attendant.findFirst({ where });
    // buscando lista de atendentes no cache, se houver, se não, iniciamos com um array vazio
    const attendants = this.cache.get<Attendant[]>(AttendantCache.name) || [];
    // recuperando o index do atendente
    const index = attendants.indexOf(attendant);
    if (!index) {
      // inserindo atendente no array
      attendants.push(attendant);
      // reinserindo atendentes no cache
      this.cache.set(AttendantCache.name, [...attendants]);
      // zerando lista
      attendants.length = 0;
      // retornando atendente selecionado
      return attendant;
    }
    // se o index existir no cache, retornamos o atendente
    return attendant;
  }

  public remove(where: Attendant) {
    // buscando o atendente a ser removido
    const attendant = this.find(where);
    // buscando a lista de atendentes
    const attendants = this.cache.get<Attendant[]>(AttendantCache.name);
    // recuperando o index do atendente a ser removido
    const index = attendants.indexOf(attendant);
    // atribuindo atendente removido à uma variável e removendo atendente da lista
    const attendantRemoved = { ...attendants.splice(index, 1) };
    // reinserindo lista no cache
    this.cache.set(AttendantCache.name, [...attendants]);
    // zerando lista
    attendants.length = 0;
    // retornando o atendente removido
    return attendantRemoved;
  }
}
