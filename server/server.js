require('dotenv').config();
const { loadConfig } = require('./config/env');
const { logger, requestLogger } = require('./lib/logger');
const { createSecurityMiddleware } = require('./middleware/security');
const { createRateLimiter } = require('./middleware/rateLimit');
const { healthRoutes } = require('./middleware/health');
const { connectDatabase } = require('./config/database');
const { notFound, errorHandler } = require('./middleware/errors');
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const multer = require('multer');
const { inspectStaticZip, mimeType } = require('./lib/staticZip');
const { putPrivate, getPrivate, deletePrivate, storageConfig } = require('./lib/privateObjectStorage');
const { safeRelativePath, rewritePreviewHtml, rewritePreviewCss, contentSecurityPolicy } = require('./lib/publisherSecurity');
const { verifyCheckoutSignature, verifyWebhookSignature, amountToPaise } = require('./lib/paymentSecurity');

const app = express();
const CONFIG = loadConfig();
const PORT = CONFIG.port;
const ROOT = path.join(__dirname, '..');
const CUSTOMER_DIR = path.join(ROOT, 'customer');
const MANAGER_DIR = path.join(ROOT, 'manager');
const JWT_SECRET = process.env.MANAGER_JWT_SECRET || process.env.JWT_SECRET;
const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || JWT_SECRET;
const IS_PRODUCTION = CONFIG.isProduction;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const RAZORPAY_API = 'https://api.razorpay.com/v1';
if (IS_PRODUCTION && (!JWT_SECRET || !CUSTOMER_JWT_SECRET)) {
  throw new Error('MANAGER_JWT_SECRET and CUSTOMER_JWT_SECRET must be configured in production.');
}

app.disable('x-powered-by');
// Render/reverse-proxy aware. Keep this aligned with the actual trusted proxy chain.
app.set('trust proxy', Number(process.env.TRUSTED_PROXY_COUNT || 1));
app.use(requestLogger);
app.use(...createSecurityMiddleware(CONFIG));
app.use('/api', createRateLimiter({ windowMs: 15 * 60 * 1000, max: Number(process.env.API_RATE_LIMIT_MAX || 300) }));
const authRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: Number(process.env.AUTH_RATE_LIMIT_MAX || 30), message: 'Too many authentication attempts. Please try again later.' });
app.use(['/api/auth', '/api/manager/login', '/api/customer/login', '/api/customer/register'], authRateLimiter);
app.use(express.json({ limit: '8mb', verify: (req, res, buf) => { if (req.path === '/api/webhooks/razorpay') req.rawBody = Buffer.from(buf); } }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

// Published business sites are served from private immutable object-storage releases.
// This middleware never executes uploaded server-side code; only prevalidated static files are streamed.
app.use(async (req, res, next) => {
  try {
    const rootDomain = String(process.env.PLATFORM_ROOT_DOMAIN || 'creatarsh.in').toLowerCase();
    const host = String(req.hostname || '').toLowerCase().replace(/\.$/, '');
    if (!host.endsWith('.' + rootDomain) || host === 'www.' + rootDomain || host === 'api.' + rootDomain || host === 'admin.' + rootDomain || req.path.startsWith('/api/')) return next();
    const subdomain = host.slice(0, -(rootDomain.length + 1));
    if (!/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/.test(subdomain) || subdomain.includes('.')) return res.status(404).send('Business site not found.');
    if (!dbReady || !storageConfig()) return res.status(503).send('Business website temporarily unavailable.');
    const business = await Business.findOne({ slug: subdomain, status: { $ne: 'SUSPENDED' } }).select('_id').lean();
    if (!business) return res.status(404).send('Business site not found.');
    const deployment = await WebsiteDeployment.findOne({ businessId: business._id, active: true, status: 'PUBLISHED' }).sort({ version: -1 }).lean();
    if (!deployment) return res.status(404).send('This business website is not published yet.');
    const rel = safeRelativePath(req.path === '/' ? 'index.html' : req.path.slice(1));
    if (!rel) return res.status(404).send('File not found.');
    const object = await getPrivate(`${deployment.artifactPrefix}/${rel}`);
    res.set('Content-Type', object.contentType || mimeType(rel));
    res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('Content-Security-Policy', contentSecurityPolicy(false));
    res.set('Cache-Control', rel.toLowerCase().endsWith('.html') ? 'public, max-age=60' : 'public, max-age=86400, immutable');
    return res.status(200).send(object.body);
  } catch (err) { if (err && ['NoSuchKey','NotFound','NoSuchBucket'].includes(err.name)) return res.status(404).send('File not found.'); logger.error('published_site_serve_failed', { requestId: req.id, errorCode: err.code || err.name }); return res.status(502).send('Business website temporarily unavailable.'); }
});

// Serve the customer website and manager assets from the same Express service.
// This keeps CSS/JS/images available when the API and web app are deployed together.
app.use('/customer', express.static(CUSTOMER_DIR, { extensions: ['html'] }));
// Root aliases keep the same customer HTML files working when Express serves the site at /.
app.use('/assets', express.static(path.join(CUSTOMER_DIR, 'assets')));
app.use('/css', express.static(path.join(CUSTOMER_DIR, 'css')));
app.use('/js', express.static(path.join(CUSTOMER_DIR, 'js')));
app.use('/discovery', express.static(path.join(CUSTOMER_DIR, 'discovery')));
app.use('/manager', express.static(MANAGER_DIR, { extensions: ['html'] }));
app.get('/robots.txt', (req, res) => res.sendFile(path.join(ROOT, 'robots.txt')));
app.get('/sitemap.xml', (req, res) => res.sendFile(path.join(ROOT, 'sitemap.xml')));
app.get('/', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'discovery', 'index.html')));
app.get('/studio', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'index.html')));
app.get('/discover', (req, res) => res.redirect('/'));
app.get('/business/:slug', async (req, res, next) => {
  try {
    if (!dbReady) return res.status(503).sendFile(path.join(CUSTOMER_DIR, 'discovery', 'unavailable.html'));
    const business = await Business.findOne({ slug: String(req.params.slug || '').toLowerCase(), status: 'PUBLISHED' }).lean();
    if (!business) return res.status(404).sendFile(path.join(CUSTOMER_DIR, 'discovery', 'not-found.html'));
    const escapeHtml = value => String(value || '').replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
    const title = escapeHtml(`${business.name} | Creatarsh`);
    const description = escapeHtml((business.description || `${business.name} business profile on Creatarsh.`).slice(0, 300));
    const canonical = `https://creatarsh.in/business/${encodeURIComponent(business.slug)}`;
    const schema = JSON.stringify({ '@context':'https://schema.org', '@type':'LocalBusiness', name:business.name, description:business.description || '', url:canonical, telephone:business.phone || undefined, image:business.coverImage || business.logo || undefined, address: { '@type':'PostalAddress', streetAddress:business.address || undefined, addressLocality:business.city || undefined, postalCode:business.pinCode || undefined, addressCountry:'IN' } }).replace(/</g, '\\u003c');
    const html = require('fs').readFileSync(path.join(CUSTOMER_DIR, 'discovery', 'business.html'), 'utf8')
      .replaceAll('__BUSINESS_SLUG__', escapeHtml(business.slug))
      .replaceAll('__SEO_TITLE__', title).replaceAll('__SEO_DESCRIPTION__', description)
      .replaceAll('__CANONICAL_URL__', escapeHtml(canonical)).replace('__BUSINESS_SCHEMA__', schema);
    res.type('html').send(html);
  } catch (err) { next(err); }
});
app.get('/login', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'register.html')));
app.get('/account', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'account.html')));
app.get('/business-dashboard', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'business-dashboard.html')));
app.get('/services', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'services.html')));
// Service detail pages: support direct navigation, refreshes and the plural alias.
app.get('/service', (req, res) => res.redirect('/services'));
app.get(['/service/:slug', '/services/:slug'], (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'service.html')));
app.get('/work', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'work.html')));
app.get('/portfolio', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'work.html')));
app.get('/portfolio/:slug', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'portfolio.html')));
app.get('/about', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'about.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'contact.html')));
app.get('/support', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'support.html')));
app.get('/grievance', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'grievance.html')));
app.get('/faq', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'faq.html')));
app.get('/buy', (req,res)=>res.sendFile(path.join(CUSTOMER_DIR,'buy.html')));
app.get('/packages', (req,res)=>res.redirect('/buy'));
app.get('/packages/:code', (req,res)=>res.redirect('/buy?package='+encodeURIComponent(req.params.code)));
app.get('/start-project', (req,res)=>res.redirect('/buy'));
app.get('/legal/terms', (req,res)=>res.sendFile(path.join(CUSTOMER_DIR,'legal/terms.html')));
app.get('/legal/privacy', (req,res)=>res.sendFile(path.join(CUSTOMER_DIR,'legal/privacy.html')));
app.get('/legal/refunds', (req,res)=>res.sendFile(path.join(CUSTOMER_DIR,'legal/refunds.html')));
app.get('/legal/cookies', (req,res)=>res.sendFile(path.join(CUSTOMER_DIR,'legal/cookies.html')));
app.get('/legal/ai', (req,res)=>res.sendFile(path.join(CUSTOMER_DIR,'legal/ai.html')));
app.get('/legal/service-agreement', (req,res)=>res.sendFile(path.join(CUSTOMER_DIR,'legal/service-agreement.html')));
app.get('/legal/ip', (req,res)=>res.sendFile(path.join(CUSTOMER_DIR,'legal/ip.html')));
app.get('/legal/acceptable-use', (req,res)=>res.sendFile(path.join(CUSTOMER_DIR,'legal/acceptable-use.html')));
app.get('/manager', (req, res) => res.redirect('/manager/'));
app.get('/admin', (req,res)=>res.sendFile(path.join(MANAGER_DIR,'admin.html')));

// Generous production limits prevent a small agency team/page load from locking itself out.

// ---------- Models ----------
const businessMemberSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  role: { type: String, enum: ['OWNER', 'EDITOR'], default: 'OWNER' },
  status: { type: String, enum: ['ACTIVE', 'REVOKED'], default: 'ACTIVE' },
  grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  grantedAt: { type: Date, default: Date.now }
}, { timestamps: true });
businessMemberSchema.index({ businessId: 1, userId: 1 }, { unique: true });
const businessClaimSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  message: { type: String, maxlength: 1200, default: '' },
  proofReferences: [{ type: String, maxlength: 500 }],
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'], default: 'PENDING', index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId },
  reviewedAt: Date,
  reviewNote: { type: String, maxlength: 1000, default: '' }
}, { timestamps: true });
businessClaimSchema.index({ businessId: 1, requesterId: 1, status: 1 });
const businessPermissionSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  type: { type: String, enum: ['PROFILE_CREATED', 'CLAIM_SUBMITTED', 'CLAIM_APPROVED', 'CLAIM_REJECTED', 'PROFILE_UPDATED', 'MEDIA_UPLOADED', 'CORRECTION_REQUESTED', 'REMOVAL_REQUESTED', 'OWNER_GRANTED', 'OWNER_REVOKED'], required: true },
  scope: { type: String, default: 'business-profile' },
  granted: { type: Boolean, default: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  occurredAt: { type: Date, default: Date.now }
}, { timestamps: true });
businessPermissionSchema.index({ businessId: 1, occurredAt: -1 });
const businessRequestSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  type: { type: String, enum: ['CORRECTION', 'REMOVAL'], required: true },
  details: { type: String, required: true, maxlength: 2000 },
  proposedChanges: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['PENDING', 'IN_REVIEW', 'COMPLETED', 'REJECTED'], default: 'PENDING', index: true },
  reviewedBy: mongoose.Schema.Types.ObjectId,
  reviewedAt: Date,
  resolution: { type: String, maxlength: 1000, default: '' }
}, { timestamps: true });
businessRequestSchema.index({ businessId: 1, requesterId: 1, createdAt: -1 });

const businessSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 140 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/ },
  description: { type: String, default: '', maxlength: 3000 },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  logo: { type: String, default: '' }, coverImage: { type: String, default: '' },
  phone: { type: String, default: '' }, websiteUrl: { type: String, default: '' },
  email: { type: String, default: '', lowercase: true, trim: true }, whatsapp: { type: String, default: '' },
  contactOptions: { type: [String], enum: ['PHONE', 'WHATSAPP', 'EMAIL', 'WEBSITE', 'DIRECTIONS'], default: ['PHONE'] },
  hours: { type: mongoose.Schema.Types.Mixed, default: {} }, media: [{ url: String, publicId: String, resourceType: String, alt: String }],
  createdByCustomer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, ownershipStatus: { type: String, enum: ['UNCLAIMED', 'CLAIM_PENDING', 'CLAIMED'], default: 'UNCLAIMED', index: true },
  address: { type: String, default: '' }, city: { type: String, default: '', trim: true },
  pinCode: { type: String, default: '', trim: true, match: /^(?:[0-9]{6})?$/ },
  location: { type: { type: String, enum: ['Point'], default: undefined }, coordinates: { type: [Number], default: undefined } },
  tags: [{ type: String, trim: true }],
  status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'SUSPENDED'], default: 'DRAFT', index: true },
  storeEnabled: { type: Boolean, default: false, index: true },
  verified: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Manager' }
}, { timestamps: true });
businessSchema.index({ status: 1, category: 1, city: 1 });
businessSchema.index({ status: 1, name: 'text', description: 'text', category: 'text', tags: 'text' });
businessSchema.index({ location: '2dsphere' });
const publisherCounterSchema = new mongoose.Schema({ businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, unique: true }, value: { type: Number, default: 0 } }, { timestamps: true });
const websiteDeploymentSchema = new mongoose.Schema({ businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true }, version: { type: Number, required: true }, status: { type: String, enum: ['STAGED','PUBLISHED','ROLLED_BACK','UNPUBLISHED','FAILED'], default: 'STAGED', index: true }, active: { type: Boolean, default: false, index: true }, sourceKey: { type: String, required: true }, artifactPrefix: { type: String, required: true }, entryPoint: { type: String, default: 'index.html' }, fileManifest: [{ path: String, size: Number, contentType: String, sha256: String }], sourceSha256: String, totalBytes: Number, fileCount: Number, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Manager', required: true }, publishedAt: Date, logs: [{ event: String, level: { type: String, enum: ['info','warn','error'], default: 'info' }, message: String, actorId: mongoose.Schema.Types.ObjectId, metadata: mongoose.Schema.Types.Mixed, createdAt: { type: Date, default: Date.now } }] }, { timestamps: true });
websiteDeploymentSchema.index({ businessId: 1, version: 1 }, { unique: true });
websiteDeploymentSchema.index({ businessId: 1, active: 1, status: 1 });

const serviceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true }, slug: { type: String, index: true }, description: String, icon: { type: String, default: '✦' },
  features: [String], deliverables: [String], designTypes: [String],
  packages: [{ name: String, price: String, description: String, features: [String], popular: { type: Boolean, default: false } }],
  offers: [String], startingPrice: { type: Number, default: 0 }, timeline: String,
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
const contractTemplateSchema = new mongoose.Schema({ code:{type:String,unique:true,index:true}, name:{type:String,required:true}, category:String, priceLabel:String, description:String, scope:String, milestones:String, timeline:String, deliverables:[String], ip:String, support:String, acceptance:String, termination:String, active:{type:Boolean,default:true} },{timestamps:true});
const contractSchema = new mongoose.Schema({ contractId:{type:String,unique:true,index:true}, template:{type:mongoose.Schema.Types.ObjectId,ref:'ContractTemplate'}, customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'}, project:{type:mongoose.Schema.Types.ObjectId,ref:'Project'}, title:String, customerDetails:{name:String,email:String,phone:String,company:String,address:String}, scope:String, price:Number, priceLabel:String, milestones:String, timeline:String, deliverables:[String], ip:String, support:String, acceptance:String, termination:String, status:{type:String,enum:['DRAFT','SENT','ACCEPTED','REJECTED','TERMINATED'],default:'DRAFT'}, acceptedAt:Date, acceptedIp:String },{timestamps:true});
const customerSchema = new mongoose.Schema({ name: { type: String, required: true, trim: true }, email: { type: String, required: true, unique: true, lowercase: true, trim: true }, phone: String, company: String, passwordHash: { type: String, required: true }, active: { type: Boolean, default: true }, lastLoginAt: Date }, { timestamps: true });
const leadSchema = new mongoose.Schema({ enquiryId: { type: String, unique: true, index: true }, name: String, company: String, email: String, whatsapp: String, projectType: String, budget: String, deadline: String, referenceUrl: String, requirements: String, status: { type: String, default: 'NEW' }, workflowStage: { type: String, enum: ['NEW LEAD','QUALIFIED','QUOTE','PROPOSAL','ACCEPTED','CONTRACT','PAYMENT','PROJECT','DELIVERY','APPROVAL','COMPLETED','MAINTENANCE'], default: 'NEW LEAD' }, notes: String, customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' } }, { timestamps: true });
const projectSchema = new mongoose.Schema({ projectId: { type: String, unique: true, index: true }, customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' }, name: String, description: String, status: { type: String, default: 'PLANNING' }, progress: { type: Number, default: 0, min: 0, max: 100 }, value: { type: Number, default: 0 }, startDate: Date, dueDate: Date, notes: String }, { timestamps: true });
const quoteSchema = new mongoose.Schema({ quoteId: { type: String, unique: true, index: true }, customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' }, items: [{ name: String, quantity: { type: Number, default: 1 }, price: { type: Number, default: 0 } }], discount: { type: Number, default: 0 }, gst: { type: Number, default: 18 }, subtotal: Number, total: Number, status: { type: String, default: 'DRAFT' }, validUntil: Date, notes: String }, { timestamps: true });
const invoiceSchema = new mongoose.Schema({ invoiceId: { type: String, unique: true, index: true }, invoiceDate: { type: Date, default: Date.now }, customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' }, businessDetails: { legalName: String, tradeName: String, gstin: String, address: String, email: String, phone: String }, customerBilling: { name: String, company: String, email: String, phone: String, address: String, gstin: String }, items: [{ name: String, description: String, quantity: { type: Number, default: 1 }, rate: { type: Number, default: 0 }, price: { type: Number, default: 0 }, taxRate: { type: Number, default: 0 } }], subtotal: Number, discount: { type: Number, default: 0 }, gst: { type: Number, default: 18 }, taxAmount: { type: Number, default: 0 }, total: Number, status: { type: String, enum: ['DRAFT','UNPAID','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED','REFUNDED'], default: 'UNPAID' }, paymentMethod: String, transactionReference: String, dueDate: Date, paymentTerms: String, notes: String }, { timestamps: true });
const servicePackageSchema = new mongoose.Schema({ code: { type: String, unique: true, index: true }, name: { type: String, required: true }, price: { type: Number, required: true }, bookingAmount: { type: Number, default: 499 }, description: String, features: [String], category: String, active: { type: Boolean, default: true }, order: { type: Number, default: 0 }, billingType: { type: String, default: 'ONE_TIME' }, startingAt: { type: Boolean, default: false } }, { timestamps: true });

const paymentIntentSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'ServicePackage', required: true }, planCode: { type: String, required: true }, planName: { type: String, required: true },
  amount: { type: Number, required: true, min: 1 }, currency: { type: String, default: 'INR' }, idempotencyKey: { type: String, required: true },
  razorpayOrderId: { type: String, unique: true, sparse: true }, razorpayPaymentId: { type: String, default: '' }, invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  status: { type: String, enum: ['CREATING','CREATED','AUTHORIZED','PAID','FAILED','REFUNDED','RECONCILIATION_REQUIRED'], default: 'CREATING', index: true },
  providerStatus: { type: String, default: '' }, paidAt: Date, failureReason: { type: String, default: '' }, lastReconciledAt: Date
}, { timestamps: true });
paymentIntentSchema.index({ customer: 1, idempotencyKey: 1 }, { unique: true });
paymentIntentSchema.index({ status: 1, createdAt: -1 });
const razorpayWebhookEventSchema = new mongoose.Schema({ eventId: { type: String, required: true, unique: true }, event: String, processedAt: Date, outcome: String }, { timestamps: true });
const RazorpayWebhookEvent = mongoose.models.RazorpayWebhookEvent || mongoose.model('RazorpayWebhookEvent', razorpayWebhookEventSchema);
const PaymentIntent = mongoose.models.PaymentIntent || mongoose.model('PaymentIntent', paymentIntentSchema);

const paymentSchema = new mongoose.Schema({ transactionId: { type: String, index: true }, customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' }, invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }, amount: { type: Number, required: true }, gateway: String, status: { type: String, default: 'SUCCESS' }, paidAt: Date, note: String }, { timestamps: true });
invoiceSchema.index({status:1,createdAt:-1});
paymentSchema.index({status:1,paidAt:-1});
paymentSchema.index({customer:1,createdAt:-1});
const notificationSchema = new mongoose.Schema({ recipientType: { type: String, enum: ['customer', 'manager'] }, recipient: mongoose.Schema.Types.ObjectId, title: String, message: String, read: { type: Boolean, default: false }, link: String }, { timestamps: true });
const ticketSchema = new mongoose.Schema({ ticketId:{type:String,unique:true,index:true}, customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'}, subject:{type:String,required:true,trim:true}, category:{type:String,default:'GENERAL'}, priority:{type:String,default:'NORMAL'}, message:{type:String,required:true}, status:{type:String,default:'OPEN'}, messages:[{senderType:String,sender:mongoose.Schema.Types.ObjectId,message:String,createdAt:{type:Date,default:Date.now}}] },{timestamps:true});
const consentSchema = new mongoose.Schema({ customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'}, type:String, version:String, granted:Boolean, source:String, grantedAt:Date, withdrawnAt:Date, ip:String },{timestamps:true});
const privacyRequestSchema = new mongoose.Schema({ requestId:{type:String,unique:true,index:true}, customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'}, type:String, details:String, status:{type:String,default:'SUBMITTED'}, response:String, resolvedAt:Date },{timestamps:true});
const adminAuditSchema = new mongoose.Schema({ actorId:{type:mongoose.Schema.Types.ObjectId,ref:'Manager',required:true,index:true}, actorUsername:{type:String,default:''}, action:{type:String,required:true,index:true}, resourceType:{type:String,required:true,index:true}, resourceId:{type:String,default:''}, outcome:{type:String,enum:['SUCCESS','DENIED','FAILED'],default:'SUCCESS'}, ipHash:{type:String,default:''}, userAgentFamily:{type:String,default:''}, details:{type:mongoose.Schema.Types.Mixed,default:{}}, createdAt:{type:Date,default:Date.now,index:true} },{timestamps:false});
adminAuditSchema.index({createdAt:-1,action:1});
const adCampaignSchema = new mongoose.Schema({name:{type:String,required:true,trim:true,maxlength:140},status:{type:String,enum:['DRAFT','ACTIVE','PAUSED','ENDED'],default:'DRAFT',index:true},placement:{type:String,enum:['DIRECTORY_FEATURED','CATEGORY_SPONSORED','SEARCH_SPONSORED','BUSINESS_PAGE'],required:true},businessId:{type:mongoose.Schema.Types.ObjectId,ref:'Business',default:null,index:true},startsAt:Date,endsAt:Date,budget:Number,impressions:{type:Number,default:0},clicks:{type:Number,default:0},creativeUrl:String,creativeTitle:{type:String,default:'',maxlength:120},creativeText:{type:String,default:'',maxlength:400},destinationUrl:{type:String,default:''},creativeStatus:{type:String,enum:['PENDING','APPROVED','REJECTED'],default:'PENDING',index:true},creativeReviewNote:{type:String,default:'',maxlength:500},creativeReviewedBy:{type:mongoose.Schema.Types.ObjectId,ref:'Manager',default:null},creativeReviewedAt:Date,category:{type:String,default:'',maxlength:80},notes:String},{timestamps:true});
adCampaignSchema.index({status:1,creativeStatus:1,placement:1,startsAt:1,endsAt:1});
const adDailyMetricSchema = new mongoose.Schema({campaignId:{type:mongoose.Schema.Types.ObjectId,ref:'AdCampaign',required:true},day:{type:String,required:true},event:{type:String,enum:['IMPRESSION','CLICK'],required:true},count:{type:Number,default:0}},{timestamps:true});
adDailyMetricSchema.index({campaignId:1,day:1,event:1},{unique:true});
const AdDailyMetric = mongoose.models.AdDailyMetric || mongoose.model('AdDailyMetric',adDailyMetricSchema);
const AdminAudit = mongoose.models.AdminAudit || mongoose.model('AdminAudit',adminAuditSchema);
const AdCampaign = mongoose.models.AdCampaign || mongoose.model('AdCampaign',adCampaignSchema);
privacyRequestSchema.index({status:1,createdAt:-1});
const orderSchema = new mongoose.Schema({ orderId:{type:String,unique:true,index:true}, customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'}, productType:String, productCode:String, productName:String, packagePrice:Number, bookingAmount:Number, amount:{type:Number,required:true}, status:{type:String,default:'PENDING_PAYMENT'}, business:{type:String}, requirements:String, acceptedTermsVersion:String, privacyNoticeVersion:String, notes:String, razorpayOrderId:String, razorpayPaymentId:String, razorpaySignature:String },{timestamps:true});
const approvalSchema = new mongoose.Schema({ project:{type:mongoose.Schema.Types.ObjectId,ref:'Project'}, customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'}, type:String, title:String, version:String, status:{type:String,default:'PENDING'}, comment:String, actedAt:Date },{timestamps:true});
const documentSchema = new mongoose.Schema({ documentId:{type:String,unique:true,index:true}, customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'}, project:{type:mongoose.Schema.Types.ObjectId,ref:'Project'}, name:String, type:String, url:String, version:String, visibility:{type:String,default:'CUSTOMER'}, createdBy:String },{timestamps:true});
const counterSchema = new mongoose.Schema({ key:{type:String,unique:true}, value:{type:Number,default:0} });

const Business = mongoose.models.Business || mongoose.model('Business', businessSchema);
const WebsiteDeployment = mongoose.models.WebsiteDeployment || mongoose.model('WebsiteDeployment', websiteDeploymentSchema);
const PublisherCounter = mongoose.models.PublisherCounter || mongoose.model('PublisherCounter', publisherCounterSchema);
const BusinessMember = mongoose.models.BusinessMember || mongoose.model('BusinessMember', businessMemberSchema);
const BusinessClaim = mongoose.models.BusinessClaim || mongoose.model('BusinessClaim', businessClaimSchema);
const BusinessPermission = mongoose.models.BusinessPermission || mongoose.model('BusinessPermission', businessPermissionSchema);
const BusinessRequest = mongoose.models.BusinessRequest || mongoose.model('BusinessRequest', businessRequestSchema);

const analyticsEventSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
  event: { type: String, enum: ['PAGE_VIEW','CONTACT_CLICK','WHATSAPP_CLICK','DIRECTIONS_CLICK','ENQUIRY_SUBMITTED'], required: true },
  occurredAt: { type: Date, required: true, default: Date.now },
  pagePath: { type: String, maxlength: 240, default: '/' },
  sourceHost: { type: String, maxlength: 160, default: 'direct' },
  // Daily salted digest of an ephemeral session token; never store IP, raw token, user-agent or visitor identity.
  visitorDigest: { type: String, maxlength: 64, default: '' }
}, { timestamps: false });
analyticsEventSchema.index({ businessId: 1, occurredAt: -1 });
analyticsEventSchema.index({ businessId: 1, event: 1, occurredAt: -1 });
analyticsEventSchema.index({ businessId: 1, occurredAt: -1, visitorDigest: 1 });
const businessEnquirySchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
  name: { type: String, required: true, maxlength: 120 }, email: { type: String, maxlength: 254, default: '' },
  phone: { type: String, maxlength: 40, default: '' }, message: { type: String, required: true, maxlength: 3000 },
  status: { type: String, enum: ['NEW','CONTACTED','CLOSED'], default: 'NEW' }
}, { timestamps: true });
businessEnquirySchema.index({ businessId: 1, createdAt: -1 });
businessEnquirySchema.index({ businessId: 1, status: 1, createdAt: -1 });
const storeProductSchema = new mongoose.Schema({ businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true }, name: { type: String, required: true, maxlength: 180 }, sku: { type: String, maxlength: 80, default: '' }, price: { type: Number, min: 0, required: true }, active: { type: Boolean, default: true }, stock: { type: Number, min: 0, default: 0 } }, { timestamps: true });
storeProductSchema.index({ businessId: 1, createdAt: -1 }); storeProductSchema.index({ businessId: 1, sku: 1 }, { sparse: true });
const BusinessAnalyticsEvent = mongoose.models.BusinessAnalyticsEvent || mongoose.model('BusinessAnalyticsEvent', analyticsEventSchema);
const BusinessEnquiry = mongoose.models.BusinessEnquiry || mongoose.model('BusinessEnquiry', businessEnquirySchema);
const BusinessStoreProduct = mongoose.models.BusinessStoreProduct || mongoose.model('BusinessStoreProduct', storeProductSchema);

const Service = mongoose.model('Service', serviceSchema); const Portfolio = mongoose.model('Portfolio', portfolioSchema);
const Testimonial = mongoose.model('Testimonial', testimonialSchema); const FAQ = mongoose.model('FAQ', faqSchema); const Banner = mongoose.model('Banner', bannerSchema);
const Site = mongoose.model('Site', siteSchema); const ServicePackage = mongoose.model('ServicePackage', servicePackageSchema); const Manager = mongoose.model('Manager', managerSchema); const Customer = mongoose.model('Customer', customerSchema);
const Counter = mongoose.model('Counter', counterSchema); const Lead = mongoose.model('Lead', leadSchema); const ContractTemplate = mongoose.model('ContractTemplate', contractTemplateSchema); const Contract = mongoose.model('Contract', contractSchema); const Project = mongoose.model('Project', projectSchema); const Quote = mongoose.model('Quote', quoteSchema); const Invoice = mongoose.model('Invoice', invoiceSchema); const Payment = mongoose.model('Payment', paymentSchema); const Notification = mongoose.model('Notification', notificationSchema); const Ticket = mongoose.model('Ticket', ticketSchema); const Consent = mongoose.model('Consent', consentSchema); const PrivacyRequest = mongoose.model('PrivacyRequest', privacyRequestSchema); const Order = mongoose.model('Order', orderSchema); const Approval = mongoose.model('Approval', approvalSchema); const Document = mongoose.model('Document', documentSchema);

let dbReady = false;
mongoose.connection.on('connected', () => { dbReady = true; });
mongoose.connection.on('disconnected', () => { dbReady = false; logger.warn('mongodb_disconnected'); });
if (CONFIG.mongoUri) {
  connectDatabase(CONFIG.mongoUri).catch(() => logger.error('mongodb_connection_failed', { hint: 'Check MONGODB_URI and Atlas network access; connection details are intentionally omitted.' }));
} else logger.warn('mongodb_not_configured', { hint: 'Database features will be unavailable until MONGODB_URI is configured.' });

// ---------- Utilities ----------
function cleanArray(v) { return Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : []; }
function slugify(v) { return String(v || '').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function cleanPackages(v) { return Array.isArray(v) ? v.map(x => ({ name:String(x?.name||'').trim(), price:String(x?.price||'').trim(), description:String(x?.description||'').trim(), features:cleanArray(x?.features), popular:!!x?.popular })).filter(x=>x.name) : []; }
function id(prefix) { return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`; }
async function ticketId(){const c=await Counter.findOneAndUpdate({key:'support-ticket'},{$inc:{value:1}},{upsert:true,new:true,setDefaultsOnInsert:true});return `CR-TKT-${String(c.value).padStart(4,'0')}`;}
function tokenFrom(req) { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7).trim() : null; }
function signManager(m) { return jwt.sign({ sub: String(m._id), username: m.username, role: m.role || 'manager', type: 'manager' }, JWT_SECRET, { expiresIn: process.env.MANAGER_JWT_EXPIRES || '12h' }); }
function signCustomer(c) { return jwt.sign({ sub: String(c._id), email: c.email, type: 'customer' }, CUSTOMER_JWT_SECRET, { expiresIn: process.env.CUSTOMER_JWT_EXPIRES || '7d' }); }
function verifyToken(req, type) { const token = tokenFrom(req); if (!token) throw new Error('NO_TOKEN'); const secret = type === 'manager' ? JWT_SECRET : CUSTOMER_JWT_SECRET; const payload = jwt.verify(token, secret); if (payload.type !== type) throw new Error('WRONG_TYPE'); return payload; }
async function requireManager(req, res, next) { try { req.auth = verifyToken(req, 'manager'); if (!dbReady) return res.status(503).json({ message: 'Manager authorization is temporarily unavailable.', code: 'AUTH_DATABASE_UNAVAILABLE' }); const manager = await Manager.findById(req.auth.sub).select('_id username role active').lean(); if (!manager || manager.active === false) return res.status(401).json({ message: 'Manager session is no longer valid. Please sign in again.', code: 'AUTH_REQUIRED' }); req.auth.username = manager.username; req.auth.role = manager.role || 'manager'; next(); } catch (e) { if (e.message === 'NO_TOKEN' || e.message === 'WRONG_TYPE' || e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError') return res.status(401).json({ message: 'Manager session expired. Please sign in again.', code: 'AUTH_REQUIRED' }); next(e); } }
const ADMIN_ROLES = new Set(['admin','superadmin']);
function safeAuditDetails(value){ const input=value&&typeof value==='object'?value:{}; const out={}; for(const [k,v] of Object.entries(input).slice(0,30)){ if(/password|secret|token|authorization|cookie|email|phone|address|ip|useragent|message|details|payment|signature/i.test(k)) continue; if(['string','number','boolean'].includes(typeof v)) out[k]=typeof v==='string'?v.slice(0,160):v; } return out; }
async function writeAdminAudit(req, action, resourceType, resourceId='', details={}, outcome='SUCCESS'){ try { const crypto = await import('node:crypto'); const ip=String(req.ip||''); const ipHash=ip?crypto.createHash('sha256').update(`${process.env.AUDIT_IP_SALT||'local-audit-salt'}:${ip}`).digest('hex').slice(0,24):''; const ua=String(req.headers['user-agent']||''); const family=/Edg/i.test(ua)?'Edge':/Chrome/i.test(ua)?'Chrome':/Firefox/i.test(ua)?'Firefox':/Safari/i.test(ua)?'Safari':'Other'; await AdminAudit.create({actorId:req.auth.sub,actorUsername:String(req.auth.username||''),action,resourceType,resourceId:String(resourceId||'').slice(0,100),outcome,ipHash,userAgentFamily:family,details:safeAuditDetails(details)}); } catch(e) { logger.error('admin_audit_write_failed',{action,resourceType,error:e.message}); throw e; } }
async function requireAdmin(req,res,next){ try { req.auth=verifyToken(req,'manager'); if(!dbReady)return res.status(503).json({message:'Admin authorization requires the database.'}); const manager=await Manager.findById(req.auth.sub).select('_id username role active').lean(); if(!manager||!manager.active||!ADMIN_ROLES.has(String(manager.role||'').toLowerCase())){ await writeAdminAudit({auth:{sub:req.auth.sub,username:req.auth.username},ip:req.ip,headers:req.headers},'ADMIN_ACCESS_DENIED','route',req.path,{},'DENIED').catch(()=>{}); return res.status(403).json({message:'Administrator role required.',code:'ADMIN_REQUIRED'}); } req.auth.role=manager.role; req.auth.username=manager.username; next(); } catch(e){ if(e.message==='NO_TOKEN'||e.message==='WRONG_TYPE'||e.name==='JsonWebTokenError'||e.name==='TokenExpiredError')return res.status(401).json({message:'Manager session expired. Please sign in again.',code:'AUTH_REQUIRED'}); next(e); } }
async function requireCustomer(req, res, next) { try { req.auth = verifyToken(req, 'customer'); if (!dbReady) return res.status(503).json({ message: 'Account authorization is temporarily unavailable.', code: 'AUTH_DATABASE_UNAVAILABLE' }); const c = await Customer.findById(req.auth.sub).select('_id active').lean(); if (!c || c.active === false) return res.status(401).json({ message: 'Customer session is no longer valid. Please sign in again.', code: 'AUTH_REQUIRED' }); next(); } catch (e) { if (e.message === 'NO_TOKEN' || e.message === 'WRONG_TYPE' || e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError' || e.message === 'CUSTOMER_DISABLED') return res.status(401).json({ message: 'Customer session expired. Please sign in again.', code: 'AUTH_REQUIRED' }); next(e); } }
function finiteNumber(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function validItems(items) { return Array.isArray(items) && items.length > 0 && items.every(x => String(x?.name || '').trim() && finiteNumber(x.quantity, 1) > 0 && finiteNumber(x.price, 0) >= 0); }
function calc(items = [], discount = 0, gst = 18) { const subtotal = items.reduce((s, x) => s + finiteNumber(x.quantity, 1) * finiteNumber(x.price, 0), 0); const safeDiscount = Math.min(Math.max(0, finiteNumber(discount, 0)), subtotal); const safeGst = Math.min(Math.max(0, finiteNumber(gst, 18)), 100); const afterDiscount = Math.max(0, subtotal - safeDiscount); return { subtotal: Math.round(subtotal * 100) / 100, total: Math.round(afterDiscount * (1 + safeGst / 100) * 100) / 100 }; }
async function seed() {
  if (!dbReady) return;
  if (process.env.MANAGER_INITIAL_USERNAME && process.env.MANAGER_INITIAL_PASSWORD) {
    const username = process.env.MANAGER_INITIAL_USERNAME.toLowerCase();
    const existing = await Manager.findOne({ username });
    if (!existing) await Manager.create({ username, passwordHash: await bcrypt.hash(process.env.MANAGER_INITIAL_PASSWORD, 12), role: 'manager' });
  }
  if(process.env.ADMIN_INITIAL_USERNAME && process.env.ADMIN_INITIAL_PASSWORD){ const username=process.env.ADMIN_INITIAL_USERNAME.toLowerCase(); const existing=await Manager.findOne({username}); if(!existing) await Manager.create({username,passwordHash:await bcrypt.hash(process.env.ADMIN_INITIAL_PASSWORD,12),role:'admin',active:true}); }
  if (!await Site.findOne({ key: 'main' })) await Site.create({ key: 'main', heroTitle: 'Ideas to Impact', heroText: 'We design and build premium digital experiences for creators, businesses and ambitious brands.', footerText: 'BUILD.DESIGN.LAUNCH' });
  if (!await Service.countDocuments()) await Service.insertMany([
    { title: 'Web Development', description: 'Fast, scalable websites and web applications.', icon: '</>', features: ['Responsive UI', 'Modern architecture', 'Deployment'], startingPrice: 15000, timeline: '1–4 weeks', order: 1 },
    { title: 'App Development', description: 'Cross-platform mobile apps built around your workflow.', icon: '▣', features: ['Android & iOS', 'API integration', 'App launch'], startingPrice: 25000, timeline: '3–8 weeks', order: 2 },
    { title: 'UI/UX Design', description: 'Clear, conversion-focused interfaces with a premium visual system.', icon: '✦', features: ['Wireframes', 'UI system', 'Prototype'], startingPrice: 8000, timeline: '1–2 weeks', order: 3 },
    { title: 'Branding & Design', description: 'Identity, social creatives and digital brand assets.', icon: '◇', features: ['Logo system', 'Brand kit', 'Social assets'], startingPrice: 5000, timeline: '3–10 days', order: 4 },
    { title: 'E-commerce', description: 'Complete stores with payments, inventory and admin systems.', icon: '□', features: ['Storefront', 'Payments', 'Manager panel'], startingPrice: 30000, timeline: '3–8 weeks', order: 5 },
    { title: 'Custom Systems', description: 'Business software tailored to the way your team works.', icon: '⌘', features: ['Custom workflow', 'Dashboard', 'Integrations'], startingPrice: 40000, timeline: '4–12 weeks', order: 6 }
  ]);
  if (!await ServicePackage.countDocuments()) await ServicePackage.insertMany([
    {code:'PRESENCE_499',name:'Online Presence Starter',price:499,bookingAmount:499,description:'A clean one-page business website.',features:['Responsive website','Business information','WhatsApp & Maps','Basic SEO','SSL/deployment','1 revision'],category:'Website',order:1},
    {code:'BUSINESS_1499',name:'Business Website',price:1499,bookingAmount:499,description:'A practical multi-page business website.',features:['Up to 5 pages','Contact form','Social links','Basic SEO','3 revisions'],category:'Website',order:2},
    {code:'PRO_2999',name:'Professional Website',price:2999,bookingAmount:999,description:'Premium custom website for growing businesses.',features:['Up to 8 pages','Premium responsive design','Gallery/testimonials','SEO','5 revisions'],category:'Website',order:3},
    {code:'DIGITAL_7999',name:'Business Digital Setup',price:7999,bookingAmount:1999,description:'Website plus essential digital setup.',features:['Professional website','Domain/hosting setup','WhatsApp','Google Business assistance','Analytics','30-day support'],category:'Digital Setup',order:4},
    {code:'GROWTH_14999',name:'Business Growth',price:14999,bookingAmount:2999,description:'Conversion-focused digital presence.',features:['Premium website','Advanced SEO','Lead workflow','WhatsApp automation','Analytics','60-day support'],category:'Growth',order:5},
    {code:'SOFTWARE_49999',name:'Custom Business Software',price:49999,bookingAmount:5000,description:'Custom business software starting at this price.',features:['Custom workflows','Dashboard','Database/API','Deployment planning'],category:'Software',order:6,startingAt:true},
    {code:'ERP_75000',name:'School ERP',price:75000,bookingAmount:7500,description:'School management platform starting package.',features:['Core ERP','Admin/teacher/parent/student workflows','Reports','Deployment planning'],category:'ERP',order:7,startingAt:true},
    {code:'CARE_499',name:'Monthly Care Plan · ₹499',price:499,bookingAmount:499,description:'Essential monthly website care.',features:['Minor content updates','Basic monitoring','Routine maintenance'],category:'Monthly Care',order:8,billingType:'MONTHLY'},
    {code:'CARE_999',name:'Monthly Care Plan · ₹999',price:999,description:'Standard monthly website care.',features:['Content updates','Monitoring','Routine maintenance','Basic support'],category:'Monthly Care',order:9,billingType:'MONTHLY'},
    {code:'CARE_1999',name:'Monthly Care Plan · ₹1,999',price:1999,bookingAmount:1999,description:'Priority monthly website care.',features:['Priority updates','Monitoring','Maintenance','Support','Minor improvements'],category:'Monthly Care',order:10,billingType:'MONTHLY'}
  ]);  if (!await ContractTemplate.countDocuments()) await ContractTemplate.insertMany([
    {code:'SMALL_WEBSITE',name:'Small Website Agreement',category:'Website',priceLabel:'₹499 / ₹1,499 / ₹2,999',description:'Standard agreement for starter, business and professional website packages.',scope:'Website design and development based on the selected package and approved requirements.',milestones:'Requirements & content; design/build; review & revisions; launch.',timeline:'Confirmed after requirements, content and access are received.',deliverables:['Website build','Responsive pages','Configured forms/integrations included in scope','Deployment handover'],ip:'Final paid deliverables are licensed/transferred as stated in the accepted proposal; Creatarsh pre-existing tools and third-party assets remain subject to their rights.',support:'Support follows the selected package and any active care plan.',acceptance:'Customer confirms acceptance in writing or through the customer portal after review.',termination:'Either party may terminate for material breach after reasonable notice; completed work and approved costs remain payable.'},
    {code:'BUSINESS_GROWTH',name:'Business Growth Agreement',category:'Growth',priceLabel:'₹7,999 / ₹14,999',description:'Agreement for Business Digital Setup and Business Growth packages.',scope:'Digital setup, website, analytics, lead workflow and other items listed in the accepted proposal.',milestones:'Discovery; implementation; review; launch; support handover.',timeline:'Set in the accepted proposal based on scope and dependencies.',deliverables:['Website/digital setup','Configured integrations in scope','Analytics/lead workflow where included','Handover and support'],ip:'Final paid custom deliverables are licensed/transferred as specified; third-party and pre-existing materials remain subject to their licenses.',support:'Package support period plus optional monthly care plan.',acceptance:'Acceptance follows customer review or production use with no material defect reported within the agreed review period.',termination:'Termination follows notice/cure where practical; completed work and non-refundable third-party costs remain payable.'},
    {code:'CUSTOM_SOFTWARE',name:'Custom Software Agreement',category:'Software',priceLabel:'₹50,000+',description:'Custom software development agreement for business systems and applications.',scope:'Detailed requirements, modules, integrations and exclusions are defined in the accepted proposal/specification.',milestones:'Discovery/specification; UI/architecture; development; testing; UAT; deployment; handover.',timeline:'Milestone dates are agreed after scope confirmation and may change for client dependencies or approved change requests.',deliverables:['Source/build or agreed deployment','Database/API components in scope','Documentation/handover','Testing and deployment support'],ip:'Ownership/licensing of custom work transfers only after agreed payments; Creatarsh retains rights in pre-existing libraries, generic components and know-how; third-party components remain under their licenses.',support:'Warranty/bug-fix period and ongoing support are defined in the proposal or maintenance plan.',acceptance:'Milestones are accepted after UAT or written approval; changes outside scope use change control.',termination:'Termination is governed by milestone status, payment for completed work, approved expenses and handling of confidential materials.'}
  ]);

}
mongoose.connection.once('connected', () => { seed().then(async () => { await ServicePackage.updateMany({ bookingAmount: { $exists: false } }, { $set: { bookingAmount: 499 } }); }).catch(err => console.error('Seed/migration failed:', err.message)); });

// ---------- Public API ----------
healthRoutes(app, { isDatabaseReady: () => dbReady, service: 'creatarsh-api' });
app.get('/api/health', (req, res) => res.json({ ok: true, database: dbReady, service: 'creatarsh-api' }));
const { buildBusinessFilters, parseDirectoryPagination } = require('./lib/businessDirectory');
app.get('/api/public/business-categories', async (req, res, next) => {
  try {
    if (!dbReady) return res.status(503).json({ message: 'Business directory is temporarily unavailable.' });
    const categories = await Business.distinct('category', { status: 'PUBLISHED', category: { $nin: ['', null] } });
    return res.json({ categories: categories.filter(Boolean).sort((a, b) => a.localeCompare(b)) });
  } catch (err) { return next(err); }
});
app.get('/api/public/businesses', async (req, res, next) => {
  try {
    if (!dbReady) return res.status(503).json({ message: 'Business directory is temporarily unavailable.' });
    const pagination = parseDirectoryPagination(req.query);
    const filters = buildBusinessFilters(req.query);
    const total = await Business.countDocuments(filters);
    const businesses = await Business.find(filters)
      .select(publicBusinessFields)
      .sort(req.query.sort === 'name' ? { name: 1, _id: 1 } : { verified: -1, name: 1, _id: 1 })
      .skip(pagination.skip).limit(pagination.limit).lean();
    return res.json({ businesses: businesses.map(sanitizePublicBusiness), pagination: { page: pagination.page, limit: pagination.limit, total, pages: Math.ceil(total / pagination.limit) } });
  } catch (err) { return next(err); }
});
app.get('/api/public/businesses/:slug', async (req, res, next) => {
  try {
    if (!dbReady) return res.status(503).json({ message: 'Business directory is temporarily unavailable.' });
    const business = await Business.findOne({ slug: String(req.params.slug || '').toLowerCase(), status: 'PUBLISHED' })
      .select(publicBusinessFields).lean();
    if (!business) return res.status(404).json({ message: 'Business not found.' });
    return res.json({ business: sanitizePublicBusiness(business) });
  } catch (err) { return next(err); }
});

// ---------- Business onboarding, ownership and profile permissions ----------
const BUSINESS_CATEGORIES = ['Retail', 'Food & Beverage', 'Beauty & Wellness', 'Health', 'Education', 'Home Services', 'Automotive', 'Professional Services', 'Entertainment', 'Other'];
const publicBusinessFields = 'name slug description category logo coverImage phone email whatsapp websiteUrl contactOptions hours address city pinCode tags media verified status createdAt';
function sanitizePublicBusiness(business) { const b = business && typeof business.toObject === 'function' ? business.toObject() : { ...(business || {}) }; const opts = Array.isArray(b.contactOptions) ? b.contactOptions : []; if (!opts.includes('EMAIL')) delete b.email; if (!opts.includes('WHATSAPP')) delete b.whatsapp; if (!opts.includes('PHONE')) delete b.phone; delete b.createdByCustomer; delete b.createdBy; delete b.ownershipStatus; delete b.__v; return b; }
const slugFromBusiness = value => String(value || '').toLowerCase().trim().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const safeHttpUrl = value => { if (!value) return ''; try { const u = new URL(String(value)); return ['https:', 'http:'].includes(u.protocol) ? u.toString() : null; } catch { return null; } };
function requireDb(req, res, next) { if (!dbReady) return res.status(503).json({ message: 'Business services are temporarily unavailable.' }); next(); }
async function requireBusinessMember(req, res, next) {
  try {
    const member = await BusinessMember.findOne({ businessId: req.params.businessId || req.params.id, userId: req.auth.sub, status: 'ACTIVE' }).lean();
    if (!member) return res.status(403).json({ message: 'You do not have permission to manage this business.' });
    req.businessMember = member; next();
  } catch (err) { next(err); }
}
function auditBusiness(businessId, actorId, type, details = {}) { return BusinessPermission.create({ businessId, actorId, type, details }); }
app.get('/api/v1/business/categories', (req, res) => res.json({ categories: BUSINESS_CATEGORIES }));
app.post('/api/v1/businesses', requireCustomer, requireDb, async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const category = String(body.category || '').trim();
    const city = String(body.city || '').trim();
    if (name.length < 2 || name.length > 140) return res.status(400).json({ message: 'Business name must be 2–140 characters.' });
    if (!BUSINESS_CATEGORIES.includes(category)) return res.status(400).json({ message: 'Choose a valid business category.' });
    if (city.length > 100 || !city) return res.status(400).json({ message: 'City is required and must be under 100 characters.' });
    const pinCode = String(body.pinCode || '').trim();
    if (pinCode && !/^\d{6}$/.test(pinCode)) return res.status(400).json({ message: 'PIN code must contain six digits.' });
    const slug = slugFromBusiness(body.slug || name);
    if (!slug || slug.length < 2 || ['www','api','admin','manager','business','mail','support','help','ftp','static'].includes(slug)) return res.status(400).json({ message: 'Choose a valid business name/slug.' });
    if (await Business.exists({ slug })) return res.status(409).json({ message: 'This business slug is already in use. Choose a different slug or submit a claim request.' });
    const phone = String(body.phone || '').trim();
    if (phone && !/^[+\d() .-]{7,20}$/.test(phone)) return res.status(400).json({ message: 'Enter a valid phone number.' });
    const websiteUrl = safeHttpUrl(body.websiteUrl || '');
    if (websiteUrl === null) return res.status(400).json({ message: 'Website URL must use HTTP or HTTPS.' });
    const contactOptions = Array.isArray(body.contactOptions) ? [...new Set(body.contactOptions)] : (phone ? ['PHONE'] : []);
    if (contactOptions.some(x => !['PHONE','WHATSAPP','EMAIL','WEBSITE','DIRECTIONS'].includes(x))) return res.status(400).json({ message: 'Invalid contact option.' });
    const business = await Business.create({ name, slug, description: String(body.description || '').trim().slice(0, 3000), category, phone, email: String(body.email || '').trim().toLowerCase(), whatsapp: String(body.whatsapp || '').trim(), websiteUrl, contactOptions, hours: body.hours && typeof body.hours === 'object' && !Array.isArray(body.hours) ? body.hours : {}, address: String(body.address || '').trim().slice(0, 300), city, pinCode, tags: Array.isArray(body.tags) ? body.tags.slice(0, 20).map(x => String(x).trim().slice(0, 40)) : [], createdByCustomer: req.auth.sub, status: 'DRAFT', verified: false, ownershipStatus: 'CLAIMED' });
    await BusinessMember.create({ businessId: business._id, userId: req.auth.sub, role: 'OWNER', status: 'ACTIVE', grantedBy: req.auth.sub });
    await auditBusiness(business._id, req.auth.sub, 'PROFILE_CREATED', { source: 'self-service', initialStatus: 'DRAFT' });
    await auditBusiness(business._id, req.auth.sub, 'OWNER_GRANTED', { role: 'OWNER', basis: 'profile-creator' });
    return res.status(201).json({ business: { _id: business._id, name: business.name, slug: business.slug, status: business.status, ownershipStatus: business.ownershipStatus }, message: 'Free profile created as a draft. It is not public until approved/published.' });
  } catch (err) { if (err.code === 11000) return res.status(409).json({ message: 'That business slug is already in use.' }); next(err); }
});
app.post('/api/v1/businesses/:businessId/claims', requireCustomer, requireDb, async (req, res, next) => {
  try {
    const business = await Business.findById(req.params.businessId);
    if (!business || business.status !== 'PUBLISHED') return res.status(404).json({ message: 'Published business not found.' });
    if (await BusinessMember.exists({ businessId: business._id, userId: req.auth.sub, status: 'ACTIVE' })) return res.status(409).json({ message: 'You already have access to this business.' });
    const existing = await BusinessClaim.findOne({ businessId: business._id, requesterId: req.auth.sub, status: 'PENDING' });
    if (existing) return res.status(409).json({ message: 'You already have a pending claim request.' });
    const proofReferences = Array.isArray(req.body.proofReferences) ? req.body.proofReferences.filter(x => typeof x === 'string' && x.length <= 500).slice(0, 5) : [];
    const claim = await BusinessClaim.create({ businessId: business._id, requesterId: req.auth.sub, message: String(req.body.message || '').trim().slice(0, 1200), proofReferences });
    await auditBusiness(business._id, req.auth.sub, 'CLAIM_SUBMITTED', { claimId: String(claim._id) });
    return res.status(201).json({ claim: { id: claim._id, businessId: claim.businessId, status: claim.status, createdAt: claim.createdAt }, message: 'Claim submitted for ownership review.' });
  } catch (err) { next(err); }
});
app.get('/api/v1/businesses/mine', requireCustomer, requireDb, async (req, res, next) => {
  try {
    const memberships = await BusinessMember.find({ userId: req.auth.sub, status: 'ACTIVE' }).select('businessId role').lean();
    const ids = memberships.map(x => x.businessId);
    const businesses = await Business.find({ _id: { $in: ids } }).select('_id name slug category city status ownershipStatus').lean();
    return res.json({ businesses: businesses.map(b => ({ ...b, role: memberships.find(m => String(m.businessId) === String(b._id))?.role })) });
  } catch (err) { next(err); }
});
app.get('/api/v1/businesses/:businessId/claims', requireCustomer, requireDb, async (req, res, next) => {
  try {
    const isMember = await BusinessMember.exists({ businessId: req.params.businessId, userId: req.auth.sub, role: 'OWNER', status: 'ACTIVE' });
    const isManager = req.auth.type === 'manager';
    if (!isMember && !isManager) return res.status(403).json({ message: 'Only a business owner can review claims.' });
    const claims = await BusinessClaim.find({ businessId: req.params.businessId, status: 'PENDING' }).select('requesterId message proofReferences status createdAt').lean();
    return res.json({ claims });
  } catch (err) { next(err); }
});
app.post('/api/v1/businesses/:businessId/claims/:claimId/review', requireCustomer, requireDb, async (req, res, next) => {
  try {
    const owner = await BusinessMember.exists({ businessId: req.params.businessId, userId: req.auth.sub, role: 'OWNER', status: 'ACTIVE' });
    if (!owner) return res.status(403).json({ message: 'Only the current business owner can approve or reject a claim.' });
    const decision = String(req.body.decision || '').toUpperCase();
    if (!['APPROVE','REJECT'].includes(decision)) return res.status(400).json({ message: 'Decision must be APPROVE or REJECT.' });
    const claim = await BusinessClaim.findOne({ _id: req.params.claimId, businessId: req.params.businessId, status: 'PENDING' });
    if (!claim) return res.status(404).json({ message: 'Pending claim not found.' });
    if (String(claim.requesterId) === String(req.auth.sub)) return res.status(400).json({ message: 'You cannot approve your own claim.' });
    if (decision === 'APPROVE') {
      await BusinessMember.updateOne({ businessId: claim.businessId, userId: req.auth.sub, status: 'ACTIVE' }, { $set: { status: 'REVOKED' } });
      await BusinessMember.updateOne({ businessId: claim.businessId, userId: claim.requesterId }, { $set: { role: 'OWNER', status: 'ACTIVE', grantedBy: req.auth.sub, grantedAt: new Date() }, $setOnInsert: { businessId: claim.businessId, userId: claim.requesterId } }, { upsert: true });
      await Business.updateOne({ _id: claim.businessId }, { $set: { createdByCustomer: claim.requesterId, ownershipStatus: 'CLAIMED' } });
      claim.status = 'APPROVED';
      await auditBusiness(claim.businessId, req.auth.sub, 'CLAIM_APPROVED', { claimId: String(claim._id), newOwnerId: String(claim.requesterId) });
      await auditBusiness(claim.businessId, req.auth.sub, 'OWNER_REVOKED', { formerOwnerId: String(req.auth.sub), reason: 'claim-approved' });
      await auditBusiness(claim.businessId, req.auth.sub, 'OWNER_GRANTED', { newOwnerId: String(claim.requesterId), role: 'OWNER' });
    } else { claim.status = 'REJECTED'; await auditBusiness(claim.businessId, req.auth.sub, 'CLAIM_REJECTED', { claimId: String(claim._id) }); }
    claim.reviewedBy = req.auth.sub; claim.reviewedAt = new Date(); claim.reviewNote = String(req.body.note || '').trim().slice(0, 1000); await claim.save();
    return res.json({ claim: { id: claim._id, status: claim.status } });
  } catch (err) { next(err); }
});
app.get('/api/v1/businesses/:businessId/profile', requireCustomer, requireDb, requireBusinessMember, async (req, res, next) => {
  try { const b = await Business.findById(req.params.businessId).select('-__v').lean(); if (!b) return res.status(404).json({ message: 'Business not found.' }); return res.json({ business: b, role: req.businessMember.role }); } catch (err) { next(err); }
});
app.patch('/api/v1/businesses/:businessId/profile', requireCustomer, requireDb, requireBusinessMember, async (req, res, next) => {
  try {
    const allowed = ['name','description','category','phone','email','whatsapp','websiteUrl','contactOptions','hours','address','city','pinCode','tags'];
    const updates = {};
    for (const key of allowed) if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) updates[key] = req.body[key];
    if (!Object.keys(updates).length) return res.status(400).json({ message: 'Provide at least one editable profile field.' });
    if (updates.name !== undefined && (typeof updates.name !== 'string' || updates.name.trim().length < 2 || updates.name.trim().length > 140)) return res.status(400).json({ message: 'Invalid business name.' });
    if (updates.category !== undefined && !BUSINESS_CATEGORIES.includes(updates.category)) return res.status(400).json({ message: 'Choose a valid category.' });
    if (updates.pinCode !== undefined && updates.pinCode && !/^\d{6}$/.test(String(updates.pinCode))) return res.status(400).json({ message: 'PIN code must contain six digits.' });
    if (updates.websiteUrl !== undefined) { updates.websiteUrl = safeHttpUrl(updates.websiteUrl); if (updates.websiteUrl === null) return res.status(400).json({ message: 'Website URL must use HTTP or HTTPS.' }); }
    if (updates.contactOptions !== undefined && (!Array.isArray(updates.contactOptions) || updates.contactOptions.some(x => !['PHONE','WHATSAPP','EMAIL','WEBSITE','DIRECTIONS'].includes(x)))) return res.status(400).json({ message: 'Invalid contact options.' });
    if (updates.description !== undefined) updates.description = String(updates.description).trim().slice(0, 3000);
    if (updates.name !== undefined) updates.name = updates.name.trim();
    if (req.businessMember.role !== 'OWNER' && Object.keys(updates).some(k => ['phone','email','address','city','pinCode','websiteUrl'].includes(k))) return res.status(403).json({ message: 'Editors cannot change owner/contact or address details.' });
    const business = await Business.findByIdAndUpdate(req.params.businessId, { $set: updates }, { new: true, runValidators: true }).select('-__v');
    if (!business) return res.status(404).json({ message: 'Business not found.' });
    await auditBusiness(business._id, req.auth.sub, 'PROFILE_UPDATED', { fields: Object.keys(updates) });
    return res.json({ business });
  } catch (err) { next(err); }
});
app.get('/api/v1/businesses/:businessId/requests', requireCustomer, requireDb, async (req, res, next) => {
  try {
    const member = await BusinessMember.exists({ businessId: req.params.businessId, userId: req.auth.sub, status: 'ACTIVE' });
    if (!member) return res.status(403).json({ message: 'Business membership required.' });
    const requests = await BusinessRequest.find({ businessId: req.params.businessId, requesterId: req.auth.sub }).select('type details proposedChanges status createdAt resolution').sort({ createdAt: -1 }).lean();
    return res.json({ requests });
  } catch (err) { next(err); }
});
app.post('/api/v1/businesses/:businessId/requests', requireCustomer, requireDb, async (req, res, next) => {
  try {
    const business = await Business.findById(req.params.businessId).select('_id');
    if (!business) return res.status(404).json({ message: 'Business not found.' });
    const type = String(req.body.type || '').toUpperCase();
    const details = String(req.body.details || '').trim();
    if (!['CORRECTION','REMOVAL'].includes(type)) return res.status(400).json({ message: 'Request type must be CORRECTION or REMOVAL.' });
    if (details.length < 10 || details.length > 2000) return res.status(400).json({ message: 'Explain the request in 10–2000 characters.' });
    const proposedChanges = type === 'CORRECTION' && req.body.proposedChanges && typeof req.body.proposedChanges === 'object' && !Array.isArray(req.body.proposedChanges) ? req.body.proposedChanges : {};
    const request = await BusinessRequest.create({ businessId: business._id, requesterId: req.auth.sub, type, details, proposedChanges });
    await auditBusiness(business._id, req.auth.sub, type === 'CORRECTION' ? 'CORRECTION_REQUESTED' : 'REMOVAL_REQUESTED', { requestId: String(request._id) });
    return res.status(201).json({ request: { id: request._id, type: request.type, status: request.status, createdAt: request.createdAt } });
  } catch (err) { next(err); }
});
app.get('/api/v1/businesses/:businessId/permissions', requireCustomer, requireDb, async (req, res, next) => {
  try {
    const member = await BusinessMember.exists({ businessId: req.params.businessId, userId: req.auth.sub, role: 'OWNER', status: 'ACTIVE' });
    if (!member) return res.status(403).json({ message: 'Only business owners can view permission records.' });
    const records = await BusinessPermission.find({ businessId: req.params.businessId }).sort({ occurredAt: -1 }).limit(100).lean();
    return res.json({ records });
  } catch (err) { next(err); }
});
const businessMediaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 }, fileFilter: (req, file, cb) => cb(null, ['image/jpeg','image/png','image/webp'].includes(file.mimetype)) });
app.post('/api/v1/businesses/:businessId/media', requireCustomer, requireDb, requireBusinessMember, (req, res, next) => businessMediaUpload.single('file')(req, res, err => {
  if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'Media file must be 5 MB or smaller.' : 'Upload one JPG, PNG or WebP image.' });
  next();
}), async (req, res, next) => {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return res.status(503).json({ message: 'Media uploads are not configured yet. Configure Cloudinary environment variables.' });
    if (!req.file || !['image/jpeg','image/png','image/webp'].includes(req.file.mimetype)) return res.status(400).json({ message: 'Choose a JPG, PNG or WebP image.' });
    const bytes = req.file.buffer;
    const signatureMatches = req.file.mimetype === 'image/jpeg' ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff : req.file.mimetype === 'image/png' ? bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) : bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!signatureMatches) return res.status(400).json({ message: 'The uploaded file content does not match its image type.' });
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `creatarsh/businesses/${req.params.businessId}`;
    const signaturePayload = `folder=${folder}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`;
    const signature = crypto.createHash('sha1').update(signaturePayload).digest('hex');
    const form = new FormData();
    form.append('file', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100));
    form.append('api_key', process.env.CLOUDINARY_API_KEY); form.append('timestamp', String(timestamp)); form.append('folder', folder); form.append('signature', signature);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(process.env.CLOUDINARY_CLOUD_NAME)}/image/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(20000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.secure_url || !result.public_id) return res.status(502).json({ message: 'Cloudinary could not store the image. Please retry later.' });
    const media = { url: result.secure_url, publicId: result.public_id, resourceType: 'image', alt: String(req.body.alt || '').trim().slice(0, 180) };
    const mediaUpdate = { $push: { media } }; const setFields = {}; if (req.body.useAsLogo === 'true') setFields.logo = media.url; if (req.body.useAsCover === 'true') setFields.coverImage = media.url; if (Object.keys(setFields).length) mediaUpdate.$set = setFields;
    const business = await Business.findByIdAndUpdate(req.params.businessId, mediaUpdate, { new: true }).select('_id media logo coverImage');
    await auditBusiness(req.params.businessId, req.auth.sub, 'MEDIA_UPLOADED', { publicId: media.publicId, resourceType: 'image' });
    return res.status(201).json({ media, business });
  } catch (err) { next(err); }
});


// Privacy-first public event collector: no IP address or user-agent is persisted.
app.post('/api/public/business-events', requireDb, async (req, res, next) => {
  try {
    const slug = String(req.body?.slug || '').toLowerCase().trim();
    const event = String(req.body?.event || '').toUpperCase();
    const allowed = ['PAGE_VIEW','CONTACT_CLICK','WHATSAPP_CLICK','DIRECTIONS_CLICK'];
    if (!/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/.test(slug) || !allowed.includes(event)) return res.status(400).json({ message: 'Invalid analytics event.' });
    const business = await Business.findOne({ slug, status: 'PUBLISHED' }).select('_id').lean();
    if (!business) return res.status(404).json({ message: 'Business not found.' });
    const pagePath = String(req.body?.pagePath || '/').slice(0, 240).replace(/[?#].*$/, '') || '/';
    let sourceHost = 'direct';
    try { const ref = new URL(String(req.body?.referrer || '')); if (ref.hostname && ref.hostname !== req.hostname) sourceHost = ref.hostname.toLowerCase().slice(0,160); } catch {}
    const session = String(req.body?.session || '').slice(0, 100);
    const day = new Date().toISOString().slice(0,10);
    const visitorDigest = session ? crypto.createHash('sha256').update(`${day}:${session}`).digest('hex') : '';
    await BusinessAnalyticsEvent.create({ businessId: business._id, event, pagePath, sourceHost, visitorDigest, occurredAt: new Date() });
    return res.status(202).json({ ok: true });
  } catch (err) { next(err); }
});
app.post('/api/public/business-enquiries', requireDb, async (req,res,next) => {
  try {
    const slug = String(req.body?.slug || '').toLowerCase().trim();
    const name = String(req.body?.name || '').trim(); const message = String(req.body?.message || '').trim();
    const email = String(req.body?.email || '').trim().slice(0,254); const phone = String(req.body?.phone || '').trim().slice(0,40);
    if (!name || name.length > 120 || !message || message.length > 3000 || (!email && !phone)) return res.status(400).json({message:'Name, message and either email or phone are required.'});
    const business = await Business.findOne({slug,status:'PUBLISHED'}).select('_id').lean(); if(!business) return res.status(404).json({message:'Business not found.'});
    await BusinessEnquiry.create({businessId:business._id,name,email,phone,message});
    await BusinessAnalyticsEvent.create({businessId:business._id,event:'ENQUIRY_SUBMITTED',pagePath:String(req.body?.pagePath||'/').slice(0,240).replace(/[?#].*$/,'')||'/',sourceHost:'direct'});
    return res.status(201).json({ok:true,message:'Enquiry submitted.'});
  } catch(err){next(err);}
});
app.get('/api/v1/businesses/:businessId/dashboard', requireCustomer, requireDb, requireBusinessMember, async (req,res,next) => {
  try {
    const business = await Business.findById(req.params.businessId).select('name slug status storeEnabled websiteUrl').lean();
    if(!business) return res.status(404).json({message:'Business not found.'});
    const active = await WebsiteDeployment.findOne({businessId:business._id,active:true,status:'PUBLISHED'}).select('version publishedAt').sort({version:-1}).lean();
    return res.json({business, website:{status:active?'PUBLISHED':(business.status==='SUSPENDED'?'SUSPENDED':'NOT_PUBLISHED'),version:active?.version||null,publishedAt:active?.publishedAt||null,url:active?`https://${business.slug}.${process.env.PLATFORM_ROOT_DOMAIN||'creatarsh.in'}`:null},storeEnabled:!!business.storeEnabled,role:req.businessMember.role});
  } catch(err){next(err);}
});
app.get('/api/v1/businesses/:businessId/analytics', requireCustomer, requireDb, requireBusinessMember, async (req,res,next) => {
  try {
    const end = req.query.to ? new Date(`${String(req.query.to).slice(0,10)}T23:59:59.999Z`) : new Date();
    const start = req.query.from ? new Date(`${String(req.query.from).slice(0,10)}T00:00:00.000Z`) : new Date(end.getTime()-29*86400000);
    if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start>end||end-start>366*86400000) return res.status(400).json({message:'Choose a valid date range of at most 367 days.'});
    const businessId = new mongoose.Types.ObjectId(req.params.businessId); const match={businessId,occurredAt:{$gte:start,$lte:end}};
    const [counts, sources, pages, visitors] = await Promise.all([
      BusinessAnalyticsEvent.aggregate([{$match:match},{$group:{_id:'$event',count:{$sum:1}}}]),
      BusinessAnalyticsEvent.aggregate([{$match:{...match,event:'PAGE_VIEW'}},{$group:{_id:'$sourceHost',views:{$sum:1}}},{$sort:{views:-1}},{$limit:10}]),
      BusinessAnalyticsEvent.aggregate([{$match:{...match,event:'PAGE_VIEW'}},{$group:{_id:'$pagePath',views:{$sum:1}}},{$sort:{views:-1}},{$limit:10}]),
      BusinessAnalyticsEvent.aggregate([{$match:{...match,event:'PAGE_VIEW',visitorDigest:{$ne:''}}},{$group:{_id:'$visitorDigest'}},{$count:'count'}])
    ]);
    const map=Object.fromEntries(counts.map(x=>[x._id,x.count]));
    return res.json({from:start.toISOString(),to:end.toISOString(),metrics:{visitors:visitors[0]?.count||0,pageViews:map.PAGE_VIEW||0,contactClicks:map.CONTACT_CLICK||0,whatsappClicks:map.WHATSAPP_CLICK||0,directionsClicks:map.DIRECTIONS_CLICK||0,enquiries:map.ENQUIRY_SUBMITTED||0},sources:sources.map(x=>({source:x._id||'direct',views:x.views})),pages:pages.map(x=>({page:x._id||'/',views:x.views})),privacy:{visitorMetrics:'daily pseudonymous session estimates; no IP/user-agent/raw visitor identity stored',visitorRecordsExposed:false}});
  } catch(err){next(err);}
});
app.get('/api/v1/businesses/:businessId/enquiries', requireCustomer, requireDb, requireBusinessMember, async(req,res,next)=>{
  try { const page=Math.max(1,Math.min(10000,Number.parseInt(req.query.page,10)||1)); const limit=Math.max(1,Math.min(50,Number.parseInt(req.query.limit,10)||20)); const filter={businessId:req.params.businessId}; if(['NEW','CONTACTED','CLOSED'].includes(req.query.status))filter.status=req.query.status; if(req.query.from||req.query.to){filter.createdAt={};if(req.query.from)filter.createdAt.$gte=new Date(`${String(req.query.from).slice(0,10)}T00:00:00Z`);if(req.query.to)filter.createdAt.$lte=new Date(`${String(req.query.to).slice(0,10)}T23:59:59.999Z`);}
    const [enquiries,total]=await Promise.all([BusinessEnquiry.find(filter).select('name email phone message status createdAt updatedAt').sort({createdAt:-1}).skip((page-1)*limit).limit(limit).lean(),BusinessEnquiry.countDocuments(filter)]); return res.json({enquiries,total,page,limit});
  }catch(err){next(err);}
});
app.patch('/api/v1/businesses/:businessId/enquiries/:enquiryId', requireCustomer, requireDb, requireBusinessMember, async(req,res,next)=>{
  try { if(!['NEW','CONTACTED','CLOSED'].includes(req.body?.status))return res.status(400).json({message:'Invalid enquiry status.'}); const enquiry=await BusinessEnquiry.findOneAndUpdate({_id:req.params.enquiryId,businessId:req.params.businessId},{$set:{status:req.body.status}},{new:true}).select('name email phone message status createdAt updatedAt').lean(); if(!enquiry)return res.status(404).json({message:'Enquiry not found.'}); return res.json({enquiry}); }catch(err){next(err);}
});
app.get('/api/v1/businesses/:businessId/store/products', requireCustomer, requireDb, requireBusinessMember, async(req,res,next)=>{
  try {const business=await Business.findById(req.params.businessId).select('storeEnabled').lean();if(!business)return res.status(404).json({message:'Business not found.'});if(!business.storeEnabled)return res.status(404).json({message:'Store module is not enabled for this business.'});const products=await BusinessStoreProduct.find({businessId:business._id}).sort({createdAt:-1}).limit(200).lean();return res.json({products});}catch(err){next(err);}
});
app.post('/api/v1/businesses/:businessId/store/products', requireCustomer, requireDb, requireBusinessMember, async(req,res,next)=>{
  try {const business=await Business.findById(req.params.businessId).select('storeEnabled').lean();if(!business)return res.status(404).json({message:'Business not found.'});if(!business.storeEnabled)return res.status(404).json({message:'Store module is not enabled for this business.'});const name=String(req.body?.name||'').trim();const price=Number(req.body?.price);if(name.length<2||name.length>180||!Number.isFinite(price)||price<0)return res.status(400).json({message:'Provide a product name and valid non-negative price.'});const product=await BusinessStoreProduct.create({businessId:business._id,name,price,sku:String(req.body?.sku||'').trim().slice(0,80),stock:Math.max(0,Number(req.body?.stock)||0),active:req.body?.active!==false});return res.status(201).json({product});}catch(err){next(err);}
});
app.get('/api/v1/businesses/:businessId/store/orders', requireCustomer, requireDb, requireBusinessMember, async(req,res,next)=>{
  try {const business=await Business.findById(req.params.businessId).select('storeEnabled').lean();if(!business)return res.status(404).json({message:'Business not found.'});if(!business.storeEnabled)return res.status(404).json({message:'Store module is not enabled for this business.'});return res.json({orders:[],message:'Store order schema integration is pending; no unrelated platform orders are exposed.'});}catch(err){next(err);}
});

// Strict administrator workspace API. All write operations are audited.
app.get('/api/v1/admin/overview',requireAdmin,requireDb,async(req,res,next)=>{try{const [businesses, pendingBusinesses, customers, managers, leads, invoices, payments, pendingRequests, deployments, activeAds, orders]=await Promise.all([Business.countDocuments(),Business.countDocuments({status:'DRAFT'}),Customer.countDocuments(),Manager.countDocuments({active:true}),Lead.countDocuments(),Invoice.countDocuments(),Payment.countDocuments(),BusinessRequest.countDocuments({status:{$in:['PENDING','IN_REVIEW']}}),WebsiteDeployment.countDocuments(),AdCampaign.countDocuments({status:'ACTIVE'}),Order.countDocuments()]);res.json({metrics:{businesses,pendingBusinesses,customers,activeManagers:managers,leads,invoices,payments,pendingRequests,deployments,activeAds,orders},health:{database:mongoose.connection.readyState===1?'connected':'disconnected',uptimeSeconds:Math.floor(process.uptime()),node:process.version,memoryRss:process.memoryUsage().rss}});}catch(e){next(e);}});
app.get('/api/v1/admin/businesses',requireAdmin,requireDb,async(req,res,next)=>{try{const filter={};if(['DRAFT','PUBLISHED','SUSPENDED'].includes(req.query.status))filter.status=req.query.status;const businesses=await Business.find(filter).select('name slug category city status verified storeEnabled websiteUrl createdAt updatedAt').sort({createdAt:-1}).limit(300).lean();res.json({businesses});}catch(e){next(e);}});
app.patch('/api/v1/admin/businesses/:businessId/moderation',requireAdmin,requireDb,async(req,res,next)=>{try{const status=String(req.body.status||'');if(!['DRAFT','PUBLISHED','SUSPENDED'].includes(status))return res.status(400).json({message:'Invalid business status.'});const b=await Business.findByIdAndUpdate(req.params.businessId,{$set:{status,verified:typeof req.body.verified==='boolean'?req.body.verified:undefined}},{new:true,runValidators:true}).select('name slug status verified').lean();if(!b)return res.status(404).json({message:'Business not found.'});await writeAdminAudit(req,'BUSINESS_MODERATED','Business',b._id,{status,verified:b.verified});res.json({business:b});}catch(e){next(e);}});
app.get('/api/v1/admin/users',requireAdmin,requireDb,async(req,res,next)=>{try{const [customers,managers]=await Promise.all([Customer.find().select('name email company active createdAt lastLoginAt').sort({createdAt:-1}).limit(300).lean(),Manager.find().select('username role active createdAt lastLoginAt').sort({createdAt:-1}).limit(200).lean()]);res.json({customers,managers});}catch(e){next(e);}});
app.patch('/api/v1/admin/users/managers/:managerId',requireAdmin,requireDb,async(req,res,next)=>{try{const role=String(req.body.role||'');if(!['manager','admin','superadmin'].includes(role)||typeof req.body.active!=='boolean')return res.status(400).json({message:'Valid role and active boolean are required.'});if(String(req.auth.sub)===String(req.params.managerId)&&(!req.body.active||role!==String(req.auth.role)))return res.status(400).json({message:'You cannot disable or demote your own administrator account.'});const target=await Manager.findById(req.params.managerId);if(!target)return res.status(404).json({message:'Manager not found.'});if(req.auth.role!=='superadmin'&&(target.role==='superadmin'||role==='superadmin'))return res.status(403).json({message:'Only a superadmin can manage superadmin accounts.'});target.role=role;target.active=req.body.active;await target.save();await writeAdminAudit(req,'MANAGER_ROLE_CHANGED','Manager',target._id,{role,active:target.active});res.json({manager:{id:target._id,username:target.username,role:target.role,active:target.active}});}catch(e){next(e);}});
app.get('/api/v1/admin/templates',requireAdmin,requireDb,async(req,res,next)=>{try{res.json({templates:await ContractTemplate.find().sort({createdAt:-1}).limit(300).lean()});}catch(e){next(e);}});
app.patch('/api/v1/admin/templates/:id',requireAdmin,requireDb,async(req,res,next)=>{try{const allowed={};for(const k of ['name','category','priceLabel','description','scope','milestones','timeline','deliverables','ip','support','acceptance','termination','active'])if(req.body[k]!==undefined)allowed[k]=req.body[k];const t=await ContractTemplate.findByIdAndUpdate(req.params.id,{$set:allowed},{new:true,runValidators:true});if(!t)return res.status(404).json({message:'Template not found.'});await writeAdminAudit(req,'TEMPLATE_UPDATED','ContractTemplate',t._id,{active:t.active});res.json({template:t});}catch(e){next(e);}});
app.get('/api/v1/admin/plans',requireAdmin,requireDb,async(req,res,next)=>{try{res.json({plans:await ServicePackage.find().sort({order:1,name:1}).limit(300).lean()});}catch(e){next(e);}});
app.post('/api/v1/admin/plans',requireAdmin,requireDb,async(req,res,next)=>{try{const code=String(req.body.code||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'');const name=String(req.body.name||'').trim();const price=Number(req.body.price);if(!/^[A-Z0-9_-]{2,60}$/.test(code)||!name||name.length>140||!Number.isFinite(price)||price<1)return res.status(400).json({message:'Valid code, name and positive price are required.'});const plan=await ServicePackage.create({code,name,price,bookingAmount:Math.max(0,Number(req.body.bookingAmount??price)),description:String(req.body.description||''),features:Array.isArray(req.body.features)?req.body.features.map(x=>String(x).slice(0,180)).slice(0,40):[],category:String(req.body.category||'GENERAL'),billingType:['ONE_TIME','MONTHLY','YEARLY'].includes(req.body.billingType)?req.body.billingType:'ONE_TIME',active:req.body.active!==false,order:Number(req.body.order||0),startingAt:req.body.startingAt===true});await writeAdminAudit(req,'PLAN_CREATED','ServicePackage',plan._id,{code:plan.code,active:plan.active,price:plan.price});res.status(201).json({plan});}catch(e){if(e.code===11000)return res.status(409).json({message:'Plan code already exists.'});next(e);}});
app.patch('/api/v1/admin/plans/:id',requireAdmin,requireDb,async(req,res,next)=>{try{const allowed={};for(const k of ['name','price','bookingAmount','description','features','category','active','order','billingType','startingAt'])if(req.body[k]!==undefined)allowed[k]=req.body[k];if(allowed.price!==undefined&&(!Number.isFinite(Number(allowed.price))||Number(allowed.price)<1))return res.status(400).json({message:'Plan price must be positive.'});const plan=await ServicePackage.findByIdAndUpdate(req.params.id,{$set:allowed},{new:true,runValidators:true});if(!plan)return res.status(404).json({message:'Plan not found.'});await writeAdminAudit(req,'PLAN_UPDATED','ServicePackage',plan._id,{active:plan.active,price:plan.price});res.json({plan});}catch(e){next(e);}});
app.get('/api/v1/admin/finance',requireAdmin,requireDb,async(req,res,next)=>{try{const [invoices,payments]=await Promise.all([Invoice.find().populate('customer','name email').sort({createdAt:-1}).limit(300).lean(),Payment.find().populate('customer','name email').sort({createdAt:-1}).limit(300).lean()]);res.json({invoices,payments});}catch(e){next(e);}});
app.get('/api/v1/admin/ads',requireAdmin,requireDb,async(req,res,next)=>{try{const campaigns=await AdCampaign.find().populate('businessId','name slug').populate('creativeReviewedBy','username').sort({createdAt:-1}).limit(300).lean();const ids=campaigns.map(c=>c._id);const metrics=await AdDailyMetric.aggregate([{$match:{campaignId:{$in:ids}}},{$group:{_id:{campaignId:'$campaignId',event:'$event'},count:{$sum:'$count'}}}]);const reporting={};for(const m of metrics){const key=String(m._id.campaignId);reporting[key] ||= {impressions:0,clicks:0};reporting[key][m._id.event==='CLICK'?'clicks':'impressions']=m.count;}res.json({campaigns,reporting});}catch(e){next(e);}});
app.post('/api/v1/admin/ads',requireAdmin,requireDb,async(req,res,next)=>{try{const placement=String(req.body.placement||'');const name=String(req.body.name||'').trim();if(!['DIRECTORY_FEATURED','CATEGORY_SPONSORED','SEARCH_SPONSORED','BUSINESS_PAGE'].includes(placement)||!name)return res.status(400).json({message:'Campaign name and valid placement are required.'});const destinationUrl=safeHttpUrl(req.body.destinationUrl||'');const creativeUrl=safeHttpUrl(req.body.creativeUrl||'');if(req.body.destinationUrl&&!destinationUrl)return res.status(400).json({message:'Destination URL must be HTTP(S).'});if(req.body.creativeUrl&&!creativeUrl)return res.status(400).json({message:'Creative URL must be HTTP(S).'});const startsAt=req.body.startsAt?new Date(req.body.startsAt):null,endsAt=req.body.endsAt?new Date(req.body.endsAt):null;if((startsAt&&!Number.isFinite(startsAt.getTime()))||(endsAt&&!Number.isFinite(endsAt.getTime()))||(startsAt&&endsAt&&endsAt<=startsAt))return res.status(400).json({message:'Invalid campaign schedule.'});const c=await AdCampaign.create({name:name.slice(0,140),placement,status:'DRAFT',businessId:req.body.businessId||null,startsAt,endsAt,budget:Number.isFinite(Number(req.body.budget))?Math.max(0,Number(req.body.budget)):undefined,creativeUrl,creativeTitle:String(req.body.creativeTitle||name).slice(0,120),creativeText:String(req.body.creativeText||'').slice(0,400),destinationUrl,creativeStatus:'PENDING',category:String(req.body.category||'').slice(0,80),notes:String(req.body.notes||'').slice(0,1000)});await writeAdminAudit(req,'AD_CAMPAIGN_CREATED','AdCampaign',c._id,{placement,status:c.status,creativeStatus:c.creativeStatus});res.status(201).json({campaign:c});}catch(e){next(e);}});
app.patch('/api/v1/admin/ads/:id',requireAdmin,requireDb,async(req,res,next)=>{try{const c=await AdCampaign.findById(req.params.id);if(!c)return res.status(404).json({message:'Campaign not found.'});const allowed={};for(const k of ['name','placement','businessId','startsAt','endsAt','budget','notes','creativeTitle','creativeText','creativeUrl','destinationUrl','category'])if(req.body[k]!==undefined)allowed[k]=req.body[k];if(allowed.status!==undefined)return res.status(400).json({message:'Use the campaign status endpoint field only after creative approval; status is updated via status property on this route.'});if(allowed.placement&&!['DIRECTORY_FEATURED','CATEGORY_SPONSORED','SEARCH_SPONSORED','BUSINESS_PAGE'].includes(allowed.placement))return res.status(400).json({message:'Invalid placement.'});for(const k of ['creativeUrl','destinationUrl'])if(allowed[k]){allowed[k]=safeHttpUrl(allowed[k]);if(!allowed[k])return res.status(400).json({message:`${k} must be HTTP(S).`});}if(allowed.creativeTitle)allowed.creativeTitle=String(allowed.creativeTitle).slice(0,120);if(allowed.creativeText)allowed.creativeText=String(allowed.creativeText).slice(0,400);if(allowed.name)allowed.name=String(allowed.name).trim().slice(0,140);if(allowed.startsAt)allowed.startsAt=new Date(allowed.startsAt);if(allowed.endsAt)allowed.endsAt=new Date(allowed.endsAt);if(allowed.startsAt&&allowed.endsAt&&allowed.endsAt<=allowed.startsAt)return res.status(400).json({message:'End date must be after start date.'});Object.assign(c,allowed);if(['creativeTitle','creativeText','creativeUrl','destinationUrl'].some(k=>allowed[k]!==undefined)){c.creativeStatus='PENDING';c.creativeReviewedBy=null;c.creativeReviewedAt=null;c.status='PAUSED';}await c.save();await writeAdminAudit(req,'AD_CAMPAIGN_UPDATED','AdCampaign',c._id,{status:c.status,placement:c.placement,creativeStatus:c.creativeStatus});res.json({campaign:c});}catch(e){next(e);}});
app.post('/api/v1/admin/ads/:id/review',requireAdmin,requireDb,async(req,res,next)=>{try{const decision=String(req.body.decision||'');if(!['APPROVED','REJECTED'].includes(decision))return res.status(400).json({message:'Decision must be APPROVED or REJECTED.'});const c=await AdCampaign.findById(req.params.id);if(!c)return res.status(404).json({message:'Campaign not found.'});if(decision==='APPROVED'&&(!c.creativeTitle||!c.destinationUrl||!safeHttpUrl(c.destinationUrl)))return res.status(400).json({message:'A valid creative title and destination URL are required before approval.'});c.creativeStatus=decision;c.creativeReviewNote=String(req.body.note||'').slice(0,500);c.creativeReviewedBy=req.auth.sub;c.creativeReviewedAt=new Date();if(decision==='REJECTED')c.status='PAUSED';await c.save();await writeAdminAudit(req,'AD_CREATIVE_REVIEWED','AdCampaign',c._id,{decision,placement:c.placement});res.json({campaign:c});}catch(e){next(e);}});
app.post('/api/v1/admin/ads/:id/status',requireAdmin,requireDb,async(req,res,next)=>{try{const status=String(req.body.status||'');if(!['DRAFT','ACTIVE','PAUSED','ENDED'].includes(status))return res.status(400).json({message:'Invalid campaign status.'});const c=await AdCampaign.findById(req.params.id);if(!c)return res.status(404).json({message:'Campaign not found.'});if(status==='ACTIVE'&&c.creativeStatus!=='APPROVED')return res.status(409).json({message:'Creative must be approved before campaign activation.'});c.status=status;await c.save();await writeAdminAudit(req,'AD_CAMPAIGN_STATUS_CHANGED','AdCampaign',c._id,{status});res.json({campaign:c});}catch(e){next(e);}});
app.get('/api/v1/admin/ads/:id/report',requireAdmin,requireDb,async(req,res,next)=>{try{const campaign=await AdCampaign.findById(req.params.id).select('name placement status startsAt endsAt budget impressions clicks').lean();if(!campaign)return res.status(404).json({message:'Campaign not found.'});const rows=await AdDailyMetric.find({campaignId:campaign._id}).select('day event count').sort({day:1}).lean();const byDay={};for(const r of rows){byDay[r.day] ||= {day:r.day,impressions:0,clicks:0};byDay[r.day][r.event==='CLICK'?'clicks':'impressions']+=r.count;}res.json({campaign,days:Object.values(byDay),totals:{impressions:rows.filter(x=>x.event==='IMPRESSION').reduce((n,x)=>n+x.count,0),clicks:rows.filter(x=>x.event==='CLICK').reduce((n,x)=>n+x.count,0)}});}catch(e){next(e);}});
app.get('/api/v1/admin/audit',requireAdmin,requireDb,async(req,res,next)=>{try{const limit=Math.min(200,Math.max(1,Number(req.query.limit)||100));res.json({events:await AdminAudit.find().select('-ipHash').sort({createdAt:-1}).limit(limit).lean()});}catch(e){next(e);}});
app.get('/api/v1/admin/health',requireAdmin,requireDb,async(req,res,next)=>{try{const checks={database:mongoose.connection.readyState===1,objectStorageConfigured:!!(process.env.OBJECT_STORAGE_BUCKET&&process.env.OBJECT_STORAGE_REGION),uptimeSeconds:Math.floor(process.uptime()),node:process.version,memory:process.memoryUsage()};res.json({status:checks.database?'ok':'degraded',checks});}catch(e){next(e);}});
app.get('/api/v1/admin/deployments',requireAdmin,requireDb,async(req,res,next)=>{try{const deployments=await WebsiteDeployment.find().select('businessId version status active fileCount totalBytes publishedAt createdAt logs.event logs.level logs.message logs.actorId logs.createdAt').populate('businessId','name slug').sort({createdAt:-1}).limit(200).lean();res.json({deployments});}catch(e){next(e);}});
app.get('/api/v1/admin/business-requests', requireAdmin, requireDb, async (req, res, next) => {
  try { const requests = await BusinessRequest.find({ status: { $in: ['PENDING','IN_REVIEW'] } }).sort({ createdAt: 1 }).limit(100).lean(); return res.json({ requests }); } catch (err) { next(err); }
});
app.patch('/api/v1/admin/business-requests/:requestId', requireAdmin, requireDb, async (req, res, next) => {
  try {
    const status = String(req.body.status || '').toUpperCase();
    if (!['IN_REVIEW','COMPLETED','REJECTED'].includes(status)) return res.status(400).json({ message: 'Invalid request status.' });
    const request = await BusinessRequest.findByIdAndUpdate(req.params.requestId, { $set: { status, reviewedBy: req.auth.sub, reviewedAt: new Date(), resolution: String(req.body.resolution || '').trim().slice(0, 1000) } }, { new: true });
    if (!request) return res.status(404).json({ message: 'Business request not found.' });
    await writeAdminAudit(req,'BUSINESS_REQUEST_REVIEWED','BusinessRequest',request._id,{status,type:request.type});
    if (request.type === 'REMOVAL' && status === 'COMPLETED') await Business.updateOne({ _id: request.businessId }, { $set: { status: 'SUSPENDED' } });
    return res.json({ request: { id: request._id, type: request.type, status: request.status } });
  } catch (err) { next(err); }
});
app.get('/api/v1/admin/business-claims', requireAdmin, requireDb, async (req, res, next) => {
  try { const claims = await BusinessClaim.find({ status: 'PENDING' }).sort({ createdAt: 1 }).limit(100).select('businessId requesterId message proofReferences status createdAt').lean(); return res.json({ claims }); } catch (err) { next(err); }
});
app.post('/api/v1/admin/businesses/:businessId/claims/:claimId/review', requireAdmin, requireDb, async (req, res, next) => {
  try {
    const decision = String(req.body.decision || '').toUpperCase();
    if (!['APPROVE','REJECT'].includes(decision)) return res.status(400).json({ message: 'Decision must be APPROVE or REJECT.' });
    const claim = await BusinessClaim.findOne({ _id: req.params.claimId, businessId: req.params.businessId, status: 'PENDING' });
    if (!claim) return res.status(404).json({ message: 'Pending claim not found.' });
    const business = await Business.findById(claim.businessId);
    if (!business) return res.status(404).json({ message: 'Business not found.' });
    if (decision === 'APPROVE') {
      await BusinessMember.updateMany({ businessId: business._id, role: 'OWNER', status: 'ACTIVE' }, { $set: { status: 'REVOKED' } });
      await BusinessMember.updateOne({ businessId: business._id, userId: claim.requesterId }, { $set: { role: 'OWNER', status: 'ACTIVE', grantedBy: claim.requesterId, grantedAt: new Date() }, $setOnInsert: { businessId: business._id, userId: claim.requesterId } }, { upsert: true });
      business.createdByCustomer = claim.requesterId; business.ownershipStatus = 'CLAIMED'; await business.save(); claim.status = 'APPROVED';
      await auditBusiness(business._id, claim.requesterId, 'OWNER_GRANTED', { role: 'OWNER', basis: 'manager-approved-claim' });
    } else claim.status = 'REJECTED';
    claim.reviewedBy = req.auth.sub; claim.reviewedAt = new Date(); claim.reviewNote = String(req.body.note || '').trim().slice(0, 1000); await claim.save();
    await auditBusiness(business._id, req.auth.sub, decision === 'APPROVE' ? 'CLAIM_APPROVED' : 'CLAIM_REJECTED', { claimId: String(claim._id), reviewedByRole: 'admin' });
    await writeAdminAudit(req,decision==='APPROVE'?'BUSINESS_CLAIM_APPROVED':'BUSINESS_CLAIM_REJECTED','BusinessClaim',claim._id,{businessId:String(claim.businessId)});
    return res.json({ claim: { id: claim._id, status: claim.status } });
  } catch (err) { next(err); }
});

// ---------- Admin static website publisher (no arbitrary server-side code) ----------
const PUBLISHER_MAX_UPLOAD_BYTES = Math.min(Math.max(1024, Number(process.env.PUBLISHER_MAX_UPLOAD_BYTES) || 20 * 1024 * 1024), 20 * 1024 * 1024);
const PUBLISHER_MAX_UNPACKED_BYTES = Math.min(Math.max(1024, Number(process.env.PUBLISHER_MAX_UNPACKED_BYTES) || 60 * 1024 * 1024), 60 * 1024 * 1024);
const publisherUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: PUBLISHER_MAX_UPLOAD_BYTES, files: 1 }, fileFilter: (req, file, cb) => cb(null, ['application/zip','application/x-zip-compressed','application/octet-stream'].includes(file.mimetype)) });
function publisherLog(deployment, event, message, actorId, level='info', metadata={}) { deployment.logs.push({ event, message: String(message).slice(0, 500), actorId, level, metadata, createdAt: new Date() }); }
function publisherError(res, err) { const status = err.status || (err.code === 'UPLOAD_SIZE' ? 413 : err.code === 'UNSAFE_CONTENT' ? 400 : 400); return res.status(status).json({ message: err.message || 'Publisher request failed.', code: err.code || 'PUBLISHER_ERROR' }); }
function signedPreviewToken(deploymentId) { const secret = JWT_SECRET || CUSTOMER_JWT_SECRET; if (!secret) throw Object.assign(new Error('Publisher preview signing is not configured.'), { status: 503 }); return jwt.sign({ type: 'publisher-preview', deploymentId: String(deploymentId) }, secret, { expiresIn: '10m' }); }
app.get('/api/v1/admin/publisher/businesses', requireAdmin, requireDb, async (req,res,next) => { try { const businesses = await Business.find({ status: { $ne: 'SUSPENDED' } }).select('_id name slug city category status').sort({ name: 1 }).limit(500).lean(); res.json({ businesses }); } catch(err){ next(err); } });
app.get('/api/v1/admin/publisher/businesses/:businessId/deployments', requireAdmin, requireDb, async (req,res,next) => { try { const deployments = await WebsiteDeployment.find({ businessId: req.params.businessId }).select('-logs.metadata').sort({ version: -1 }).limit(100).lean(); res.json({ deployments }); } catch(err){ next(err); } });
app.post('/api/v1/admin/publisher/businesses/:businessId/deployments', requireAdmin, requireDb, (req,res,next) => publisherUpload.single('file')(req,res,err => { if(err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'ZIP must be 20 MB or smaller.' : 'Upload one ZIP archive.' }); next(); }), async (req,res,next) => {
  let sourceKey, artifactPrefix, deployment; const uploadedKeys=[];
  try {
    if (!storageConfig()) return res.status(503).json({ message: 'Private object storage is not configured. Configure OBJECT_STORAGE_* variables.' });
    if (!req.file) return res.status(400).json({ message: 'Choose a ZIP file containing a static website.' });
    if (req.file.originalname && !/\.zip$/i.test(req.file.originalname)) return res.status(400).json({ message: 'Upload a .zip archive.' });
    const inspected = inspectStaticZip(req.file.buffer, { maxCompressed: PUBLISHER_MAX_UPLOAD_BYTES, maxUnpacked: PUBLISHER_MAX_UNPACKED_BYTES });
    const business = await Business.findById(req.params.businessId).select('_id name slug status').lean();
    if (!business || business.status === 'SUSPENDED') return res.status(404).json({ message: 'Business not found or suspended.' });
    const latest = await WebsiteDeployment.findOne({ businessId: business._id }).sort({ version: -1 }).select('version').lean();
    await PublisherCounter.updateOne({ businessId: business._id }, { $max: { value: latest?.version || 0 }, $setOnInsert: { businessId: business._id } }, { upsert: true });
    const counter = await PublisherCounter.findOneAndUpdate({ businessId: business._id }, { $inc: { value: 1 } }, { new: true });
    const version = counter.value;
    const prefix = `creatarsh/publisher/${business._id}/v${version}`;
    sourceKey = `${prefix}/source.zip`; artifactPrefix = `${prefix}/site`;
    await putPrivate(sourceKey, req.file.buffer, 'application/zip'); uploadedKeys.push(sourceKey);
    const manifest=[];
    for (const [filePath, content] of inspected.files.entries()) {
      const key = `${artifactPrefix}/${filePath}`;
      await putPrivate(key, content, mimeType(filePath)); uploadedKeys.push(key);
      manifest.push({ path: filePath, size: content.length, contentType: mimeType(filePath), sha256: crypto.createHash('sha256').update(content).digest('hex') });
    }
    deployment = await WebsiteDeployment.create({ businessId: business._id, version, status: 'STAGED', active: false, sourceKey, artifactPrefix, fileManifest: manifest, sourceSha256: inspected.sha256, totalBytes: inspected.totalBytes, fileCount: inspected.fileCount, createdBy: req.auth.sub, logs: [{ event: 'UPLOAD_VALIDATED', level: 'info', message: 'ZIP validated and static artifacts stored privately.', actorId: req.auth.sub, metadata: { fileCount: inspected.fileCount, totalBytes: inspected.totalBytes, sha256: inspected.sha256 }, createdAt: new Date() }] });
    await writeAdminAudit(req,'WEBSITE_UPLOAD_STAGED','WebsiteDeployment',deployment._id,{businessId:String(business._id),version,fileCount:inspected.fileCount,totalBytes:inspected.totalBytes});
    const previewToken = signedPreviewToken(deployment._id);
    logger.info('publisher_upload_staged', { deploymentId: String(deployment._id), businessId: String(business._id), version, fileCount: inspected.fileCount, totalBytes: inspected.totalBytes });
    return res.status(201).json({ deployment: { id: deployment._id, businessId: deployment.businessId, version, status: deployment.status, fileCount: deployment.fileCount, totalBytes: deployment.totalBytes }, previewUrl: `/api/v1/admin/publisher/preview/${deployment._id}?token=${encodeURIComponent(previewToken)}` });
  } catch(err) {
    if (deployment) { publisherLog(deployment,'UPLOAD_FAILED',err.message,req.auth.sub,'error',{code:err.code||'ERROR'}); await deployment.save().catch(()=>{}); } else { await Promise.all(uploadedKeys.map(key=>deletePrivate(key).catch(()=>{}))); }
    logger.warn('publisher_upload_rejected', { businessId: req.params.businessId, code: err.code || err.name || 'ERROR' });
    if (err.status || ['UPLOAD_SIZE','UNPACKED_SIZE','ZIP_BOMB','UNSAFE_CONTENT','INVALID_ARCHIVE'].includes(err.code)) return publisherError(res,err);
    return next(err);
  }
});
app.get('/api/v1/admin/publisher/deployments/:deploymentId/preview-link', requireAdmin, requireDb, async (req,res,next)=>{ try { const d=await WebsiteDeployment.findById(req.params.deploymentId).select('_id status').lean(); if(!d||!['STAGED','PUBLISHED','ROLLED_BACK'].includes(d.status))return res.status(404).json({message:'Preview not available.'});const token=signedPreviewToken(d._id);return res.json({url:`/api/v1/admin/publisher/preview/${d._id}?token=${encodeURIComponent(token)}`,expiresInSeconds:600});}catch(err){next(err);} });
app.get('/api/v1/admin/publisher/preview/:deploymentId', requireDb, async (req,res,next) => {
  try {
    const previewPayload=jwt.verify(String(req.query.token||''),JWT_SECRET||CUSTOMER_JWT_SECRET);
    if(previewPayload.type!=='publisher-preview'||String(previewPayload.deploymentId)!==String(req.params.deploymentId)) return res.status(403).send('Preview token invalid.');
    const deployment = await WebsiteDeployment.findById(req.params.deploymentId).lean();
    if(!deployment || !['STAGED','PUBLISHED','ROLLED_BACK'].includes(deployment.status)) return res.status(404).send('Preview not available.');
    const token=signedPreviewToken(deployment._id); const object=await getPrivate(`${deployment.artifactPrefix}/index.html`);
    const html=rewritePreviewHtml(object.body.toString('utf8'),String(deployment._id),token);
    res.set('Content-Security-Policy',contentSecurityPolicy(true)); res.set('X-Content-Type-Options','nosniff'); res.set('Cache-Control','no-store'); res.type('html').send(html);
  } catch(err){ next(err); }
});
app.get('/api/v1/admin/publisher/preview/:deploymentId/files/*', async (req,res) => {
  try {
    const secret=JWT_SECRET||CUSTOMER_JWT_SECRET; const payload=jwt.verify(String(req.query.token||''),secret);
    if(payload.type!=='publisher-preview'||String(payload.deploymentId)!==String(req.params.deploymentId)) return res.status(403).send('Preview token invalid.');
    const deployment=await WebsiteDeployment.findById(req.params.deploymentId).select('artifactPrefix status').lean();
    if(!deployment||!['STAGED','PUBLISHED','ROLLED_BACK'].includes(deployment.status)) return res.status(404).send('Preview unavailable.');
    const rel=safeRelativePath(req.params[0]); if(!rel)return res.status(404).send('File not found.');
    const object=await getPrivate(`${deployment.artifactPrefix}/${rel}`); let body=object.body; if(rel.toLowerCase().endsWith('.css'))body=Buffer.from(rewritePreviewCss(body.toString('utf8'),rel,req.params.deploymentId,String(req.query.token||''))); res.set('Content-Type',object.contentType||mimeType(rel));res.set('Content-Security-Policy',contentSecurityPolicy(true));res.set('X-Content-Type-Options','nosniff');res.set('Cache-Control','no-store');return res.send(object.body);
  } catch(err){ return res.status(err.name==='TokenExpiredError'?401:404).send('Preview file unavailable.'); }
});
app.post('/api/v1/admin/publisher/deployments/:deploymentId/publish', requireAdmin, requireDb, async(req,res,next)=>{
  try { const deployment=await WebsiteDeployment.findById(req.params.deploymentId);if(!deployment)return res.status(404).json({message:'Deployment not found.'});if(!['STAGED','ROLLED_BACK','PUBLISHED'].includes(deployment.status))return res.status(409).json({message:'Only a validated staged release can be published.'});
    await WebsiteDeployment.updateMany({businessId:deployment.businessId,active:true},{$set:{active:false,status:'ROLLED_BACK'},$push:{logs:{event:'SUPERSEDED',level:'info',message:`Superseded by version ${deployment.version}.`,actorId:req.auth.sub,createdAt:new Date()}}});
    deployment.active=true;deployment.status='PUBLISHED';deployment.publishedAt=new Date();publisherLog(deployment,'PUBLISHED',`Version ${deployment.version} published.`,req.auth.sub,'info',{version:deployment.version});await deployment.save();await writeAdminAudit(req,'WEBSITE_PUBLISHED','WebsiteDeployment',deployment._id,{businessId:String(deployment.businessId),version:deployment.version});
    const business=await Business.findById(deployment.businessId).select('slug name').lean();logger.info('publisher_release_published',{deploymentId:String(deployment._id),businessId:String(deployment.businessId),version:deployment.version});return res.json({ok:true,version:deployment.version,status:deployment.status,url:`https://${business.slug}.${process.env.PLATFORM_ROOT_DOMAIN||'creatarsh.in'}`});
  } catch(err){next(err);}
});
app.post('/api/v1/admin/publisher/deployments/:deploymentId/rollback', requireAdmin, requireDb, async(req,res,next)=>{
  try { const target=await WebsiteDeployment.findById(req.params.deploymentId);if(!target)return res.status(404).json({message:'Deployment not found.'});if(!['PUBLISHED','ROLLED_BACK'].includes(target.status))return res.status(409).json({message:'Only a previously published release can be restored.'});
    const current=await WebsiteDeployment.findOne({businessId:target.businessId,active:true});if(current&&String(current._id)!==String(target._id)){current.active=false;current.status='ROLLED_BACK';publisherLog(current,'ROLLBACK_DEACTIVATED',`Deactivated while rolling back to version ${target.version}.`,req.auth.sub);await current.save();}target.active=true;target.status='PUBLISHED';target.publishedAt=new Date();publisherLog(target,'ROLLBACK_ACTIVATED',`Version ${target.version} restored.`,req.auth.sub);await target.save();await writeAdminAudit(req,'WEBSITE_ROLLED_BACK','WebsiteDeployment',target._id,{businessId:String(target.businessId),version:target.version});const business=await Business.findById(target.businessId).select('slug').lean();logger.warn('publisher_rollback',{deploymentId:String(target._id),businessId:String(target.businessId),version:target.version,actorId:req.auth.sub});return res.json({ok:true,version:target.version,url:`https://${business.slug}.${process.env.PLATFORM_ROOT_DOMAIN||'creatarsh.in'}`});
  }catch(err){next(err);}
});
app.post('/api/v1/admin/publisher/businesses/:businessId/unpublish', requireAdmin, requireDb, async(req,res,next)=>{
  try {const active=await WebsiteDeployment.findOne({businessId:req.params.businessId,active:true});if(!active)return res.status(404).json({message:'No active website release.'});active.active=false;active.status='UNPUBLISHED';publisherLog(active,'UNPUBLISHED','Website unpublished by admin.',req.auth.sub,'warn');await active.save();await writeAdminAudit(req,'WEBSITE_UNPUBLISHED','WebsiteDeployment',active._id,{businessId:String(active.businessId),version:active.version});logger.warn('publisher_unpublished',{businessId:req.params.businessId,deploymentId:String(active._id),actorId:req.auth.sub});return res.json({ok:true,status:'UNPUBLISHED'});}catch(err){next(err);}
});
app.get('/api/v1/admin/publisher/deployments/:deploymentId/logs', requireAdmin, requireDb, async(req,res,next)=>{try{const d=await WebsiteDeployment.findById(req.params.deploymentId).select('logs version status businessId').lean();if(!d)return res.status(404).json({message:'Deployment not found.'});return res.json({deploymentId:d._id,version:d.version,status:d.status,logs:d.logs});}catch(err){next(err);}});

app.get('/api/public/payment-config', (req,res)=>res.json({provider:null,enabled:false,currency:'INR'}));

app.get('/api/public/pricing', async (req,res) => { try { const packages=await ServicePackage.find({active:true}).sort({order:1}); res.json({version:'2026-10',currency:'INR',packages}); } catch(e){ res.status(503).json({message:'Pricing is temporarily unavailable.'}); } });

app.post('/api/public/orders', async (req,res) => res.status(410).json({message:'Please sign in and use the package booking flow.'}));
app.post('/api/customer/bookings', requireCustomer, async (req,res) => {
  if (!dbReady) return res.status(503).json({message:'Booking is temporarily unavailable because the database is not connected.'});
  const b=req.body||{};
  if (!b.productCode || !b.terms || !b.privacy || !String(b.requirements||'').trim()) return res.status(400).json({message:'Package, requirements, Terms acceptance and Privacy acknowledgement are required.'});
  const product=await ServicePackage.findOne({code:String(b.productCode),active:true});
  if(!product) return res.status(400).json({message:'Invalid or unavailable package.'});
  try {
    const c=await Customer.findById(req.auth.sub);
    if(!c || !c.active) return res.status(401).json({message:'Customer account is unavailable.'});
    const requirements=String(b.requirements).trim();
    const business=String(b.company||c.company||'').trim();
    const o=await Order.create({
      orderId:id('ORD'), customer:c._id, productType:'SERVICE', productCode:product.code,
      productName:product.name, packagePrice:Math.max(0,Number(product.price||0)), bookingAmount:0,
      amount:0, status:'BOOKED', business, requirements,
      acceptedTermsVersion:b.termsVersion||'2026-10', privacyNoticeVersion:b.privacyVersion||'2026-10',
      notes:'Booking enquiry only. No online payment was collected.'
    });
    await Consent.create({customer:c._id,type:'TERMS',version:b.termsVersion||'2026-10',granted:true,source:'package-booking',grantedAt:new Date(),ip:req.ip});
    await Consent.create({customer:c._id,type:'PRIVACY_NOTICE',version:b.privacyVersion||'2026-10',granted:true,source:'package-booking',grantedAt:new Date(),ip:req.ip});
    if(b.marketingConsent===true||b.marketingConsent==='true'||b.marketingConsent==='on') await Consent.create({customer:c._id,type:'MARKETING',version:'2026-10',granted:true,source:'package-booking',grantedAt:new Date(),ip:req.ip});
    const lead=await Lead.create({
      enquiryId:id('ENQ'), name:c.name||'', company:business, email:c.email||'', whatsapp:String(b.phone||c.phone||''),
      projectType:product.name, budget:`₹${Number(product.price||0).toLocaleString('en-IN')} package`,
      requirements, customer:c._id, status:'NEW', workflowStage:'NEW LEAD',
      notes:`Booking enquiry ${o.orderId}. No online payment collected.`
    });
    await Notification.create({recipientType:'customer',recipient:c._id,title:'Booking enquiry received',message:`Your ${product.name} enquiry ${lead.enquiryId} has been received. Creatarsh will contact you to discuss scope, quotation, timeline and next steps.`,link:'/account'});
    res.status(201).json({ok:true,orderId:o.orderId,order:o,package:{code:product.code,name:product.name,price:Number(product.price||0)},enquiry:lead});
  } catch(e) { console.error('Booking error:',e.message); res.status(400).json({message:'Could not create booking enquiry.'}); }
});

app.get('/api/public/portfolio/:slug', async (req, res) => {
  if (!dbReady) return res.status(503).json({ message: 'Website content is temporarily unavailable because the database is not connected.' });
  try {
    const slug = String(req.params.slug || '').toLowerCase().trim();
    const items = await Portfolio.find({ active: true }).sort({ order: 1, createdAt: -1 });
    const match = items.find(x => String(x.title || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') === slug || String(x._id) === slug);
    if (!match) return res.status(404).json({ message: 'Portfolio project not found.' });
    res.json({ project: match, related: items.filter(x => String(x._id) !== String(match._id)).slice(0, 3) });
  } catch (e) { res.status(503).json({ message: 'Website content is temporarily unavailable.' }); }
});

app.get('/api/public/content', async (req, res) => {
  try {
    const [services, portfolio, testimonials, faqs, banners, site] = await Promise.all([
      Service.find({ active: true }).sort({ order: 1, createdAt: -1 }), Portfolio.find({ active: true }).sort({ order: 1, createdAt: -1 }),
      Testimonial.find({ approved: true }).sort({ order: 1 }), FAQ.find({ active: true }).sort({ order: 1 }), Banner.find({ active: true }).sort({ order: 1 }), Site.findOne({ key: 'main' })
    ]);
    res.json({ services, portfolio, testimonials, faqs, banners, site });
  } catch (e) { res.status(503).json({ message: 'Website content is temporarily unavailable.' }); }
});
// Sponsored placements are explicitly labelled; no personal profile or IP history is retained.
app.get('/api/public/ads',requireDb,async(req,res,next)=>{try{const placement=String(req.query.placement||'');if(!['DIRECTORY_FEATURED','CATEGORY_SPONSORED','SEARCH_SPONSORED','BUSINESS_PAGE'].includes(placement))return res.status(400).json({message:'Valid placement is required.'});const now=new Date();const filter={placement,status:'ACTIVE',creativeStatus:'APPROVED',$and:[{$or:[{startsAt:null},{startsAt:{$exists:false}},{startsAt:{$lte:now}}]},{$or:[{endsAt:null},{endsAt:{$exists:false}},{endsAt:{$gt:now}}]}]};if(req.query.category)filter.category=String(req.query.category).slice(0,80);const campaigns=await AdCampaign.find(filter).select('_id placement businessId creativeUrl creativeTitle creativeText destinationUrl category').populate({path:'businessId',select:'name slug category city status',match:{status:'PUBLISHED'}}).sort({createdAt:-1}).limit(5).lean();res.json({ads:campaigns.filter(c=>!c.businessId||c.businessId.status==='PUBLISHED').map(c=>({id:c._id,placement:c.placement,label:'Sponsored',business:c.businessId?{name:c.businessId.name,slug:c.businessId.slug,category:c.businessId.category,city:c.businessId.city}:null,creativeUrl:c.creativeUrl,title:c.creativeTitle,text:c.creativeText,destinationUrl:c.destinationUrl,category:c.category}))});}catch(e){next(e);}});
app.post('/api/public/ads/:id/event',requireDb,async(req,res,next)=>{try{const event=String(req.body.event||'');if(!['IMPRESSION','CLICK'].includes(event))return res.status(400).json({message:'Invalid ad event.'});const now=new Date();const campaign=await AdCampaign.findOne({_id:req.params.id,status:'ACTIVE',creativeStatus:'APPROVED',$and:[{$or:[{startsAt:null},{startsAt:{$exists:false}},{startsAt:{$lte:now}}]},{$or:[{endsAt:null},{endsAt:{$exists:false}},{endsAt:{$gt:now}}]}]}).select('_id startsAt endsAt').lean();if(!campaign)return res.status(404).json({message:'Sponsored placement is not available.'});const day=now.toISOString().slice(0,10);await AdDailyMetric.updateOne({campaignId:campaign._id,day,event},{$inc:{count:1}}, {upsert:true});await AdCampaign.updateOne({_id:campaign._id},{$inc:{[event==='CLICK'?'clicks':'impressions']:1}});res.status(204).end();}catch(e){next(e);}});

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
app.post('/api/manager/login', async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!username || !password) return res.status(400).json({ message: 'Username and password are required.' });
  try {
    if (!dbReady) return res.status(503).json({ message: 'Database is not connected. Please configure MONGODB_URI.' });
    let manager = await Manager.findOne({ username, active: true });
    if (!manager && process.env.MANAGER_INITIAL_USERNAME && process.env.MANAGER_INITIAL_PASSWORD && username === process.env.MANAGER_INITIAL_USERNAME.toLowerCase() && password === process.env.MANAGER_INITIAL_PASSWORD) {
      manager = await Manager.create({ username, passwordHash: await bcrypt.hash(password, 12), role: 'manager' });
    }
    if (!manager || !(await bcrypt.compare(password, manager.passwordHash))) return res.status(401).json({ message: 'Invalid manager credentials.' });
    manager.lastLoginAt = new Date();
    await manager.save();
    res.json({ token: signManager(manager), manager: { username: manager.username, role: manager.role } });
  } catch (e) { console.error('Manager login failed:', e.message); res.status(500).json({ message: 'Manager login failed.' }); }
});
app.get('/api/manager/me', requireManager, async (req, res) => res.json({ manager: { username: req.auth.username, role: req.auth.role } }));
app.post('/api/manager/change-password', requireManager, async (req, res) => {
  if (!dbReady) return res.status(503).json({ message: 'Database is not connected.' });
  const current = String(req.body.currentPassword || ''), next = String(req.body.newPassword || ''); if (next.length < 8) return res.status(400).json({ message: 'New password must be at least 8 characters.' });
  const m = await Manager.findById(req.auth.sub); if (!m || !(await bcrypt.compare(current, m.passwordHash))) return res.status(401).json({ message: 'Current password is incorrect.' }); m.passwordHash = await bcrypt.hash(next, 12); await m.save(); res.json({ message: 'Password updated.' });
});
app.post('/api/customer/register', async (req, res) => {
  if (!dbReady) return res.status(503).json({ message: 'Customer registration is temporarily unavailable.' });
  const name = String(req.body.name || '').trim(), email = String(req.body.email || '').trim().toLowerCase(), password = String(req.body.password || '');
  if (!name || !email || password.length < 8) return res.status(400).json({ message: 'Name, valid email and a password of at least 8 characters are required.' });
  try { if (await Customer.findOne({ email })) return res.status(409).json({ message: 'An account with this email already exists.' }); const c = await Customer.create({ name, email, phone: req.body.phone, company: req.body.company, passwordHash: await bcrypt.hash(password, 12), lastLoginAt: new Date() }); const authToken=signCustomer(c); res.status(201).json({ token: authToken, accessToken: authToken, customer: { id: c._id, name: c.name, email: c.email, phone: c.phone, company: c.company }, user: { id: c._id, name: c.name, email: c.email, phone: c.phone, company: c.company } }); } catch (e) { res.status(400).json({ message: 'Could not create customer account.' }); }
});
app.post('/api/customer/login', async (req, res) => {
  if (!dbReady) return res.status(503).json({ message: 'Customer login is temporarily unavailable. Please try again shortly.' });
  const email = String(req.body.email || '').trim().toLowerCase(), password = String(req.body.password || '');
  try { const c = await Customer.findOne({ email, active: true }); if (!c || !(await bcrypt.compare(password, c.passwordHash))) return res.status(401).json({ message: 'Invalid email or password.' }); c.lastLoginAt = new Date(); await c.save(); const authToken=signCustomer(c); res.json({ token: authToken, accessToken: authToken, customer: { id: c._id, name: c.name, email: c.email, phone: c.phone, company: c.company }, user: { id: c._id, name: c.name, email: c.email, phone: c.phone, company: c.company } }); } catch (e) { res.status(500).json({ message: 'Customer login failed.' }); }
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

// ---------- Customer contracts & verified payments ----------
app.get('/api/customer/contracts',requireCustomer,async(req,res)=>res.json(await Contract.find({customer:req.auth.sub}).populate('project','name projectId').sort({createdAt:-1})));
app.post('/api/customer/contracts/:id/accept',requireCustomer,async(req,res)=>{const c=await Contract.findOne({_id:req.params.id,customer:req.auth.sub});if(!c)return res.status(404).json({message:'Contract not found.'});if(c.status!=='SENT')return res.status(400).json({message:'This contract is not awaiting acceptance.'});c.status='ACCEPTED';c.acceptedAt=new Date();c.acceptedIp=req.ip;c.save();await Notification.create({recipientType:'customer',recipient:c.customer,title:'Contract accepted',message:`${c.title} has been accepted.`,link:'/account'});res.json(c);});
app.get('/api/public/plans', async (req,res) => {
  if (!dbReady) return res.status(503).json({ message: 'Plans are temporarily unavailable.' });
  const plans = await ServicePackage.find({ active: true }).select('code name price bookingAmount description features category billingType startingAt order').sort({ order: 1, name: 1 }).lean();
  res.json({ plans, currency: 'INR', thirdPartyCharges: 'Domain registration, hosting, app-store fees, payment gateway fees and other third-party services are charged separately when applicable and disclosed before purchase.' });
});
app.get('/api/manager/plans', requireAdmin, async (req,res) => res.json(dbReady ? await ServicePackage.find().sort({order:1,name:1}).lean() : []));
app.post('/api/manager/plans', requireAdmin, async (req,res) => {
  if (!dbReady) return res.status(503).json({message:'Database is not connected.'});
  const code=String(req.body.code||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'');
  const name=String(req.body.name||'').trim(); const price=Number(req.body.price);
  if(!/^[A-Z0-9_-]{2,60}$/.test(code)||!name||name.length>140||!Number.isFinite(price)||price<1) return res.status(400).json({message:'Valid code, name and positive price are required.'});
  try { const plan=await ServicePackage.create({code,name,price,bookingAmount:Math.max(0,Number(req.body.bookingAmount||price)),description:String(req.body.description||''),features:Array.isArray(req.body.features)?req.body.features.map(x=>String(x).slice(0,180)).slice(0,40):[],category:String(req.body.category||'GENERAL'),billingType:['ONE_TIME','MONTHLY','YEARLY'].includes(req.body.billingType)?req.body.billingType:'ONE_TIME',active:req.body.active!==false,order:Number(req.body.order||0),startingAt:req.body.startingAt===true}); return res.status(201).json(plan); }
  catch(e){if(e.code===11000)return res.status(409).json({message:'Plan code already exists.'});throw e;}
});
app.patch('/api/manager/plans/:id', requireAdmin, async (req,res) => {
  if (!dbReady) return res.status(503).json({message:'Database is not connected.'});
  const allowed={name:140,description:2000,category:80}; const update={};
  for(const [k,max] of Object.entries(allowed)) if(req.body[k]!==undefined) update[k]=String(req.body[k]).trim().slice(0,max);
  if(req.body.price!==undefined){const v=Number(req.body.price);if(!Number.isFinite(v)||v<1)return res.status(400).json({message:'Price must be positive.'});update.price=v;}
  if(req.body.bookingAmount!==undefined){const v=Number(req.body.bookingAmount);if(!Number.isFinite(v)||v<0)return res.status(400).json({message:'Booking amount cannot be negative.'});update.bookingAmount=v;}
  if(req.body.features!==undefined) update.features=Array.isArray(req.body.features)?req.body.features.map(x=>String(x).slice(0,180)).slice(0,40):[];
  if(req.body.active!==undefined)update.active=!!req.body.active;
  if(req.body.order!==undefined)update.order=Number(req.body.order)||0;
  if(req.body.billingType!==undefined){if(!['ONE_TIME','MONTHLY','YEARLY'].includes(req.body.billingType))return res.status(400).json({message:'Invalid billing type.'});update.billingType=req.body.billingType;}
  const plan=await ServicePackage.findByIdAndUpdate(req.params.id,{$set:update},{new:true,runValidators:true});if(!plan)return res.status(404).json({message:'Plan not found.'});res.json(plan);
});

async function razorpayRequest(pathname, method='GET', body) {
  if(!RAZORPAY_KEY_ID||!RAZORPAY_KEY_SECRET) { const e=new Error('Razorpay is not configured on the server.');e.statusCode=503;throw e; }
  const response=await fetch(`${RAZORPAY_API}${pathname}`,{method,headers:{Authorization:`Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const e=new Error('Payment provider request failed.');e.statusCode=response.status===429?503:502;e.providerCode=data.error?.code||'';throw e;}
  return data;
}
async function markIntentPaid(intent, paymentId, providerStatus='captured') {
  if(intent.status==='PAID') return intent;
  if(!['captured','authorized'].includes(providerStatus)) return intent;
  if(providerStatus!=='captured') { intent.status='AUTHORIZED';intent.providerStatus=providerStatus;await intent.save();return intent; }
  const paymentRecord=await Payment.findOne({transactionId:paymentId});
  if(!paymentRecord) {
    const customer=await Customer.findById(intent.customer).select('name email phone company');
    const plan=await ServicePackage.findById(intent.plan).lean();
    const amount=Number(intent.amount);
    const gstRate=Number(process.env.DEFAULT_GST_RATE||18);
    const subtotal=Math.round((amount/(1+gstRate/100))*100)/100;
    const tax=Math.round((amount-subtotal)*100)/100;
    const invoice=await Invoice.create({invoiceId:id('INV'),customer:intent.customer,invoiceDate:new Date(),customerBilling:{name:customer?.name||'',email:customer?.email||'',phone:customer?.phone||'',company:customer?.company||''},items:[{name:plan?.name||intent.planName,description:plan?.description||'',quantity:1,rate:subtotal,price:subtotal,taxRate:gstRate}],subtotal,discount:0,gst:gstRate,taxAmount:tax,total:amount,status:'PAID',paymentMethod:'Razorpay',transactionReference:paymentId,notes:`Payment intent ${intent._id}`});
    intent.invoice=invoice._id;
    await Payment.create({transactionId:paymentId,customer:intent.customer,invoice:invoice._id,amount,gateway:'Razorpay',status:'SUCCESS',paidAt:new Date(),note:`Verified captured payment for ${intent.planCode}`});
    await Notification.create({recipientType:'customer',recipient:intent.customer,title:'Payment confirmed',message:`Payment for ${intent.planName} has been verified. Invoice ${invoice.invoiceId} is available in your account.`,link:'/account'});
  }
  intent.status='PAID';intent.providerStatus=providerStatus;intent.razorpayPaymentId=paymentId;intent.paidAt=new Date();await intent.save();return intent;
}
app.post('/api/customer/payments/razorpay/order', requireCustomer, async(req,res,next)=>{
 try {
  if(!dbReady)return res.status(503).json({message:'Payment service is temporarily unavailable.'});
  const key=String(req.get('Idempotency-Key')||'').trim();if(!/^[A-Za-z0-9._:-]{12,128}$/.test(key))return res.status(400).json({message:'A valid Idempotency-Key header (12–128 characters) is required.'});
  const code=String(req.body.planCode||req.body.packageCode||'').trim().toUpperCase();if(!code)return res.status(400).json({message:'planCode is required.'});
  let intent=await PaymentIntent.findOne({customer:req.auth.sub,idempotencyKey:key});
  if(intent){if(intent.planCode!==code)return res.status(409).json({message:'Idempotency key was already used for a different plan.'});return res.json({intentId:intent._id,orderId:intent.razorpayOrderId,amount:amountToPaise(intent.amount),currency:intent.currency,keyId:RAZORPAY_KEY_ID,status:intent.status,invoiceId:intent.invoice||null});}
  const plan=await ServicePackage.findOne({code,active:true});if(!plan)return res.status(404).json({message:'Active plan not found.'});
  const amount=Number(plan.bookingAmount>0?plan.bookingAmount:plan.price);const paise=amountToPaise(amount);
  intent=await PaymentIntent.create({customer:req.auth.sub,plan:plan._id,planCode:plan.code,planName:plan.name,amount,currency:'INR',idempotencyKey:key,status:'CREATING'});
  try {const rp=await razorpayRequest('/orders','POST',{amount:paise,currency:'INR',receipt:`ca_${String(intent._id).slice(-18)}`,notes:{creatarshIntentId:String(intent._id),customerId:String(req.auth.sub),planCode:plan.code}});intent.razorpayOrderId=rp.id;intent.status='CREATED';await intent.save();return res.status(201).json({intentId:intent._id,orderId:rp.id,amount:rp.amount,currency:rp.currency,keyId:RAZORPAY_KEY_ID,status:intent.status,plan:{code:plan.code,name:plan.name},thirdPartyCharges:'Any domain, hosting, marketplace, app-store or other third-party fees are separate unless explicitly listed in this plan.'});}
  catch(e){intent.status='RECONCILIATION_REQUIRED';intent.failureReason='Provider order creation failed; check provider dashboard before retrying.';await intent.save();throw e;}
 }catch(e){next(e);}
});
app.post('/api/customer/payments/razorpay/verify', requireCustomer, async(req,res,next)=>{
 try {
  const intent=await PaymentIntent.findOne({_id:req.body.intentId,customer:req.auth.sub});if(!intent)return res.status(404).json({message:'Payment intent not found.'});
  const orderId=String(req.body.razorpay_order_id||'');const paymentId=String(req.body.razorpay_payment_id||'');const signature=String(req.body.razorpay_signature||'');
  if(orderId!==intent.razorpayOrderId||!verifyCheckoutSignature(orderId,paymentId,signature,RAZORPAY_KEY_SECRET))return res.status(400).json({message:'Payment signature verification failed.'});
  // A valid checkout signature alone does not mark payment paid: verify payment status with Razorpay's server API.
  const providerPayment=await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
  if(providerPayment.order_id!==intent.razorpayOrderId||Number(providerPayment.amount)!==amountToPaise(intent.amount)||providerPayment.currency!=='INR')return res.status(400).json({message:'Provider payment does not match this order.'});
  await markIntentPaid(intent,paymentId,providerPayment.status);
  return res.json({ok:true,status:intent.status,paid:intent.status==='PAID',invoiceId:intent.invoice||null,message:intent.status==='PAID'?'Payment verified by provider.':'Payment is not captured yet; waiting for provider confirmation.'});
 }catch(e){next(e);}
});
app.post('/api/webhooks/razorpay', async(req,res,next)=>{
 try {
  const signature=String(req.get('x-razorpay-signature')||'');if(!verifyWebhookSignature(req.rawBody,signature,RAZORPAY_WEBHOOK_SECRET))return res.status(400).json({message:'Invalid webhook signature.'});
  const eventId=String(req.get('x-razorpay-event-id')||'').trim();if(!eventId)return res.status(400).json({message:'Missing webhook event id.'});
  const event=req.body?.event||'unknown';
  let webhookRecord;try{webhookRecord=await RazorpayWebhookEvent.create({eventId,event,outcome:'RECEIVED'});}catch(e){if(e.code!==11000)throw e;webhookRecord=await RazorpayWebhookEvent.findOne({eventId});if(webhookRecord?.outcome==='PROCESSED')return res.status(200).json({ok:true,duplicate:true});if(!webhookRecord)return res.status(503).json({message:'Webhook event could not be checked safely.'});webhookRecord.outcome='RETRYING';await webhookRecord.save();}
  try {
   if(event==='payment.captured'||event==='order.paid'){
    const entity=event==='order.paid'?req.body?.payload?.order?.entity:req.body?.payload?.payment?.entity;
    const payment=event==='order.paid'?req.body?.payload?.payment?.entity:entity;
    const orderId=payment?.order_id||entity?.id;const paymentId=payment?.id;const status=payment?.status||'captured';
    if(orderId&&paymentId){const intent=await PaymentIntent.findOne({razorpayOrderId:orderId});if(intent&&Number(payment.amount)===amountToPaise(intent.amount)&&payment.currency==='INR')await markIntentPaid(intent,paymentId,status);}
   } else if(event==='payment.failed'){
    const payment=req.body?.payload?.payment?.entity; if(payment?.order_id){await PaymentIntent.updateOne({razorpayOrderId:payment.order_id,status:{$nin:['PAID','REFUNDED']}},{$set:{status:'FAILED',providerStatus:payment.status||'failed',failureReason:String(payment.error_description||'Payment failed').slice(0,300)}});}
   } else if(event==='refund.processed'){
    const refund=req.body?.payload?.refund?.entity;const paymentId=refund?.payment_id;if(paymentId){await Payment.updateOne({transactionId:paymentId},{$set:{status:'REFUNDED'}});await PaymentIntent.updateOne({razorpayPaymentId:paymentId},{$set:{status:'REFUNDED'}});await Invoice.updateOne({transactionReference:paymentId},{$set:{status:'REFUNDED'}});}
   }
   await RazorpayWebhookEvent.updateOne({eventId},{$set:{processedAt:new Date(),outcome:'PROCESSED'}});
  }catch(e){await RazorpayWebhookEvent.updateOne({eventId},{$set:{outcome:'PROCESSING_ERROR'}});throw e;}
  res.json({ok:true});
 }catch(e){next(e);}
});
app.post('/api/manager/payments/reconcile/:id', requireAdmin, async(req,res,next)=>{
 try{const intent=await PaymentIntent.findById(req.params.id);if(!intent)return res.status(404).json({message:'Payment intent not found.'});if(!intent.razorpayOrderId)return res.status(409).json({message:'Intent has no provider order ID; inspect provider dashboard manually.'});
  const rpOrder=await razorpayRequest(`/orders/${encodeURIComponent(intent.razorpayOrderId)}`);const payments=await razorpayRequest(`/orders/${encodeURIComponent(intent.razorpayOrderId)}/payments`);let paid=false;
  for(const p of (payments.items||[])){if(p.status==='captured'&&Number(p.amount)===amountToPaise(intent.amount)&&p.currency==='INR'){await markIntentPaid(intent,p.id,p.status);paid=true;break;}}
  if(!paid&&['PAID','AUTHORIZED'].includes(intent.status)&&!['paid','captured'].includes(rpOrder.status)){intent.status='RECONCILIATION_REQUIRED';await intent.save();}
  intent.lastReconciledAt=new Date();await intent.save();res.json({intentId:intent._id,status:intent.status,providerOrderStatus:rpOrder.status,providerPaymentCount:(payments.items||[]).length,reconciledAt:intent.lastReconciledAt});
 }catch(e){next(e);}
});
app.get('/api/manager/payment-intents',requireAdmin,async(req,res)=>res.json(dbReady?await PaymentIntent.find().populate('customer','name email').populate('invoice','invoiceId status total').sort({createdAt:-1}).limit(200).lean():[]));
app.post('/api/customer/tickets',requireCustomer,async(req,res)=>{if(!dbReady)return res.status(503).json({message:'Support is temporarily unavailable.'}); if(!req.body.subject||!req.body.message)return res.status(400).json({message:'Subject and message are required.'}); if(!['WEBSITE','SOFTWARE','PAYMENT','DOMAIN','HOSTING','BUG','BILLING','OTHER'].includes(String(req.body.category||'OTHER').toUpperCase()))return res.status(400).json({message:'Invalid support category.'}); const t=await Ticket.create({ticketId:await ticketId(),customer:req.auth.sub,subject:String(req.body.subject).trim(),category:req.body.category||'GENERAL',priority:req.body.priority||'NORMAL',message:String(req.body.message).trim(),messages:[{senderType:'customer',sender:req.auth.sub,message:String(req.body.message).trim()}]}); return res.status(201).json(t);});
app.post('/api/customer/tickets/:id/messages',requireCustomer,async(req,res)=>{const t=await Ticket.findOne({_id:req.params.id,customer:req.auth.sub});if(!t)return res.status(404).json({message:'Ticket not found.'});if(!req.body.message)return res.status(400).json({message:'Message is required.'});t.messages.push({senderType:'customer',sender:req.auth.sub,message:String(req.body.message).trim()});t.status='OPEN';await t.save();res.json(t);});
app.get('/api/customer/approvals',requireCustomer,async(req,res)=>res.json(await Approval.find({customer:req.auth.sub}).populate('project','name projectId').sort({createdAt:-1})));
app.post('/api/customer/approvals/:id/respond',requireCustomer,async(req,res)=>{const status=req.body.status==='APPROVED'?'APPROVED':'CHANGES_REQUESTED';const a=await Approval.findOneAndUpdate({_id:req.params.id,customer:req.auth.sub,status:'PENDING'},{status,comment:String(req.body.comment||'').trim(),actedAt:new Date()},{new:true});if(!a)return res.status(404).json({message:'Approval request not found.'});res.json(a);});
app.get('/api/customer/documents',requireCustomer,async(req,res)=>res.json(await Document.find({customer:req.auth.sub}).populate('project','name').sort({createdAt:-1})));
app.get('/api/customer/privacy/requests',requireCustomer,async(req,res)=>res.json(await PrivacyRequest.find({customer:req.auth.sub}).sort({createdAt:-1})));
app.post('/api/customer/privacy/requests',requireCustomer,async(req,res)=>{if(!['ACCESS','CORRECTION','DELETION','WITHDRAW_CONSENT','COMPLAINT'].includes(req.body.type))return res.status(400).json({message:'Invalid privacy request type.'});const r=await PrivacyRequest.create({requestId:id('PRV'),customer:req.auth.sub,type:req.body.type,details:req.body.details||''});res.status(201).json(r);});
app.get('/api/customer/consents',requireCustomer,async(req,res)=>res.json(await Consent.find({customer:req.auth.sub}).sort({createdAt:-1})));
app.post('/api/customer/consents',requireCustomer,async(req,res)=>{if(!req.body.type||!req.body.version)return res.status(400).json({message:'Consent type and version are required.'});const c=await Consent.create({customer:req.auth.sub,type:req.body.type,version:req.body.version,granted:req.body.granted!==false,source:'customer-portal',grantedAt:req.body.granted!==false?new Date():null,withdrawnAt:req.body.granted===false?new Date():null});res.status(201).json(c);});
app.get('/api/customer/profile/export',requireCustomer,async(req,res)=>{const c=await Customer.findById(req.auth.sub).select('-passwordHash');const [orders,projects,quotes,invoices,payments,tickets,consents,privacy]=await Promise.all([Order.find({customer:req.auth.sub}),Project.find({customer:req.auth.sub}),Quote.find({customer:req.auth.sub}),Invoice.find({customer:req.auth.sub}),Payment.find({customer:req.auth.sub}),Ticket.find({customer:req.auth.sub}),Consent.find({customer:req.auth.sub}),PrivacyRequest.find({customer:req.auth.sub})]);res.json({exportedAt:new Date().toISOString(),customer:c,orders,projects,quotes,invoices,payments,tickets,consents,privacyRequests:privacy});});

app.get('/api/manager/workflow', requireAdmin, async (req,res)=>{const stages=['NEW LEAD','QUALIFIED','QUOTE','PROPOSAL','ACCEPTED','CONTRACT','PAYMENT','PROJECT','DELIVERY','APPROVAL','COMPLETED','MAINTENANCE'];const [leads,orders,projects,payments,invoices]=await Promise.all([Lead.find().populate('customer','name email company').sort({createdAt:-1}),Order.find().populate('customer','name email company').sort({createdAt:-1}),Project.find().populate('customer','name email company').sort({createdAt:-1}),Payment.find().sort({createdAt:-1}),Invoice.find().sort({createdAt:-1})]);res.json({stages,leads,orders,projects,payments,invoices});});
app.get('/api/manager/contracts/templates',requireManager,async(req,res)=>res.json(await ContractTemplate.find().sort({createdAt:1})));
app.put('/api/manager/contracts/templates/:id',requireManager,async(req,res)=>{const t=await ContractTemplate.findByIdAndUpdate(req.params.id,req.body,{new:true});if(!t)return res.status(404).json({message:'Template not found.'});res.json(t);});
app.get('/api/manager/contracts',requireManager,async(req,res)=>res.json(await Contract.find().populate('customer','name email company').populate('project','name projectId').populate('template','name code').sort({createdAt:-1})));
app.post('/api/manager/contracts',requireManager,async(req,res)=>{const t=await ContractTemplate.findById(req.body.template);if(!t)return res.status(404).json({message:'Contract template not found.'});const customer=await Customer.findById(req.body.customer);if(!customer)return res.status(400).json({message:'Customer is required.'});const c=await Contract.create({contractId:id('CTR'),template:t._id,customer:customer._id,project:req.body.project||null,title:req.body.title||t.name,customerDetails:{name:customer.name,email:customer.email,phone:customer.phone,company:customer.company,address:req.body.address||''},scope:req.body.scope||t.scope,price:Number(req.body.price||0),priceLabel:req.body.priceLabel||t.priceLabel,milestones:req.body.milestones||t.milestones,timeline:req.body.timeline||t.timeline,deliverables:req.body.deliverables||t.deliverables,ip:req.body.ip||t.ip,support:req.body.support||t.support,acceptance:req.body.acceptance||t.acceptance,termination:req.body.termination||t.termination,status:req.body.status||'SENT'});await Notification.create({recipientType:'customer',recipient:customer._id,title:'New contract ready',message:`${c.title} is available for your review.`,link:'/account'});res.status(201).json(c);});
app.put('/api/manager/contracts/:id',requireManager,async(req,res)=>{const c=await Contract.findByIdAndUpdate(req.params.id,req.body,{new:true});if(!c)return res.status(404).json({message:'Contract not found.'});res.json(c);});

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
app.post('/api/manager/projects', requireManager, async (req, res) => { if (!dbReady) return res.status(503).json({ message: 'Database is not connected.' }); if (!req.body.name) return res.status(400).json({ message: 'Project name is required.' }); const p = await Project.create({ projectId: id('PRJ'), customer: req.body.customer, name: req.body.name, description: req.body.description, value: Number(req.body.value || 0), status: req.body.status || 'PLANNING', progress: Number(req.body.progress || 0), startDate: req.body.startDate || null, dueDate: req.body.dueDate || null, notes: req.body.notes }); if (p.customer) await Notification.create({ recipientType: 'customer', recipient: p.customer, title: 'New project', message: `Your project “${p.name}” is now available in your account.`, link: '/account' }); res.status(201).json(p); });
app.put('/api/manager/projects/:id', requireManager, async (req, res) => { const p = await Project.findByIdAndUpdate(req.params.id, { $set: { name: req.body.name, description: req.body.description, status: req.body.status, progress: Number(req.body.progress || 0), value: Number(req.body.value || 0), startDate: req.body.startDate || null, dueDate: req.body.dueDate || null, notes: req.body.notes } }, { new: true }).populate('customer', 'name email'); res.json(p); });
app.get('/api/manager/quotes', requireManager, async (req, res) => res.json(dbReady ? await Quote.find().populate('customer', 'name email').populate('project', 'name').sort({ createdAt: -1 }) : []));
app.post('/api/manager/quotes', requireManager, async (req, res) => { if (!dbReady) return res.status(503).json({ message: 'Database is not connected.' }); const items = Array.isArray(req.body.items) ? req.body.items : []; if (!validItems(items)) return res.status(400).json({ message: 'At least one valid quotation item is required.' }); const totals = calc(items, req.body.discount, req.body.gst); const q = await Quote.create({ quoteId: id('QUO'), customer: req.body.customer, project: req.body.project || null, items, discount: Number(req.body.discount || 0), gst: Number(req.body.gst ?? 18), ...totals, status: req.body.status || 'SENT', validUntil: req.body.validUntil || null, notes: req.body.notes }); if (q.customer) await Notification.create({ recipientType: 'customer', recipient: q.customer, title: 'New quotation', message: `Quotation ${q.quoteId} is ready to review.`, link: '/account' }); res.status(201).json(q); });
app.put('/api/manager/quotes/:id', requireManager, async (req, res) => { const totals = calc(req.body.items || [], req.body.discount, req.body.gst); const q = await Quote.findByIdAndUpdate(req.params.id, { $set: { items: req.body.items || [], discount: Number(req.body.discount || 0), gst: Number(req.body.gst ?? 18), ...totals, status: req.body.status, validUntil: req.body.validUntil || null, notes: req.body.notes } }, { new: true }); res.json(q); });
app.post('/api/customer/quotes/:id/respond', requireCustomer, async (req, res) => { const q = await Quote.findOneAndUpdate({ _id: req.params.id, customer: req.auth.sub }, { status: req.body.status === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED' }, { new: true }); if (!q) return res.status(404).json({ message: 'Quotation not found.' }); res.json(q); });
app.get('/api/manager/invoices', requireAdmin, async (req, res) => res.json(dbReady ? await Invoice.find().populate('customer', 'name email').populate('project', 'name').sort({ createdAt: -1 }) : []));
app.post('/api/manager/invoices', requireAdmin, async (req, res) => { if (!dbReady) return res.status(503).json({ message: 'Database is not connected.' }); const items = Array.isArray(req.body.items) ? req.body.items.map(x=>({...x,rate:finiteNumber(x.rate ?? x.price,0),price:finiteNumber(x.rate ?? x.price,0),quantity:finiteNumber(x.quantity,1),taxRate:finiteNumber(x.taxRate,0)})) : []; if (!validItems(items)) return res.status(400).json({ message: 'At least one valid invoice item is required.' }); const totals = calc(items, req.body.discount, req.body.gst); const taxAmount=Math.round(Math.max(0, totals.total-(totals.subtotal-Math.min(Math.max(0,finiteNumber(req.body.discount,0)),totals.subtotal)))*100)/100; const existingCustomer=req.body.customer?await Customer.findById(req.body.customer).select('name email phone company'):null; const customerBilling={name:existingCustomer?.name||'',company:existingCustomer?.company||'',email:existingCustomer?.email||'',phone:existingCustomer?.phone||'',...(req.body.customerBilling||{})}; const i = await Invoice.create({ invoiceId: id('INV'), invoiceDate:req.body.invoiceDate||new Date(), customer: req.body.customer || null, project: req.body.project || null, businessDetails:req.body.businessDetails||{}, customerBilling, items, discount: Number(req.body.discount || 0), gst: Number(req.body.gst ?? 18), taxAmount, ...totals, status: req.body.status || 'UNPAID', paymentMethod:req.body.paymentMethod, transactionReference:req.body.transactionReference, dueDate: req.body.dueDate || null, paymentTerms:req.body.paymentTerms, notes:req.body.notes }); if (i.customer) await Notification.create({ recipientType: 'customer', recipient: i.customer, title: 'New invoice', message: `Invoice ${i.invoiceId} is available in your account.`, link: '/account' }); res.status(201).json(i); });
app.get('/api/manager/payments', requireAdmin, async (req, res) => res.json(dbReady ? await Payment.find().populate('customer', 'name email').populate('project', 'name').sort({ createdAt: -1 }) : []));
app.post('/api/manager/payments', requireAdmin, async (req, res) => { if (!dbReady) return res.status(503).json({ message: 'Database is not connected.' }); const amount = finiteNumber(req.body.amount, 0); if (amount <= 0) return res.status(400).json({ message: 'Payment amount must be greater than zero.' }); const p = await Payment.create({ transactionId: req.body.transactionId || id('TXN'), customer: req.body.customer, project: req.body.project || null, invoice: req.body.invoice || null, amount, gateway: req.body.gateway || 'Manual', status: req.body.status || 'SUCCESS', paidAt: req.body.paidAt || new Date(), note: req.body.note }); if (p.status === 'SUCCESS' && p.invoice) await Invoice.findByIdAndUpdate(p.invoice, { $set: { status: 'PAID', paymentMethod: p.gateway, transactionReference: p.transactionId } }); if (p.status === 'SUCCESS' && p.customer) await Order.updateMany({ customer: p.customer, status: 'PENDING_PAYMENT' }, { $set: { status: 'PAID' } }); if (p.customer) await Notification.create({ recipientType: 'customer', recipient: p.customer, title: 'Payment confirmed', message: `₹${Number(p.amount).toLocaleString('en-IN')} payment has been recorded. Your dashboard has been updated.`, link: '/account' }); res.status(201).json(p); });

app.get('/api/manager/tickets',requireManager,async(req,res)=>res.json(await Ticket.find().populate('customer','name email company').sort({createdAt:-1})));
app.put('/api/manager/tickets/:id',requireManager,async(req,res)=>{const t=await Ticket.findById(req.params.id);if(!t)return res.status(404).json({message:'Ticket not found.'});if(req.body.status)t.status=req.body.status;if(req.body.message)t.messages.push({senderType:'manager',sender:req.auth.sub,message:String(req.body.message).trim()});await t.save();if(t.customer)await Notification.create({recipientType:'customer',recipient:t.customer,title:`Support update · ${t.ticketId}`,message:'Your support ticket has a new update.',link:'/account'});res.json(t);});
app.get('/api/manager/approvals',requireManager,async(req,res)=>res.json(await Approval.find().populate('customer','name email').populate('project','name projectId').sort({createdAt:-1})));
app.post('/api/manager/approvals',requireManager,async(req,res)=>{if(!req.body.project||!req.body.customer||!req.body.title)return res.status(400).json({message:'Project, customer and title are required.'});const a=await Approval.create({project:req.body.project,customer:req.body.customer,type:req.body.type||'DELIVERABLE',title:req.body.title,version:req.body.version||'1.0'});await Notification.create({recipientType:'customer',recipient:req.body.customer,title:'Approval required',message:`${a.title} is ready for your review.`,link:'/account'});res.status(201).json(a);});
app.get('/api/manager/activity',requireAdmin,async(req,res)=>{const [consents,notifications,privacy]=await Promise.all([Consent.find().populate('customer','name email company').sort({createdAt:-1}).limit(100),Notification.find().sort({createdAt:-1}).limit(100),PrivacyRequest.find().populate('customer','name email company').sort({createdAt:-1}).limit(100)]);res.json({consents,notifications,privacy});});
app.get('/api/manager/privacy/requests',requireAdmin,async(req,res)=>res.json(await PrivacyRequest.find().populate('customer','name email company').sort({createdAt:-1})));
app.put('/api/manager/privacy/requests/:id',requireAdmin,async(req,res)=>{const r=await PrivacyRequest.findByIdAndUpdate(req.params.id,{$set:{status:req.body.status,response:req.body.response,resolvedAt:['COMPLETED','REJECTED'].includes(req.body.status)?new Date():null}},{new:true});if(!r)return res.status(404).json({message:'Privacy request not found.'});res.json(r);});
app.get('/api/manager/orders',requireAdmin,async(req,res)=>res.json(await Order.find().populate('customer','name email company').sort({createdAt:-1})));
app.put('/api/manager/orders/:id',requireAdmin,async(req,res)=>{const o=await Order.findByIdAndUpdate(req.params.id,{$set:{status:req.body.status,notes:req.body.notes}},{new:true});if(!o)return res.status(404).json({message:'Order not found.'});if(o.customer)await Notification.create({recipientType:'customer',recipient:o.customer,title:`Order ${o.orderId} updated`,message:`Your order is now ${o.status}.`,link:'/account'});res.json(o);});
app.get('/api/manager/documents',requireManager,async(req,res)=>res.json(await Document.find().populate('customer','name email').populate('project','name').sort({createdAt:-1})));
app.post('/api/manager/documents',requireManager,async(req,res)=>{const d=await Document.create({documentId:id('DOC'),customer:req.body.customer,project:req.body.project||null,name:req.body.name,type:req.body.type||'OTHER',url:req.body.url,version:req.body.version||'1.0',createdBy:req.auth.username});if(d.customer)await Notification.create({recipientType:'customer',recipient:d.customer,title:'New document',message:`${d.name} is available in your account.`,link:'/account'});res.status(201).json(d);});

// ---------- Service catalogue ----------
app.get('/api/manager/catalogue', requireManager, async (req,res)=>res.json(await ServicePackage.find().sort({order:1,createdAt:-1})));
app.post('/api/manager/catalogue', requireManager, async (req,res)=>{ const d={...req.body,price:Number(req.body.price||0),bookingAmount:Number(req.body.bookingAmount||499),order:Number(req.body.order||0),active:req.body.active!==false,billingType:req.body.billingType||'ONE_TIME',startingAt:!!req.body.startingAt,features:cleanArray(req.body.features)}; if(!d.code||!d.name||d.price<0)return res.status(400).json({message:'Code, name and valid price are required.'}); res.status(201).json(await ServicePackage.create(d)); });
app.put('/api/manager/catalogue/:id', requireManager, async (req,res)=>{ const d={...req.body}; if(d.price!==undefined)d.price=Number(d.price); if(d.order!==undefined)d.order=Number(d.order); if(d.features!==undefined)d.features=cleanArray(d.features); if(d.active!==undefined)d.active=d.active==='true'||d.active===true; if(d.startingAt!==undefined)d.startingAt=d.startingAt==='true'||d.startingAt===true; const x=await ServicePackage.findByIdAndUpdate(req.params.id,d,{new:true}); if(!x)return res.status(404).json({message:'Catalogue item not found.'}); res.json(x); });
app.delete('/api/manager/catalogue/:id', requireManager, async (req,res)=>{await ServicePackage.findByIdAndDelete(req.params.id);res.json({ok:true});});

// ---------- CMS generic CRUD ----------
const cms = { services: Service, portfolio: Portfolio, testimonials: Testimonial, faq: FAQ, banners: Banner };
for (const [key, Model] of Object.entries(cms)) {
  app.get(`/api/manager/${key}`, requireManager, async (req, res) => res.json(await Model.find().sort({ order: 1, createdAt: -1 })));
  app.post(`/api/manager/${key}`, requireManager, async (req, res) => { const d = { ...req.body }; if (key === 'services' || key === 'portfolio') { d.features = cleanArray(d.features); d.technologies = cleanArray(d.technologies); d.media = cleanArray(d.media); d.results = cleanArray(d.results); } if (key === 'services') { d.slug = d.slug || slugify(d.title); d.deliverables = cleanArray(d.deliverables); d.designTypes = cleanArray(d.designTypes); d.offers = cleanArray(d.offers); d.packages = cleanPackages(d.packages); } const item = await Model.create(d); res.status(201).json(item); });
  app.put(`/api/manager/${key}/:id`, requireManager, async (req, res) => { const d = { ...req.body }; if (key === 'services' || key === 'portfolio') { d.features = cleanArray(d.features); d.technologies = cleanArray(d.technologies); d.media = cleanArray(d.media); d.results = cleanArray(d.results); } if (key === 'services') { d.slug = d.slug || slugify(d.title); d.deliverables = cleanArray(d.deliverables); d.designTypes = cleanArray(d.designTypes); d.offers = cleanArray(d.offers); d.packages = cleanPackages(d.packages); } const item = await Model.findByIdAndUpdate(req.params.id, d, { new: true }); if (!item) return res.status(404).json({ message: 'Item not found.' }); res.json(item); });
  app.delete(`/api/manager/${key}/:id`, requireManager, async (req, res) => { await Model.findByIdAndDelete(req.params.id); res.json({ ok: true }); });
}
app.get('/api/manager/site', requireManager, async (req, res) => res.json(await Site.findOne({ key: 'main' }) || {}));
app.put('/api/manager/site', requireManager, async (req, res) => res.json(await Site.findOneAndUpdate({ key: 'main' }, { $set: { ...req.body, key: 'main' } }, { upsert: true, new: true })));

// ---------- Error / start ----------
app.use('/api', notFound);
app.use(errorHandler);
app.listen(PORT, '0.0.0.0', () => logger.info('server_started', { port: PORT, environment: CONFIG.nodeEnv }));
