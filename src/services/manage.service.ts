import { AnyMessageContent, delay, proto } from '@adiwajshing/baileys';
import { CallCenter, Transaction } from '@prisma/client';
import dayjs from 'dayjs';
import { timeDay } from '../common/format.date';
import { Logger } from '../common/logger';
import { Instance } from './instance.service';
import { PrismaService } from './prisma.service';

type Options = { delay?: number; quoted?: proto.IWebMessageInfo };

type ItemSelected = {
  transaction?: string;
  customerId?: string;
  action?: string;
  callCenterId?: string;
  sectorId?: string;
};

enum Replace {
  BOTNAME = '<botName>',
  DAY = '<day>',
}

export class ManageService {
  // eslint-disable-next-line prettier/prettier
  constructor(private readonly prismaService: PrismaService) { }

  private instance: Instance = {};
  private callCenter: CallCenter;
  private readonly logger = new Logger(ManageService.name);

  public set client(value: any) {
    this.instance = value;
  }

  private removeSpaces(value: string, regex = /^ +/gm) {
    return value.replace(regex, '');
  }

  private async sendMessage(wuid: string, message: proto.IMessage, options?: Options) {
    await this.instance.client.presenceSubscribe(wuid);
    await this.instance.client.sendPresenceUpdate('composing', wuid);
    await delay(options?.delay || 2000);
    await this.instance.client.sendPresenceUpdate('paused', wuid);

    return await this.instance.client.sendMessage(
      wuid,
      {
        forward: {
          key: {
            fromMe: true,
            remoteJid: this.instance.client.user.id.replace(/:\d+/, 's'),
          },
          message,
        },
      },
      {
        quoted: options?.quoted,
      },
    );
  }

  private selectedText(message: proto.IMessage) {
    if (message?.conversation) return message.conversation;
    if (message?.extendedTextMessage) return message.extendedTextMessage.text;
    return '';
  }

  private selectedIdMsg(message: proto.IMessage) {
    let selectedId: ItemSelected;
    if (message?.buttonsResponseMessage?.selectedButtonId) {
      const [action, transaction] =
        message.buttonsResponseMessage.selectedButtonId.split('-');
      selectedId = { action, transaction };
    } else if (message?.listResponseMessage?.singleSelectReply?.selectedRowId) {
      const [customerId, transaction, callCenterId, sectorId] =
        message.listResponseMessage.singleSelectReply.selectedRowId.split('-');
      selectedId = { customerId, callCenterId, sectorId, transaction };
    }
    return selectedId;
  }

  private async createList(tId: number, cId: number): Promise<proto.ISection[]> {
    const sectors = await this.prismaService.companySector.findMany();
    const rows: proto.IRow[] = Array.from(sectors, (sector) => {
      return {
        title: sector.sector.toUpperCase(),
        description: ' ',
        rowId: `${cId}-${tId}-${sector.callCenterId}-${sector.sectorId}`,
      };
    });
    return [
      { title: 'SETORES', rows },
      {
        title: 'OUTRAS OPÇÕES',
        rows: [{ title: 'Nem uma das alternativas acima', description: ' ', rowId: '0' }],
      },
    ];
  }

  private async profilePicture(wuid: string) {
    try {
      return await this.instance.client.profilePictureUrl(wuid, 'image');
    } catch (error) {
      return 'no image';
    }
  }

  private async loadCustomer(received: proto.IWebMessageInfo) {
    const wuid = received.key.remoteJid;

    let customer = await this.prismaService.customer.findFirst({
      where: { wuid },
    });
    const profilePictureUrl = await this.profilePicture(customer.wuid);
    if (customer) {
      this.prismaService.customer
        .update({
          where: { customerId: customer.customerId },
          data: { profilePictureUrl },
        })
        .then()
        .catch((error) =>
          this.logger.error({
            local: ManageService.name + '.loadCustomer',
            message: `Could not update client id: ${customer.customerId}`,
            ...error,
          }),
        );
    } else {
      customer = await this.prismaService.customer.create({
        data: {
          pushName: received.pushName,
          profilePictureUrl,
          createAt: Date.now().toString(),
          wuid,
          phoneNumber: wuid.replace('@s.whatsapp.net', ''),
        },
      });
      this.logger.log(`Customer: id${customer.customerId} - CREATED`);
    }

    return customer;
  }

  private async setSender(received: proto.IWebMessageInfo) {
    return {
      customer: await this.loadCustomer(received),
      attendant: await this.prismaService.attendant.findFirst({
        where: { wuid: received.key.remoteJid },
      }),
    };
  }

  private async initialChat(received: proto.IWebMessageInfo, id?: number) {
    const wuid = received.key.remoteJid;

    await this.sendMessage(
      received.key.remoteJid,
      {
        extendedTextMessage: {
          text: this.callCenter.presentation
            .replace(Replace.BOTNAME, this.callCenter.botName)
            .replace(Replace.DAY, timeDay(dayjs().hour())),
        },
      },
      { delay: 1000 },
    );
    await this.sendMessage(
      wuid,
      { extendedTextMessage: { text: 'Digite agora o seu nome:' } },
      { delay: 1000 },
    );
    await this.prismaService.chatStage.upsert({
      where: { wuid },
      create: { wuid, stage: 'setName' },
      update: { wuid, stage: 'setName' },
    });

    return await this.prismaService.transaction.create({
      data: {
        initiated: Date.now().toString(),
        customerId: id,
      },
    });
  }

  private async setName(received: proto.IWebMessageInfo, id?: number) {
    const wuid = received.key.remoteJid;

    const name = this.selectedText(received.message);

    if (name === '') {
      this.sendMessage(
        wuid,
        {
          extendedTextMessage: {
            text: this
              .removeSpaces(`A mensagem que você enviou para não é válida para ser atribuída ao um nome.\n
            Informe o seu nome:`),
          },
        },
        { delay: 1500, quoted: received },
      );
    }

    await this.prismaService.customer.update({
      where: { customerId: id },
      data: { name },
    });

    const transaction = await this.prismaService.transaction.findFirst({
      where: { customerId: id, status: 'ACTIVE' },
      select: { transactionId: true, initiated: true, customerId: true },
    });
    this.prismaService.transaction
      .update({
        where: { transactionId: transaction.transactionId },
        data: { protocol: `${transaction.initiated}-${transaction.transactionId}` },
      })
      .then(({ protocol }) =>
        this.sendMessage(
          wuid,
          {
            extendedTextMessage: {
              text: `Ótimo ${name}.\n\nEsse é o protocolo do seu atendimento: *${protocol}*`,
            },
          },
          { delay: 1000 },
        ).then(async () => {
          const sections = await this.createList(
            transaction.transactionId,
            transaction.customerId,
          );
          if (sections?.length === 0) {
            await this.prismaService.chatStage.update({
              where: { wuid: wuid },
              data: { stage: 'setSubject' },
            });
            this.sendMessage(
              wuid,
              {
                extendedTextMessage: {
                  text: `${this
                    .removeSpaces(`Informe agora o assunto do seu atendimento.\n
                  Pode ser um text, ou vídeo, ou imagem, etc.
                  E quando vc terminar, envie a palavra:\n`)}
                  *FIM*\n`,
                },
              },
              { delay: 1000 },
            );
            return;
          }

          await this.prismaService.chatStage.update({
            where: { wuid },
            data: { stage: 'checkSector' },
          });
          this.sendMessage(
            wuid,
            {
              listMessage: {
                title: '*Com qual setor você deseja falar?*\n',
                description: 'Clique no botão e escolha un dos setores.',
                buttonText: 'SETORES',
                footerText: this.callCenter.companyName + ' - ' + this.callCenter.url,
                listType: 1,
                sections,
              },
            },
            { delay: 1500 },
          );
        }),
      )
      .catch((error) =>
        this.logger.error({
          local: ManageService.name + '.loadCustomer',
          message: `Could not update transaction id: ${transaction.transactionId}`,
          ...error,
        }),
      );
  }

  private async checkSector(received: proto.IWebMessageInfo) {
    const wuid = received.key.remoteJid;
    const sectors = await this.prismaService.companySector.findMany({
      where: { callCenterId: this.callCenter.callCenterId },
    });

    let findSector = false;
    let sectorId: number;
    let transaction: Transaction;

    const text = this.selectedText(received.message);
    const selectedId = this.selectedIdMsg(received.message);

    if (text && sectors.find((s) => s.sector === text.toUpperCase())) {
      sectorId = sectors.find((s) => s.sector === text.toUpperCase()).sectorId;
      findSector = true;
      transaction = await this.prismaService.transaction.findFirst({
        where: { Customer: { wuid }, status: 'ACTIVE' },
      });
    }

    if (
      selectedId?.transaction &&
      sectors.find((s) => s.sectorId === Number.parseInt(selectedId.sectorId))
    ) {
      sectorId = sectors.find(
        (s) => s.sectorId === Number.parseInt(selectedId.sectorId),
      ).sectorId;
      findSector = true;
      transaction = await this.prismaService.transaction.findUnique({
        where: { transactionId: Number.parseInt(selectedId.transaction) },
      });
    }

    if (findSector && transaction) {
      await this.prismaService.chatStage.update({
        where: { wuid: wuid },
        data: { stage: 'setSubject' },
      });
      await this.prismaService.transaction.update({
        where: { transactionId: transaction.transactionId },
        data: { sectorId: sectorId },
      });
      this.sendMessage(
        wuid,
        {
          extendedTextMessage: {
            text: `${this.removeSpaces(`Informe agora o assunto do seu atendimento.\n
            Pode ser um text, ou vídeo, ou imagem, etc.
            E quando vc terminar, envie a palavra:\n`)}
            *FIM*\n`,
          },
        },
        { delay: 1000 },
      );
    } else {
      this.sendMessage(
        wuid,
        {
          extendedTextMessage: {
            text: '👆🏼👆🏼 Houve um erro ao atribuir esta categoria!\nTente novamente informar a categoria',
          },
        },
        { delay: 1500, quoted: received },
      );
    }
  }

  private async setSubject(received: proto.IWebMessageInfo, id?: number) {
    const wuid = received.key.remoteJid;

    const transaction = await this.prismaService.transaction.findFirst({
      where: { customerId: id, status: 'ACTIVE' },
    });

    const text = this.selectedText(received.message).trim().toLowerCase();
    if (text !== 'fim') {
      (transaction.subject as any[]).push(received);
      await this.prismaService.transaction.update({
        where: { transactionId: transaction.transactionId },
        data: { subject: transaction.subject },
      });
      return;
    }

    this.sendMessage(
      wuid,
      {
        extendedTextMessage: {
          text: 'Ótimo! Aguarde um momento!\nLogo você será atendido pela nossa equipe.',
        },
      },
      { delay: 1500 },
    );
  }

  public async messageManagement(received: proto.IWebMessageInfo) {
    if (received.key.fromMe) {
      return;
    }

    if (!this.callCenter) {
      this.callCenter = await this.prismaService.callCenter.findUnique({
        where: { phoneNumber: this.instance.client.user.id.split(':')[0] },
      });
    }

    // Declarando variavel que armazenaraos dados das transacoes
    let transaction: Transaction;
    // checando o remetente da mensagem
    const sender = await this.setSender(received);

    // verificando usuario e seu estagio
    if (sender?.customer) {
      const chatStage = await this.prismaService.chatStage.findUnique({
        where: { wuid: sender.customer.wuid },
      });
      if (chatStage.stage === 'finishedChat') {
        return await this.initialChat(received, sender.customer.customerId);
      }
      transaction = await this[chatStage.stage](received, sender.customer.customerId);
    }
  }
}
