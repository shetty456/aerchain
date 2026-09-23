type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, string | number | boolean | null | undefined>;

const priority: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function enabled(level: LogLevel) {
  const configured = (process.env.PROCUREMENT_LOG_LEVEL || 'info').toLowerCase() as LogLevel;
  return priority[level] >= (priority[configured] ?? priority.info);
}

function write(level: LogLevel, event: string, fields: Fields = {}) {
  if (!enabled(level)) return;
  const payload = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields });
  if (level === 'error') console.error(`[procurement] ${payload}`);
  else if (level === 'warn') console.warn(`[procurement] ${payload}`);
  else console.log(`[procurement] ${payload}`);
}

export const procurementLog = {
  debug: (event: string, fields?: Fields) => write('debug', event, fields),
  info: (event: string, fields?: Fields) => write('info', event, fields),
  warn: (event: string, fields?: Fields) => write('warn', event, fields),
  error: (event: string, fields?: Fields) => write('error', event, fields),
};

export function elapsedSince(startedAt: number) {
  return Date.now() - startedAt;
}
