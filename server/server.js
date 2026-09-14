require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const serviceSchema = new mongoose.Schema({ title: String, description: String, active: { type: Boolean, default: true }, order: { type: Number, default: 0 } });
const portfolioSchema = new mongoose.Schema({ title: String, description: String, category: String, technologies: [String], projectUrl: String, featured: Boolean, active: { type: Boolean, default: true }, order: Number, media: [String] }, { timestamps: true });
const leadSchema = new mongoose.Schema({ name: String, company: String, email: String, whatsapp: String, projectType: String, requirements: String, status: { type: String, default: 'New' } }, { timestamps: true });
const managerSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'manager' },
  active: { type: Boolean, default: true },
  lastLoginAt: Date
}, { timestamps: true });

const Service = mongoose.model('Service', serviceSchema);
const Portfolio = mongoose.model('Portfolio', portfolioSchema);
const Lead = mongoose.model('Lead', leadSchema);
const Manager = mongoose.model('Manager', managerSchema);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again later.' }
});

function signToken(manager) {
  if (!process.env.MANAGER_JWT_SECRET) throw new Error('MANAGER_JWT_SECRET is not configured');
  return jwt.sign({ sub: manager._id.toString(), username: manager.username, role: manager.role }, process.env.MANAGER_JWT_SECRET, { expiresIn: '12h' });
}

function requireManager(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Authentication required' });
    if (!process.env.MANAGER_JWT_SECRET) return res.status(500).json({ message: 'Manager authentication is not configured' });
    req.manager = jwt.verify(token, process.env.MANAGER_JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid or expired session' });
  }
}

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'creatarsh-api' }));

app.get('/api/public/services', async (req, res) => {
  try { res.json(await Service.find({ active: true }).sort({ order: 1 })); }
  catch (e) { res.status(500).json({ message: 'Failed to load services' }); }
});

app.get('/api/public/portfolio', async (req, res) => {
  try { res.json(await Portfolio.find({ active: true }).sort({ order: 1 })); }
  catch (e) { res.status(500).json({ message: 'Failed to load portfolio' }); }
});

app.post('/api/public/leads', async (req, res) => {
  try { res.status(201).json(await Lead.create(req.body)); }
  catch (e) { res.status(400).json({ message: 'Invalid lead data' }); }
});

app.post('/api/manager/login', loginLimiter, async (req, res) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!username || !password) return res.status(400).json({ message: 'Username and password are required' });

    const manager = await Manager.findOne({ username, active: true });
    if (!manager || !(await bcrypt.compare(password, manager.passwordHash))) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    manager.lastLoginAt = new Date();
    await manager.save();
    const token = signToken(manager);
    res.json({ token, manager: { username: manager.username, role: manager.role } });
  } catch (e) {
    console.error('Manager login failed:', e.message);
    res.status(500).json({ message: 'Login service is unavailable' });
  }
});

app.get('/api/manager/me', requireManager, async (req, res) => {
  try {
    const manager = await Manager.findById(req.manager.sub).select('username role active lastLoginAt');
    if (!manager || !manager.active) return res.status(401).json({ message: 'Manager account is inactive' });
    res.json({ manager });
  } catch (e) { res.status(401).json({ message: 'Invalid manager session' }); }
});

app.post('/api/manager/change-password', requireManager, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (newPassword.length < 8) return res.status(400).json({ message: 'New password must be at least 8 characters' });
    const manager = await Manager.findById(req.manager.sub);
    if (!manager || !manager.active) return res.status(401).json({ message: 'Manager account is inactive' });
    if (!(await bcrypt.compare(currentPassword, manager.passwordHash))) return res.status(401).json({ message: 'Current password is incorrect' });
    manager.passwordHash = await bcrypt.hash(newPassword, 12);
    await manager.save();
    res.json({ message: 'Password changed successfully' });
  } catch (e) { res.status(500).json({ message: 'Could not change password' }); }
});

app.get('/api/manager/stats', requireManager, async (req, res) => {
  try {
    res.json({ portfolio: await Portfolio.countDocuments({ active: true }), services: await Service.countDocuments({ active: true }), leads: await Lead.countDocuments() });
  } catch (e) { res.status(500).json({ message: 'Failed to load dashboard stats' }); }
});

async function seedInitialManager() {
  const username = String(process.env.MANAGER_INITIAL_USERNAME || '').trim().toLowerCase();
  const password = String(process.env.MANAGER_INITIAL_PASSWORD || '');
  if (!username || !password) return;
  if (password.length < 8) throw new Error('MANAGER_INITIAL_PASSWORD must be at least 8 characters');
  const existing = await Manager.findOne({ username });
  if (existing) return;
  const passwordHash = await bcrypt.hash(password, 12);
  await Manager.create({ username, passwordHash, role: 'manager' });
  console.log(`Initial manager created: ${username}`);
}

const port = process.env.PORT || 5000;
async function start() {
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('MongoDB connected');
      await seedInitialManager();
    } catch (e) {
      console.error('MongoDB connection failed:', e.message);
    }
  } else console.log('No MONGODB_URI configured; API starts in demo mode.');
  app.listen(port, () => console.log(`Creatarsh API running on ${port}`));
}
start();
