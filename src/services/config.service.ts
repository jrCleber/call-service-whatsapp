export class ConfigService<T = Record<string, any>> {
  constructor(load: () => T) {
    this.env = load();
  }
  private env: T;

  public get<U = any>(key: keyof T) {
    return this.env[key] as unknown as U;
  }
}
