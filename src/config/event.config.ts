import { ConstructorOptions } from 'eventemitter2';

export const EVENT_EMITTER_CONFIG: ConstructorOptions = {
  delimiter: '.',
  newListener: false,
  ignoreErrors: false,
};
