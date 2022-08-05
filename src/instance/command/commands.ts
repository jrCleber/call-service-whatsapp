import { Attendant } from '../../cache/attendant.cache';
import { Transaction } from '../../cache/transaction.cache';
import { formatDate, timeDay } from '../../common/format.date';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../services/cache.service';
import { Options } from '../manage.service';
import * as XLSX from 'xlsx';
import { getMimeType } from '../../utils/mimetype/utils';
import { Instance } from '../instance.service';
import { Logger } from '../../common/logger';
import dayjs from 'dayjs';
import { prepareWAMessageMedia, proto } from '../../Baileys/src';

type ResultCommands = 'finished' | 'list' | 'status' | Transaction;

export type Flag = { type: string; value: any };

class CustomerCommands {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cacheService: CacheService,
  ) {
    //
  }

  public sendMessage: (
    wuid: string,
    message: proto.IMessage,
    options?: Options,
  ) => Promise<proto.IWebMessageInfo>;

  public instance: Instance;

  private formatText(value: string, regex = /^ +/gm) {
    return value.replace(regex, '');
  }

  public async c(attendant: Attendant, customerId: number) {
    const customer = await this.prismaService.customer.findUnique({
      where: { customerId },
    });
    if (!customer || Object.keys(customer).length === 0) {
      this.sendMessage(
        attendant.wuid,
        {
          extendedTextMessage: {
            text: 'O cliente solicitado não existe',
          },
        },
        { delay: 1500 },
      );
    } else {
      let imageMessage: proto.Message.IImageMessage;
      let sendImageMessage: proto.IWebMessageInfo;

      try {
        // Preparing the media message.
        const prepareMedia = await prepareWAMessageMedia(
          { image: { url: customer.profilePictureUrl } },
          { upload: this.instance.client.waUploadToServer },
        );
        // Assigning auxiliary variables.
        imageMessage = prepareMedia.imageMessage;
        imageMessage.caption = customer.profilePictureUrl;

        sendImageMessage = await this.sendMessage(
          attendant.wuid,
          { imageMessage },
          { delay: 1000 },
        );
      } catch (error) {
        // no image
      }

      this.sendMessage(
        attendant.wuid,
        {
          extendedTextMessage: {
            /*
              text: this.formatText(`*Name: ${customer.name}*\n
              *ID:* ${customer.customerId}
              *PushName:* ${customer.pushName}
              *Wuid:* ${customer.wuid}
              *PhoneNumber:* ${customer.phoneNumber}`),
            */
            text: this.formatText(`*Nome: ${customer.name}*\n
            *ID:* ${customer.customerId}
            *PushName:* ${customer.pushName}
            *Wuid:* ${customer.wuid}
            *Telefone:* ${customer.phoneNumber}`),
          },
        },
        { delay: 2000, quoted: sendImageMessage },
      );
    }

    // Removing cache attendant.
    return await this.cacheService.attendant.remove({
      field: 'attendantId',
      value: attendant.attendantId,
    });
  }

  public async g(attendant: Attendant, customerId: number) {
    const customer = await this.cacheService.customer.find({
      field: 'customerId',
      value: customerId,
    });
    if (!customer || Object.keys(customer).length === 0) {
      this.sendMessage(
        attendant.wuid,
        {
          extendedTextMessage: {
            text: 'O cliente solicitado não existe',
          },
        },
        { delay: 1500 },
      );
    } else {
      // Creating transaction.
      const transaction = await this.cacheService.transaction.create({
        customerId: customer.customerId,
        attendantId: attendant.attendantId,
        initiated: Date.now().toString(),
        status: 'PROCESSING',
        startProcessing: Date.now().toString(),
        sectorId: attendant.companySectorId,
        subject: 'initiated by attendant',
      });
      // Updating transaction with protocol.
      const protocol =
        Math.trunc(Number.parseInt(transaction.initiated) / 1000).toString() +
        '-' +
        transaction.transactionId;
      this.cacheService.transaction.update(
        {
          field: 'transactionId',
          value: transaction.transactionId,
          status: 'PROCESSING',
        },
        { protocol },
      );
      // Changing the stage of the customer.
      this.cacheService.chatStage.update(
        { wuid: customer.wuid },
        { stage: 'transaction' },
      );

      //Informing the customer of the opening of a call by the attendant.
      this.sendMessage(
        customer.wuid,
        {
          extendedTextMessage: {
            /*
            text: this.formatText(`${timeDay(dayjs().hour())} *${customer.name}*\n
            The attendant ${attendant.shortName} started a call with you.\n
            This is the service protocol: ${protocol}`),
            */
            text: this.formatText(`${timeDay(dayjs().hour())} *${customer.name}*\n
            O atendente ${attendant.shortName} iniciou um atendimento com você.\n
            Esse é o protocolo do atendimento *${protocol}*`),
          },
        },
        { delay: 1200 },
      );

      // Informing the attendant that the service is now open.
      this.sendMessage(
        attendant.wuid,
        {
          extendedTextMessage: {
            text: this
              .formatText(`Tudo certo! O atendimento já foi iniciado e você já pode conversar\n
            Esse é o protocolo do atendimento: *${protocol}*`),
          },
        },
        { delay: 1200 },
      );
    }
  }
}

class TransferCommands {
  // eslint-disable-next-line prettier/prettier
  constructor(private readonly cacheService: CacheService) { }

  public sendMessage: (
    wuid: string,
    message: proto.IMessage,
    options?: Options,
  ) => Promise<proto.IWebMessageInfo>;

  public instance: Instance;

  private formatText(value: string, regex = /^ +/gm) {
    return value.replace(regex, '');
  }

  public async s(attendant: Attendant, flag: Flag) {
    const sectors = await this.cacheService.sector.findMany();
    const sector = sectors.find((s) => s.sector === flag?.value.toString());
    // Verificando se o setor informado existe.
    if (!sector || Object.keys(sector).length === 0) {
      this.sendMessage(
        attendant.wuid,
        {
          extendedTextMessage: {
            // text: 'The sector informs does not exist or there are no attendants linked to it.',
            text: 'O setor informa não existe ou não existem atendentes vinculados a ele.',
          },
        },
        { delay: 1200 },
      );
      return;
    }
    // Finding transaction..
    const transaction = await this.cacheService.transaction.find({
      field: 'attendantId',
      value: attendant.attendantId,
    });
    // Finding customer.
    const customer = await this.cacheService.customer.find({
      field: 'customerId',
      value: transaction.customerId,
    });
    // Finalizing transaction.
    this.cacheService.transaction.update(
      { field: 'transactionId', value: transaction },
      { status: 'FINISHED', finished: Date.now().toString(), finisher: 'A' },
    );
    // Removing transaction from cache.
    this.cacheService.transaction.remove({
      field: 'transactionId',
      value: transaction.transactionId,
    });
    // Informing the customer that the transaction has been completed.
    this.sendMessage(
      customer.wuid,
      {
        extendedTextMessage: {
          /*
              text: this.formatText(`Esse atendimento foi encerrado.\n
              Agora você está sendo redirecionado para o setor *${sector.sector}*.`),
            */
          text: this.formatText(`Esse atendimento foi encerrado.\n
            Agora você está sendo redirecionado para o setor *${sector.sector}*.`),
        },
      },
      { delay: 1200 },
    );
    // Creating new transaction.
    const newTransaction = await this.cacheService.transaction.create({
      sectorId: sector.sectorId,
      customerId: customer.customerId,
      initiated: Date.now().toString(),
      status: 'ACTIVE',
      subject: JSON.stringify([
        {
          key: {
            fromMe: true,
            remoteJid: this.instance.client.user.id.replace(/:\d+/, 's'),
          },
          message: {
            extendedTextMessage: {
              text: this.formatText(
                `Cliente redirecionado do setor *${sectors.find(
                  (s) => s.sectorId === attendant.companySectorId,
                )}*.\n
                *Responsável:* ${attendant.shortName}
                *Contato:* ${attendant.phoneNumber}`,
              ),
            },
          },
        },
      ]),
    });
    // Creating a protocol.
    const protocol =
      Math.trunc(Number.parseInt(transaction.initiated) / 1000).toString() +
      '-' +
      transaction.transactionId;
    // Updating transaction.
    newTransaction.protocol = protocol;
    this.cacheService.transaction.update(
      { field: 'transactionId', value: newTransaction.transactionId },
      { protocol },
    );
    // Informing the customer of the new protocol number.
    this.sendMessage(
      customer.wuid,
      {
        extendedTextMessage: {
          // text: `This is the service protocol: *${protocol}*`,
          text: `Esse é o protocolo do atendimento *${protocol}*`,
        },
      },
      { delay: 1200 },
    );

    /**
     * Agora vamos procurar uma operação de atendimento que está ativa para
     * o setor que rediciionou o.
     */
    const releaseTransaction = await this.cacheService.transaction.find({
      field: 'sectorId',
      value: attendant.companySectorId,
      status: 'ACTIVE',
    });
    /**
     * We return to the file manage.service.ts:1100 the new transaction (newTransaction)
     * which is the redirection of the client to another sector and the negotiation available
     * releaseTransaction) that will be served (to the attendant.
     */
    return { newTransaction, releaseTransaction };
  }
}

export class Commands {
  constructor(
    private readonly cacheService: CacheService,
    private readonly prismaService: PrismaService,
  ) {
    //
  }

  private readonly logger = new Logger(Commands.name);

  private formatText(value: string, regex = /^ +/gm) {
    return value.replace(regex, '');
  }

  private sendMessage: (
    wuid: string,
    message: proto.IMessage,
    options?: Options,
  ) => Promise<proto.IWebMessageInfo>;

  private instance: Instance;

  public set setInstance(instance: Instance) {
    this.instance = instance;
  }

  public set waSendMessage(
    func: (w: string, m: proto.IMessage, o?: Options) => Promise<any>,
  ) {
    this.sendMessage = func;
  }

  // Customer commands object.
  private readonly customerCommands = new CustomerCommands(
    this.prismaService,
    this.cacheService,
  );
  private readonly transferCommands = new TransferCommands(this.cacheService);

  /**
   * Attendant commands:
   * ├> &end: ends the transaction;
   * │  ├> sends a message to the client informing the termination of its protocol;
   * │  ├> releases the user for a new service;
   * │  └> sends a message to the attendant informing the termination.
   * │
   * ├> &list: lists all transactions linked to the user and sends them to the attendant in
   * │  │ xlsx format.
   * │  └> &list c=<id>: lists all transactions for a given user.
   * │
   * ├> &customer: lists all clients and sends this information in xlsx format.
   * │  ├> &customer c=<id>: retrieves all information for a specific customer;
   * │  └> &customer g=<id>: retriever a customer and start a call.
   * │
   * ├> &transfer s=<sector name>: transfers the customer to the specified sector that
   * │   had attendants.
   * │
   * ├> &pause: not implemented:
   * │  └> puts a given call on hold.
   * │
   * └> &status: not implemented:
   *    └> informs the status of a given service.
   */

  public async '&end'(transaction: Transaction): Promise<ResultCommands> {
    // Ending the transaction.
    const transactionFinesher = await this.cacheService.transaction.update(
      { field: 'transactionId', value: transaction.transactionId, status: 'PROCESSING' },
      { status: 'FINISHED', finished: Date.now().toString(), finisher: 'A' },
    );

    // Sending message to the client.
    const customer = await this.cacheService.customer.find({
      field: 'customerId',
      value: transactionFinesher.customerId,
    });
    this.sendMessage(
      customer.wuid,
      {
        extendedTextMessage: {
          /*
            text: this.formatText(`Thank you for contacting us.
            We are closing this service, if you need a new service, just call here...\n
            *Protocol:* ${transactionFinesher.protocol}
            *Status:* FINISHED
            *Date/hour:* ${formatDate(transactionFinesher.finished)}`),
          */
          text: this.formatText(`Obrigado por entrar em contato conosco.
          Estamos encerrando esse atendimento, caso precise de um novo atendimento, é só chamar aqui...\n
          *Protocolo:* ${transactionFinesher.protocol}
          *Status:* FINALIZADO
          *Data/hora:* ${formatDate(transactionFinesher.finished)}`),
        },
      },
      { delay: 1200 },
    );
    // Updating user stage.
    this.cacheService.chatStage.update(
      { wuid: customer.wuid },
      { stage: 'finishedChat' },
    );

    // Deleting customer from cache.
    this.cacheService.customer.remove({
      field: 'customerId',
      value: transactionFinesher.customerId,
    });
    // Deleting stage from cache
    this.cacheService.chatStage.remove({ wuid: customer.wuid });

    // Sending message to the attendant.
    const attendant = await this.cacheService.attendant.find({
      field: 'attendantId',
      value: transactionFinesher.attendantId,
    });
    this.sendMessage(
      attendant.wuid,
      { extendedTextMessage: { text: 'Atendimento finalizado com sucesso' } },
      { delay: 1000 },
    );
    // Deleting completed transaction from cache.
    this.cacheService.transaction.remove({
      field: 'transactionId',
      value: transactionFinesher.transactionId,
      status: 'FINISHED',
    });
    /**
     * At this point we identify that the attendant is released for a new service,
     * so we search the database for a pending transaction in the bank.
     */
    const findTransaction = await this.cacheService.transaction.find({
      field: 'sectorId',
      value: attendant.companySectorId,
      status: 'ACTIVE',
    });
    // Deleting attendant from cache.
    this.cacheService.attendant.remove({
      field: 'attendantId',
      value: transaction.attendantId,
    });

    return findTransaction;
  }

  public async '&list'(attendant: Attendant, customerId?: number) {
    /**
     * Retrieving all transactions.
     *Note, it is not necessary to do any checking on the variable
     * customerId, because if it is undefined, we will retrieve all
     * the transactions of the attendant, otherwise, only that of the defined customer.
     */
    const transactions = await this.prismaService.transaction.findMany({
      where: { customerId, attendantId: attendant.attendantId },
      select: {
        transactionId: true,
        initiated: true,
        startProcessing: true,
        finished: true,
        protocol: true,
        status: true,
        finisher: true,
        Sector: { select: { sector: true } },
        Customer: {
          select: { name: true, phoneNumber: true, wuid: true, customerId: true },
        },
      },
    });
    // Verificando a quantidade de transações,
    if (transactions.length === 0) {
      this.sendMessage(
        attendant.wuid,
        {
          extendedTextMessage: {
            // text: 'There is no service associated with your user',
            text: 'Não existe nem um atendimento associado ao seu usuário',
          },
        },
        { delay: 1200 },
      );
      return;
    }
    // Formatting data for the worksheet.
    const formatData: any[] = [];
    transactions.forEach((t) =>
      formatData.push({
        trasactionId: t.transactionId,
        initiaed: new Date(Number.parseInt(t.initiated)),
        startProcessing: t?.startProcessing
          ? new Date(Number.parseInt(t.startProcessing))
          : '',
        finished: t?.finished ? new Date(Number.parseInt(t.finished)) : '',
        protocol: t.protocol,
        status: t.status,
        sector: t.Sector.sector,
        customerId: t.Customer.customerId,
        customer: t.Customer.name,
        phoneNumber: t.Customer.phoneNumber,
        wuid: t.Customer.wuid,
      }),
    );
    /**
     * Creating a workbook.
     * https://www.npmjs.com/package/xlsx
     */
    const workbook = XLSX.utils.book_new();
    workbook.Props = {
      Author: 'https://github.com/jrCleber',
      Title: 'Transactions by attendant',
      Company: 'CodeChat',
      CreatedDate: new Date(),
    };
    // Creating a workSheets with the formatted data.
    const workSheets = XLSX.utils.json_to_sheet(formatData);
    // Inserting workSheets into workbook.
    XLSX.utils.book_append_sheet(workbook, workSheets, 'transactions');
    // Converting workbook to buffer.
    const xlsxBuffer = XLSX.write(workbook, { type: 'buffer' });
    // Composing a name for the file.
    const fileName =
      'transactions' +
      `_${Date.now() / 1000}` +
      `_${attendant.attendantId}` +
      `_${attendant.shortName.toLowerCase().replace(' ', '_')}` +
      '.xlsx';
    // Preparando documento para o envio.
    const prepareMedia = await prepareWAMessageMedia({ document: xlsxBuffer } as any, {
      upload: this.instance.client.waUploadToServer,
    });
    const documentMessage = prepareMedia.documentMessage;
    documentMessage.fileName = fileName;
    documentMessage.mimetype = getMimeType(fileName);
    // Sending document.
    this.sendMessage(attendant.wuid, { documentMessage }, { delay: 1500 }).then(
      (quoted) =>
        this.sendMessage(
          attendant.wuid,
          {
            extendedTextMessage: {
              // text: `Total number of calls: *${transactions.length}*`,
              text: `Total de atendimentos: *${transactions.length}*`,
            },
          },
          { delay: 500, quoted },
        ),
    );
  }

  public async '&customer'(attendant: Attendant, flag?: Flag) {
    if (flag?.type && flag?.value) {
      this.customerCommands.sendMessage = this.sendMessage;
      this.customerCommands.instance = this.instance;
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return await this.customerCommands[flag.type](attendant, flag.value);
    }

    const customers = await this.prismaService.customer.findMany();
    const workbook = XLSX.utils.book_new();
    workbook.Props = {
      Author: 'https://github.com/jrCleber',
      Title: 'Customers list',
      Company: 'CodeChat',
      CreatedDate: new Date(),
    };
    const workSheets = XLSX.utils.json_to_sheet(customers);
    XLSX.utils.book_append_sheet(workbook, workSheets, 'customers');
    const xlsxBuffer = XLSX.write(workbook, { type: 'buffer' });
    const fileName =
      'customers' +
      `_${Date.now() / 1000}` +
      `_${attendant.attendantId}` +
      `_${attendant.shortName.toLowerCase().replace(' ', '_')}` +
      '.xlsx';
    const prepareMedia = await prepareWAMessageMedia({ document: xlsxBuffer } as any, {
      upload: this.instance.client.waUploadToServer,
    });
    const documentMessage = prepareMedia.documentMessage;
    documentMessage.fileName = fileName;
    documentMessage.mimetype = getMimeType(fileName);
    this.sendMessage(attendant.wuid, { documentMessage }, { delay: 1500 }).then(
      (quoted) =>
        this.sendMessage(
          attendant.wuid,
          {
            extendedTextMessage: {
              // text: `Total customers:: *${customers.length}*`,
              text: `Total de clientes: *${customers.length}*`,
            },
          },
          { delay: 500, quoted },
        ),
    );

    // Removing cache attendant.
    return await this.cacheService.attendant.remove({
      field: 'attendantId',
      value: attendant.attendantId,
    });
  }

  public async '&transfer'(attendant: Attendant, flag: Flag) {
    if (flag?.type && flag?.value) {
      this.transferCommands.instance = this.instance;
      this.transferCommands.sendMessage = this.sendMessage;
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return this.transferCommands[flag.type](attendant, flag.value);
    }

    this.sendMessage(
      attendant.wuid,
      {
        extendedTextMessage: {
          // text: 'The command typed is not recognized.',
          text: 'O comando digitado não é reconhecido.',
        },
      },
      { delay: 1200 },
    );
  }
}
