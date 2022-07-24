import EventEmitter2 from 'eventemitter2';
import { Env, LOADENV } from './common/yaml.load';
import { EVENT_EMITTER_CONFIG } from './config/event.config';
import { StartupService } from './instance/startup.service';
import { ConfigService } from './services/config.service';
import { PrismaService } from './prisma/prisma.service';
import { ManageService } from './instance/manage.service';
import { CacheService } from './instance/cache.service';
import { StageCache } from './cache/stage.cache';
import { AttendantCache } from './cache/attendant.cache';
import { CustomerCache } from './cache/customer.cache';
import { SectorCache } from './cache/sector.cache';

const eventemitter2 = new EventEmitter2(EVENT_EMITTER_CONFIG);

const prismaService = new PrismaService();

const configService = new ConfigService<Env>(LOADENV);

const stageCache = new StageCache(prismaService);
const attendantCache = new AttendantCache(prismaService);
const customerCache = new CustomerCache(prismaService);
const sectorCache = new SectorCache(prismaService);

const cacheService = new CacheService(
  prismaService,
  customerCache,
  attendantCache,
  sectorCache,
  stageCache,
);

const manageService = new ManageService(cacheService);

const startupService = new StartupService(
  eventemitter2,
  prismaService,
  configService,
  manageService,
);

export { startupService, prismaService };
