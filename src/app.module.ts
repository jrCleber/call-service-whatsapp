import EventEmitter2 from 'eventemitter2';
import { Env, LOADENV } from './common/yaml.load';
import { EVENT_EMITTER_CONFIG } from './config/event.config';
import { StartupService } from './services/startup.service';
import { ConfigService } from './services/config.service';
import { PrismaService } from './prisma/prisma.service';
import { ManageService } from './instance/manage.service';
import { CacheService } from './services/cache.service';
import { StageCache } from './cache/stage.cache';
import { AttendantCache } from './cache/attendant.cache';
import { CustomerCache } from './cache/customer.cache';
import { SectorCache } from './cache/sector.cache';
import { TransactionCache } from './cache/transaction.cache';
import NodeCache from 'node-cache';
import { Commands } from './instance/command/commands';

// Instantiating dependencies.
const eventemitter2 = new EventEmitter2(EVENT_EMITTER_CONFIG);
const prismaService = new PrismaService();
const configService = new ConfigService<Env>(LOADENV);
const cache = new NodeCache({ checkperiod: 0 });

// Instantiating caches and injecting dependencies.
const stageCache = new StageCache(prismaService, cache);
const attendantCache = new AttendantCache(prismaService, cache);
const customerCache = new CustomerCache(prismaService, cache);
const sectorCache = new SectorCache(prismaService, cache);
const transactionCache = new TransactionCache(prismaService, cache);

// Instantiating chace service and injecting dependencies.
const cacheService = new CacheService(
  prismaService,
  customerCache,
  attendantCache,
  sectorCache,
  stageCache,
  transactionCache,
);

// Instantiating dependency Command.
const commands = new Commands(cacheService, prismaService);

// Instantiating service manager and injecting dependency.
const manageService = new ManageService(cacheService, commands, prismaService);

// Instantiating startup service and injecting its dependencies.
const startupService = new StartupService(
  eventemitter2,
  prismaService,
  configService,
  manageService,
);

// Exporting startup service.
export { startupService };
