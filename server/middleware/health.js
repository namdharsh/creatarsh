function healthRoutes(app, { isDatabaseReady, service = 'creatarsh-api' }) {
  app.get('/api/health/live', (req, res) => res.status(200).json({ ok: true, service, status: 'live' }));
  app.get('/api/health/ready', (req, res) => {
    const ready = Boolean(isDatabaseReady());
    return res.status(ready ? 200 : 503).json({ ok: ready, service, status: ready ? 'ready' : 'not_ready', database: ready });
  });
}
module.exports = { healthRoutes };
