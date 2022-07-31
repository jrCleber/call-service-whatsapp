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
   * Comandos do atendente:
   * ├> &end:
   * │  ├> finaliza a transação;
   * │  ├> envia uma mensagem para o cliente informando o encerramento do seu protocolo;
   * │  ├> libera o usuário para um novo atendimento;
   * │  └> envia uma mensagem para o atendente informando o encerramento.
   * │
   * ├> &list:
   * │   ├> lista todas as transações vinculadas ao usuário  e evia para o atendente no
   * │   │  formato xlsx.
   * │   └> &list c=<id>: lista todas as transações de um determindado usuário.
   * │
   * ├> &pause: não implementado:
   * │  └> coloca em espera um determinado atendimento.
   * │
   * ├> &status: não implementado:
   * │  └> informa o status de uma determinado atendimento.
   * │
   * └> &customer: não implementado;
   *    ├> buscar as informações de um determindo cliente;
   *    └> &customer -s<id>: envia uma mensagem para um determindado cliente.
   */

  public async '&end'(transaction: Transaction): Promise<ResultCommands> {
    // finalizando a transação
    const transactionFinesher = await this.cacheService.transaction.update(
      { field: 'transactionId', value: transaction.transactionId },
      { status: 'FINISHED', finished: Date.now().toString(), finisher: 'A' },
    );

    // Enviando mensagem para o cliente.
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
    // Atualizando estágio do usuário.
    this.cacheService.chatStage.update(
      { wuid: customer.wuid },
      { stage: 'finishedChat' },
    );

    // Enviando mensagem para o atendente.
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
     * Neste ponto identificamos que o atendente está liberado para um novo atendimento,
     * portanto buscamos no banco de dados, uma transação pendente no banco.
     */
    const findTransaction = await this.prismaService.transaction.findFirst({
      where: { sectorId: attendant.companySectorId, status: 'ACTIVE' },
    });
    return findTransaction;
  }

  public async '&list'(attendant: Attendant, customerId?: number) {
    /**
     * Recuperando todas as transações.
     * Note, não é necessário fazer qualquer verificação na variável
     * customerId, pois caso ela estiver indefinida, recuperaremos todas
     * as transações do atendente, senão, somente a do cliente definido.
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
    // Formatando dados para a planilha.
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
     * Criando um workbook
     * https://www.npmjs.com/package/xlsx
     */
    const workbook = XLSX.utils.book_new();
    // Criando um workSheets com os dados formatados.
    const workSheets = XLSX.utils.json_to_sheet(formatData);
    // Inserindo workSheets em workbook.
    XLSX.utils.book_append_sheet(workbook, workSheets, 'transactions');
    // Convertendo workbook para buffer.
    const xlsxBuffer = XLSX.write(workbook, { type: 'buffer' });
    // Compondo um nome para o arquivo.
    const fileName =
      'transactions_' +
      Date.now() +
      `_${attendant.attendantId}` +
      `_${attendant.shortName.toLowerCase()}` +
      '.xlsx';
    // Preparando documento para o envio.
    const prepareMedia = await prepareWAMessageMedia({ document: xlsxBuffer } as any, {
      upload: this.instance.client.waUploadToServer,
    });
    const documentMessage = prepareMedia.documentMessage;
    documentMessage.fileName = fileName;
    documentMessage.mimetype = getMimeType(fileName);
    // Enviando documento.
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
}
