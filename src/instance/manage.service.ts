import { delay, prepareWAMessageMedia, proto } from '@adiwajshing/baileys';
import { Attendant, CallCenter } from '@prisma/client';
import dayjs from 'dayjs';
import { Transaction } from '../cache/transaction.cache';
import { formatDate, timeDay } from '../common/format.date';
import { Logger } from '../common/logger';
import { CacheService, CallCenterService, Weekday } from '../services/cache.service';
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
   * Criando uma lista de setores
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
   * Buscando a imagem de perfil do usuário.
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
    // Realizando uma busca no cache e no db para retornar o cliente solicitado.
    const customer = await this.cacheService.customer.find({
      field: 'wuid',
      value: wuid,
    });
    // Não existindo:
    if (!customer || Object.keys(customer).length === 0) {
      // criamos um cliente
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
    // Enviando mensagem de saudação.
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
    // Solicitando o nome
    await this.sendMessage(
      wuid,
      { extendedTextMessage: { text: 'Digite agora o seu nome:' } },
      { delay: 1000 },
    );
    // Inicializando estágios do cliente.
    await this.cacheService.chatStage.create({
      wuid,
      stage: 'setName',
      customerId: id,
    });
    // Iniciando um protocolo.
    await this.cacheService.transaction.create({
      initiated: Date.now().toString(),
      customerId: id,
    });
  }

  private async setName(received: proto.IWebMessageInfo, id?: number) {
    const wuid = received.key.remoteJid;
    // Selecionando o nome do cliente.
    const name = this.selectedText(received.message);
    // Verificando se o nome exinste ou se é um número.
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
    // Atualizando o usuário.
    this.cacheService.customer.update({ field: 'customerId', value: id }, { name: name });
    // Buscando transação.
    const transaction = await this.cacheService.transaction.find({
      field: 'customerId',
      value: id,
      status: 'ACTIVE',
    });
    // Compondo protocolo: composto pelo timestamp, convertido para segundos, mais o id do cliente.
    const protocol =
      Math.trunc(Number.parseInt(transaction.initiated) / 1000).toString() +
      '-' +
      transaction.transactionId;
    // Atualizando transação com o número do protocolo.
    this.cacheService.transaction
      .update({ field: 'transactionId', value: transaction.transactionId }, { protocol })
      .then(({ protocol }) =>
        // Informando para o usuário o número do seu protocolo.
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
           * Caso haja somente um setor para o atendimento:
           *  └> redirecionameos o cliente para o estágio assunto.
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
           * Caso haja mais de um setor:
           *  └> redirecionamos o cliente para o estágio que verifica o setor.
           */

          const sections = await this.createList(
            transaction.transactionId,
            transaction.customerId,
          );
          this.cacheService.chatStage.update({ wuid }, { stage: 'checkSector' });
          // Enviando a lista de setores para o cliente.
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

  /**
   * Durante a checagem do setor para o atendimento, o usuário pode:
   *  ├> tanto digitar o nome do setor;
   *  └> quanto clicar noitem de lista.
   * Portanto trataremos os dois casos.
   */
  private async checkSector(received: proto.IWebMessageInfo) {
    const wuid = received.key.remoteJid;
    // Recuperando todos os setores
    const sectors = await this.cacheService.sector.findMany();
    // Declaraando variáveis auxiliares.
    let findSector = false;
    let sectorId: number;
    let transaction: Transaction;
    // Selecionando o texto digitado.
    const text = this.selectedText(received.message);
    // Verificando se a variável text não é verdadeita e se o setor existe na lista de setores.
    if (text && sectors.find((s) => s.sector === text.toUpperCase())) {
      /**
       * Existindo:
       *  ├> selecionamos o id do setor;
       *  ├> atribuimos o valor true para a variável findSector, que usaremos mais tarde.
       *  └> buscamos a transação do usuário.
       */
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
    } else {
      // Selecionando o id do item de lista clicado (rowId)
      const selectedId = this.selectedIdMsg(received.message);
      // Verificando se o id existe e se é um id existente
      if (
        selectedId?.transaction &&
        sectors.find((s) => s.sectorId === Number.parseInt(selectedId.sectorId))
      ) {
        /**
         * Existindo:
         *  ├> selecionamos o id do setor;
         *  ├> atribuimos o valor true para a variável findSector, que usaremos mais tarde.
         *  └> buscamos a transação do usuário.
         */
        sectorId = sectors.find(
          (s) => s.sectorId === Number.parseInt(selectedId.sectorId),
        ).sectorId;
        findSector = true;
        transaction = await this.cacheService.transaction.find({
          field: 'transactionId',
          value: Number.parseInt(selectedId.transaction),
        });
      }
    }

    // Verificando se o setor foi encontrado e se a transação existe
    if (findSector && transaction) {
      // Alterando estágio do usuário para informar o assunto.
      this.cacheService.chatStage.update({ wuid }, { stage: 'setSubject' });
      // Atualizando transação com o id do setor
      await this.cacheService.transaction.update(
        { field: 'transactionId', value: transaction.transactionId },
        { sectorId },
      );
      // Enviando mensagem oa cliente solicitando o assunto.
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
      // Caso o setor não seja encontrado ou a transação não existir, informamos que houve um erro para o cliente
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
    // Buscando a transação na qual o cliente se encontra.
    const transaction = await this.cacheService.transaction.find({
      field: 'customerId',
      value: (
        await this.cacheService.customer.find({ field: 'wuid', value: wuid })
      ).customerId,
      status: 'ACTIVE',
    });
    // Verificando se o cliente digitou o comando FIM, para cancelar o atendimento.
    const text = this.selectedText(received.message)?.trim().toLowerCase();
    if (text !== 'fim') {
      // Começamos a atribuir o assunto à transação.
      if (!transaction?.subject) {
        transaction.subject = JSON.stringify([received as any]);
      } else {
        const subject: proto.IWebMessageInfo[] = JSON.parse(
          transaction.subject as string,
        );
        subject.push(received);
        transaction.subject = JSON.stringify(subject);
      }
      // Atualizando transação com o assunto.
      this.cacheService.transaction.update(
        { field: 'transactionId', value: transaction.transactionId },
        { subject: transaction.subject },
      );
      return;
    }
    /**
     * Iniciando o gerenciador de filas, que colocará o cliente em espera e enviará para
     * o primeiro artendente disponível do setor, uma solicitação de atendimento.
     */
    this.manageQueue(transaction);
    // Enviando mensagem para o usuário, após a sua finalização do assunto.
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
    // Atualizando estágio do usuário.
    this.cacheService.chatStage.update({ wuid }, { stage: 'transaction' });
  }

  private async manageQueue(transaction: Transaction) {
    // Buscando todos os setores.
    const sectors = await this.cacheService.sector.findMany();
    let sectorId: number;
    // Verificando a quantidade de setores.
    if (sectors.length === 1) {
      sectorId = sectors[0].sectorId;
    }
    // Buscando todas as transações, de acordo com a cláusula where.
    const transactions = await this.cacheService.transaction.findMany({
      where: {
        sectorId: transaction.sectorId || sectorId,
        status: { notIn: 'PROCESSING' },
      },
    });
    // Declarando variável que armazenará o atendente dispon´vel.
    let releaseAttendant: Attendant;
    // Caso todos os atendentes do setor estivem disponíveis, atribuímos o primeiro.
    if (!transactions.find((t) => t.attendantId)) {
      releaseAttendant = await this.cacheService.attendant.set({
        where: { companySectorId: transaction.sectorId },
      });
    } else {
      /**
       * Caso não:
       *  └> buscamos na tabela attendant, o primeiro atendente disponível para o setor
       *     selecionado.
       */
      releaseAttendant = await this.cacheService.attendant.set({
        where: {
          attendantId: { notIn: [...new Set(transactions.map((t) => t.attendantId))] },
          companySectorId: transaction.sectorId,
        },
      });
    }

    // Buscando o usuáro relacionado à transação.
    const customer = await this.cacheService.customer.find({
      field: 'customerId',
      value: transaction.customerId,
    });

    /**
     * Nesse ponto, iniciaremos a atribuição da imagem de perfil do cliente:
     */
    // Declarando variáveis auxiliares.
    let imageMessage: proto.IImageMessage;
    let contentText: string;
    let headerType: number;
    // Checamos a propriedade profilePictureUrl.
    if (customer.profilePictureUrl !== 'no image') {
      try {
        // Preparando a mensagen de mídia.
        const prepareMedia = await prepareWAMessageMedia(
          { image: { url: customer.profilePictureUrl } },
          { upload: this.instance.client.waUploadToServer },
        );
        // Atribuindo variáveis auxiliares.
        imageMessage = prepareMedia.imageMessage;
        headerType = 4;
        contentText = this.formatText(`*Protocolo: ${transaction.protocol}*
          *Clente:* ${customer.name || customer.pushName}
          *Id do cliente:* ${customer.customerId}
          *Contato:* ${customer.phoneNumber}`);
      } catch (error) {
        // Caso a preparação cause algum erro, ignoramos a imagem de perfil do cliente.
        headerType = 2;
        contentText = this.formatText(`*Clente:* ${customer.name || customer.pushName}
          *Contato:* ${customer.phoneNumber}`);
      }
    }

    // Informando ao atendente selecionado que existe uma nova solicitação de atendimento.
    return this.sendMessage(
      releaseAttendant.wuid,
      {
        extendedTextMessage: {
          text: '⚠️ *ATEÇÂO* ⚠️\nNova solicitação de atendimento.',
        },
      },
      { delay: 1000 },
    ).then(() =>
      // Solicitando a aceitação da solicitação ao atendente.
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

    // Buscando atendente.
    const attendant = await this.cacheService.attendant.find({
      field: 'attendantId',
      value: transaction.attendantId,
    });

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
      if (!attendant || Object?.keys(attendant).length === 0) {
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
            text: this
              .formatText(`Aguarde um momento!\nLogo você será atendido pela nossa equipe.\n
            Para cancelar o atendimento, a qualquer momento, digite: *-1*`),
          },
        },
        { delay: 1500 },
      );

      return;
    }

    // Encaminhando mensagem para o atendente.
    this.sendMessage(attendant.wuid, received.message, { delay: 1500 }).then(
      async (quoted) => {
        /**
         * Para que o atendente não se perca no chat, vamos citar a mensagem
         * encaminhada pelo usuário com as informações da transação.
         * Isso facilitará a busca de mensagens no chat e não confunde o atendente
         * sobre quem enviou a mensagem.
         */
        // Buscando informações do cliente.
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

  // Esta função reconhece se o atendente aceito o atendimento, ou não.
  private async checkAcceptance(received: proto.IWebMessageInfo) {
    /**
     * Alocando resposta do clique do botão, se houver,
     * pois o atendente pode clicar no botão, bem como
     * digitar um texto.
     */
    const selected = this.selectedIdMsg(received.message);
    // Caso digite um texto, interrompemos este trecho de código.
    if (!selected) {
      return false;
    }
    const wuid = received.key.remoteJid;
    // Buscando transação selecionada.
    const transaction = await this.cacheService.transaction.find({
      field: 'transactionId',
      value: Number.parseInt(selected?.transaction),
    });
    const attendant = this.cacheService.attendant.getAttendant(wuid);
    // Verificando se o atendente aceitou a solicitação.
    if (selected?.action === 'accept') {
      // Verificando se a solicitação não foi atendida por outro atendente.
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
        // Atribuindo todas as informações do atendente no cache.
        const releaseAttendant = await this.cacheService.attendant.set({
          where: { attendantId: attendant.attendantId },
        });
        // Atualizando transação com o id do atendente.
        this.cacheService.transaction.update(
          {
            field: 'transactionId',
            value: transaction.transactionId,
          },
          { attendantId: releaseAttendant.attendantId },
        );
        // Enviando o assunto da transação para o atendente.
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
        // Informando que o assunto foi finalizado.
        await this.sendMessage(
          wuid,
          {
            extendedTextMessage: {
              text: '*FINALIZAÇÃO DO ASSUNTO*',
            },
          },
          { delay: 1000 },
        );
        // Enviando mensagem para o atendente, informando que o chat já está vinculado.
        this.sendMessage(
          wuid,
          {
            extendedTextMessage: {
              text: 'Ótimo!\nAgora, você já pode iniciar o atendimento!',
            },
          },
          { delay: 1200 },
        );
        // Buscando informações do cliente.
        const customer = await this.cacheService.customer.find({
          field: 'customerId',
          value: transaction.customerId,
        });
        // Enviando mensagem para o cliente informando que o chat está liberado.
        this.sendMessage(
          customer.wuid,
          {
            extendedTextMessage: {
              text: this.formatText(
                `Olá *${customer.name}*! O meu nome é *${releaseAttendant.shortName}* e irei realizar o seu atendimento.\n
                Já estou analizando o seu assunto, me aguarde um momento!`,
              ),
            },
          },
          { delay: 1000 },
        );
      }

      return true;
    }
  }

  // Esta função transacionará as mensagens do atendente para o cliente.
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
    const attendant = await this.cacheService.attendant.find({
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
            text: 'No momento, você não está envolvido nem um atendimento.\nAguarde até ser vinculado a um.',
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

  // Checando horário de funcionamento.
  private checkOperation() {
    // Pegando o dia da semana.
    const day = dayjs().day() as Weekday;
    // Pegando a hora atual.
    const hour = dayjs().hour();
    const operation = this.callCenter.operation;
    // Verificando se é um dia de funcionamento.
    if (!operation.weekday.includes(day)) {
      return false;
    }
    // Verificando o orário do expediente.
    if (hour < operation.open || hour > operation.closed) {
      return false;
    }

    return true;
  }

  public async messageManagement(received: proto.IWebMessageInfo) {
    if (received.key.fromMe) {
      return;
    }

    /**
     * @wuid -> whatsapp unique identifier
     */
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
    const attendant = this.cacheService.attendant.getAttendant(wuid);
    // Não sendo...
    if (!attendant) {
      // Carregando cliente
      const customer = await this.loadCustomer(received);
      // Verificando expediente
      if (this.checkOperation() === false) {
        const operation = this.callCenter.operation;
        this.sendMessage(
          wuid,
          {
            templateMessage: {
              hydratedTemplate: {
                templateId: '01',
                hydratedTitleText: `Olá ${customer.name}, ${timeDay(
                  dayjs().hour(),
                ).toLowerCase()}😉!`,
                hydratedContentText: this.formatText(
                  `A nossa equipe 🤝🏼 agradece a sua mensage!
                  No momento nós não estamos disponíveis🙂!\n
                  Nosso horário de funcionamento é das *${operation.open}h* às *${operation.closed}h*` +
                    `${operation?.desc ? 'de ' + operation.desc : '.'}\n
                    Para mais informações, acesse a nossa página!`,
                ),
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
        return;
      }

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
      /**
       * Caso a verificação do clieque do botão do atendente retorne false, executamos
       * a função transactionAttendant.
       */
      (await this.checkAcceptance(received)) === false
        ? (transaction = await this.transactionAttendant(received))
        : undefined;
    }
  }
}
