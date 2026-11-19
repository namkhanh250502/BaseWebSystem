type Level = 'debug' | 'info' | 'warn' | 'error';

function serialize(value: unknown) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function log(level: Level, message: string, extra?: unknown) {
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...(extra !== undefined ? { extra: serialize(extra) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** Logger JSON đơn giản; có thể thay bằng pino khi cần */
export const logger = {
  debug: (message: string, extra?: unknown) => log('debug', message, extra),
  info: (message: string, extra?: unknown) => log('info', message, extra),
  warn: (message: string, extra?: unknown) => log('warn', message, extra),
  error: (message: string, extra?: unknown) => log('error', message, extra),
};
