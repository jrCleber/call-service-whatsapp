import { join } from 'path';

export const ROOT_DIR = process.cwd();
export const INSTANCE_DIR = join(ROOT_DIR, 'instances');

export const YAML_FILE = join(ROOT_DIR, '.env.yaml');
