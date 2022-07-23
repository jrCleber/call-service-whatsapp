import dayjs from 'dayjs';

export const formatDate = (timestamp: string) =>
  dayjs(Number.parseInt(timestamp)).format('YYYY-MM-DD HH:mm:ss');

export const formatDateLog = (timestamp: number) =>
  dayjs(timestamp)
    .toDate()
    .toString()
    .replace(/\([\(\)\w'à-úÀ-Ú ]+\)$/, '');

export const timeDay = (hour: number) => {
  if (hour >= 2 && hour < 12) return 'Bom dia';
  else if (hour >= 12 && hour < 18) return 'Boa tarde';
  else return 'Boa noite';
};
