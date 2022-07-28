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
import { TransactionCache } from './cache/transaction.cache';
import NodeCache from 'node-cache';

// Instanciando dependências.
const eventemitter2 = new EventEmitter2(EVENT_EMITTER_CONFIG);
const prismaService = new PrismaService();
const configService = new ConfigService<Env>(LOADENV);
const cache = new NodeCache({ checkperiod: 0 });

// Instanciando caches e injeando dependências.
const stageCache = new StageCache(prismaService, cache);
const attendantCache = new AttendantCache(prismaService, cache);
const customerCache = new CustomerCache(prismaService, cache);
const sectorCache = new SectorCache(prismaService, cache);
const transactionCache = new TransactionCache(prismaService, cache);

// Instanciando serviço de chace e injetando dependências.
const cacheService = new CacheService(
  prismaService,
  customerCache,
  attendantCache,
  sectorCache,
  stageCache,
  transactionCache,
);

// Instanciando gerenciado de atendimento e injetando dependência.
const manageService = new ManageService(cacheService);

// Instanciando serviço de inicialização e injetando suas dependências.
const startupService = new StartupService(
  eventemitter2,
  prismaService,
  configService,
  manageService,
);

// Exportando serviço de inicialização.
export { startupService };
