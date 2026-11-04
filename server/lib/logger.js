const REDACT_KEYS = /authorization|cookie|password|secret|token|mongodb_uri|razorpay|api[_-]?key/i;
function redact(value, key = '') {
  if (REDACT_KEYS.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, k)]));
  }
  return value;
}
function log(level, message, fields = {}) {
  const entry = { timestamp: new Date().toISOString(), level, message, ...redact(fields) };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
const logger = {
  info: (message, fields) => log('info', message, fields),
  warn: (message, fields) => log('warn', message, fields),
  error: (message, fields) => log('error', message, fields),
  debug: (message, fields) => { if (process.env.NODE_ENV !== 'production') log('debug', message, fields); },
  redact,
};
function requestLogger(req, res, next) {
  const startedAt = Date.now();
  const requestId = req.headers['x-request-id'] && /^[a-zA-Z0-9._-]{1,100}$/.test(req.headers['x-request-id'])
    ? req.headers['x-request-id'] : require('crypto').randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.on('finish', () => logger.info('http_request', {
    requestId, method: req.method, path: String(req.originalUrl || req.url).split('?')[0],
    statusCode: res.statusCode, durationMs: Date.now() - startedAt,
  }));
  next();
}
module.exports = { logger, requestLogger, redact };
