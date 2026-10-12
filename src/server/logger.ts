export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

/** One JSON object per line: easy to grep locally, easy to ship to any log stack. */
export function createJsonLogger(write: (line: string) => void = console.log): Logger {
  const log =
    (level: string) =>
    (event: string, fields: Record<string, unknown> = {}) => {
      write(JSON.stringify({ time: new Date().toISOString(), level, event, ...fields }));
    };
  return { info: log("info"), warn: log("warn"), error: log("error") };
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
