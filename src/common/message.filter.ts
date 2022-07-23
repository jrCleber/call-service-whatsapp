import { proto } from '@adiwajshing/baileys';

type Args = { received: proto.IWebMessageInfo; exclude: string[] };

/**
 * This method, checks whether or not the received message type should be ignored
 * in the message manager
 */
export const messageProcessing = (
  args: Args,
  operation: (resource: proto.IWebMessageInfo) => void,
) => {
  if (args.exclude.includes(args.received.key.remoteJid)) {
    return;
  }

  for (const [key, _] of Object.entries(args.received.message)) {
    if (args.exclude.includes(key)) {
      return;
    }
  }

  return operation(args.received);
};
