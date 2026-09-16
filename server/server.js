require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = Number(process.env.PORT || 5000);
const ROOT = path.join(__dirname, '..');
const CUSTOMER_DIR = path.join(ROOT, 'customer');
const MANAGER_DIR = path.join(ROOT, 'manager');
const JWT_SECRET = process.env.MANAGER_JWT_SECRET || process.env.JWT_SECRET || 'change-this-secret-in-production';
const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || JWT_SECRET;

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

// Serve the customer website and manager assets from the same Express service.
// This keeps CSS/JS/images available when the API and web app are deployed together.
app.use('/customer', express.static(CUSTOMER_DIR, { extensions: ['html'] }));
app.use('/manager', express.static(MANAGER_DIR, { extensions: ['html'] }));
app.get('/', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'register.html')));
app.get('/account', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'account.html')));
app.get('/services', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'services.html')));
app.get('/work', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'work.html')));
app.get('/about', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'about.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'contact.html')));
app.get('/faq', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'faq.html')));
app.get('/manager', (req, res) => res.redirect('/manager/'));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
app.use('/api/', limiter);

// ---------- Models ----------
const serviceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true }, description: String, icon: { type: String, default: '✦' },
  features: [String], startingPrice: { type: Number, default: 0 }, timeline: String,
  active: { type: Boolean, default: true }, order: { type: Number, default: 0 }
}, { timestamps: true });
const portfolioSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true }, description: String, category: String, client: String,
  technologies: [String], projectUrl: String, githubUrl: String, featured: { type: Boolean, default: false },
  active: { type: Boolean, default: true }, order: { type: Number, default: 0 }, media: [String], results: [String]
}, { timestamps: true });
const testimonialSchema = new mongoose.Schema({ name: String, company: String, role: String, quote: String, rating: { type: Number, default: 5 }, avatar: String, approved: { type: Boolean, default: false }, order: { type: Number, default: 0 } }, { timestamps: true });
const faqSchema = new mongoose.Schema({ question: String, answer: String, active: { type: Boolean, default: true }, order: { type: Number, default: 0 } }, { timestamps: true });
const bannerSchema = new mongoose.Schema({ eyebrow: String, title: String, text: String, ctaText: String, ctaUrl: String, image: String, active: { type: Boolean, default: true }, order: { type: Number, default: 0 } }, { timestamps: true });
const siteSchema = new mongoose.Schema({ key: { type: String, unique: true, default: 'main' }, heroTitle: String, heroText: String, footerText: String, email: String, whatsapp: String, phone: String, instagram: String, linkedin: String, youtube: String, github: String, announcement: String, aboutText: String }, { timestamps: true });
const managerSchema = new mongoose.Schema({ username: { type: String, unique: true, lowercase: true, trim: true }, passwordHash: String, role: { type: String, default: 'manager' }, active: { type: Boolean, default: true }, lastLoginAt: Date }, { timestamps: true });
const customerSchema = new mongoose.Schema({ name: { type: String, required: true, trim: true }, email: { type: String, required: true, unique: true, lowercase: true, trim: true }, phone: String, company: String, passwordHash: { type: String, required: true }, active: { type: Boolean, default: true }, lastLoginAt: Date }, { timestamps: true });
const leadSchema = new mongoose.Schema({ enquiryId: { type: String, unique: true, index: true }, name: String, company: String, email: String, whatsapp: String, projectType: String, budget: String, deadline: String, referenceUrl: String, requirements: String, status: { type: String, default: 'NEW' }, notes: String, customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' } }, { timestamps: true });
const projectSchema = new mongoose.Schema({ projectId: { type: String, unique: true, index: true }, customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' }, name: String, description: String, status: { type: String, default: 'PLANNING' }, progress: { type: Number, default: 0, min: 0, max: 100 }, value: { type: Number, default: 0 }, startDate: Date, dueDate: Date, notes: String }, { timestamps: true });
const quoteSchema = new mongoose.Schema({ quoteId: { type: String, unique: true, index: true }, customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' }, items: [{ name: String, quantity: { type: Number, default: 1 }, price: { type: Number, default: 0 } }], discount: { type: Number, default: 0 }, gst: { type: Number, default: 18 }, subtotal: Number, total: Number, status: { type: String, default: 'DRAFT' }, validUntil: Date, notes: String }, { timestamps: true });
const invoiceSchema = new mongoose.Schema({ invoiceId: { type: String, unique: true, index: true }, customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' }, items: [{ name: String, quantity: { type: Number, default: 1 }, price: { type: Number, default: 0 } }], subtotal: Number, discount: { type: Number, default: 0 }, gst: { type: Number, default: 18 }, total: Number, status: { type: String, default: 'UNPAID' }, dueDate: Date }, { timestamps: true });
const paymentSchema = new mongoose.Schema({ transactionId: { type: String, index: true }, customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' }, invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }, amount: { type: Number, required: true }, gateway: String, status: { type: String, default: 'SUCCESS' }, paidAt: Date, note: String }, { timestamps: true });
const notificationSchema = new mongoose.Schema({ recipientType: { type: String, enum: ['customer', 'manager'] }, recipient: mongoose.Schema.Types.ObjectId, title: String, message: String, read: { type: Boolean, default: false }, link: String }, { timestamps: true });

const Service = mongoose.model('Service', serviceSchema); const Portfolio = mongoose.model('Portfolio', portfolioSchema);
const Testimonial = mongoose.model('Testimonial', testimonialSchema); const FAQ = mongoose.model('FAQ', faqSchema); const Banner = mongoose.model('Banner', bannerSchema);
const Site = mongoose.model('Site', siteSchema); const Manager = mongoose.model('Manager', managerSchema); const Customer = mongoose.model('Customer', customerSchema);
const Lead = mongoose.model('Lead', leadSchema); const Project = mongoose.model('Project', projectSchema); const Quote = mongoose.model('Quote', quoteSchema); const Invoice = mongoose.model('Invoice', invoiceSchema); const Payment = mongoose.model('Payment', paymentSchema); const Notification = mongoose.model('Notification', notificationSchema);

let dbReady = false;
mongoose.connection.on('connected', () => { dbReady = true; console.log('MongoDB connected'); });
mongoose.connection.on('disconnected', () => { dbReady = false; console.warn('MongoDB disconnected'); });
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI).catch(err => console.error('MongoDB connection failed:', err.message));
} else console.warn('MONGODB_URI is not configured. Database features will be unavailable.');

// ---------- Utilities ----------
function cleanArray(v) { return Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : []; }
function id(prefix) { return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`; }
function tokenFrom(req) { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7).trim() : null; }
function signManager(m) { return jwt.sign({ sub: String(m._id || 'env-manager'), username: m.username, role: m.role || 'manager', type: 'manager' }, JWT_SECRET, { expiresIn: process.env.MANAGER_JWT_EXPIRES || '90d' }); }
function signCustomer(c) { return jwt.sign({ sub: String(c._id), email: c.email, type: 'customer' }, CUSTOMER_JWT_SECRET, { expiresIn: process.env.CUSTOMER_JWT_EXPIRES || '90d' }); }
function verifyToken(req, type) { const token = tokenFrom(req); if (!token) throw new Error('NO_TOKEN'); const secret = type === 'manager' ? JWT_SECRET : CUSTOMER_JWT_SECRET; const payload = jwt.verify(token, secret); if (payload.type !== type) throw new Error('WRONG_TYPE'); return payload; }
async function requireManager(req, res, next) { try { req.auth = verifyToken(req, 'manager'); next(); } catch (e) { res.status(401).json({ message: 'Manager session expired. Please sign in again.', code: 'AUTH_REQUIRED' }); } }
async function requireCustomer(req, res, next) { try { req.auth = verifyToken(req, 'customer'); if (dbReady) { const c = await Customer.findById(req.auth.sub).select('_id active'); if (!c || !c.active) throw new Error('CUSTOMER_DISABLED'); } next(); } catch (e) { res.status(401).json({ message: 'Customer session expired. Please sign in again.', code: 'AUTH_REQUIRED' }); } }
function calc(items = [], discount = 0, gst = 18) { const subtotal = items.reduce((s, x) => s + Number(x.quantity || 1) * Number(x.price || 0), 0); const afterDiscount = Math.max(0, subtotal - Number(discount || 0)); return { subtotal, total: Math.round(afterDiscount * (1 + Number(gst || 0) / 100) * 100) / 100 }; }
async function seed() {
  if (!dbReady) return;
  if (process.env.MANAGER_INITIAL_USERNAME && process.env.MANAGER_INITIAL_PASSWORD) {
    const username = process.env.MANAGER_INITIAL_USERNAME.toLowerCase();
    const existing = await Manager.findOne({ username });
    if (!existing) await Manager.create({ username, passwordHash: await bcrypt.hash(process.env.MANAGER_INITIAL_PASSWORD, 12), role: 'manager' });
  }
  if (!await Site.findOne({ key: 'main' })) await Site.create({ key: 'main', heroTitle: 'Ideas to Impact', heroText: 'We design and build premium digital experiences for creators, businesses and ambitious brands.', footerText: 'BUILD.DESIGN.LAUNCH' });
  if (!await Service.countDocuments()) await Service.insertMany([
    { title: 'Web Development', description: 'Fast, scalable websites and web applications.', icon: '</>', features: ['Responsive UI', 'Modern architecture', 'Deployment'], startingPrice: 15000, timeline: '1–4 weeks', order: 1 },
    { title: 'App Development', description: 'Cross-platform mobile apps built around your workflow.', icon: '▣', features: ['Android & iOS', 'API integration', 'App launch'], startingPrice: 25000, timeline: '3–8 weeks', order: 2 },
    { title: 'UI/UX Design', description: 'Clear, conversion-focused interfaces with a premium visual system.', icon: '✦', features: ['Wireframes', 'UI system', 'Prototype'], startingPrice: 8000, timeline: '1–2 weeks', order: 3 },
    { title: 'Branding & Design', description: 'Identity, social creatives and digital brand assets.', icon: '◇', features: ['Logo system', 'Brand kit', 'Social assets'], startingPrice: 5000, timeline: '3–10 days', order: 4 },
    { title: 'E-commerce', description: 'Complete stores with payments, inventory and admin systems.', icon: '□', features: ['Storefront', 'Payments', 'Manager panel'], startingPrice: 30000, timeline: '3–8 weeks', order: 5 },
    { title: 'Custom Systems', description: 'Business software tailored to the way your team works.', icon: '⌘', features: ['Custom workflow', 'Dashboard', 'Integrations'], startingPrice: 40000, timeline: '4–12 weeks', order: 6 }
  ]);
}
setTimeout(seed, 2500);

// ---------- Public API ----------
app.get('/api/health', (req, res) => res.json({ ok: true, database: dbReady, service: 'creatarsh-api' }));
app.get('/api/public/content', async (req, res) => {
  try {
    const [services, portfolio, testimonials, faqs, banners, site] = await Promise.all([
      Service.find({ active: true }).sort({ order: 1, createdAt: -1 }), Portfolio.find({ active: true }).sort({ order: 1, createdAt: -1 }),
      Testimonial.find({ approved: true }).sort({ order: 1 }), FAQ.find({ active: true }).sort({ order: 1 }), Banner.find({ active: true }).sort({ order: 1 }), Site.findOne({ key: 'main' })
    ]);
    res.json({ services, portfolio, testimonials, faqs, banners, site });
  } catch (e) { res.status(503).json({ message: 'Website content is temporarily unavailable.' }); }
});
app.post('/api/public/leads', async (req, res) => {
  if (!dbReady) return res.status(503).json({ message: 'Project enquiry is temporarily unavailable. Please try again shortly.' });
  try {
    const b = req.body || {}; if (!b.name || !b.email || !b.requirements) return res.status(400).json({ message: 'Name, email and project requirements are required.' });
    let customer = null; try { const p = verifyToken(req, 'customer'); customer = p.sub; } catch (_) {}
    const lead = await Lead.create({ enquiryId: id('CR'), name: String(b.name).trim(), company: b.company, email: String(b.email).trim().toLowerCase(), whatsapp: b.whatsapp, projectType: b.projectType, budget: b.budget, deadline: b.deadline, referenceUrl: b.referenceUrl, requirements: b.requirements, customer });
    res.status(201).json({ message: 'Project brief received.', enquiryId: lead.enquiryId });
  } catch (e) { res.status(400).json({ message: 'Could not create enquiry.' }); }
});

// ---------- Auth ----------
app.post('/api/manager/login', authLimiter, async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase(); const password = String(req.body.password || '');
  if (!username || !password) return res.status(400).json({ message: 'Username and password are required.' });
  try {
    if (process.env.MANAGER_INITIAL_USERNAME && process.env.MANAGER_INITIAL_PASSWORD && username === process.env.MANAGER_INITIAL_USERNAME.toLowerCase() && password === process.env.MANAGER_INITIAL_PASSWORD) {
      let manager = dbReady ? await Manager.findOne({ username }) : null; manager = manager || { _id: 'env-manager', username, role: 'manager' };
      if (dbReady && manager._id !== 'env-manager') await Manager.updateOne({ _id: manager._id }, { lastLoginAt: new Date() });
      return res.json({ token: signManager(manager), manager: { username: manager.username, role: manager.role || 'manager' } });
    }
    if (!dbReady) return res.status(503).json({ message: 'Database is not connected. Configure MONGODB_URI or use the configured initial manager credentials.' });
    const manager = await Manager.findOne({ username, active: true }); if (!manager || !(await bcrypt.compare(password, manager.passwordHash))) return res.status(401).json({ message: 'Invalid manager credentials.' });
    manager.lastLoginAt = new Date(); await manager.save(); res.json({ token: signManager(manager), manager: { username: manager.username, role: manager.role } });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Manager login failed.' }); }
});
app.get('/api/manager/me', requireManager, async (req, res) => res.json({ manager: { username: req.auth.username, role: req.auth.role } }));
app.post('/api/manager/change-password', requireManager, async (req, res) => {
  if (!dbReady || req.auth.sub === 'env-manager') return res.status(400).json({ message: 'Use MANAGER_INITIAL_PASSWORD in Render environment variables for the initial manager account.' });
  const current = String(req.body.currentPassword || ''), next = String(req.body.newPassword || ''); if (next.length < 8) return res.status(400).json({ message: 'New password must be at least 8 characters.' });
  const m = await Manager.findById(req.auth.sub); if (!m || !(await bcrypt.compare(current, m.passwordHash))) return res.status(401).json({ message: 'Current password is incorrect.' }); m.passwordHash = await bcrypt.hash(next, 12); await m.save(); res.json({ message: 'Password updated.' });
});
app.post('/api/customer/register', authLimiter, async (req, res) => {
  if (!dbReady) return res.status(503).json({ message: 'Customer registration is temporarily unavailable.' });
  const name = String(req.body.name || '').trim(), email = String(req.body.email || '').trim().toLowerCase(), password = String(req.body.password || '');
  if (!name || !email || password.length < 8) return res.status(400).json({ message: 'Name, valid email and a password of at least 8 characters are required.' });
  try { if (await Customer.findOne({ email })) return res.status(409).json({ message: 'An account with this email already exists.' }); const c = await Customer.create({ name, email, phone: req.body.phone, company: req.body.company, passwordHash: await bcrypt.hash(password, 12), lastLoginAt: new Date() }); res.status(201).json({ token: signCustomer(c), customer: { id: c._id, name: c.name, email: c.email, phone: c.phone, company: c.company } }); } catch (e) { res.status(400).json({ message: 'Could not create customer account.' }); }
});
app.post('/api/customer/login', authLimiter, async (req, res) => {
  if (!dbReady) return res.status(503).json({ message: 'Customer login is temporarily unavailable. Please try again shortly.' });
  const email = String(req.body.email || '').trim().toLowerCase(), password = String(req.body.password || '');
  try { const c = await Customer.findOne({ email, active: true }); if (!c || !(await bcrypt.compare(password, c.passwordHash))) return res.status(401).json({ message: 'Invalid email or password.' }); c.lastLoginAt = new Date(); await c.save(); res.json({ token: signCustomer(c), customer: { id: c._id, name: c.name, email: c.email, phone: c.phone, company: c.company } }); } catch (e) { res.status(500).json({ message: 'Customer login failed.' }); }
});
app.get('/api/customer/me', requireCustomer, async (req, res) => { const c = await Customer.findById(req.auth.sub).select('-passwordHash'); if (!c) return res.status(404).json({ message: 'Customer not found.' }); res.json({ customer: c }); });
app.put('/api/customer/me', requireCustomer, async (req, res) => { const c = await Customer.findByIdAndUpdate(req.auth.sub, { $set: { name: req.body.name, phone: req.body.phone, company: req.body.company } }, { new: true }).select('-passwordHash'); res.json({ customer: c }); });

// ---------- Customer portal ----------
app.get('/api/customer/projects', requireCustomer, async (req, res) => res.json(await Project.find({ customer: req.auth.sub }).sort({ createdAt: -1 })));
app.get('/api/customer/quotes', requireCustomer, async (req, res) => res.json(await Quote.find({ customer: req.auth.sub }).populate('project', 'name').sort({ createdAt: -1 })));
app.get('/api/customer/invoices', requireCustomer, async (req, res) => res.json(await Invoice.find({ customer: req.auth.sub }).populate('project', 'name').sort({ createdAt: -1 })));
app.get('/api/customer/payments', requireCustomer, async (req, res) => res.json(await Payment.find({ customer: req.auth.sub }).populate('project', 'name').sort({ createdAt: -1 })));
app.get('/api/customer/notifications', requireCustomer, async (req, res) => res.json(await Notification.find({ recipientType: 'customer', recipient: req.auth.sub }).sort({ createdAt: -1 }).limit(30)));
app.post('/api/customer/notifications/:id/read', requireCustomer, async (req, res) => { await Notification.updateOne({ _id: req.params.id, recipientType: 'customer', recipient: req.auth.sub }, { read: true }); res.json({ ok: true }); });

// ---------- Manager APIs ----------
app.get('/api/manager/dashboard', requireManager, async (req, res) => {
  if (!dbReady) return res.json({ revenue: 0, pendingPayments: 0, leads: 0, customers: 0, activeProjects: 0, completedProjects: 0, openTickets: 0, recentLeads: [], recentPayments: [] });
  const [customers, leads, activeProjects, completedProjects, payments, recentLeads, recentPayments] = await Promise.all([
    Customer.countDocuments(), Lead.countDocuments(), Project.countDocuments({ status: { $nin: ['COMPLETED', 'CANCELLED'] } }), Project.countDocuments({ status: 'COMPLETED' }), Payment.find({ status: 'SUCCESS' }), Lead.find().sort({ createdAt: -1 }).limit(6), Payment.find().populate('customer', 'name email').populate('project', 'name').sort({ createdAt: -1 }).limit(6)
  ]);
  const revenue = payments.reduce((s, p) => s + Number(p.amount || 0), 0); const allInvoices = await Invoice.find({ status: { $in: ['UNPAID', 'OVERDUE'] } }); const pendingPayments = allInvoices.reduce((s, i) => s + Number(i.total || 0), 0);
  res.json({ revenue, pendingPayments, leads, customers, activeProjects, completedProjects, openTickets: 0, recentLeads, recentPayments });
});
app.get('/api/manager/customers', requireManager, async (req, res) => res.json(dbReady ? await Customer.find().select('-passwordHash').sort({ createdAt: -1 }) : []));
app.get('/api/manager/leads', requireManager, async (req, res) => res.json(dbReady ? await Lead.find().populate('customer', 'name email').sort({ createdAt: -1 }) : []));
app.put('/api/manager/leads/:id', requireManager, async (req, res) => { const lead = await Lead.findByIdAndUpdate(req.params.id, { $set: { status: req.body.status, notes: req.body.notes } }, { new: true }).populate('customer', 'name email'); res.json(lead); });
app.post('/api/manager/leads/:id/convert', requireManager, async (req, res) => {
  const lead = await Lead.findById(req.params.id); if (!lead) return res.status(404).json({ message: 'Lead not found.' }); let customer = lead.customer ? await Customer.findById(lead.customer) : await Customer.findOne({ email: lead.email });
  if (!customer) return res.status(400).json({ message: 'This lead has no customer account. Ask the client to register first or create the customer account from the Customers section.' });
  const project = await Project.create({ projectId: id('PRJ'), customer: customer._id, lead: lead._id, name: req.body.name || lead.projectType || 'New Project', description: lead.requirements, value: Number(req.body.value || 0), status: 'PLANNING', progress: 0 });
  lead.customer = customer._id; lead.status = 'WON'; await lead.save(); await Notification.create({ recipientType: 'customer', recipient: customer._id, title: 'Project created', message: `Your Creatarsh project “${project.name}” has been created.`, link: '/account' }); res.status(201).json(project);
});
app.get('/api/manager/projects', requireManager, async (req, res) => res.json(dbReady ? await Project.find().populate('customer', 'name email company').sort({ createdAt: -1 }) : []));
app.post('/api/manager/projects', requireManager, async (req, res) => { const p = await Project.create({ projectId: id('PRJ'), customer: req.body.customer, name: req.body.name, description: req.body.description, value: Number(req.body.value || 0), status: req.body.status || 'PLANNING', progress: Number(req.body.progress || 0), startDate: req.body.startDate || null, dueDate: req.body.dueDate || null, notes: req.body.notes }); if (p.customer) await Notification.create({ recipientType: 'customer', recipient: p.customer, title: 'New project', message: `Your project “${p.name}” is now available in your account.`, link: '/account' }); res.status(201).json(p); });
app.put('/api/manager/projects/:id', requireManager, async (req, res) => { const p = await Project.findByIdAndUpdate(req.params.id, { $set: { name: req.body.name, description: req.body.description, status: req.body.status, progress: Number(req.body.progress || 0), value: Number(req.body.value || 0), startDate: req.body.startDate || null, dueDate: req.body.dueDate || null, notes: req.body.notes } }, { new: true }).populate('customer', 'name email'); res.json(p); });
app.get('/api/manager/quotes', requireManager, async (req, res) => res.json(dbReady ? await Quote.find().populate('customer', 'name email').populate('project', 'name').sort({ createdAt: -1 }) : []));
app.post('/api/manager/quotes', requireManager, async (req, res) => { const items = Array.isArray(req.body.items) ? req.body.items : []; const totals = calc(items, req.body.discount, req.body.gst); const q = await Quote.create({ quoteId: id('QUO'), customer: req.body.customer, project: req.body.project || null, items, discount: Number(req.body.discount || 0), gst: Number(req.body.gst ?? 18), ...totals, status: req.body.status || 'SENT', validUntil: req.body.validUntil || null, notes: req.body.notes }); if (q.customer) await Notification.create({ recipientType: 'customer', recipient: q.customer, title: 'New quotation', message: `Quotation ${q.quoteId} is ready to review.`, link: '/account' }); res.status(201).json(q); });
app.put('/api/manager/quotes/:id', requireManager, async (req, res) => { const totals = calc(req.body.items || [], req.body.discount, req.body.gst); const q = await Quote.findByIdAndUpdate(req.params.id, { $set: { items: req.body.items || [], discount: Number(req.body.discount || 0), gst: Number(req.body.gst ?? 18), ...totals, status: req.body.status, validUntil: req.body.validUntil || null, notes: req.body.notes } }, { new: true }); res.json(q); });
app.post('/api/customer/quotes/:id/respond', requireCustomer, async (req, res) => { const q = await Quote.findOneAndUpdate({ _id: req.params.id, customer: req.auth.sub }, { status: req.body.status === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED' }, { new: true }); if (!q) return res.status(404).json({ message: 'Quotation not found.' }); res.json(q); });
app.get('/api/manager/invoices', requireManager, async (req, res) => res.json(dbReady ? await Invoice.find().populate('customer', 'name email').populate('project', 'name').sort({ createdAt: -1 }) : []));
app.post('/api/manager/invoices', requireManager, async (req, res) => { const items = req.body.items || []; const totals = calc(items, req.body.discount, req.body.gst); const i = await Invoice.create({ invoiceId: id('INV'), customer: req.body.customer, project: req.body.project || null, items, discount: Number(req.body.discount || 0), gst: Number(req.body.gst ?? 18), ...totals, status: req.body.status || 'UNPAID', dueDate: req.body.dueDate || null }); if (i.customer) await Notification.create({ recipientType: 'customer', recipient: i.customer, title: 'New invoice', message: `Invoice ${i.invoiceId} is available in your account.`, link: '/account' }); res.status(201).json(i); });
app.get('/api/manager/payments', requireManager, async (req, res) => res.json(dbReady ? await Payment.find().populate('customer', 'name email').populate('project', 'name').sort({ createdAt: -1 }) : []));
app.post('/api/manager/payments', requireManager, async (req, res) => { const p = await Payment.create({ transactionId: req.body.transactionId || id('TXN'), customer: req.body.customer, project: req.body.project || null, invoice: req.body.invoice || null, amount: Number(req.body.amount || 0), gateway: req.body.gateway || 'Manual', status: req.body.status || 'SUCCESS', paidAt: req.body.paidAt || new Date(), note: req.body.note }); if (p.customer) await Notification.create({ recipientType: 'customer', recipient: p.customer, title: 'Payment recorded', message: `₹${Number(p.amount).toLocaleString('en-IN')} payment has been recorded.`, link: '/account' }); res.status(201).json(p); });

// ---------- CMS generic CRUD ----------
const cms = { services: Service, portfolio: Portfolio, testimonials: Testimonial, faq: FAQ, banners: Banner };
for (const [key, Model] of Object.entries(cms)) {
  app.get(`/api/manager/${key}`, requireManager, async (req, res) => res.json(await Model.find().sort({ order: 1, createdAt: -1 })));
  app.post(`/api/manager/${key}`, requireManager, async (req, res) => { const d = { ...req.body }; if (key === 'services' || key === 'portfolio') { d.features = cleanArray(d.features); d.technologies = cleanArray(d.technologies); d.media = cleanArray(d.media); d.results = cleanArray(d.results); } const item = await Model.create(d); res.status(201).json(item); });
  app.put(`/api/manager/${key}/:id`, requireManager, async (req, res) => { const d = { ...req.body }; if (key === 'services' || key === 'portfolio') { d.features = cleanArray(d.features); d.technologies = cleanArray(d.technologies); d.media = cleanArray(d.media); d.results = cleanArray(d.results); } const item = await Model.findByIdAndUpdate(req.params.id, d, { new: true }); if (!item) return res.status(404).json({ message: 'Item not found.' }); res.json(item); });
  app.delete(`/api/manager/${key}/:id`, requireManager, async (req, res) => { await Model.findByIdAndDelete(req.params.id); res.json({ ok: true }); });
}
app.get('/api/manager/site', requireManager, async (req, res) => res.json(await Site.findOne({ key: 'main' }) || {}));
app.put('/api/manager/site', requireManager, async (req, res) => res.json(await Site.findOneAndUpdate({ key: 'main' }, { $set: { ...req.body, key: 'main' } }, { upsert: true, new: true })));

// ---------- Error / start ----------
app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found.' }));
app.listen(PORT, () => console.log(`Creatarsh server running on port ${PORT}`));
