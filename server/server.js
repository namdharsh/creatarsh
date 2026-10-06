require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 5000);
const ROOT = path.join(__dirname, '..');
const CUSTOMER_DIR = path.join(ROOT, 'customer');
const MANAGER_DIR = path.join(ROOT, 'manager');
const JWT_SECRET = process.env.MANAGER_JWT_SECRET || process.env.JWT_SECRET;
const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || JWT_SECRET;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const RAZORPAY_API = 'https://api.razorpay.com/v1';
if (IS_PRODUCTION && (!JWT_SECRET || !CUSTOMER_JWT_SECRET)) {
  throw new Error('MANAGER_JWT_SECRET and CUSTOMER_JWT_SECRET must be configured in production.');
}
const corsOrigins = String(process.env.CORS_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false, referrerPolicy: { policy: 'strict-origin-when-cross-origin' } }));
app.use(cors({ origin(origin, callback) {
  // Public/customer API uses bearer tokens rather than credentialed cookies.
  // Allow the Creatarsh frontend even when it is deployed separately from the API.
  if (!origin || corsOrigins.length === 0 || corsOrigins.includes(origin) || origin.endsWith('.vercel.app') || origin.endsWith('.pages.dev') || origin.endsWith('.github.io')) return callback(null, true);
  return callback(new Error('CORS origin not allowed'));
}, credentials: false }));
app.use(express.json({ limit: '8mb', verify: (req, res, buf) => { if (req.originalUrl === '/api/webhooks/razorpay') req.rawBody = Buffer.from(buf); } }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

// Serve the customer website and manager assets from the same Express service.
// This keeps CSS/JS/images available when the API and web app are deployed together.
app.use('/customer', express.static(CUSTOMER_DIR, { extensions: ['html'] }));
// Root aliases keep the same customer HTML files working when Express serves the site at /.
app.use('/assets', express.static(path.join(CUSTOMER_DIR, 'assets')));
app.use('/css', express.static(path.join(CUSTOMER_DIR, 'css')));
app.use('/js', express.static(path.join(CUSTOMER_DIR, 'js')));
app.use('/manager', express.static(MANAGER_DIR, { extensions: ['html'] }));
app.get('/robots.txt', (req, res) => res.sendFile(path.join(ROOT, 'robots.txt')));
app.get('/sitemap.xml', (req, res) => res.sendFile(path.join(ROOT, 'sitemap.xml')));
app.get('/', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'register.html')));
app.get('/account', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'account.html')));
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

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
app.use('/api/', limiter);

// ---------- Models ----------
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
const servicePackageSchema = new mongoose.Schema({ code: { type: String, unique: true, index: true }, name: { type: String, required: true }, price: { type: Number, required: true }, description: String, features: [String], category: String, active: { type: Boolean, default: true }, order: { type: Number, default: 0 }, billingType: { type: String, default: 'ONE_TIME' }, startingAt: { type: Boolean, default: false } }, { timestamps: true });
const paymentSchema = new mongoose.Schema({ transactionId: { type: String, index: true }, customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' }, invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }, amount: { type: Number, required: true }, gateway: String, status: { type: String, default: 'SUCCESS' }, paidAt: Date, note: String }, { timestamps: true });
const notificationSchema = new mongoose.Schema({ recipientType: { type: String, enum: ['customer', 'manager'] }, recipient: mongoose.Schema.Types.ObjectId, title: String, message: String, read: { type: Boolean, default: false }, link: String }, { timestamps: true });
const ticketSchema = new mongoose.Schema({ ticketId:{type:String,unique:true,index:true}, customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'}, subject:{type:String,required:true,trim:true}, category:{type:String,default:'GENERAL'}, priority:{type:String,default:'NORMAL'}, message:{type:String,required:true}, status:{type:String,default:'OPEN'}, messages:[{senderType:String,sender:mongoose.Schema.Types.ObjectId,message:String,createdAt:{type:Date,default:Date.now}}] },{timestamps:true});
const consentSchema = new mongoose.Schema({ customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'}, type:String, version:String, granted:Boolean, source:String, grantedAt:Date, withdrawnAt:Date, ip:String },{timestamps:true});
const privacyRequestSchema = new mongoose.Schema({ requestId:{type:String,unique:true,index:true}, customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'}, type:String, details:String, status:{type:String,default:'SUBMITTED'}, response:String, resolvedAt:Date },{timestamps:true});
const orderSchema = new mongoose.Schema({ orderId:{type:String,unique:true,index:true}, customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'}, productType:String, productName:String, amount:{type:Number,required:true}, status:{type:String,default:'PENDING_PAYMENT'}, business:{type:String}, requirements:String, acceptedTermsVersion:String, privacyNoticeVersion:String, notes:String, razorpayOrderId:String, razorpayPaymentId:String, razorpaySignature:String },{timestamps:true});
const approvalSchema = new mongoose.Schema({ project:{type:mongoose.Schema.Types.ObjectId,ref:'Project'}, customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'}, type:String, title:String, version:String, status:{type:String,default:'PENDING'}, comment:String, actedAt:Date },{timestamps:true});
const documentSchema = new mongoose.Schema({ documentId:{type:String,unique:true,index:true}, customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'}, project:{type:mongoose.Schema.Types.ObjectId,ref:'Project'}, name:String, type:String, url:String, version:String, visibility:{type:String,default:'CUSTOMER'}, createdBy:String },{timestamps:true});
const counterSchema = new mongoose.Schema({ key:{type:String,unique:true}, value:{type:Number,default:0} });

const Service = mongoose.model('Service', serviceSchema); const Portfolio = mongoose.model('Portfolio', portfolioSchema);
const Testimonial = mongoose.model('Testimonial', testimonialSchema); const FAQ = mongoose.model('FAQ', faqSchema); const Banner = mongoose.model('Banner', bannerSchema);
const Site = mongoose.model('Site', siteSchema); const ServicePackage = mongoose.model('ServicePackage', servicePackageSchema); const Manager = mongoose.model('Manager', managerSchema); const Customer = mongoose.model('Customer', customerSchema);
const Counter = mongoose.model('Counter', counterSchema); const Lead = mongoose.model('Lead', leadSchema); const ContractTemplate = mongoose.model('ContractTemplate', contractTemplateSchema); const Contract = mongoose.model('Contract', contractSchema); const Project = mongoose.model('Project', projectSchema); const Quote = mongoose.model('Quote', quoteSchema); const Invoice = mongoose.model('Invoice', invoiceSchema); const Payment = mongoose.model('Payment', paymentSchema); const Notification = mongoose.model('Notification', notificationSchema); const Ticket = mongoose.model('Ticket', ticketSchema); const Consent = mongoose.model('Consent', consentSchema); const PrivacyRequest = mongoose.model('PrivacyRequest', privacyRequestSchema); const Order = mongoose.model('Order', orderSchema); const Approval = mongoose.model('Approval', approvalSchema); const Document = mongoose.model('Document', documentSchema);

let dbReady = false;
mongoose.connection.on('connected', () => { dbReady = true; console.log('MongoDB connected'); });
mongoose.connection.on('disconnected', () => { dbReady = false; console.warn('MongoDB disconnected'); });
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI).catch(err => console.error('MongoDB connection failed:', err.message));
} else console.warn('MONGODB_URI is not configured. Database features will be unavailable.');

// ---------- Utilities ----------
function cleanArray(v) { return Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : []; }
function slugify(v) { return String(v || '').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function cleanPackages(v) { return Array.isArray(v) ? v.map(x => ({ name:String(x?.name||'').trim(), price:String(x?.price||'').trim(), description:String(x?.description||'').trim(), features:cleanArray(x?.features), popular:!!x?.popular })).filter(x=>x.name) : []; }
function id(prefix) { return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`; }
async function ticketId(){const c=await Counter.findOneAndUpdate({key:'support-ticket'},{$inc:{value:1}},{upsert:true,new:true,setDefaultsOnInsert:true});return `CR-TKT-${String(c.value).padStart(4,'0')}`;}
function tokenFrom(req) { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7).trim() : null; }
function signManager(m) { return jwt.sign({ sub: String(m._id), username: m.username, role: m.role || 'manager', type: 'manager' }, JWT_SECRET, { expiresIn: process.env.MANAGER_JWT_EXPIRES || '90d' }); }
function signCustomer(c) { return jwt.sign({ sub: String(c._id), email: c.email, type: 'customer' }, CUSTOMER_JWT_SECRET, { expiresIn: process.env.CUSTOMER_JWT_EXPIRES || '90d' }); }
function verifyToken(req, type) { const token = tokenFrom(req); if (!token) throw new Error('NO_TOKEN'); const secret = type === 'manager' ? JWT_SECRET : CUSTOMER_JWT_SECRET; const payload = jwt.verify(token, secret); if (payload.type !== type) throw new Error('WRONG_TYPE'); return payload; }
async function requireManager(req, res, next) { try { req.auth = verifyToken(req, 'manager'); next(); } catch (e) { res.status(401).json({ message: 'Manager session expired. Please sign in again.', code: 'AUTH_REQUIRED' }); } }
async function requireCustomer(req, res, next) { try { req.auth = verifyToken(req, 'customer'); if (dbReady) { const c = await Customer.findById(req.auth.sub).select('_id active'); if (!c || !c.active) throw new Error('CUSTOMER_DISABLED'); } next(); } catch (e) { res.status(401).json({ message: 'Customer session expired. Please sign in again.', code: 'AUTH_REQUIRED' }); } }
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
    {code:'PRESENCE_499',name:'Online Presence Starter',price:499,description:'A clean one-page business website.',features:['Responsive website','Business information','WhatsApp & Maps','Basic SEO','SSL/deployment','1 revision'],category:'Website',order:1},
    {code:'BUSINESS_1499',name:'Business Website',price:1499,description:'A practical multi-page business website.',features:['Up to 5 pages','Contact form','Social links','Basic SEO','3 revisions'],category:'Website',order:2},
    {code:'PRO_2999',name:'Professional Website',price:2999,description:'Premium custom website for growing businesses.',features:['Up to 8 pages','Premium responsive design','Gallery/testimonials','SEO','5 revisions'],category:'Website',order:3},
    {code:'DIGITAL_7999',name:'Business Digital Setup',price:7999,description:'Website plus essential digital setup.',features:['Professional website','Domain/hosting setup','WhatsApp','Google Business assistance','Analytics','30-day support'],category:'Digital Setup',order:4},
    {code:'GROWTH_14999',name:'Business Growth',price:14999,description:'Conversion-focused digital presence.',features:['Premium website','Advanced SEO','Lead workflow','WhatsApp automation','Analytics','60-day support'],category:'Growth',order:5},
    {code:'SOFTWARE_49999',name:'Custom Business Software',price:49999,description:'Custom business software starting at this price.',features:['Custom workflows','Dashboard','Database/API','Deployment planning'],category:'Software',order:6,startingAt:true},
    {code:'ERP_75000',name:'School ERP',price:75000,description:'School management platform starting package.',features:['Core ERP','Admin/teacher/parent/student workflows','Reports','Deployment planning'],category:'ERP',order:7,startingAt:true},
    {code:'CARE_499',name:'Monthly Care Plan · ₹499',price:499,description:'Essential monthly website care.',features:['Minor content updates','Basic monitoring','Routine maintenance'],category:'Monthly Care',order:8,billingType:'MONTHLY'},
    {code:'CARE_999',name:'Monthly Care Plan · ₹999',price:999,description:'Standard monthly website care.',features:['Content updates','Monitoring','Routine maintenance','Basic support'],category:'Monthly Care',order:9,billingType:'MONTHLY'},
    {code:'CARE_1999',name:'Monthly Care Plan · ₹1,999',price:1999,description:'Priority monthly website care.',features:['Priority updates','Monitoring','Maintenance','Support','Minor improvements'],category:'Monthly Care',order:10,billingType:'MONTHLY'}
  ]);  if (!await ContractTemplate.countDocuments()) await ContractTemplate.insertMany([
    {code:'SMALL_WEBSITE',name:'Small Website Agreement',category:'Website',priceLabel:'₹499 / ₹1,499 / ₹2,999',description:'Standard agreement for starter, business and professional website packages.',scope:'Website design and development based on the selected package and approved requirements.',milestones:'Requirements & content; design/build; review & revisions; launch.',timeline:'Confirmed after requirements, content and access are received.',deliverables:['Website build','Responsive pages','Configured forms/integrations included in scope','Deployment handover'],ip:'Final paid deliverables are licensed/transferred as stated in the accepted proposal; Creatarsh pre-existing tools and third-party assets remain subject to their rights.',support:'Support follows the selected package and any active care plan.',acceptance:'Customer confirms acceptance in writing or through the customer portal after review.',termination:'Either party may terminate for material breach after reasonable notice; completed work and approved costs remain payable.'},
    {code:'BUSINESS_GROWTH',name:'Business Growth Agreement',category:'Growth',priceLabel:'₹7,999 / ₹14,999',description:'Agreement for Business Digital Setup and Business Growth packages.',scope:'Digital setup, website, analytics, lead workflow and other items listed in the accepted proposal.',milestones:'Discovery; implementation; review; launch; support handover.',timeline:'Set in the accepted proposal based on scope and dependencies.',deliverables:['Website/digital setup','Configured integrations in scope','Analytics/lead workflow where included','Handover and support'],ip:'Final paid custom deliverables are licensed/transferred as specified; third-party and pre-existing materials remain subject to their licenses.',support:'Package support period plus optional monthly care plan.',acceptance:'Acceptance follows customer review or production use with no material defect reported within the agreed review period.',termination:'Termination follows notice/cure where practical; completed work and non-refundable third-party costs remain payable.'},
    {code:'CUSTOM_SOFTWARE',name:'Custom Software Agreement',category:'Software',priceLabel:'₹50,000+',description:'Custom software development agreement for business systems and applications.',scope:'Detailed requirements, modules, integrations and exclusions are defined in the accepted proposal/specification.',milestones:'Discovery/specification; UI/architecture; development; testing; UAT; deployment; handover.',timeline:'Milestone dates are agreed after scope confirmation and may change for client dependencies or approved change requests.',deliverables:['Source/build or agreed deployment','Database/API components in scope','Documentation/handover','Testing and deployment support'],ip:'Ownership/licensing of custom work transfers only after agreed payments; Creatarsh retains rights in pre-existing libraries, generic components and know-how; third-party components remain under their licenses.',support:'Warranty/bug-fix period and ongoing support are defined in the proposal or maintenance plan.',acceptance:'Milestones are accepted after UAT or written approval; changes outside scope use change control.',termination:'Termination is governed by milestone status, payment for completed work, approved expenses and handling of confidential materials.'}
  ]);

}
mongoose.connection.once('connected', () => { seed().catch(err => console.error('Seed failed:', err.message)); });

// ---------- Public API ----------
app.get('/api/health', (req, res) => res.json({ ok: true, database: dbReady, service: 'creatarsh-api' }));
app.get('/api/public/payment-config', (req,res)=>res.json({provider:'razorpay',enabled:Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET),keyId:RAZORPAY_KEY_ID||null,currency:'INR'}));

app.get('/api/public/pricing', async (req,res) => { try { const packages=await ServicePackage.find({active:true}).sort({order:1}); res.json({version:'2026-10',currency:'INR',packages}); } catch(e){ res.status(503).json({message:'Pricing is temporarily unavailable.'}); } });

app.post('/api/public/orders', async (req,res) => { if(!dbReady)return res.status(503).json({message:'Ordering is temporarily unavailable.'}); const b=req.body||{}; if(!b.name||!b.email||!b.productCode||String(b.password||'').length<8||!b.terms||!b.privacy)return res.status(400).json({message:'Name, email, product, password, Terms acceptance and Privacy acknowledgement are required.'}); const product=await ServicePackage.findOne({code:b.productCode,active:true}); if(!product)return res.status(400).json({message:'Invalid product.'}); try{let c=await Customer.findOne({email:String(b.email).trim().toLowerCase()}); if(c)return res.status(409).json({message:'An account with this email already exists. Please sign in first, then place the order from your account.'}); c=await Customer.create({name:String(b.name).trim(),email:String(b.email).trim().toLowerCase(),phone:b.phone,company:b.company,passwordHash:await bcrypt.hash(String(b.password),12),lastLoginAt:new Date()}); const termsVersion=b.termsVersion||'2026-10', privacyVersion=b.privacyVersion||'2026-10'; const o=await Order.create({orderId:id('ORD'),customer:c._id,productType:'SERVICE',productName:product.name,amount:product.price,status:'PENDING_PAYMENT',business:b.company,requirements:b.requirements,acceptedTermsVersion:termsVersion,privacyNoticeVersion:privacyVersion}); await Consent.create({customer:c._id,type:'TERMS',version:termsVersion,granted:true,source:'public-order',grantedAt:new Date()}); await Consent.create({customer:c._id,type:'PRIVACY_NOTICE',version:privacyVersion,granted:true,source:'public-order',grantedAt:new Date()}); if (b.marketingConsent === true || b.marketingConsent === 'true' || b.marketingConsent === 'on') await Consent.create({customer:c._id,type:'MARKETING',version:'2026-10',granted:true,source:'public-order',grantedAt:new Date()}); await Notification.create({recipientType:'customer',recipient:c._id,title:'Order created',message:`Order ${o.orderId} has been created. Your next step is payment/onboarding.`,link:'/account'}); res.status(201).json({orderId:o.orderId,amount:o.amount,customerId:c._id,token:signCustomer(c),customer:{id:c._id,name:c.name,email:c.email,phone:c.phone,company:c.company}});}catch(e){console.error('Order error',e.message);res.status(400).json({message:'Could not create order.'});} });
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

// ---------- Customer contracts & verified payments ----------
app.get('/api/customer/contracts',requireCustomer,async(req,res)=>res.json(await Contract.find({customer:req.auth.sub}).populate('project','name projectId').sort({createdAt:-1})));
app.post('/api/customer/contracts/:id/accept',requireCustomer,async(req,res)=>{const c=await Contract.findOne({_id:req.params.id,customer:req.auth.sub});if(!c)return res.status(404).json({message:'Contract not found.'});if(c.status!=='SENT')return res.status(400).json({message:'This contract is not awaiting acceptance.'});c.status='ACCEPTED';c.acceptedAt=new Date();c.acceptedIp=req.ip;c.save();await Notification.create({recipientType:'customer',recipient:c.customer,title:'Contract accepted',message:`${c.title} has been accepted.`,link:'/account'});res.json(c);});
app.post('/api/customer/payments/razorpay/order',requireCustomer,async(req,res)=>{if(!RAZORPAY_KEY_ID||!RAZORPAY_KEY_SECRET)return res.status(503).json({message:'Razorpay is not configured on the server.'});const requestedAmount=Number(req.body.amount||0);if(requestedAmount<=0)return res.status(400).json({message:'Invalid payment amount.'});const order=await Order.findOne({$or:[{_id:req.body.orderId},{orderId:req.body.orderId}],customer:req.auth.sub}).catch(()=>null);if(!order)return res.status(404).json({message:'Order not found.'});const amount=Math.round(Number(order.amount||0)*100);if(amount<=0)return res.status(400).json({message:'Order amount is invalid.'});if(order.status==='PAID')return res.status(400).json({message:'Order is already paid.'});const rp=await fetch(`${RAZORPAY_API}/orders`,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64'),'Content-Type':'application/json'},body:JSON.stringify({amount,currency:'INR',receipt:order.orderId,payment_capture:1,notes:{orderId:String(order._id)}})});const data=await rp.json();if(!rp.ok)return res.status(502).json({message:data.error?.description||'Could not create Razorpay order.'});order.razorpayOrderId=data.id;await order.save();res.json({keyId:RAZORPAY_KEY_ID,orderId:data.id,amount:data.amount,currency:data.currency,customerId:req.auth.sub});});
app.post('/api/customer/payments/razorpay/verify',requireCustomer,async(req,res)=>{if(!RAZORPAY_KEY_SECRET)return res.status(503).json({message:'Razorpay is not configured on the server.'});const {razorpay_order_id,razorpay_payment_id,razorpay_signature}=req.body||{};if(!razorpay_order_id||!razorpay_payment_id||!razorpay_signature)return res.status(400).json({message:'Incomplete Razorpay verification payload.'});const expected=crypto.createHmac('sha256',RAZORPAY_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');const sig=String(razorpay_signature);if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(sig)))return res.status(400).json({message:'Payment signature verification failed.'});const order=await Order.findOne({razorpayOrderId:razorpay_order_id,customer:req.auth.sub});if(!order)return res.status(404).json({message:'Order not found.'});order.status='PAID';order.razorpayPaymentId=razorpay_payment_id;order.razorpaySignature=razorpay_signature;await order.save();const existing=await Payment.findOne({transactionId:razorpay_payment_id});let payment=existing;if(!payment){payment=await Payment.create({transactionId:razorpay_payment_id,customer:order.customer,amount:order.amount,gateway:'Razorpay',status:'SUCCESS',paidAt:new Date(),note:`Verified against Razorpay order ${razorpay_order_id}`});}let invoice=await Invoice.findOne({customer:order.customer,notes:{$regex:order.orderId,$options:'i'}});if(!invoice){invoice=await Invoice.create({invoiceId:id('INV'),customer:order.customer,invoiceDate:new Date(),businessDetails:{tradeName:'Creatarsh',email:'creatarshbusiness@gmail.com',phone:'7566743098'},customerBilling:{name:(await Customer.findById(order.customer)).name,email:(await Customer.findById(order.customer)).email},items:[{name:order.productName,description:'Creatarsh service purchase',quantity:1,rate:order.amount,price:order.amount,taxRate:0}],subtotal:order.amount,total:order.amount,status:'PAID',paymentMethod:'Razorpay',transactionReference:razorpay_payment_id,notes:`Generated from ${order.orderId}`});}payment.invoice=invoice._id;await payment.save();await Invoice.findByIdAndUpdate(invoice._id,{$set:{status:'PAID',paymentMethod:'Razorpay',transactionReference:razorpay_payment_id}});await Notification.create({recipientType:'customer',recipient:order.customer,title:'Payment confirmed',message:`Payment for ${order.productName} was verified successfully. Invoice ${invoice.invoiceId} is available.`,link:'/account'});res.json({ok:true,order,invoice,payment});});
app.post('/api/webhooks/razorpay', async (req, res) => {
  if (!RAZORPAY_WEBHOOK_SECRET) return res.status(503).json({ message: 'Webhook secret is not configured.' });
  const signature = req.get('X-Razorpay-Signature') || '';
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const expected = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(400).json({ message: 'Invalid webhook signature.' });
  }
  try {
    const event = req.body.event;
    const paymentEntity = req.body.payload?.payment?.entity;
    if (['payment.captured', 'order.paid'].includes(event) && paymentEntity?.id) {
      const existing = await Payment.findOne({ transactionId: paymentEntity.id });
      if (!existing) {
        const order = await Order.findOne({ razorpayOrderId: paymentEntity.order_id });
        if (order) {
          order.status = 'PAID';
          order.razorpayPaymentId = paymentEntity.id;
          await order.save();
          const payment = await Payment.create({
            transactionId: paymentEntity.id,
            customer: order.customer,
            amount: Number(paymentEntity.amount || order.amount * 100) / 100,
            gateway: 'Razorpay',
            status: 'SUCCESS',
            paidAt: new Date(),
            note: `Webhook ${event}`
          });
          let invoice = await Invoice.findOne({ customer: order.customer, notes: { $regex: order.orderId, $options: 'i' } });
          if (!invoice) {
            const c = await Customer.findById(order.customer).select('name email phone company');
            invoice = await Invoice.create({
              invoiceId: id('INV'), customer: order.customer, invoiceDate: new Date(),
              businessDetails: { tradeName: 'Creatarsh', email: 'creatarshbusiness@gmail.com', phone: '7566743098' },
              customerBilling: { name: c?.name || '', company: c?.company || '', email: c?.email || '', phone: c?.phone || '' },
              items: [{ name: order.productName, description: 'Creatarsh service purchase', quantity: 1, rate: order.amount, price: order.amount, taxRate: 0 }],
              subtotal: order.amount, total: order.amount, status: 'PAID', paymentMethod: 'Razorpay',
              transactionReference: paymentEntity.id, notes: `Generated from ${order.orderId}`
            });
          }
          payment.invoice = invoice._id;
          await payment.save();
          await Invoice.findByIdAndUpdate(invoice._id, { $set: { status: 'PAID', paymentMethod: 'Razorpay', transactionReference: paymentEntity.id } });
          await Notification.create({
            recipientType: 'customer', recipient: order.customer,
            title: 'Payment confirmed',
            message: `Payment for ${order.productName} was verified successfully. Invoice ${invoice.invoiceId} is available.`,
            link: '/account'
          });
        }
      }
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('Razorpay webhook processing failed:', e.message);
    return res.status(500).json({ message: 'Webhook received but could not be processed.' });
  }
});

// ---------- Manager APIs ----------
app.get('/api/customer/orders',requireCustomer,async(req,res)=>res.json(await Order.find({customer:req.auth.sub}).sort({createdAt:-1})));
app.get('/api/customer/tickets',requireCustomer,async(req,res)=>res.json(await Ticket.find({customer:req.auth.sub}).sort({createdAt:-1})));
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

app.get('/api/manager/workflow', requireManager, async (req,res)=>{const stages=['NEW LEAD','QUALIFIED','QUOTE','PROPOSAL','ACCEPTED','CONTRACT','PAYMENT','PROJECT','DELIVERY','APPROVAL','COMPLETED','MAINTENANCE'];const [leads,orders,projects,payments,invoices]=await Promise.all([Lead.find().populate('customer','name email company').sort({createdAt:-1}),Order.find().populate('customer','name email company').sort({createdAt:-1}),Project.find().populate('customer','name email company').sort({createdAt:-1}),Payment.find().sort({createdAt:-1}),Invoice.find().sort({createdAt:-1})]);res.json({stages,leads,orders,projects,payments,invoices});});
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
app.get('/api/manager/invoices', requireManager, async (req, res) => res.json(dbReady ? await Invoice.find().populate('customer', 'name email').populate('project', 'name').sort({ createdAt: -1 }) : []));
app.post('/api/manager/invoices', requireManager, async (req, res) => { if (!dbReady) return res.status(503).json({ message: 'Database is not connected.' }); const items = Array.isArray(req.body.items) ? req.body.items.map(x=>({...x,rate:finiteNumber(x.rate ?? x.price,0),price:finiteNumber(x.rate ?? x.price,0),quantity:finiteNumber(x.quantity,1),taxRate:finiteNumber(x.taxRate,0)})) : []; if (!validItems(items)) return res.status(400).json({ message: 'At least one valid invoice item is required.' }); const totals = calc(items, req.body.discount, req.body.gst); const taxAmount=Math.round(Math.max(0, totals.total-(totals.subtotal-Math.min(Math.max(0,finiteNumber(req.body.discount,0)),totals.subtotal)))*100)/100; const existingCustomer=req.body.customer?await Customer.findById(req.body.customer).select('name email phone company'):null; const customerBilling={name:existingCustomer?.name||'',company:existingCustomer?.company||'',email:existingCustomer?.email||'',phone:existingCustomer?.phone||'',...(req.body.customerBilling||{})}; const i = await Invoice.create({ invoiceId: id('INV'), invoiceDate:req.body.invoiceDate||new Date(), customer: req.body.customer || null, project: req.body.project || null, businessDetails:req.body.businessDetails||{}, customerBilling, items, discount: Number(req.body.discount || 0), gst: Number(req.body.gst ?? 18), taxAmount, ...totals, status: req.body.status || 'UNPAID', paymentMethod:req.body.paymentMethod, transactionReference:req.body.transactionReference, dueDate: req.body.dueDate || null, paymentTerms:req.body.paymentTerms, notes:req.body.notes }); if (i.customer) await Notification.create({ recipientType: 'customer', recipient: i.customer, title: 'New invoice', message: `Invoice ${i.invoiceId} is available in your account.`, link: '/account' }); res.status(201).json(i); });
app.get('/api/manager/payments', requireManager, async (req, res) => res.json(dbReady ? await Payment.find().populate('customer', 'name email').populate('project', 'name').sort({ createdAt: -1 }) : []));
app.post('/api/manager/payments', requireManager, async (req, res) => { if (!dbReady) return res.status(503).json({ message: 'Database is not connected.' }); const amount = finiteNumber(req.body.amount, 0); if (amount <= 0) return res.status(400).json({ message: 'Payment amount must be greater than zero.' }); const p = await Payment.create({ transactionId: req.body.transactionId || id('TXN'), customer: req.body.customer, project: req.body.project || null, invoice: req.body.invoice || null, amount, gateway: req.body.gateway || 'Manual', status: req.body.status || 'SUCCESS', paidAt: req.body.paidAt || new Date(), note: req.body.note }); if (p.status === 'SUCCESS' && p.invoice) await Invoice.findByIdAndUpdate(p.invoice, { $set: { status: 'PAID', paymentMethod: p.gateway, transactionReference: p.transactionId } }); if (p.status === 'SUCCESS' && p.customer) await Order.updateMany({ customer: p.customer, status: 'PENDING_PAYMENT' }, { $set: { status: 'PAID' } }); if (p.customer) await Notification.create({ recipientType: 'customer', recipient: p.customer, title: 'Payment confirmed', message: `₹${Number(p.amount).toLocaleString('en-IN')} payment has been recorded. Your dashboard has been updated.`, link: '/account' }); res.status(201).json(p); });

app.get('/api/manager/tickets',requireManager,async(req,res)=>res.json(await Ticket.find().populate('customer','name email company').sort({createdAt:-1})));
app.put('/api/manager/tickets/:id',requireManager,async(req,res)=>{const t=await Ticket.findById(req.params.id);if(!t)return res.status(404).json({message:'Ticket not found.'});if(req.body.status)t.status=req.body.status;if(req.body.message)t.messages.push({senderType:'manager',sender:req.auth.sub,message:String(req.body.message).trim()});await t.save();if(t.customer)await Notification.create({recipientType:'customer',recipient:t.customer,title:`Support update · ${t.ticketId}`,message:'Your support ticket has a new update.',link:'/account'});res.json(t);});
app.get('/api/manager/approvals',requireManager,async(req,res)=>res.json(await Approval.find().populate('customer','name email').populate('project','name projectId').sort({createdAt:-1})));
app.post('/api/manager/approvals',requireManager,async(req,res)=>{if(!req.body.project||!req.body.customer||!req.body.title)return res.status(400).json({message:'Project, customer and title are required.'});const a=await Approval.create({project:req.body.project,customer:req.body.customer,type:req.body.type||'DELIVERABLE',title:req.body.title,version:req.body.version||'1.0'});await Notification.create({recipientType:'customer',recipient:req.body.customer,title:'Approval required',message:`${a.title} is ready for your review.`,link:'/account'});res.status(201).json(a);});
app.get('/api/manager/activity',requireManager,async(req,res)=>{const [consents,notifications,privacy]=await Promise.all([Consent.find().populate('customer','name email company').sort({createdAt:-1}).limit(100),Notification.find().sort({createdAt:-1}).limit(100),PrivacyRequest.find().populate('customer','name email company').sort({createdAt:-1}).limit(100)]);res.json({consents,notifications,privacy});});
app.get('/api/manager/privacy/requests',requireManager,async(req,res)=>res.json(await PrivacyRequest.find().populate('customer','name email company').sort({createdAt:-1})));
app.put('/api/manager/privacy/requests/:id',requireManager,async(req,res)=>{const r=await PrivacyRequest.findByIdAndUpdate(req.params.id,{$set:{status:req.body.status,response:req.body.response,resolvedAt:['COMPLETED','REJECTED'].includes(req.body.status)?new Date():null}},{new:true});if(!r)return res.status(404).json({message:'Privacy request not found.'});res.json(r);});
app.get('/api/manager/orders',requireManager,async(req,res)=>res.json(await Order.find().populate('customer','name email company').sort({createdAt:-1})));
app.put('/api/manager/orders/:id',requireManager,async(req,res)=>{const o=await Order.findByIdAndUpdate(req.params.id,{$set:{status:req.body.status,notes:req.body.notes}},{new:true});if(!o)return res.status(404).json({message:'Order not found.'});if(o.customer)await Notification.create({recipientType:'customer',recipient:o.customer,title:`Order ${o.orderId} updated`,message:`Your order is now ${o.status}.`,link:'/account'});res.json(o);});
app.get('/api/manager/documents',requireManager,async(req,res)=>res.json(await Document.find().populate('customer','name email').populate('project','name').sort({createdAt:-1})));
app.post('/api/manager/documents',requireManager,async(req,res)=>{const d=await Document.create({documentId:id('DOC'),customer:req.body.customer,project:req.body.project||null,name:req.body.name,type:req.body.type||'OTHER',url:req.body.url,version:req.body.version||'1.0',createdBy:req.auth.username});if(d.customer)await Notification.create({recipientType:'customer',recipient:d.customer,title:'New document',message:`${d.name} is available in your account.`,link:'/account'});res.status(201).json(d);});

// ---------- Service catalogue ----------
app.get('/api/manager/catalogue', requireManager, async (req,res)=>res.json(await ServicePackage.find().sort({order:1,createdAt:-1})));
app.post('/api/manager/catalogue', requireManager, async (req,res)=>{ const d={...req.body,price:Number(req.body.price||0),order:Number(req.body.order||0),active:req.body.active!==false,billingType:req.body.billingType||'ONE_TIME',startingAt:!!req.body.startingAt,features:cleanArray(req.body.features)}; if(!d.code||!d.name||d.price<0)return res.status(400).json({message:'Code, name and valid price are required.'}); res.status(201).json(await ServicePackage.create(d)); });
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
app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found.' }));
app.use((err, req, res, next) => {
  console.error('Unhandled request error:', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ message: 'Something went wrong on the server.' });
});
app.listen(PORT, () => console.log(`Creatarsh server running on port ${PORT}`));
