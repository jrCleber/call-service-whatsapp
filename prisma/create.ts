import { Logger } from '../src/common/logger';
import { PrismaService } from '../src/prisma/prisma.service';

const prismaService = new PrismaService();
const logger = new Logger('Create');

async function serviceCreate() {
  const botName = '<central bot name>';
  // Creating the Call Center.
  const callCenter = await prismaService.callCenter.create({
    data: {
      /**
       * <day> --> will be replaced by the time of day when the service will be requested.
       *  └> https://github.com/jrCleber/call-service-whatsapp/blob/main/src/common/format.date.ts
       * <botName> --> <day>: will be replaced by the bot name informed above.
       */
      presentation: 'Olá <day>! Aqui é o <botName>, o seu asistente virtual😉!',
      botName,
      phoneNumber: '<central telephone>',
      url: 'https://app.codechat.dev/v1/docs',
      companyName: 'CodeChat',
      createAt: Date.now().toString(),
      operation: {
        open: 8,
        closed: 18,
        /**
         * Refers to the days of the week.
         * ┌> 0 --> Sunday
         * ├> 1 --> Monday
         * ├> 2 --> Tuesday
         * ├> 3 --> Wednesday
         * ├> 4 --> Thurday
         * ├> 5 --> Friday
         * └> 7 --> Saturday
         */
        weekday: [1, 2, 3, 4, 5],
      },
    },
  });
  logger.log({ callCenter });

  // Creating the sectors.
  const serctors = await prismaService.companySector.createMany({
    data: [
      /*
      { sector: 'TECHNOLOGY', callCenterId: callCenter.callCenterId },
      { sector: 'FINANCIAL', callCenterId: callCenter.callCenterId },
      { sector: 'LOGISTICS', callCenterId: callCenter.callCenterId },
      { sector: 'ACCOUNTING', callCenterId: callCenter.callCenterId },
      { sector: 'HUMAN RESOURCES', callCenterId: callCenter.callCenterId },
      */
      { sector: 'TI', callCenterId: callCenter.callCenterId },
      { sector: 'FINANCEIRO', callCenterId: callCenter.callCenterId },
      { sector: 'LOGISTICA', callCenterId: callCenter.callCenterId },
      { sector: 'COMTABILIDADE', callCenterId: callCenter.callCenterId },
      { sector: 'RH', callCenterId: callCenter.callCenterId },
    ],
  });
  logger.log({ serctors });

  // Creating attendants.
  const attendants = prismaService.attendant.createMany({
    data: [
      {
        shortName: '<short name>',
        phoneNumber: '5531900000000',
        wuid: '5531900000000@s.whatsapp.net',
        status: 'ACTIVE',
        manager: false /* true */,
        createAt: Date.now().toString(),
        companySectorId: 0,
        callCenterId: callCenter.callCenterId,
      },
    ],
  });
  logger.log({ attendants });
}
