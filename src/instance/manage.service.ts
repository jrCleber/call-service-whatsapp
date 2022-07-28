import { delay, prepareWAMessageMedia, proto } from '@adiwajshing/baileys';
import { Attendant, CallCenter } from '@prisma/client';
import dayjs from 'dayjs';
import { Transaction } from '../cache/transaction.cache';
import { formatDate, timeDay } from '../common/format.date';
import { Logger } from '../common/logger';
import { CacheService } from '../services/cache.service';
import { Commands } from './command/commands';
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
  constructor(
    private readonly cacheService: CacheService,
    private readonly commands: Commands,
  ) {
    //
  }

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
    return;
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

    const customer = await this.cacheService.customer.find({
      field: 'wuid',
      value: wuid,
    });
    if (!customer || Object.keys(customer).length === 0) {
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
      customerId: id,
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

    this.cacheService.customer.update({ field: 'customerId', value: id }, { name: name });

    const transaction = await this.cacheService.transaction.find({
      field: 'customerId',
      value: id,
      status: 'ACTIVE',
    });
    // Composto pelo timestamp, convertido para segundos, mais o id do cliente.
    const protocol =
      Math.trunc(Number.parseInt(transaction.initiated) / 1000).toString() +
      '-' +
      transaction.transactionId;
    this.cacheService.transaction
      .update({ field: 'transactionId', value: transaction.transactionId }, { protocol })
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
      // transaction = await this.cacheService.transaction.find({
      //   Customer: { wuid },
      //   status: 'ACTIVE',
      // });
      transaction = await this.cacheService.transaction.find({
        field: 'Customer',
        value: { wuid },
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
        field: 'transactionId',
        value: Number.parseInt(selectedId.transaction),
      });
    }

    if (findSector && transaction) {
      this.cacheService.chatStage.update({ wuid }, { stage: 'setSubject' });
      await this.cacheService.transaction.update(
        { field: 'transactionId', value: transaction.transactionId },
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
      field: 'customerId',
      value: (
        await this.cacheService.customer.find({ field: 'wuid', value: wuid })
      ).customerId,
      status: 'ACTIVE',
    });

    const text = this.selectedText(received.message).trim().toLowerCase();
    if (text !== 'fim') {
      if (!transaction?.subject) {
        transaction.subject = JSON.stringify([received as any]);
      } else {
        const subject: proto.IWebMessageInfo[] = JSON.parse(
          transaction.subject as string,
        );
        subject.push(received);
        transaction.subject = JSON.stringify(subject);
      }
      this.cacheService.transaction.update(
        { field: 'transactionId', value: transaction.transactionId },
        { subject: transaction.subject },
      );
      return;
    }

    this.manageQueue(transaction);

    this.sendMessage(
      wuid,
      {
        extendedTextMessage: {
          text: `Ótimo! Aguarde um momento!\nLogo você será atendido pela nossa equipe.\n
          Para cancelar o atendimento, a qualquer momento, digit: *-1*`,
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
      field: 'customerId',
      value: transaction.customerId,
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
      this.sendMessage(releaseAttendant.wuid, {
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

  // O principal objetivo desta função é transacionar asmensagens do cliente para o atendente
  private async transaction(received: proto.IWebMessageInfo, id?: number) {
    const wuid = received.key.remoteJid;

    // Recuperando transação
    const transaction = await this.cacheService.transaction.find({
      field: 'customerId',
      value: id,
    });

    // declarando variável que armazenará os dados do atendente.
    let attendant: Attendant;

    // Selecionando o texto das mensagens de texto.
    const selectedText = this.selectedText(received.message);
    // Verificando se o cliente deseja cancelar o atendimeto.
    if (selectedText === '-1' || selectedText === '*-1*') {
      // Cancelando o atendimento.
      this.cacheService.transaction.update(
        { field: 'transactionId', value: transaction.transactionId },
        { finished: Date.now().toString(), finisher: 'C', status: 'FINISHED' },
      );
      // Enviando mensagem para o cliente que o seu atendimento foi finalizado,.
      this.sendMessage(
        wuid,
        {
          extendedTextMessage: {
            text: 'Tudo certo!\nO seu atendimento foi finalizado com sucesso.',
          },
        },
        { delay: 1500 },
      );
      // Verificando se existe um atendente vinculado a esse atendimento.
      if (transaction?.attendantId) {
        attendant = this.cacheService.attendant.find({
          field: 'attendantId',
          value: transaction.attendantId,
        });
        this.sendMessage(attendant.wuid, {
          extendedTextMessage: {
            text: `*Protocolo: ${transaction.protocol}*
            *Situação:* cancelado pelo cliente;
            *Status:* ${transaction.status}
            *Data/Hora:* ${formatDate(Date.now().toString())}`,
          },
        });
        // Deletando atendente do cache.
        this.cacheService.attendant.remove({
          field: 'attendantId',
          value: attendant.attendantId,
        });
      }
      // Deletando informações do cache.
      this.cacheService.chatStage.remove({ wuid });
      this.cacheService.customer.remove({
        field: 'customerId',
        value: transaction.customerId,
      });
      this.cacheService.transaction.remove({
        field: 'transactionId',
        value: transaction.transactionId,
      });

      return;
    }

    // Caso o cliente não esteja vinculado a um atendente
    if (!transaction?.attendantId) {
      this.sendMessage(
        wuid,
        {
          extendedTextMessage: {
            text: `Aguarde um momento!\nLogo você será atendido pela nossa equipe.\n
            Para cancelar o atendimento, a qualquer momento, digit: *-1*`,
          },
        },
        { delay: 1500 },
      );
      return;
    }

    // Encaminhando mensagem para o atendente.
    this.sendMessage(attendant.wuid, received.message, { delay: 1500 });

    return transaction;
  }

  // Esta função transacionará as mensagens do atendente para o cliente
  private async transactionAttendant(received: proto.IWebMessageInfo) {
    const wuid = received.key.remoteJid;

    // Verificando se o attendente inseriu um comando válido.
    const textCommand = this.selectedText(received.message) as keyof Commands;
    const command = this.commands[textCommand];
    if (command) {
      command();
      return;
    }

    // Buscando dados do atendente.
    const attendant = this.cacheService.attendant.find({
      field: 'wuid',
      value: wuid,
    });

    // Verificando se este atendente está vinculado a uma transação.
    const transaction = await this.cacheService.transaction.find({
      field: 'attendantId',
      value: attendant?.attendantId,
    });

    if (!transaction) {
      this.sendMessage(
        wuid,
        {
          extendedTextMessage: {
            text: 'No momento, você não está em nem um atendimento; aguarde até ser vinculado a um.',
          },
        },
        { delay: 1500 },
      );
      return;
    }

    // Buscando dados do usuário.
    const customer = await this.cacheService.customer.find({
      field: 'customerId',
      value: transaction?.customerId,
    });
    // Encaminhado mensagen do atendente ao cliente.
    if (customer) {
      this.sendMessage(customer.wuid, received.message, { delay: 1500 });
      return transaction;
    }
  }

  public async messageManagement(received: proto.IWebMessageInfo) {
    if (received.key.fromMe) {
      return;
    }

    const wuid = received.key.remoteJid;

    // Carregando variável que contém as informações do call center.
    if (!this.callCenter) {
      this.callCenter = await this.cacheService.getCallCenter(
        this.instance.client.user.id.split(':')[0],
      );
    }

    // Declarando variavel que armazenaraos dados das transacoes.
    let transaction: Transaction;

    // Verificando se o remetente da mensagem é um atendente.
    const attendant = this.cacheService.attendant.getAttendants(wuid);

    if (!attendant) {
      // Carregando cliente
      const customer = await this.loadCustomer(received);

      // Verificando usuario e seu estagio
      if (customer) {
        // recuperando estágio no cache
        const chatStage = await this.cacheService.chatStage.find({ wuid: customer.wuid });
        /**
         * Se a condição abaixo for satisfeita,identificamos que o cliente:
         *  ├> não se encontra no processo de atendimento;
         *  └> ou o, quailque atendimento, já foi finalizado.
         * Então podemos redirecioná-lo para o stágio inicial.
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
      transaction = await this.transactionAttendant(received);
    }
  }
}
