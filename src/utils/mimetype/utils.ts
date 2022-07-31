import { mimetypesByExtension } from './mimetypesByExtension';

const defaultMimeType = mimetypesByExtension['.txt'];

export const getMimeType = (fileName: string) => {
  const regex = new RegExp(/.([\w\d])+$/);
  const match = regex.exec(fileName);
  if (match && match.length > 0) {
    const extension = match[0] as keyof typeof mimetypesByExtension;
    const mimetype = mimetypesByExtension[extension];
    return mimetype ? mimetype : defaultMimeType;
  }
  return defaultMimeType;
};
