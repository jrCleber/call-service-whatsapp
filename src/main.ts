// Importnado servicço de inicialização.
import { startupService } from './app.module';
// Atribuindo o nome para à instância.
const instanceKey = 'codechat';
/**
 * Carregando instância:
 *  ├> se a instância não existir, ela será criada e o qrcode emitido no terminal;
 *  └> se não, a instância criada será carregada na memória e disponibilizada.
 */
startupService.loadInstance({ instanceKey });
