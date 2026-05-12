import util from 'util';

export const logger = {
  info: (message: string, meta?: unknown) => console.log(JSON.stringify({ level: 'info', message, ...(meta ? { meta } : {}) })),
  warn: (message: string, meta?: unknown) => console.warn(JSON.stringify({ level: 'warn', message, ...(meta ? { meta } : {}) })),
  error: (message: string, meta?: unknown) => console.error(JSON.stringify({ level: 'error', message, ...(meta ? { meta } : {}) }))
};

export const inspect = (value: unknown) => util.inspect(value, { depth: 4, colors: false });
