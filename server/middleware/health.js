function healthRoutes(app, { isDatabaseReady, service = 'creatarsh-api' }) {
  const live = (req, res) => res.status(200).json({ ok: true, service, status: 'live' });
  const ready = (req, res) => {
    const database = Boolean(isDatabaseReady());
    return res.status(database ? 200 : 503).json({ ok: database, service, status: database ? 'ready' : 'not_ready', database });
  };
  app.get('/health', live);
  app.get('/ready', ready);
  app.get('/api/health/live', live);
  app.get('/api/health/ready', ready);
}
module.exports = { healthRoutes };
