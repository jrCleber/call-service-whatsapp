import { Logger } from '../src/common/logger';
import { PrismaService } from '../src/prisma/prisma.service';

const prismaService = new PrismaService();
const logger = new Logger('Create');

const callCenter = () => {
  const botName = 'BotChat';
  prismaService.callCenter
    .create({
      data: {
        presentation: 'Olá <day>! Aqui é o <botName>, o seu asistente virtual😉!',
        botName,
        phoneNumber: '553195918699',
        url: 'https://app.codechat.dev/v1/docs',
        companyName: 'CodeChat',
        createAt: Date.now().toString(),
        operation: {
          open: 8,
          closed: 18,
          weekday: [1, 2, 3, 4, 5],
        },
      },
    })
    .then((result) => {
      logger.log(result);
      prismaService.companySector
        .createMany({
          data: [
            { sector: 'TI', callCenterId: 1 },
            { sector: 'FINANCEIRO', callCenterId: 1 },
            { sector: 'LOGISTICA', callCenterId: 1 },
            { sector: 'COMTABILIDADE', callCenterId: 1 },
            { sector: 'RH', callCenterId: 1 },
          ],
        })
        .then((result) => logger.log(result));
    });
};

callCenter();
