// server/logger.ts
export class Logger {
  private readonly prefix: string;

  constructor(prefix: string = 'git-graph-web') {
    this.prefix = prefix;
  }

  log(message: string): void {
    console.log(`[${this.prefix}] ${message}`);
  }

  logError(message: string): void {
    console.error(`[${this.prefix}] ERROR: ${message}`);
  }

  logCmd(cmd: string, args: string[]): void {
    console.log(`[${this.prefix}] CMD: ${cmd} ${args.join(' ')}`);
  }
}
