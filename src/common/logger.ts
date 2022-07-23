import { formatDate } from './format.date';

enum Color {
  LOG = '\x1b[32m',
  INFO = '\x1b[34m',
  WARN = '\x1b[33m',
  ERROR = '\x1b[31m',
  DEBUG = '\x1b[36m',
  VERBOSE = '\x1b[37m',
}

enum Command {
  RESET = '\x1b[0m',
  BRIGTH = '\x1b[1m',
  UNDERSCORE = '\x1b[4m',
}

enum Level {
  LOG = Color.LOG + '%s' + Command.RESET,
  ERROR = Color.ERROR + '%s' + Command.RESET,
  INFO = Color.INFO + '%s' + Command.RESET,
  DEBUG = Color.DEBUG + '%s' + Command.RESET,
  WARN = Color.WARN + '%s' + Command.RESET,
  VERBOSE = Color.VERBOSE + '%s' + Command.RESET,
}

enum Type {
  LOG = 'LOG',
  WARN = 'WARN',
  INFO = 'INFO',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG',
  VERBOSE = 'VERBOSE',
}

enum Background {
  LOG = '\x1b[42m',
  INFO = '\x1b[44m',
  WARN = '\x1b[43m',
  ERROR = '\x1b[41m',
  DEBUG = '\x1b[46m',
  VERBOSE = '\x1b[47m',
}

export class Logger {
  // eslint-disable-next-line prettier/prettier
  constructor(private context = 'Logger') { }

  public setContext(value: string) {
    this.context = value;
  }

  private console(value: any, type: Type) {
    console.log(
      '\n' + Command.UNDERSCORE + Command.BRIGTH + Level[type],
      '[CodeChat]',
      Command.BRIGTH + Color[type],
      '-',
      Command.BRIGTH + Color.VERBOSE,
      formatDate(Date.now().toString()) + Command.RESET,
      Color[type] + Background[type] + Command.BRIGTH,
      `${type} ` + Command.RESET,
      Color.WARN + Command.BRIGTH,
      `[${this.context}]` + Command.RESET,
      Color[type] + Command.BRIGTH,
      `[${typeof value}]` + Command.RESET,
      value,
      '\n',
    );
  }

  public log(value: any) {
    this.console(value, Type.LOG);
  }

  public info(value: any) {
    this.console(value, Type.INFO);
  }

  public warn(value: any) {
    this.console(value, Type.WARN);
  }

  public error(value: any) {
    this.console(value, Type.ERROR);
  }

  public verbose(value: any) {
    this.console(value, Type.VERBOSE);
  }

  public debug(value: any) {
    this.console(value, Type.DEBUG);
  }
}
