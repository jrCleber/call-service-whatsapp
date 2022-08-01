import { delay, prepareWAMessageMedia, proto } from '@adiwajshing/baileys';
import { Attendant, CallCenter, Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import { Customer } from '../cache/customer.cache';
import { Transaction } from '../cache/transaction.cache';
import { formatDate, timeDay } from '../common/format.date';
import { Logger } from '../common/logger';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService, CallCenterService, Weekday } from '../services/cache.service';
import { Commands } from './command/commands';
import { Instance } from './instance.service';

export type Options = { delay?: number; quoted?: proto.IWebMessageInfo };

type ItemSelected = {
  transaction?: string;
  customerId?: string;
  action?: string;
  callCenterId?: string;
  sectorId?: string;
};

type TextCommand = {
  text?: keyof Commands;
  param1?: string;
  param2?: number;
};

enum Replace {
  BOTNAME = '<botName>',
  DAY = '<day>',
}

export class ManageService {
  constructor(
    private readonly cacheService: CacheService,
    private readonly commands: Commands,
    private readonly prismaService: PrismaService,
  ) {
    //
  }

  private instance: Instance = {};
  private callCenter: CallCenterService;
  private readonly logger = new Logger(ManageService.name);

  public set client(value: any) {
    this.instance = value;
  }

  private formatText(value: string, regex = /^ +/gm) {
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
      { quoted: options?.quoted },
    );
  }

  private selectedText(message: proto.IMessage) {
    if (message?.conversation) return message.conversation;
    if (message?.extendedTextMessage) return message.extendedTextMessage.text;
    return;
  }

  private async saveMessage(transaction: Transaction, received: proto.IWebMessageInfo) {
    const wuid = received.key.remoteJid;
    const header = received.key as Prisma.JsonObject;
    const body = received.message as Prisma.JsonObject;

    const customer = await this.cacheService.customer.find({
      field: 'wuid',
      value: wuid,
    });

    this.prismaService.messageWA
      .create({
        data: {
          header,
          body,
          sender: customer ? 'C' : 'A',
          wuid,
          senderAt: Date.now().toString(),
          transactionId: transaction.transactionId,
        },
      })
      .then((result) => this.logger.info(`Message id: ${result.messageId} - CREATED`))
      .catch((error) =>
        this.logger.error({
          local: ManageService.name + '.' + ManageService.prototype.saveMessage.name,
          error,
        }),
      );
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

  /**
   * Creating a list of sectors.
   * @param tId -> transactionId
   * @param cId -> customerId
   */
  private async createList(tId: number, cId: number): Promise<proto.ISection[]> {
    const sectors = await this.cacheService.sector.findMany();
    const rows: proto.IRow[] = Array.from(sectors, (sector) => {
      return {
        title: sector.sector.toUpperCase(),
        description: ' ',
        rowId: `${cId}-${tId}-${sector.callCenterId}-${sector.sectorId}`,
      };
    });
    return [{ title: 'SETORES', rows }];
  }

  /**
   * Fetching the user's profile picture.
   * @param wuid -> whatsapp unique identifier
   */
  private async profilePicture(wuid: string) {
    try {
      return await this.instance.client.profilePictureUrl(wuid, 'image');
    } catch (error) {
      return 'no image';
    }
  }

  private async loadCustomer(received: proto.IWebMessageInfo) {
    const wuid = received.key.remoteJid;
    // Performing a cache and db lookup to return the requested client.
    const customer = await this.cacheService.customer.find({
      field: 'wuid',
      value: wuid,
    });
    // Not existing:
    if (!customer || Object.keys(customer).length === 0) {
      // We create a client.
      const customerCreate = await this.cacheService.customer.create({
        pushName: received.pushName,
        createAt: Date.now().toString(),
        profilePictureUrl: await this.profilePicture(wuid),
        wuid,
        phoneNumber: wuid.replace('@s.whatsapp.net', ''),
      });

      return customerCreate;
    }

    return customer;
  }

  private async initialChat(received: proto.IWebMessageInfo, id?: number) {
    const wuid = received.key.remoteJid;
    // Sending greeting message.
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
    // Requesting the name.
    await this.sendMessage(
      wuid,
      { extendedTextMessage: { text: 'Digite agora o seu nome:' } },
      { delay: 1000 },
    );
    // Initializing client stages.
    await this.cacheService.chatStage.create({
      wuid,
      stage: 'setName',
      customerId: id,
    });
    // Starting a transaction.
    await this.cacheService.transaction.create({
      initiated: Date.now().toString(),
      customerId: id,
    });
  }

  private async setName(received: proto.IWebMessageInfo, id?: number) {
    const wuid = received.key.remoteJid;
    // Selecting the customer's name.
    const name = this.selectedText(received.message);
    // Checking if the name exists or if it is a number.
    if (!name || Number.parseFloat(name)) {
      this.sendMessage(
        wuid,
        {
          extendedTextMessage: {
            text: this
              .formatText(`A mensagem que você enviou para não é válida para ser atribuída ao um nome.\n
            Informe o seu nome:`),
          },
        },
        { delay: 1500, quoted: received },
      );
      return;
    }
    // Updating the user.
    this.cacheService.customer.update({ field: 'customerId', value: id }, { name: name });
    // Fetching transaction.
    const transaction = await this.cacheService.transaction.find({
      field: 'customerId',
      value: id,
      status: 'ACTIVE',
    });
    // Composing protocol: composed of the timestamp, converted to seconds, plus the client id.
    const protocol =
      Math.trunc(Number.parseInt(transaction.initiated) / 1000).toString() +
      '-' +
      transaction.transactionId;
    // Updating transaction with protocol number.
    this.cacheService.transaction
      .update({ field: 'transactionId', value: transaction.transactionId }, { protocol })
      .then(({ protocol }) =>
        // Informing the user of the protocol number.
        this.sendMessage(
          wuid,
          {
            extendedTextMessage: {
              text: `Ótimo ${name}.\n\nEsse é o protocolo do seu atendimento: *${protocol}*`,
            },
          },
          { delay: 1000 },
        ).then(async () => {
          const sectors = await this.cacheService.sector.findMany();
          /**
           * If there is only one sector for service:
           * └> redirects the client to the subject stage.
           */
          if (sectors?.length === 1) {
            this.cacheService.chatStage.update({ wuid }, { stage: 'setSubject' });
            // Solicitando ao cliente o assunto do chamado.
            this.sendMessage(
              wuid,
              {
                extendedTextMessage: {
                  text: `${this.formatText(`Informe agora o assunto do seu atendimento.\n
                  Pode ser um text, ou vídeo, ou imagem, etc.
                  E quando vc terminar, envie a palavra:\n`)}
                                  *FIM*\n`,
                },
              },
              { delay: 1000 },
            );
            return;
          }
          /**
           * If there is more than one sector:
           * └> we redirect the client to the stage that checks the sector.
           */
          const sections = await this.createList(
            transaction.transactionId,
            transaction.customerId,
          );
          this.cacheService.chatStage.update({ wuid }, { stage: 'checkSector' });
          // Sending the sector list to the client.
          await this.sendMessage(
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
          message: 'There was an error sending the list.',
          ...error,
        }),
      );
  }

  /**
   * During the check of the sector for the service, the user can:
   * ├> both enter the name of the sector;
   * └> how much to click list night.
   * Therefore, we will treat both cases.
   */
  private async checkSector(received: proto.IWebMessageInfo) {
    const wuid = received.key.remoteJid;
    // Retrieving all sectors.
    const sectors = await this.cacheService.sector.findMany();
    // Declaring auxiliary variables.
    let findSector = false;
    let sectorId: number;
    let transaction: Transaction;
    // Selecting the typed text.
    const text = this.selectedText(received.message);
    // Checking that the text variable is not true and that the sector exists in the sector list.
    if (text && sectors.find((s) => s.sector === text.toUpperCase())) {
      /**
       * Existing:
       * ├> select the sector id;
       * ├> we assign the value true to the findSector variable, which we will use later.
       * └> we fetch the user transaction.
       */
      sectorId = sectors.find((s) => s.sector === text.toUpperCase()).sectorId;
      findSector = true;
      transaction = await this.cacheService.transaction.find({
        field: 'Customer',
        value: { wuid },
        status: 'ACTIVE',
      });
    } else {
      // Selecting the id of the clicked list item (rowId)
      const selectedId = this.selectedIdMsg(received.message);
      // Checking if the id exists and if it is an existing id.
      if (
        selectedId?.transaction &&
        sectors.find((s) => s.sectorId === Number.parseInt(selectedId.sectorId))
      ) {
        /**
         * Existing:
         * ├> select the sector id;
         * ├> we assign the value true to the findSector variable, which we will use later.
         * └> we fetch the user transaction.
         */
        sectorId = sectors.find(
          (s) => s.sectorId === Number.parseInt(selectedId.sectorId),
        ).sectorId;
        findSector = true;
        transaction = await this.cacheService.transaction.find({
          field: 'transactionId',
          value: Number.parseInt(selectedId.transaction),
          status: 'ACTIVE',
        });
      }
    }

    // Checking if the sector was found and if the transaction exists
    if (findSector && transaction) {
      // Changing user stage to inform subject.
      this.cacheService.chatStage.update({ wuid }, { stage: 'setSubject' });
      // Updating transaction with sector id.
      await this.cacheService.transaction.update(
        { field: 'transactionId', value: transaction.transactionId },
        { sectorId },
      );
      // Sending message to the client requesting the subject.
      this.sendMessage(
        wuid,
        {
          extendedTextMessage: {
            text: `${this.formatText(`Informe agora o assunto do seu atendimento.\n
            Pode ser um text, ou vídeo, ou imagem, etc.
            E quando vc terminar, envie a palavra:\n`)}
                            *FIM*\n`,
          },
        },
        { delay: 1000 },
      );
    } else {
      // If the sector is not found or the transaction does not exist, we inform that there was an error for the client
      this.sendMessage(
        wuid,
        {
          extendedTextMessage: {
            text: this.formatText(
              `👆🏼👆🏼 Houve um erro ao atribuir esta categoria!\nTente novamente informar a categoria.\n
              Ou digite *-1*, para cancelar o atendimento`,
            ),
          },
        },
        { delay: 1500, quoted: received },
      );
    }
  }

  private async setSubject(received: proto.IWebMessageInfo) {
    const wuid = received.key.remoteJid;
    // Fetching the transaction in which the customer is.
    const transaction = await this.cacheService.transaction.find({
      field: 'customerId',
      value: (
        await this.cacheService.customer.find({ field: 'wuid', value: wuid })
      ).customerId,
      status: 'ACTIVE',
    });
    // Checking if the customer has typed the FIM command, to cancel the service.
    const text = this.selectedText(received.message)?.trim().toLowerCase();
    if (text !== 'fim') {
      // We start assigning the subject to the transaction.
      if (!transaction?.subject) {
        transaction.subject = JSON.stringify([received as any]);
      } else {
        const subject: proto.IWebMessageInfo[] = JSON.parse(
          transaction.subject as string,
        );
        subject.push(received);
        transaction.subject = JSON.stringify(subject);
      }
      // Updating transaction with subject.
      this.cacheService.transaction.update(
        { field: 'transactionId', value: transaction.transactionId },
        { subject: transaction.subject },
      );
      return;
    }
    /**
     * Starting the queue manager, which will put the client on hold and send to
     * the industry's first available craftsman, a fulfillment request.
     */
    this.manageQueue(transaction);
    // Sending a message to the user, after the subject is finalized.
    this.sendMessage(
      wuid,
      {
        extendedTextMessage: {
          text: this
            .formatText(`Ótimo! Aguarde um momento!\nLogo você será atendido pela nossa equipe.\n
          Para cancelar o atendimento, a qualquer momento, digit: *-1*`),
        },
      },
      { delay: 1500 },
    );
    // Updating user stage.
    this.cacheService.chatStage.update({ wuid }, { stage: 'transaction' });
  }

  // This function sends a service request to the attendant.
  private async serviceRequest(
    transaction: Transaction,
    customer: Customer,
    attendant: Attendant,
  ) {
    /**
     * At this point, we will start assigning the customer profile image:
     */
    // Declaring auxiliary variables.
    let imageMessage: proto.IImageMessage;
    let contentText: string;
    let headerType: number;
    try {
      // Preparing the media message.
      const prepareMedia = await prepareWAMessageMedia(
        { image: { url: customer.profilePictureUrl } },
        { upload: this.instance.client.waUploadToServer },
      );
      // Assigning auxiliary variables.
      imageMessage = prepareMedia.imageMessage;
      headerType = 4;
      contentText = this.formatText(`*Protocolo: ${transaction.protocol}*
          *Clente:* ${customer.name || customer.pushName}
          *Id do cliente:* ${customer.customerId}
          *Contato:* ${customer.phoneNumber}`);
    } catch (error) {
      // If the preparation causes an error, we ignore the customer's profile image.
      headerType = 2;
      contentText = this.formatText(`*Clente:* ${customer.name || customer.pushName}
          *Contato:* ${customer.phoneNumber}`);
    }

    // Informing the selected attendant that there is a new service request.
    this.sendMessage(
      attendant.wuid,
      {
        extendedTextMessage: {
          text: '⚠️ *ATEÇÂO* ⚠️\nNova solicitação de atendimento.',
        },
      },
      { delay: 1000 },
    ).then(() =>
      // Asking the attendant to accept the request.
      this.sendMessage(attendant.wuid, {
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
      }),
    );
  }

  private async manageQueue(transaction: Transaction) {
    // Fetching all sectors.
    const sectors = await this.cacheService.sector.findMany();
    let sectorId: number;
    // Checking the number of sectors.
    if (sectors.length === 1) {
      sectorId = sectors[0].sectorId;
    }
    // Fetching all transactions, according to the where clause.
    const transactions = await this.cacheService.transaction.findMany({
      where: {
        sectorId: transaction.sectorId || sectorId,
        status: { notIn: 'PROCESSING' },
      },
      select: { attendantId: true },
    });
    this.logger.log({ MQ_T: transactions });
    // Declaring variable that will store the available attendant.
    let releaseAttendant: Attendant;
    // If all the agents in the sector are available, we assign the first one.
    if (!transactions.find((t) => t.attendantId)) {
      releaseAttendant = await this.cacheService.attendant.realise({
        where: { companySectorId: transaction.sectorId },
      });
      this.logger.log({ if: releaseAttendant });
    } else {
      // retrieving attendants in attendance.
      const inAttendance: number[] = [];
      transactions.forEach((t) => {
        if (t?.attendantId) return inAttendance.push(t.attendantId);
      });
      /**
       * If not:
       * └> we search in the attendant table, the first available attendant for the sector
       * selected.
       */
      releaseAttendant = await this.cacheService.attendant.realise({
        where: {
          attendantId: { notIn: [...inAttendance] },
          companySectorId: transaction.sectorId,
        },
      });
      this.logger.log({ else: releaseAttendant });
    }

    // Fetching the user related to the transaction.
    const customer = await this.cacheService.customer.find({
      field: 'customerId',
      value: transaction.customerId,
    });

    /**
     * Checking if there is an attendant available, if not, the customer will wait
     * until an attendant, from the requested sector, finishes a service.
     */
    if (releaseAttendant) {
      this.serviceRequest(transaction, customer, releaseAttendant);
      return;
    }

    return;
  }

  // The main purpose of this function is to transact messages from the customer to the attendant.
  private async transaction(received: proto.IWebMessageInfo, id?: number) {
    const wuid = received.key.remoteJid;
    // Retrieving transaction.
    const transaction = await this.cacheService.transaction.find({
      field: 'customerId',
      value: id,
      status: 'PROCESSING',
    });
    // Looking for attendant.
    const attendant = await this.cacheService.attendant.find({
      field: 'attendantId',
      value: transaction.attendantId,
    });
    // Selecting the text of text messages.
    const selectedText = this.selectedText(received.message);
    // Checking if the customer wants to cancel the service.
    if (selectedText === '-1' || selectedText === '*-1*') {
      this.logger.log({ transaction });
      // Canceling the call.
      this.cacheService.transaction.update(
        { field: 'transactionId', value: transaction.transactionId },
        { finished: Date.now().toString(), finisher: 'C', status: 'FINISHED' },
      );
      // Sending a message to the customer that their service has ended.
      this.sendMessage(
        wuid,
        {
          extendedTextMessage: {
            text: 'Tudo certo!\nO seu atendimento foi finalizado com sucesso.',
          },
        },
        { delay: 1500 },
      );
      // Checking if there is an attendant linked to this call.
      if (attendant || Object?.keys(attendant).length > 0) {
        this.sendMessage(attendant.wuid, {
          extendedTextMessage: {
            text: this.formatText(`*Protocolo: ${transaction.protocol}*
            *Situação:* cancelado pelo cliente;
            *Status:* FINISHED
            *Data/Hora:* ${formatDate(Date.now().toString())}`),
          },
        });
        // Deleting cache attendant.
        this.cacheService.attendant.remove({
          field: 'attendantId',
          value: attendant.attendantId,
        });
      }
      // Deleting cache information.
      this.cacheService.chatStage.remove({ wuid });
      this.cacheService.customer.remove({
        field: 'customerId',
        value: transaction.customerId,
      });
      this.cacheService.transaction.remove({
        field: 'transactionId',
        value: transaction.transactionId,
        status: 'FINISHED',
      });

      return;
    }

    // If the customer is not linked to an attendant.
    if (!transaction?.attendantId) {
      this.sendMessage(
        wuid,
        {
          extendedTextMessage: {
            text: this
              .formatText(`Aguarde um momento!\nLogo você será atendido pela nossa equipe.\n
            Para cancelar o atendimento, a qualquer momento, digite: *-1*`),
          },
        },
        { delay: 1500 },
      );

      return;
    }

    // Forwarding message to the attendant.
    this.sendMessage(attendant.wuid, received.message, { delay: 1500 }).then(
      async (quoted) => {
        /**
         * So that the attendant doesn't get lost in the chat, let's quote the message
         * forwarded by the user with the transaction information.
         * This will facilitate the search for messages in the chat and does not confuse the attendant
         * about who sent the message.
         */
        // Fetching customer information.
        const customer = await this.cacheService.customer.find({
          field: 'customerId',
          value: transaction.customerId,
        });
        this.sendMessage(
          attendant.wuid,
          {
            extendedTextMessage: {
              text: this.formatText(`*Protocolo: ${transaction.protocol}*
              *Cliente:* ${customer.name}
              *Id do cliente:* ${customer.customerId}`),
            },
          },
          { delay: 500, quoted },
        );
      },
    );

    return transaction;
  }

  // This function recognizes whether the attendant accepts the service or not.
  private async checkAcceptance(received: proto.IWebMessageInfo) {
    /**
     * Allocating button click response, if any,
     * because the attendant can click on the button, as well as
     * enter a text.
     */
    const selected = this.selectedIdMsg(received.message);
    // If you type a text, we interrupt this code snippet.
    if (!selected) {
      return false;
    }
    const wuid = received.key.remoteJid;
    // Fetching selected transaction.
    const transaction = await this.cacheService.transaction.find({
      field: 'transactionId',
      value: Number.parseInt(selected?.transaction),
      status: 'ACTIVE',
    });
    // Fetching customer information.
    const customer = await this.cacheService.customer.find({
      field: 'customerId',
      value: transaction.customerId,
    });
    const attendant = await this.cacheService.attendant.find({
      field: 'wuid',
      value: wuid,
      sectorId: transaction.sectorId,
    });
    // Checking if the attendant accepted the request.
    if (selected?.action === 'accept') {
      // Checking if the request was not answered by another attendant.
      if (transaction?.attendantId) {
        this.sendMessage(
          wuid,
          {
            extendedTextMessage: {
              text: 'Esta solicitação já foi atendida por outro atendente',
            },
          },
          { delay: 1000 },
        );

        return;
      } else {
        // Updating transaction with the id of the attendant.
        this.cacheService.transaction.update(
          { field: 'transactionId', value: transaction.transactionId },
          {
            attendantId: attendant.attendantId,
            startProcessing: Date.now().toString(),
            status: 'PROCESSING',
          },
        );
        // Sending the transaction subject to the attendant.
        const subject: proto.IWebMessageInfo[] = JSON.parse(
          transaction.subject as string,
        );
        await this.sendMessage(
          wuid,
          {
            extendedTextMessage: {
              text: '*ASSUNTO INFORMADO PELO CLIENTE*',
            },
          },
          { delay: 1500 },
        );
        for await (const message of subject) {
          await this.sendMessage(wuid, message.message, { delay: 100 });
        }
        // Informing that the subject has been finalized.
        await this.sendMessage(
          wuid,
          {
            extendedTextMessage: {
              text: '*FINALIZAÇÃO DO ASSUNTO*',
            },
          },
          { delay: 1000 },
        );
        // Sending a message to the attendant, informing that the chat is already linked.
        this.sendMessage(
          wuid,
          {
            extendedTextMessage: {
              text: 'Ótimo!\nAgora, você já pode iniciar o atendimento!',
            },
          },
          { delay: 1200 },
        );
        // Sending a message to the client informing that the chat is released.
        this.sendMessage(
          customer.wuid,
          {
            extendedTextMessage: {
              text: this.formatText(
                `Olá *${customer.name}*! O meu nome é *${attendant.shortName}* e irei realizar o seu atendimento.\n
                Já estou analizando o seu assunto, me aguarde um momento!`,
              ),
            },
          },
          { delay: 1000 },
        );
      }

      return true;
    }

    // O atendente não aceitando a solicitação, buscamos todas as transações.
    const transactions = await this.cacheService.transaction.findMany({
      where: { sectorId: transaction.sectorId, status: { notIn: 'PROCESSING' } },
    });
    // Declarando variável que armazenará o atendente dispon´vel.
    let releaseAttendant: Attendant;
    // Caso todos os atendentes do setor estivem disponíveis, atribuímos o primeiro.
    if (!transactions.find((t) => t.attendantId)) {
      releaseAttendant = await this.cacheService.attendant.realise({
        where: { companySectorId: transaction.sectorId },
      });
    } else {
      /**
       * Caso não:
       *  └> buscamos na tabela attendant, o primeiro atendente disponível para o setor
       *     selecionado.
       */
      releaseAttendant = await this.cacheService.attendant.realise({
        where: {
          attendantId: { notIn: [...new Set(transactions.map((t) => t.attendantId))] },
          companySectorId: transaction.sectorId,
        },
      });
    }
    // Enviando mensagem para o atendente.
    if (releaseAttendant) {
      this.serviceRequest(transaction, customer, releaseAttendant);
      return true;
    }
  }

  // This function will transact messages from the attendant to the customer.
  private async transactionAttendant(received: proto.IWebMessageInfo) {
    const wuid = received.key.remoteJid;
    // Fetching data from the attendant.
    const attendant = await this.cacheService.attendant.find({
      field: 'wuid',
      value: wuid,
    });
    // Checking if this listener is linked to a transaction.
    const transaction = await this.cacheService.transaction.find({
      field: 'attendantId',
      value: attendant?.attendantId,
      status: 'PROCESSING',
    });

    if (!transaction) {
      this.sendMessage(
        wuid,
        {
          extendedTextMessage: {
            text: 'No momento, você não está envolvido nem um atendimento.\nAguarde até ser vinculado a um.',
          },
        },
        { delay: 1500 },
      );
      return;
    }

    // Checking if the attendant entered a valid command.
    const textCommand = this.selectedText(
      received.message,
    ).toLowerCase() as keyof Commands;
    if (this.commands[textCommand]) {
      this.commands.setInstance = this.instance;
      this.commands.waSendMessage = this.sendMessage;
      // Receiving available transaction.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const releaseTransaction = (await this.commands[textCommand](
        transaction,
      )) as Transaction;
      // Checking if a transaction exists.
      if (releaseTransaction) {
        // Fetching the client.
        const customer = await this.cacheService.customer.find({
          field: 'customerId',
          value: releaseTransaction.customerId,
        });
        // Sending service request to the attendant.
        this.serviceRequest(releaseTransaction, customer, attendant);
      }

      return;
    }

    // Fetching user data.
    const customer = await this.cacheService.customer.find({
      field: 'customerId',
      value: transaction?.customerId,
    });
    // Forward message from customer service.
    if (customer) {
      this.sendMessage(customer.wuid, received.message, { delay: 1500 });
      return transaction;
    }
  }

  // Checking opening hours.
  private checkOperation(wuid: string, customerName: string) {
    // Getting the day of the week.
    const day = dayjs().day() as Weekday;
    // Getting the current time.
    const hour = dayjs().hour();
    const operation = this.callCenter.operation;
    // Checking if it's a working day.
    if (
      !operation.weekday.includes(day) ||
      hour < operation.open ||
      hour > operation.closed
    ) {
      this.sendMessage(
        wuid,
        {
          templateMessage: {
            hydratedTemplate: {
              templateId: '01',
              hydratedTitleText: `Olá ${customerName}, ${timeDay(
                dayjs().hour(),
              ).toLowerCase()}😉!`,
              hydratedContentText:
                'A nossa equipe 🤝🏼 agradece a sua mensage!\n' +
                'No momento nós não estamos disponíveis🙂!\n\n' +
                'Nosso horário de funcionamento é das ' +
                `*${operation.open}h* às *${operation.closed}h*` +
                ` ${operation?.desc ? operation.desc : '.'}\n\n` +
                'Para mais informações, acesse a nossa página!',
              hydratedFooterText: this.callCenter.botName.toLowerCase(),
              hydratedButtons: [
                {
                  index: 0,
                  urlButton: {
                    displayText: this.callCenter.companyName,
                    url: this.callCenter.url,
                  },
                },
              ],
            },
          },
        },
        { delay: 2000 },
      );
      return false;
    }

    return true;
  }

  private async operationAttendant(received: proto.IWebMessageInfo) {
    const wuid = received.key.remoteJid;
    // Declaring variable that will receive the command.
    const textCommand: TextCommand = {};
    // Checking if the attendant entered a valid command.
    const selectedText = this.selectedText(received.message);
    // Checking the command type.
    const split = selectedText?.split(' ');
    if (!split) {
      return;
    }
    if (split.length === 1) {
      textCommand.text = split[0].toLowerCase() as keyof Commands;
      /**
       * The &end command, is the only command that the user executes being linked to
       * a transaction. And, in the course of execution, the code informs you that the attendant
       * is not linked to any service.
       */
      if (textCommand.text === '&end') {
        return false;
      }
    } else if (split.length > 0) {
      textCommand.text = split[0] as keyof Commands;
      const params = split[1].split('=');
      textCommand.param1 = params[0];
      textCommand.param2 =
        Number.parseInt(params[1]).toString() !== 'NaN'
          ? Number.parseInt(params[1])
          : undefined;
    }
    // Looking for attendant.
    const attendant = await this.cacheService.attendant.find({
      field: 'wuid',
      value: wuid,
    });
    // Checking if the command function reference is true.
    if (this.commands[textCommand.text]) {
      this.commands.setInstance = this.instance;
      this.commands.waSendMessage = this.sendMessage;
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.commands[textCommand.text](attendant, textCommand.param2);
      return true;
    }
  }

  public async messageManagement(received: proto.IWebMessageInfo) {
    if (received.key.fromMe) {
      return;
    }

    /**
     * @wuid -> whatsapp unique identifier
     */
    const wuid = received.key.remoteJid;

    // Loading variable that contains the call center information.
    if (!this.callCenter) {
      this.callCenter = await this.cacheService.getCallCenter(
        this.instance.client.user.id.split(':')[0],
      );
    }

    // Declaring variable that will store transaction data.
    let transaction: Transaction;

    // Checking if the message sender is an attendant.
    const attendant = this.cacheService.attendant.getAttendant(wuid);
    // Not being...
    if (!attendant) {
      // Carregando cliente.
      const customer = await this.loadCustomer(received);
      // Checking office hours.
      if (this.checkOperation(wuid, customer.name) === false) {
        return;
      }

      // Checking user and his stage.
      if (customer) {
        // Retrieving stage from cache.
        const chatStage = await this.cacheService.chatStage.find({ wuid: customer.wuid });
        /**
         * If the condition below is satisfied, we identify that the customer:
         * ├> is not in the service process;
         * └> or whatever service has already been completed.
         * Then we can redirect it to the initial stage.
         */
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
    } else {
      // Checking if the attendant has typed a command.
      if (await this.operationAttendant(received)) {
        return;
      }
      /**
       * If the check for the click of the attendant button returns false, we run
       * the transactionAttendant function.
       */
      if ((await this.checkAcceptance(received)) === false) {
        transaction = await this.transactionAttendant(received);
      }
    }
    /**
     * Checking if the transaction value returns true, to save
     * the message in the database associated with the transaction id.
     */
    if (transaction) {
      this.saveMessage(transaction, received);
    }
  }
}
