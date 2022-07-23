import { proto } from '@adiwajshing/baileys';
import { PrismaService } from './prisma.service';

export class ManageService {
  // eslint-disable-next-line prettier/prettier
  constructor(private readonly prismaService: PrismaService) { }

  public async messageManagement(received: proto.IWebMessageInfo) {
    //
  }
}
