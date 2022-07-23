import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import { YAML_FILE } from '../config/path.config';

export type QrCode = { LIMIT: number };
export type Browser = { CLIENT: string; NAME: string };

export type Env = { QRCODE: QrCode; BROWSER: Browser };

export const LOADENV = (): Env =>
  load(readFileSync(YAML_FILE, { encoding: 'utf-8' })) as Env;
