import { prepareWAMessageMedia, proto } from '@adiwajshing/baileys';
import { Attendant } from '../../cache/attendant.cache';
import { Transaction } from '../../cache/transaction.cache';
import { formatDate } from '../../common/format.date';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../services/cache.service';
import { Options } from '../manage.service';
import * as XLSX from 'xlsx';
import { getMimeType } from '../../utils/mimetype/utils';
import { Instance } from '../instance.service';
import { Logger } from '../../common/logger';

type ResultCommands = 'finished' | 'list' | 'status' | Transaction;

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

  /**
   * Attendant commands:
   * ├> &end: ends the transaction;
   * │ ├> sends a message to the client informing the termination of its protocol;
   * │ ├> releases the user for a new service;
   * │ └> sends a message to the attendant informing the termination.
   * │
   * ├> &list: lists all transactions linked to the user and sends them to the attendant in
   * │ │ xlsx format.
   * │ └> &list c=<id>: lists all transactions for a given user.
   * ├> &customer:
   * │ ├> lists all clients and sends this information in xlsx format;
   * │ └> &customer c=<id>: retrieves all information for a specific customer.
   * │
   * ├> &pause: not implemented:
   * │ └> puts a given call on hold.
   * │
   * └> &status: not implemented:
   * └> informs the status of a given service.
   */

  public async '&end'(transaction: Transaction): Promise<ResultCommands> {
    // Ending the transaction.
    const transactionFinesher = await this.cacheService.transaction.update(
      { field: 'transactionId', value: transaction.transactionId },
      { status: 'FINISHED', finished: Date.now().toString(), finisher: 'A' },
    );

    // Sending message to the client.
    const customer = await this.cacheService.customer.find({
      field: 'customerId',
      value: transaction.customerId,
    });
    this.sendMessage(
      customer.wuid,
      {
        extendedTextMessage: {
          text: this.formatText(`Obrigado por entrar em contato conosco.
          Estanos encerrando este atendimento, caso precise de um novo atendimento, é só chamar aqui...\n
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

    // Deleting variables from cache.
    this.cacheService.customer.remove({
      field: 'customerId',
      value: transaction.customerId,
    });
    this.cacheService.attendant.remove({
      field: 'attendantId',
      value: transaction.attendantId,
    });
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

    /**
     * At this point we identify that the attendant is released for a new service,
     * so we search the database for a pending transaction in the bank.
     */
    const findTransaction = await this.prismaService.transaction.findFirst({
      where: { sectorId: attendant.companySectorId, status: 'ACTIVE' },
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
              text: `Total de atendimentos: *${transactions.length}*`,
            },
          },
          { delay: 500, quoted },
        ),
    );
  }

  public async '&customer'(attendant: Attendant, customerId: number) {
    if (customerId) {
      const customer = await this.prismaService.customer.findUnique({
        where: { customerId },
      });
      if (customer) {
        let imageMessage: proto.IImageMessage;
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
              text: this.formatText(`*Name: ${customer.name}*\n
              *ID:* ${customer.customerId}
              *PushName:* ${customer.pushName}
              *Wuid:* ${customer.wuid}
              *PhoneNumber:* ${customer.phoneNumber}`),
            },
          },
          { delay: 2000, quoted: sendImageMessage },
        );

        return;
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
                text: `Total de clientes: *${customers.length}*`,
              },
            },
            { delay: 500, quoted },
          ),
      );
    }
  }
}
