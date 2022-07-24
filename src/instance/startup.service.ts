import EventEmitter2 from 'eventemitter2';
import { InstanceWA } from './instance.service';
import { rmSync } from 'fs';
import { join } from 'path';
import { BaileysEventEmitter, DisconnectReason } from '@adiwajshing/baileys';
import { Boom } from '@hapi/boom';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../services/config.service';
import { ManageService } from './manage.service';
import { Env } from '../common/yaml.load';
import { INSTANCE_DIR } from '../config/path.config';
import { Logger } from '../common/logger';

type PayloadEvent = { instanceKey: string };

export class StartupService {
  constructor(
    private readonly eventEmitter2: EventEmitter2,
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService<Env>,
    private readonly manageService: ManageService,
  ) {
    this.removeInstance();
    this.noConnection();
  }

  private readonly logger = new Logger(StartupService.name);

  public readonly startedInstance: Record<string, InstanceWA> = {};

  public async loadInstance({ instanceKey }: PayloadEvent) {
    const instanceWA = new InstanceWA(
      this.prismaService,
      this.configService,
      this.eventEmitter2,
      this.manageService,
    );
    instanceWA.instanceKey = instanceKey;
    await instanceWA.connectToWatsapp();
    this.startedInstance[instanceKey] = instanceWA;
  }

  private removeEvents(ev: BaileysEventEmitter) {
    ev.removeAllListeners('connection.update');
    ev.removeAllListeners('messages.upsert');
    ev.removeAllListeners('messages.update');
    ev.removeAllListeners('creds.update');
  }

  private removeInstance() {
    this.eventEmitter2.on('remove.instance', async ({ instanceKey }: PayloadEvent) => {
      try {
        // removing directory
        rmSync(join(INSTANCE_DIR, instanceKey), { recursive: true, force: true });
        // removing events
        this.removeEvents(this.startedInstance[instanceKey]?.client?.ev);
        // deleted variable from memory
        delete this.startedInstance[instanceKey];

        this.logger.log(`Instance: ${instanceKey} - REMOVED`);
      } catch (error) {
        this.logger.error({
          localError: 'removeInstance',
          message: `Error deleting ${instanceKey} folder with whatsapp connection files, or files do not exist.`,
        });
        console.log({ error });
      }
    });
  }

  private noConnection() {
    this.eventEmitter2.on('no.connection', ({ instanceKey }: PayloadEvent) => {
      try {
        // removing events
        this.removeEvents(this.startedInstance[instanceKey]?.client?.ev);
        this.startedInstance[instanceKey].client.end(
          new Boom('QR code limit reached, please login again', {
            statusCode: DisconnectReason.badSession,
          }),
        );
        delete this.startedInstance[instanceKey];
      } catch (error) {
        this.logger.error({
          localError: 'noConnection',
          message: `Error deleting ${instanceKey} from memory.`,
        });
        console.log({ error });
      }
    });
  }
}
