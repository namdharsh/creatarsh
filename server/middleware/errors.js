class AppError extends Error {
  constructor(statusCode, message, code = 'REQUEST_ERROR', details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }
}
function notFound(req, res, next) {
  return next(new AppError(404, 'API route not found.', 'NOT_FOUND'));
}
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const { logger } = require('../lib/logger');
  let status = Number(err.statusCode || err.status || 500);
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'Something went wrong on the server.';
  if (err.type === 'entity.too.large') { status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body is too large.'; }
  else if (err.type === 'entity.parse.failed' || err instanceof SyntaxError && Object.prototype.hasOwnProperty.call(err, 'body')) { status = 400; code = 'INVALID_JSON'; message = 'Request body contains invalid JSON.'; }
  else if (err.name === 'ValidationError') { status = 400; code = 'VALIDATION_ERROR'; message = 'Request validation failed.'; }
  else if (err.name === 'CastError') { status = 400; code = 'INVALID_IDENTIFIER'; message = 'A supplied identifier is invalid.'; }
  if (!Number.isInteger(status) || status < 400 || status > 599) status = 500;
  if (status >= 500) {
    logger.error('request_error', { requestId: req.requestId, method: req.method, path: req.path, statusCode: status, errorName: err.name });
    if (status === 500) message = 'Something went wrong on the server.';
  } else {
    logger.warn('request_rejected', { requestId: req.requestId, method: req.method, path: req.path, statusCode: status, code });
  }
  const body = { error: { code, message }, requestId: req.requestId || null };
  if (err.details && status < 500) body.error.details = err.details;
  return res.status(status).json(body);
}
module.exports = { AppError, notFound, errorHandler };
