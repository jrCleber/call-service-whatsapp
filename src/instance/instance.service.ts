import makeWASocket, {
  AuthenticationState,
  BaileysEventEmitter,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidGroup,
  proto,
  useMultiFileAuthState,
  UserFacingSocketConfig,
  WABrowserDescription,
  WAConnectionState,
  WASocket,
} from '@adiwajshing/baileys';
import { ConfigService } from '../services/config.service';
import { PrismaService } from '../prisma/prisma.service';
import EventEmitter2 from 'eventemitter2';
import { Boom } from '@hapi/boom';
import { join } from 'path';
import { release } from 'os';
import P from 'pino';
import { ManageService } from './manage.service';
import { Browser, QrCode } from '../common/yaml.load';
import { messageProcessing } from '../common/message.filter';
import { INSTANCE_DIR } from '../config/path.config';
import { Logger } from '../common/logger';

export type Instance = {
  instanceKey?: string;
  client?: WASocket;
  qrcode?: { base64?: string; count: number; qr?: string };
  authState?: { state: AuthenticationState; saveCreds: () => void };
  connectionStatus?: WAConnectionState;
};

export class InstanceWA {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    private readonly eventEmitter2: EventEmitter2,
    private readonly manageService: ManageService,
  ) {
    //
  }

  private readonly instance: Instance = { qrcode: { count: 0 }, instanceKey: '' };
  private readonly env = {
    QRCODE: this.configService.get<QrCode>('QRCODE'),
    BROWSER: this.configService.get<Browser>('BROWSER'),
  };

  private readonly logger = new Logger(InstanceWA.name);

  public set instanceKey(key: string) {
    this.instance.instanceKey = key;
  }

  public get client() {
    return this.instance.client;
  }

  private connectionUpdate() {
    const client = this.instance.client;
    client.ev.on('connection.update', async ({ qr, connection, lastDisconnect }) => {
      if (qr) {
        this.logger.log('QRCODE: ' + qr);
        if (this.instance.qrcode.count === this.env.QRCODE.LIMIT) {
          this.eventEmitter2.emit('no.connection', {
            instanceKey: this.instance.instanceKey,
          });
        }

        this.instance.qrcode.count++;
        this.instance.qrcode.qr = qr;
      }

      if (connection) {
        this.instance.connectionStatus = connection;
      }

      if (connection === 'close') {
        const shouldRecnnect =
          (lastDisconnect.error as Boom)?.output?.statusCode !==
          DisconnectReason.loggedOut;
        if (shouldRecnnect) {
          this.connectToWatsapp();
        } else {
          this.eventEmitter2.emit('remove.instance', {
            instanceKey: this.instance.instanceKey,
          });
        }
      }

      if (connection === 'open') {
        const phoneNumber = this.instance.client.user.id.split(':')[0];
        await this.prismaService.callCenter.update({
          where: { phoneNumber },
          data: { loggedAt: Date.now().toString() },
        });
        this.logger.info(
          `
          ┌──────────────────────────────┐
          │    CONNECTED TO WHATSAPP     │
          └──────────────────────────────┘`.replace(/^ +/gm, '  '),
        );
      }
    });
  }

  public async connectToWatsapp() {
    // Verificando se a instância está connectada
    if (this.instance.connectionStatus === 'open') {
      this.logger.warn('You are already connected to this instance');
      return true;
    }
    // Iniciando a authenticação e conexão com o whatsapp
    this.instance.authState = await useMultiFileAuthState(
      join(INSTANCE_DIR, this.instance.instanceKey),
    );

    const { version, isLatest } = await fetchLatestBaileysVersion();
    // Configurando como será exibido a conexão noaprelho.
    const browser: WABrowserDescription = [
      this.env.BROWSER.CLIENT,
      this.env.BROWSER.NAME,
      release(),
    ];
    /**
     * Inserindo as configurações para a conexão.
     * https://github.com/adiwajshing/Baileys#configuring-the-connection
     */
    const socketConfig: UserFacingSocketConfig = {
      auth: this.instance.authState.state,
      logger: P({ level: 'error' }),
      printQRInTerminal: true,
      msgRetryCounterMap: {},
      linkPreviewImageThumbnailWidth: 1600,
      markOnlineOnConnect: false,
      browser,
      version,
      connectTimeoutMs: 60_000,
      getMessage: async (key: proto.IMessageKey) => {
        return { conversation: 'hi' };
      },
    };

    this.instance.client = makeWASocket(socketConfig);

    this.setHandles();

    this.logger.info(`Using WA v${version.join('.')} - isLatest: ${isLatest}`);
  }

  private messageHandle(ev: BaileysEventEmitter) {
    ev.on('messages.upsert', ({ messages, type }) => {
      const received = messages[0];
      /**
       * verificando se a mensagem recebida é do tipo de notificação
       * e se a propriedade mensagem não é nula
       */
      if (type !== 'notify' || !received?.message) {
        return;
      }
      // Verificando se a mensagem é do tipo reaction.
      const keys = Object.keys(received.message);
      if (keys.includes('reactionMessage')) {
        return;
      }
      // ignorando mensagens de grupo
      if (isJidGroup(received.key.remoteJid)) {
        return;
      }
      // mostrando mensagem recebida no console
      this.logger.log({ type, messgage: { ...received } });
      // setanso cliente em manageService
      this.manageService.client = this.instance;
      // iniciando o precessador de mensagens
      messageProcessing(
        {
          received,
          exclude: [
            'protocolMessage',
            'senderKeyDistributionMessage',
            'protocolMessage',
            'status@broadcast',
          ],
        },
        // iniciando gerenciador de mensagens
        async (received) => await this.manageService.messageManagement(received),
      );
    });

    ev.on('messages.update', (args) => {
      const update = args[0];
      const status = {
        1: 'PENDING',
        2: 'SERVER_ACK',
        3: 'DELIVERY_ACK',
        4: 'READ_ACK',
      };
      const key = update.key;
      this.logger.log({
        'messages.update': {
          key,
          status: status[update.update.status as keyof typeof status],
        },
      });
    });
  }

  private setHandles() {
    // Realizando a conexão
    this.connectionUpdate();
    // setando iniciador de mensagens
    this.messageHandle(this.instance.client.ev);
    // salvando e atualizando as credenciais de conexão
    this.instance.client.ev.on('creds.update', this.instance.authState.saveCreds);
  }
}
