import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../services/cache.service';

export class Commands {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cacheService: CacheService,
  ) {
    //
  }

  /**
   * Comandos do atendente:
   * ├> &end:
   * │  ├> finaliza a transação;
   * │  ├> envia uma mensagem para o cliente informando o encerramento do seu protocolo;
   * │  └> libera o usuário para um novo atendimento.
   * │
   * ├> &list: não implementado:
   * │   └> lista todas as transações vinculadas ao usuário.
   * │
   * ├> &pause: não implementado:
   * │  └> coloca em espera um determinado atendimento.
   * │
   * ├> &status: não implementado:
   * │  └> informa o status de uma determinado atendimento.
   * │
   * └> &customer: não implementado;
   *    ├> buscar as informações de um determindo cliente;
   *    └> &customer -s<id>: envia uma mensagem para um determindado cliente.
   */

  public async '&end'() {
    //
  }
}
