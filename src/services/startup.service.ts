import EventEmitter2 from 'eventemitter2';
import { InstanceWA } from '../instance/instance.service';
import { rmSync } from 'fs';
import { join } from 'path';
import { Boom } from '@hapi/boom';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from './config.service';
import { ManageService } from '../instance/manage.service';
import { Env } from '../common/yaml.load';
import { INSTANCE_DIR } from '../config/path.config';
import { Logger } from '../common/logger';
import { BaileysEventEmitter, DisconnectReason } from '../Baileys/src';

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

  // Loading instance.
  public async loadInstance({ instanceKey }: PayloadEvent) {
    const instanceWA = new InstanceWA(
      this.prismaService,
      this.configService,
      this.eventEmitter2,
      this.manageService,
    );
    // Setting the property that stores the instance name.
    instanceWA.instanceKey = instanceKey;
    // Making the connection.
    await instanceWA.connectToWatsapp();
    // Making instance available throughout the class.
    this.startedInstance[instanceKey] = instanceWA;
  }

  private removeEvents(ev: BaileysEventEmitter) {
    ev.removeAllListeners('connection.update');
    ev.removeAllListeners('messages.upsert');
    ev.removeAllListeners('creds.update');
  }

  private removeInstance() {
    this.eventEmitter2.on('remove.instance', async ({ instanceKey }: PayloadEvent) => {
      try {
        // Removing the instance directory.
        rmSync(join(INSTANCE_DIR, instanceKey), { recursive: true, force: true });
        // Removendo eventos registrados.
        this.removeEvents(this.startedInstance[instanceKey]?.client?.ev);
        // Deleting instance from memory.
        delete this.startedInstance[instanceKey];

        this.logger.warn(`Instance: ${instanceKey} - REMOVED`);
      } catch (error) {
        this.logger.error({
          localError: 'removeInstance',
          message: `Error deleting ${instanceKey} folder with whatsapp connection files, or files do not exist.`,
        });
        console.log({ error });
      }
    });
  }

  // When the user does not connect.
  private noConnection() {
    this.eventEmitter2.on('no.connection', ({ instanceKey }: PayloadEvent) => {
      try {
        // Removing logged events.
        this.removeEvents(this.startedInstance[instanceKey]?.client?.ev);
        // Terminating the connection.
        this.startedInstance[instanceKey].client.end(
          new Boom('QR code limit reached, please login again', {
            statusCode: DisconnectReason.badSession,
          }),
        );
        // Deleting instance from memory.
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
