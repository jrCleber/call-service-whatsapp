import EventEmitter2 from 'eventemitter2';
import { Env, LOADENV } from './common/yaml.load';
import { EVENT_EMITTER_CONFIG } from './config/event.config';
import { StartupService } from './services/startup.service';
import { ConfigService } from './services/config.service';
import { PrismaService } from './services/prisma.service';
import { ManageService } from './services/manage.service';

const eventemitter2 = new EventEmitter2(EVENT_EMITTER_CONFIG);

const prismaService = new PrismaService();

const configService = new ConfigService<Env>(LOADENV);

const manageService = new ManageService(prismaService);

const startupService = new StartupService(
  eventemitter2,
  prismaService,
  configService,
  manageService,
);

export { startupService };
