// Importing startup service.
import { startupService } from './app.module';
// Assigning the name to the instance.
const instanceKey = 'codechat';
/**
 * Loading instance:
 * ├> if the instance does not exist, it will be created and the qrcode emitted in the terminal;
 * └> if not, the created instance will be loaded into memory and made available.
 */
startupService.loadInstance({ instanceKey });
