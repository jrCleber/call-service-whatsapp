import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';

export const formatDate = (timestamp: string) =>
  dayjs(Number.parseInt(timestamp)).format('YYYY-MM-DD HH:mm:ss');
