/**
 * Logger interface for configurable logging
 */
export interface Logger {
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  info?(message: string, ...args: any[]): void;
  debug?(message: string, ...args: any[]): void;
}

/**
 * Default console logger
 */
export const consoleLogger: Logger = {
  warn: (message: string, ...args: any[]) => console.warn(message, ...args),
  error: (message: string, ...args: any[]) => console.error(message, ...args),
  info: (message: string, ...args: any[]) => console.info(message, ...args),
  debug: (message: string, ...args: any[]) => console.debug(message, ...args),
};

/**
 * Silent logger (no output)
 */
export const silentLogger: Logger = {
  warn: () => {},
  error: () => {},
  info: () => {},
  debug: () => {},
};
