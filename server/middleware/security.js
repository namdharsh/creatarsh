const cors = require('cors');
const helmet = require('helmet');
function createSecurityMiddleware(config) {
  const corsMiddleware = cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // server-to-server / same-origin requests
      if (config.corsOrigins.includes(origin)) return callback(null, true);
      // Keep development convenience, but never silently allow all origins in production.
      if (!config.isProduction) {
        try { if (/\.(vercel\.app|pages\.dev|github\.io)$/.test(new URL(origin).hostname)) return callback(null, true); } catch { /* reject malformed origins below */ }
      }
      const error = new Error('CORS origin not allowed'); error.statusCode = 403; error.code = 'CORS_ORIGIN_DENIED';
      return callback(error);
    }, credentials: false,
  });
  const helmetMiddleware = helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false, // Existing inline-script HTML relies on this; tighten after CSP audit.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
  return [helmetMiddleware, corsMiddleware];
}
module.exports = { createSecurityMiddleware };
