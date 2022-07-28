import { delay, prepareWAMessageMedia, proto } from '@adiwajshing/baileys';
import { Attendant, CallCenter, Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import { Transaction } from '../cache/transaction.cache';
import { formatDate, timeDay } from '../common/format.date';
import { Logger } from '../common/logger';
import { CacheService } from './cache.service';
import { Instance } from './instance.service';

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
  constructor(private readonly cacheService: CacheService) { }

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
    const sectors = await this.cacheService.sector.findMany();
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

    let customer = await this.cacheService.customer.find({ wuid });
    if (!customer) {
      customer = await this.cacheService.customer.create({
        pushName: received.pushName,
        createAt: Date.now().toString(),
        wuid: await this.profilePicture(wuid),
        phoneNumber: wuid.replace('@s.whatsapp.net', ''),
      });
    }

    return customer;
  }

  private async initialChat(received: proto.IWebMessageInfo, id?: number) {
    const wuid = received.key.remoteJid;

    await this.sendMessage(
      received.key.remoteJid,
      {
        extendedTextMessage: {
          text: this.callCenter.presentation
            .replace(Replace.BOTNAME, `*${this.callCenter.botName}*`)
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
    await this.cacheService.chatStage.create({
      wuid,
      stage: 'setName',
      customerId: (await this.cacheService.customer.find({ wuid })).customerId,
    });

    await this.cacheService.transaction.create({
      initiated: Date.now().toString(),
      customerId: id,
    });
  }

  private async setName(received: proto.IWebMessageInfo, id?: number) {
    const wuid = received.key.remoteJid;

    const name = this.selectedText(received.message);

    if (name === '' || Number.parseFloat(name)) {
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

    this.cacheService.customer.update({ customerId: id }, { name: name });

    const transaction = await this.cacheService.transaction.find({
      customerId: id,
      status: 'ACTIVE',
    });
    this.cacheService.transaction
      .update(
        { transactionId: transaction.transactionId },
        { protocol: `${transaction.initiated}-${transaction.transactionId}` },
      )
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
          if (sections?.length === 1) {
            this.cacheService.chatStage.update({ wuid }, { stage: 'setSubject' });
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

          this.cacheService.chatStage.update({ wuid }, { stage: 'checkSector' });
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
          local: ManageService.name + '.' + ManageService.prototype.setName.name,
          message: `Could not update transaction id: ${transaction.transactionId}`,
          ...error,
        }),
      );
  }

  private async checkSector(received: proto.IWebMessageInfo) {
    const wuid = received.key.remoteJid;
    const sectors = await this.cacheService.sector.findMany();

    let findSector = false;
    let sectorId: number;
    let transaction: Transaction;

    const text = this.selectedText(received.message);
    const selectedId = this.selectedIdMsg(received.message);

    if (text && sectors.find((s) => s.sector === text.toUpperCase())) {
      sectorId = sectors.find((s) => s.sector === text.toUpperCase()).sectorId;
      findSector = true;
      transaction = await this.cacheService.transaction.find({
        Customer: { wuid },
        status: 'ACTIVE',
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
      transaction = await this.cacheService.transaction.find({
        transactionId: Number.parseInt(selectedId.transaction),
      });
    }

    if (findSector && transaction) {
      this.cacheService.chatStage.update({ wuid }, { stage: 'setSubject' });
      await this.cacheService.transaction.update(
        { transactionId: transaction.transactionId },
        { sectorId },
      );
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

  private async setSubject(received: proto.IWebMessageInfo) {
    const wuid = received.key.remoteJid;

    const transaction = await this.cacheService.transaction.find({
      customerId: (await this.cacheService.customer.find({ wuid })).customerId,
      status: 'ACTIVE',
    });

    const text = this.selectedText(received.message).trim().toLowerCase();
    if (text !== 'fim') {
      if (!transaction?.subject) {
        transaction.subject = [received as unknown as Prisma.JsonObject];
      } else {
        (transaction.subject as Prisma.JsonArray).push(
          received as unknown as Prisma.JsonObject,
        );
      }
      (transaction.subject as any[]).push(received);
      this.cacheService.transaction.update(
        { transactionId: transaction.transactionId },
        { subject: transaction.subject },
      );
      return;
    }

    this.manageQueue(transaction);

    this.sendMessage(
      wuid,
      {
        extendedTextMessage: {
          text: 'Ótimo! Aguarde um momento!\nLogo você será atendido pela nossa equipe.',
        },
      },
      { delay: 1500 },
    );
    this.cacheService.chatStage.update({ wuid }, { stage: 'transaction' });
  }

  private async manageQueue(transaction: Transaction) {
    const transactions = await this.cacheService.transaction.findMany({
      where: { sectorId: transaction.sectorId, status: { notIn: 'PROCESSING' } },
    });

    let releaseAttendant: Attendant;

    if (!transactions.find((t) => t.attendantId)) {
      releaseAttendant = await this.cacheService.attendant.set({
        where: { companySectorId: transaction.sectorId },
      });
    } else {
      releaseAttendant = await this.cacheService.attendant.set({
        where: {
          attendantId: { notIn: [...new Set(transactions.map((t) => t.attendantId))] },
          companySectorId: transaction.sectorId,
        },
      });
    }

    const customer = await this.cacheService.customer.find({
      customerId: transaction.customerId,
    });

    let imageMessage: proto.IImageMessage;
    let contentText: string;
    let headerType: number;

    if (customer.profilePictureUrl !== 'no image') {
      try {
        const prepareMedia = await prepareWAMessageMedia(
          { image: { url: customer.profilePictureUrl } },
          { upload: this.instance.client.waUploadToServer },
        );
        imageMessage = prepareMedia.imageMessage;
        headerType = 4;

        contentText = this.removeSpaces(`*Protocolo: ${transaction.protocol}*
          *Clente:* ${customer.name || customer.pushName}
          *Contato:* ${customer.phoneNumber}`);
      } catch (error) {
        headerType = 2;
        contentText = this.removeSpaces(`*Clente:* ${customer.name || customer.pushName}
          *Contato:* ${customer.phoneNumber}`);
      }
    }

    return this.sendMessage(
      releaseAttendant.wuid,
      {
        extendedTextMessage: {
          text: '⚠️ *ATEÇÂO* ⚠️\nNova solicitação de atendimento.',
        },
      },
      { delay: 1000 },
    ).then(() =>
      this.sendMessage(
        releaseAttendant.wuid,
        {
          buttonsMessage: {
            text: `*Protocolo: ${transaction.protocol}*`,
            contentText,
            footerText: `Início: ${formatDate(transaction.initiated)}`,
            headerType,
            imageMessage,
            buttons: [
              {
                buttonId: 'accept-' + transaction.transactionId.toString(),
                buttonText: { displayText: 'Aceitar Atendimento' },
                type: 1,
              },
              {
                buttonId: 'not_accept-' + transaction.transactionId.toString(),
                buttonText: { displayText: 'Não aceitar' },
                type: 1,
              },
            ],
          },
        },
        { delay: 1500 },
      ),
    );
  }

  private async transaction(received: proto.IWebMessageInfo, id?: number) {
    //
  }

  public async messageManagement(received: proto.IWebMessageInfo) {
    if (received.key.fromMe) {
      return;
    }

    const customer = await this.loadCustomer(received);

    if (!this.callCenter) {
      this.callCenter = await this.cacheService.getCallCenter(
        this.instance.client.user.id.split(':')[0],
      );
    }

    // Declarando variavel que armazenaraos dados das transacoes
    let transaction: Transaction;

    // verificando usuario e seu estagio
    if (customer) {
      const chatStage = await this.cacheService.chatStage.find({ wuid: customer.wuid });
      if (!chatStage?.stage || chatStage.stage === 'finishedChat') {
        return await this.initialChat(received, customer.customerId);
      }
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      transaction = (await this[chatStage.stage](
        received,
        customer.customerId,
      )) as Transaction;
    }
  }
}
