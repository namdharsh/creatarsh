const REQUIRED_PRODUCTION_SECRETS = ['MANAGER_JWT_SECRET', 'CUSTOMER_JWT_SECRET'];

function parseCsv(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function loadConfig(env = process.env) {
  const errors = [];
  const nodeEnv = env.NODE_ENV || 'development';
  const port = Number(env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('PORT must be an integer between 1 and 65535.');
  if (!['development', 'test', 'production'].includes(nodeEnv)) errors.push('NODE_ENV must be development, test, or production.');
  const corsOrigins = parseCsv(env.CORS_ORIGINS);
  for (const origin of corsOrigins) {
    try {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) errors.push('CORS_ORIGINS must contain exact HTTP(S) origins without paths.');
    } catch { errors.push('CORS_ORIGINS must contain valid HTTP(S) origins.'); }
  }
  if (nodeEnv === 'production') {
    for (const name of REQUIRED_PRODUCTION_SECRETS) {
      if (!env[name] || String(env[name]).trim().length < 32) errors.push(`${name} must be set to a random value of at least 32 characters in production.`);
    }
    if (!env.MONGODB_URI) errors.push('MONGODB_URI must be configured in production.');
    if (!corsOrigins.length) errors.push('CORS_ORIGINS must contain at least one allowed origin in production.');
  }
  if (errors.length) {
    const error = new Error(`Invalid environment configuration: ${errors.join(' ')}`);
    error.name = 'ConfigurationError';
    error.statusCode = 500;
    throw error;
  }
  return Object.freeze({ nodeEnv, isProduction: nodeEnv === 'production', port, corsOrigins, mongoUri: env.MONGODB_URI || '' });
}

module.exports = { loadConfig, parseCsv };
