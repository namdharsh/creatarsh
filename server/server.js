require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
let nodemailer = null; try { nodemailer = require('nodemailer'); } catch (_) {}

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
if (IS_PRODUCTION && (!process.env.MANAGER_JWT_SECRET || !process.env.CUSTOMER_JWT_SECRET || process.env.MANAGER_JWT_SECRET === process.env.CUSTOMER_JWT_SECRET)) {
  throw new Error('Configure distinct MANAGER_JWT_SECRET and CUSTOMER_JWT_SECRET values in production.');
}
const corsOrigins = String(process.env.CORS_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);

app.disable('x-powered-by');
// Render/reverse-proxy aware: preserve the real client IP for rate limiting.
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false, referrerPolicy: { policy: 'strict-origin-when-cross-origin' } }));
app.use(cors({ origin(origin, callback) {
  // Public/customer API uses bearer tokens rather than credentialed cookies.
  // Allow the Creatarsh frontend even when it is deployed separately from the API.
  if (!origin || corsOrigins.length === 0 || corsOrigins.includes(origin) || origin.endsWith('.vercel.app') || origin.endsWith('.pages.dev') || origin.endsWith('.github.io')) return callback(null, true);
  return callback(new Error('CORS origin not allowed'));
}, credentials: false }));
app.use(express.json({ limit: '1mb', verify: (req, res, buf) => { if (req.originalUrl === '/api/webhooks/razorpay') req.rawBody = Buffer.from(buf); } }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

// Serve the customer website and manager assets from the same Express service.
// This keeps CSS/JS/images available when the API and web app are deployed together.
app.use('/customer', express.static(CUSTOMER_DIR, { extensions: ['html'] }));
// Root aliases keep the same customer HTML files working when Express serves the site at /.
app.use('/assets', express.static(path.join(CUSTOMER_DIR, 'assets')));
app.use('/css', express.static(path.join(CUSTOMER_DIR, 'css')));
app.use('/js', express.static(path.join(CUSTOMER_DIR, 'js')));
app.get('/manifest.webmanifest', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'manifest.webmanifest')));
app.get('/sw.js', (req, res) => { res.set('Content-Type','application/javascript'); res.sendFile(path.join(CUSTOMER_DIR, 'sw.js')); });
app.use('/manager', express.static(MANAGER_DIR, { extensions: ['html'] }));
app.get('/robots.txt', (req, res) => res.sendFile(path.join(ROOT, 'robots.txt')));
app.get('/sitemap.xml', (req, res) => res.sendFile(path.join(ROOT, 'sitemap.xml')));
app.get('/', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'register.html')));
app.get('/account', (req, res) => res.sendFile(path.join(CUSTOMER_DIR, 'account.html')));
app.get('/forgot-password',(req,res)=>res.sendFile(path.join(CUSTOMER_DIR,'forgot-password.html')));
app.get('/reset-password',(req,res)=>res.sendFile(path.join(CUSTOMER_DIR,'reset-password.html')));
app.get('/verify-email',(req,res)=>res.sendFile(path.join(CUSTOMER_DIR,'verify-email.html')));
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
app.get('/products', (req,res)=>res.sendFile(path.join(CUSTOMER_DIR,'products.html')));
app.get('/products/:slug', (req,res)=>res.sendFile(path.join(CUSTOMER_DIR,'product.html')));
app.get('/manager/saas-catalogue', (req,res)=>res.sendFile(path.join(MANAGER_DIR,'saas-catalogue.html')));
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

// Generous production limits prevent a small agency team/page load from locking itself out.

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
const customerSchema = new mongoose.Schema({ name: { type: String, required: true, trim: true, maxlength: 100 }, email: { type: String, required: true, unique: true, lowercase: true, trim: true }, emailVerifiedAt: Date, phone: String, phoneVerifiedAt: Date, company: String, passwordHash: { type: String, required: true }, active: { type: Boolean, default: true }, lastLoginAt: Date, passwordChangedAt: Date }, { timestamps: true });
const customerSessionSchema = new mongoose.Schema({ customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer',required:true,index:true}, sidHash:{type:String,required:true,unique:true}, userAgent:{type:String,maxlength:300}, ip:String, expiresAt:{type:Date,required:true}, revokedAt:Date, lastSeenAt:Date },{timestamps:true});
customerSessionSchema.index({expiresAt:1},{expireAfterSeconds:0});
const customerTokenSchema = new mongoose.Schema({ customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer',required:true,index:true}, tokenHash:{type:String,required:true,index:true}, purpose:{type:String,enum:['VERIFY_EMAIL','RESET_PASSWORD','VERIFY_PHONE'],required:true}, expiresAt:{type:Date,required:true}, usedAt:Date },{timestamps:true});
customerTokenSchema.index({expiresAt:1},{expireAfterSeconds:0});
const saasSubscriptionSchema = new mongoose.Schema({customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer',required:true,index:true},product:{type:mongoose.Schema.Types.ObjectId,ref:'SaaSProduct',required:true},planCode:{type:String,required:true},status:{type:String,enum:['TRIALING','ACTIVE','PAST_DUE','CANCELLED','SUSPENDED','EXPIRED'],default:'TRIALING',index:true},currentPeriodEnd:Date,trialEndsAt:Date,provider:String,providerSubscriptionId:String},{timestamps:true});
const leadSchema = new mongoose.Schema({ enquiryId: { type: String, unique: true, index: true }, name: String, company: String, email: String, whatsapp: String, projectType: String, budget: String, deadline: String, referenceUrl: String, requirements: String, status: { type: String, default: 'NEW' }, workflowStage: { type: String, enum: ['NEW LEAD','QUALIFIED','QUOTE','PROPOSAL','ACCEPTED','CONTRACT','PAYMENT','PROJECT','DELIVERY','APPROVAL','COMPLETED','MAINTENANCE'], default: 'NEW LEAD' }, notes: String, customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' } }, { timestamps: true });
const projectSchema = new mongoose.Schema({ projectId: { type: String, unique: true, index: true }, customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' }, name: String, description: String, status: { type: String, default: 'PLANNING' }, progress: { type: Number, default: 0, min: 0, max: 100 }, value: { type: Number, default: 0 }, startDate: Date, dueDate: Date, notes: String }, { timestamps: true });
const quoteSchema = new mongoose.Schema({ quoteId: { type: String, unique: true, index: true }, customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' }, items: [{ name: String, quantity: { type: Number, default: 1 }, price: { type: Number, default: 0 } }], discount: { type: Number, default: 0 }, gst: { type: Number, default: 18 }, subtotal: Number, total: Number, status: { type: String, default: 'DRAFT' }, validUntil: Date, notes: String }, { timestamps: true });
const invoiceSchema = new mongoose.Schema({ invoiceId: { type: String, unique: true, index: true }, invoiceDate: { type: Date, default: Date.now }, customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' }, businessDetails: { legalName: String, tradeName: String, gstin: String, address: String, email: String, phone: String }, customerBilling: { name: String, company: String, email: String, phone: String, address: String, gstin: String }, items: [{ name: String, description: String, quantity: { type: Number, default: 1 }, rate: { type: Number, default: 0 }, price: { type: Number, default: 0 }, taxRate: { type: Number, default: 0 } }], subtotal: Number, discount: { type: Number, default: 0 }, gst: { type: Number, default: 18 }, taxAmount: { type: Number, default: 0 }, total: Number, status: { type: String, enum: ['DRAFT','UNPAID','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED','REFUNDED'], default: 'UNPAID' }, paymentMethod: String, transactionReference: String, dueDate: Date, paymentTerms: String, notes: String }, { timestamps: true });
const servicePackageSchema = new mongoose.Schema({ code: { type: String, unique: true, index: true }, name: { type: String, required: true }, price: { type: Number, required: true }, bookingAmount: { type: Number, default: 499 }, description: String, features: [String], category: String, active: { type: Boolean, default: true }, order: { type: Number, default: 0 }, billingType: { type: String, default: 'ONE_TIME' }, startingAt: { type: Boolean, default: false } }, { timestamps: true });
// SaaS storefront catalogue is deliberately separate from legacy agency ServicePackage records.
const saasPlanSchema = new mongoose.Schema({ code:{type:String,required:true,trim:true}, tier:{type:String,enum:['BASIC','MEDIUM','PREMIUM'],required:true}, name:{type:String,required:true,trim:true}, description:String, amount:{type:Number,min:0,required:true}, currency:{type:String,default:'INR',match:/^[A-Z]{3}$/}, interval:{type:String,enum:['MONTH','YEAR'],default:'MONTH'}, trialDays:{type:Number,min:0,max:30,default:3}, features:[String], active:{type:Boolean,default:true}, highlight:{type:Boolean,default:false}, order:{type:Number,default:0} },{_id:true});
const saasProductSchema = new mongoose.Schema({ code:{type:String,required:true,unique:true,index:true,trim:true,uppercase:true}, slug:{type:String,required:true,unique:true,index:true,trim:true,lowercase:true}, name:{type:String,required:true,trim:true}, shortDescription:{type:String,trim:true,maxlength:180}, description:{type:String,trim:true}, valueProposition:String, audience:String, icon:{type:String,default:'✦'}, category:String, status:{type:String,enum:['DRAFT','ACTIVE','ARCHIVED'],default:'DRAFT',index:true}, currency:{type:String,default:'INR',match:/^[A-Z]{3}$/}, plans:{type:[saasPlanSchema],default:[]}, faqs:[{question:String,answer:String}], seo:{title:String,description:String}, order:{type:Number,default:0} },{timestamps:true});
saasProductSchema.index({status:1,order:1,updatedAt:-1});
const paymentSchema = new mongoose.Schema({ transactionId: { type: String, index: true }, customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' }, invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }, amount: { type: Number, required: true }, gateway: String, status: { type: String, default: 'SUCCESS' }, paidAt: Date, note: String }, { timestamps: true });
const notificationSchema = new mongoose.Schema({ recipientType: { type: String, enum: ['customer', 'manager'] }, recipient: mongoose.Schema.Types.ObjectId, title: String, message: String, read: { type: Boolean, default: false }, link: String }, { timestamps: true });
const ticketSchema = new mongoose.Schema({ ticketId:{type:String,unique:true,index:true}, customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'}, subject:{type:String,required:true,trim:true}, category:{type:String,default:'GENERAL'}, priority:{type:String,default:'NORMAL'}, message:{type:String,required:true}, status:{type:String,default:'OPEN'}, messages:[{senderType:String,sender:mongoose.Schema.Types.ObjectId,message:String,createdAt:{type:Date,default:Date.now}}] },{timestamps:true});
const consentSchema = new mongoose.Schema({ customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'}, type:String, version:String, granted:Boolean, source:String, grantedAt:Date, withdrawnAt:Date, ip:String },{timestamps:true});
const privacyRequestSchema = new mongoose.Schema({ requestId:{type:String,unique:true,index:true}, customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'}, type:String, details:String, status:{type:String,default:'SUBMITTED'}, response:String, resolvedAt:Date },{timestamps:true});
const orderSchema = new mongoose.Schema({ orderId:{type:String,unique:true,index:true}, customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'}, productType:String, productCode:String, productName:String, packagePrice:Number, bookingAmount:Number, amount:{type:Number,required:true}, status:{type:String,default:'PENDING_PAYMENT'}, business:{type:String}, requirements:String, acceptedTermsVersion:String, privacyNoticeVersion:String, notes:String, razorpayOrderId:String, razorpayPaymentId:String, razorpaySignature:String },{timestamps:true});
const approvalSchema = new mongoose.Schema({ project:{type:mongoose.Schema.Types.ObjectId,ref:'Project'}, customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'}, type:String, title:String, version:String, status:{type:String,default:'PENDING'}, comment:String, actedAt:Date },{timestamps:true});
const documentSchema = new mongoose.Schema({ documentId:{type:String,unique:true,index:true}, customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'}, project:{type:mongoose.Schema.Types.ObjectId,ref:'Project'}, name:String, type:String, url:String, version:String, visibility:{type:String,default:'CUSTOMER'}, createdBy:String },{timestamps:true});
const counterSchema = new mongoose.Schema({ key:{type:String,unique:true}, value:{type:Number,default:0} });

const Service = mongoose.model('Service', serviceSchema); const Portfolio = mongoose.model('Portfolio', portfolioSchema);
const Testimonial = mongoose.model('Testimonial', testimonialSchema); const FAQ = mongoose.model('FAQ', faqSchema); const Banner = mongoose.model('Banner', bannerSchema);
const CustomerSession = mongoose.model('CustomerSession', customerSessionSchema); const CustomerToken = mongoose.model('CustomerToken', customerTokenSchema); const SaaSSubscription = mongoose.model('SaaSSubscription', saasSubscriptionSchema);
const Site = mongoose.model('Site', siteSchema); const ServicePackage = mongoose.model('ServicePackage', servicePackageSchema); const Manager = mongoose.model('Manager', managerSchema); const Customer = mongoose.model('Customer', customerSchema); const SaaSProduct = mongoose.model('SaaSProduct', saasProductSchema);
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
function signCustomer(c, sid) { return jwt.sign({ sub: String(c._id), sid, type: 'customer' }, CUSTOMER_JWT_SECRET, { expiresIn: process.env.CUSTOMER_JWT_EXPIRES || '30d' }); }
const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const authLimiter = rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:true,legacyHeaders:false,message:{message:'Too many attempts. Please try again in 15 minutes.'}});
const resetLimiter = rateLimit({windowMs:60*60*1000,limit:5,standardHeaders:true,legacyHeaders:false,message:{message:'Too many requests. Please try again later.'}});
function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)&&v.length<=254;}
function passwordValid(v){return typeof v==='string'&&v.length>=10&&v.length<=128;}
async function sendCustomerEmail(to,subject,text){if(!process.env.SMTP_HOST||!nodemailer) return false; const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:String(process.env.SMTP_SECURE||'false')==='true',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined}); await transporter.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to,subject,text}); return true;}
async function createCustomerSession(c,req){const sid=crypto.randomBytes(32).toString('hex');const days=Math.max(1,Math.min(90,Number(process.env.CUSTOMER_SESSION_DAYS||30)));const expiresAt=new Date(Date.now()+days*86400000);await CustomerSession.create({customer:c._id,sidHash:sha256(sid),userAgent:String(req.get('user-agent')||'').slice(0,300),ip:req.ip,expiresAt,lastSeenAt:new Date()});return {token:signCustomer(c,sid),expiresAt};}
function publicCustomer(c){return {id:String(c._id),name:c.name,email:c.email,phone:c.phone||'',company:c.company||'',emailVerified:!!c.emailVerifiedAt,phoneVerified:!!c.phoneVerifiedAt};}
function verifyToken(req, type) { const token = tokenFrom(req); if (!token) throw new Error('NO_TOKEN'); const secret = type === 'manager' ? JWT_SECRET : CUSTOMER_JWT_SECRET; const payload = jwt.verify(token, secret); if (payload.type !== type) throw new Error('WRONG_TYPE'); return payload; }
async function requireManager(req, res, next) { try { req.auth = verifyToken(req, 'manager'); next(); } catch (e) { res.status(401).json({ message: 'Manager session expired. Please sign in again.', code: 'AUTH_REQUIRED' }); } }
async function requireCustomer(req, res, next) { try { req.auth = verifyToken(req, 'customer'); if(!req.auth.sid||!dbReady) throw new Error('SESSION_REQUIRED'); const [c,session]=await Promise.all([Customer.findById(req.auth.sub).select('_id active'),CustomerSession.findOne({customer:req.auth.sub,sidHash:sha256(req.auth.sid),revokedAt:null,expiresAt:{$gt:new Date()}})]); if(!c||!c.active||!session) throw new Error('CUSTOMER_DISABLED'); req.customerSession=session; session.lastSeenAt=new Date(); session.save().catch(()=>{}); next(); } catch (e) { res.status(401).json({ message: 'Customer session expired. Please sign in again.', code: 'AUTH_REQUIRED' }); } }
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
app.get('/api/health', (req, res) => res.json({ ok: true, database: dbReady, service: 'creatarsh-api' }));
app.get('/api/public/payment-config', (req,res)=>res.json({provider:'razorpay',enabled:Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET),keyId:RAZORPAY_KEY_ID||null,currency:'INR'}));

app.get('/api/public/pricing', async (req,res) => { if (!dbReady) return res.status(503).json({message:'Pricing is temporarily unavailable because the database is not connected.'}); try { const packages=await ServicePackage.find({active:true}).sort({order:1}); res.json({version:'2026-10',currency:'INR',packages}); } catch(e){ res.status(503).json({message:'Pricing is temporarily unavailable.'}); } });
// SaaS storefront catalogue: all product and plan content comes from MongoDB manager records.
app.get('/api/public/products', async (req,res)=>{ if(!dbReady)return res.status(503).json({message:'Product catalogue is temporarily unavailable.'}); try{const products=await SaaSProduct.find({status:'ACTIVE'}).select('code slug name shortDescription description icon category currency plans order').sort({order:1,updatedAt:-1}).lean();res.set('Cache-Control','public, max-age=60, stale-while-revalidate=300');res.json({products});}catch(e){res.status(503).json({message:'Product catalogue is temporarily unavailable.'});} });
app.get('/api/public/products/:slug', async (req,res)=>{ if(!dbReady)return res.status(503).json({message:'Product details are temporarily unavailable.'}); try{const product=await SaaSProduct.findOne({slug:String(req.params.slug).toLowerCase(),status:'ACTIVE'}).lean();if(!product)return res.status(404).json({message:'Product not found.'});product.plans=(product.plans||[]).filter(x=>x.active!==false).sort((a,b)=>a.order-b.order);res.set('Cache-Control','public, max-age=60, stale-while-revalidate=300');res.json({product});}catch(e){res.status(503).json({message:'Product details are temporarily unavailable.'});} });


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
app.post('/api/customer/register', authLimiter, async (req,res)=>{
  if(!dbReady)return res.status(503).json({message:'Registration is temporarily unavailable.'});
  const name=String(req.body.name||'').trim(),email=String(req.body.email||'').trim().toLowerCase(),password=req.body.password,phone=String(req.body.phone||'').trim(),company=String(req.body.company||'').trim();
  if(name.length<2||name.length>100||!validEmail(email)||!passwordValid(password)||phone.length>25||company.length>120||(String(process.env.CUSTOMER_PHONE_VERIFICATION_REQUIRED||'false')==='true'&&phone.length<8))return res.status(400).json({message:'Enter a valid name, email and phone. Password must be 10–128 characters.'});
  try{const existing=await Customer.findOne({email});if(existing)return res.status(409).json({message:'An account with this email already exists.'});const c=await Customer.create({name,email,phone,company,passwordHash:await bcrypt.hash(password,12)});let verificationRequired=String(process.env.CUSTOMER_EMAIL_VERIFICATION_REQUIRED||'false')==='true';let verificationSent=false;if(verificationRequired){const raw=crypto.randomBytes(32).toString('hex');await CustomerToken.create({customer:c._id,tokenHash:sha256(raw),purpose:'VERIFY_EMAIL',expiresAt:new Date(Date.now()+24*3600000)});const url=(process.env.PUBLIC_APP_URL||'https://creatarsh.in')+'/verify-email?token='+raw;try{verificationSent=await sendCustomerEmail(email,'Verify your Creatarsh email',`Verify your email within 24 hours: ${url}`);}catch(e){console.error('Verification email delivery failed:',e.message);} }
    if(verificationRequired)return res.status(201).json({message:verificationSent?'Account created. Check your email to verify the address before signing in.':'Account created. Email verification is required; email delivery is not configured. Contact support to complete verification.',verificationRequired:true,authenticated:false});
    const session=await createCustomerSession(c,req);c.lastLoginAt=new Date();await c.save();res.status(201).json({token:session.token,expiresAt:session.expiresAt,customer:publicCustomer(c),verificationRequired,authenticated:true});
  }catch(e){console.error('Customer registration failed:',e.message);res.status(400).json({message:'Could not create customer account.'});}
});
app.post('/api/customer/login',authLimiter,async(req,res)=>{
  if(!dbReady)return res.status(503).json({message:'Login is temporarily unavailable.'});const email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');
  try{const c=await Customer.findOne({email,active:true});if(!c||!(await bcrypt.compare(password,c.passwordHash)))return res.status(401).json({message:'Invalid email or password.'});if(String(process.env.CUSTOMER_EMAIL_VERIFICATION_REQUIRED||'false')==='true'&&!c.emailVerifiedAt)return res.status(403).json({message:'Please verify your email before signing in.',code:'EMAIL_VERIFICATION_REQUIRED'});if(String(process.env.CUSTOMER_PHONE_VERIFICATION_REQUIRED||'false')==='true'&&!c.phoneVerifiedAt)return res.status(403).json({message:'Please verify your phone number before signing in.',code:'PHONE_VERIFICATION_REQUIRED'});const session=await createCustomerSession(c,req);c.lastLoginAt=new Date();await c.save();res.json({token:session.token,expiresAt:session.expiresAt,customer:publicCustomer(c)});}catch(e){res.status(500).json({message:'Customer login failed.'});}
});
app.post('/api/customer/verify-email',authLimiter,async(req,res)=>{const raw=String(req.body.token||'');if(!/^[a-f0-9]{64}$/.test(raw))return res.status(400).json({message:'Invalid or expired verification link.'});const record=await CustomerToken.findOneAndUpdate({tokenHash:sha256(raw),purpose:'VERIFY_EMAIL',usedAt:null,expiresAt:{$gt:new Date()}},{$set:{usedAt:new Date()}},{new:true});if(!record)return res.status(400).json({message:'Invalid or expired verification link.'});await Customer.updateOne({_id:record.customer},{$set:{emailVerifiedAt:new Date()}});res.json({ok:true,message:'Email verified. You can now sign in.'});});
app.post('/api/customer/verification/resend',resetLimiter,async(req,res)=>{const email=String(req.body.email||'').trim().toLowerCase();const c=await Customer.findOne({email,active:true});if(c&&!c.emailVerifiedAt){const raw=crypto.randomBytes(32).toString('hex');await CustomerToken.create({customer:c._id,tokenHash:sha256(raw),purpose:'VERIFY_EMAIL',expiresAt:new Date(Date.now()+86400000)});const url=(process.env.PUBLIC_APP_URL||'https://creatarsh.in')+'/verify-email?token='+raw;try{await sendCustomerEmail(email,'Verify your Creatarsh email',`Verify your email within 24 hours: ${url}`);}catch(e){console.error('Verification resend failed:',e.message);}}res.json({message:'If the account exists and needs verification, instructions will be sent.'});});
app.post('/api/customer/phone/send-code',requireCustomer,resetLimiter,async(req,res)=>{if(String(process.env.CUSTOMER_PHONE_VERIFICATION_REQUIRED||'false')!=='true')return res.status(400).json({message:'Phone verification is not enabled.'});if(!process.env.SMS_WEBHOOK_URL||!process.env.SMS_WEBHOOK_TOKEN)return res.status(503).json({message:'Phone verification delivery is not configured.'});const c=await Customer.findById(req.auth.sub);if(!c||!c.phone||c.phone.length<8)return res.status(400).json({message:'Add a valid phone number to your profile first.'});const code=String(crypto.randomInt(100000,1000000));await CustomerToken.deleteMany({customer:c._id,purpose:'VERIFY_PHONE',usedAt:null});await CustomerToken.create({customer:c._id,tokenHash:sha256(code),purpose:'VERIFY_PHONE',expiresAt:new Date(Date.now()+10*60000)});try{const response=await fetch(process.env.SMS_WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.SMS_WEBHOOK_TOKEN},body:JSON.stringify({to:c.phone,message:`Your Creatarsh verification code is ${code}. It expires in 10 minutes.`})});if(!response.ok)throw new Error('SMS provider rejected the request');res.json({message:'Verification code sent.'});}catch(e){await CustomerToken.deleteMany({customer:c._id,purpose:'VERIFY_PHONE',tokenHash:sha256(code)});console.error('SMS delivery failed:',e.message);res.status(503).json({message:'Could not send a verification code. Try again later.'});}});
app.post('/api/customer/phone/verify',requireCustomer,authLimiter,async(req,res)=>{const code=String(req.body.code||'');if(!/^\d{6}$/.test(code))return res.status(400).json({message:'Enter the 6-digit code.'});const record=await CustomerToken.findOneAndUpdate({customer:req.auth.sub,tokenHash:sha256(code),purpose:'VERIFY_PHONE',usedAt:null,expiresAt:{$gt:new Date()}},{$set:{usedAt:new Date()}},{new:true});if(!record)return res.status(400).json({message:'Invalid or expired verification code.'});await Customer.updateOne({_id:req.auth.sub},{$set:{phoneVerifiedAt:new Date()}});res.json({ok:true,message:'Phone number verified.'});});
app.post('/api/customer/password/forgot',resetLimiter,async(req,res)=>{const email=String(req.body.email||'').trim().toLowerCase();const c=await Customer.findOne({email,active:true});if(c){const raw=crypto.randomBytes(32).toString('hex');await CustomerToken.create({customer:c._id,tokenHash:sha256(raw),purpose:'RESET_PASSWORD',expiresAt:new Date(Date.now()+3600000)});const url=(process.env.PUBLIC_APP_URL||'https://creatarsh.in')+'/reset-password?token='+raw;try{await sendCustomerEmail(email,'Reset your Creatarsh password',`Reset your password within one hour: ${url}`);}catch(e){console.error('Password reset email delivery failed:',e.message);}}res.json({message:'If an active account exists for that email, password reset instructions will be sent.'});});
app.post('/api/customer/password/reset',authLimiter,async(req,res)=>{const raw=String(req.body.token||''),password=req.body.password;if(!/^[a-f0-9]{64}$/.test(raw)||!passwordValid(password))return res.status(400).json({message:'Invalid reset link or password. Use 10–128 characters.'});const record=await CustomerToken.findOneAndUpdate({tokenHash:sha256(raw),purpose:'RESET_PASSWORD',usedAt:null,expiresAt:{$gt:new Date()}},{$set:{usedAt:new Date()}},{new:true});if(!record)return res.status(400).json({message:'Invalid or expired reset link.'});const hash=await bcrypt.hash(password,12);await Customer.updateOne({_id:record.customer},{$set:{passwordHash:hash,passwordChangedAt:new Date()}});await CustomerSession.updateMany({customer:record.customer,revokedAt:null},{$set:{revokedAt:new Date()}});res.json({ok:true,message:'Password updated. Please sign in again.'});});
app.get('/api/customer/sessions',requireCustomer,async(req,res)=>{const sessions=await CustomerSession.find({customer:req.auth.sub,revokedAt:null,expiresAt:{$gt:new Date()}}).sort({createdAt:-1}).select('userAgent ip createdAt lastSeenAt expiresAt').lean();res.json({sessions:sessions.map(x=>({...x,current:String(req.customerSession._id)===String(x._id)}))});});
app.delete('/api/customer/sessions/:id',requireCustomer,async(req,res)=>{if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:'Invalid session id.'});await CustomerSession.updateOne({_id:req.params.id,customer:req.auth.sub,revokedAt:null},{$set:{revokedAt:new Date()}});res.json({ok:true});});
app.post('/api/customer/logout',requireCustomer,async(req,res)=>{await CustomerSession.updateOne({_id:req.customerSession._id,customer:req.auth.sub},{$set:{revokedAt:new Date()}});res.json({ok:true});});
app.post('/api/customer/logout-all',requireCustomer,async(req,res)=>{await CustomerSession.updateMany({customer:req.auth.sub,revokedAt:null},{$set:{revokedAt:new Date()}});res.json({ok:true,message:'All sessions have been signed out.'});});
app.get('/api/customer/me', requireCustomer, async (req,res)=>{const c=await Customer.findById(req.auth.sub);if(!c)return res.status(404).json({message:'Customer not found.'});res.json({customer:publicCustomer(c)});});
app.put('/api/customer/me', requireCustomer, async (req,res)=>{const name=String(req.body.name||'').trim(),phone=String(req.body.phone||'').trim(),company=String(req.body.company||'').trim();if(name.length<2||name.length>100||phone.length>25||company.length>120)return res.status(400).json({message:'Please check your account details.'});const c=await Customer.findById(req.auth.sub);if(!c)return res.status(404).json({message:'Customer account not found.'});if(phone!==String(c.phone||''))c.phoneVerifiedAt=null;c.name=name;c.phone=phone;c.company=company;await c.save();res.json({customer:publicCustomer(c)});});
app.post('/api/customer/password/change',requireCustomer,authLimiter,async(req,res)=>{const current=String(req.body.currentPassword||''),next=req.body.newPassword;if(!passwordValid(next))return res.status(400).json({message:'New password must be 10–128 characters.'});const c=await Customer.findById(req.auth.sub);if(!c||!(await bcrypt.compare(current,c.passwordHash)))return res.status(401).json({message:'Current password is incorrect.'});c.passwordHash=await bcrypt.hash(next,12);c.passwordChangedAt=new Date();await c.save();await CustomerSession.updateMany({customer:c._id,_id:{$ne:req.customerSession._id},revokedAt:null},{$set:{revokedAt:new Date()}});res.json({ok:true,message:'Password changed. Other sessions were signed out.'});});
app.get('/api/customer/saas-dashboard',requireCustomer,async(req,res)=>{const subs=await SaaSSubscription.find({customer:req.auth.sub}).populate('product','name slug icon').sort({createdAt:-1}).lean();res.json({subscriptions:subs.map(s=>({id:s._id,product:s.product,planCode:s.planCode,status:s.status,currentPeriodEnd:s.currentPeriodEnd,trialEndsAt:s.trialEndsAt,createdAt:s.createdAt}))});});

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
app.post('/api/customer/payments/razorpay/order',requireCustomer,async(req,res)=>{
  if(!dbReady)return res.status(503).json({message:'Checkout is temporarily unavailable because the database is not connected.'});
  if(!RAZORPAY_KEY_ID||!RAZORPAY_KEY_SECRET)return res.status(503).json({message:'Online checkout is not configured yet. You can still send your project brief.'});
  const b=req.body||{};
  if(!b.productCode||!String(b.requirements||'').trim()||!b.terms||!b.privacy)return res.status(400).json({message:'Package, project requirements, Terms acceptance and Privacy acknowledgement are required.'});
  const product=await ServicePackage.findOne({code:String(b.productCode),active:true});
  if(!product)return res.status(400).json({message:'This package is no longer available.'});
  if(product.billingType==='MONTHLY')return res.status(400).json({message:'Monthly care plans require manual activation and billing confirmation. Please send your project brief instead.'});
  const amount=Math.round(Number(product.bookingAmount||product.price||0));
  if(!Number.isFinite(amount)||amount<1||amount>Number(product.price||amount))return res.status(400).json({message:'This package has an invalid booking amount. Please contact Creatarsh.'});
  try{
    const localOrderId=id('ORD');
    const response=await fetch(`${RAZORPAY_API}/orders`,{method:'POST',headers:{'Authorization':'Basic '+Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64'),'Content-Type':'application/json'},body:JSON.stringify({amount:amount*100,currency:'INR',receipt:localOrderId,notes:{productCode:product.code,customerId:String(req.auth.sub)}})});
    const gateway=await response.json().catch(()=>({}));
    if(!response.ok||!gateway.id)return res.status(502).json({message:'Payment provider could not create checkout. Please try again or contact us.'});
    const customerDoc=await Customer.findById(req.auth.sub);
    if(!customerDoc||!customerDoc.active)return res.status(401).json({message:'Customer account is unavailable.'});
    const order=await Order.create({orderId:localOrderId,customer:customerDoc._id,productType:'SERVICE',productCode:product.code,productName:product.name,packagePrice:Number(product.price||0),bookingAmount:amount,amount,status:'PENDING_PAYMENT',business:String(b.company||customerDoc.company||'').trim(),requirements:String(b.requirements).trim(),acceptedTermsVersion:b.termsVersion||'2026-10',privacyNoticeVersion:b.privacyVersion||'2026-10',notes:'Booking payment collected through Razorpay checkout.',razorpayOrderId:gateway.id});
    res.json({keyId:RAZORPAY_KEY_ID,orderId:gateway.id,localOrderId:order.orderId,amount:gateway.amount,currency:gateway.currency||'INR',name:'Creatarsh',description:`${product.name} — booking payment`,prefill:{name:customerDoc.name||'',email:customerDoc.email||'',contact:customerDoc.phone||''}});
  }catch(e){console.error('Razorpay order creation failed:',e.message);res.status(502).json({message:'Could not start checkout. Please try again or request a quote.'});}
});
app.post('/api/customer/payments/razorpay/verify',requireCustomer,async(req,res)=>{
  if(!dbReady||!RAZORPAY_KEY_SECRET)return res.status(503).json({message:'Payment verification is temporarily unavailable.'});
  const b=req.body||{};
  const orderId=String(b.razorpay_order_id||''),paymentId=String(b.razorpay_payment_id||''),signature=String(b.razorpay_signature||''),localOrderId=String(b.localOrderId||'');
  if(!orderId||!paymentId||!signature||!localOrderId)return res.status(400).json({message:'Payment verification details are incomplete.'});
  const order=await Order.findOne({orderId:localOrderId,razorpayOrderId:orderId,customer:req.auth.sub});
  if(!order)return res.status(404).json({message:'Order not found for this account.'});
  const expected=crypto.createHmac('sha256',RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  const supplied=Buffer.from(signature,'hex'),wanted=Buffer.from(expected,'hex');
  if(supplied.length!==wanted.length||!crypto.timingSafeEqual(supplied,wanted))return res.status(400).json({message:'Payment signature could not be verified.'});
  try{
    const response=await fetch(`${RAZORPAY_API}/payments/${encodeURIComponent(paymentId)}`,{headers:{'Authorization':'Basic '+Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}});
    const payment=await response.json().catch(()=>({}));
    if(!response.ok||payment.order_id!==orderId||Number(payment.amount)!==Number(order.amount)*100)return res.status(400).json({message:'Payment details do not match this order.'});
    if(payment.status!=='captured')return res.status(409).json({message:'Payment is not captured yet. If money was deducted, please contact support with payment ID '+paymentId+'.'});
    order.status=Number(order.amount)<Number(order.packagePrice)?'PARTIALLY_PAID':'PAID';order.razorpayPaymentId=paymentId;order.razorpaySignature=signature;order.notes='Booking payment verified and captured through Razorpay.';await order.save();
    await Payment.updateOne({transactionId:paymentId},{$set:{transactionId:paymentId,customer:order.customer,amount:Number(order.amount),gateway:'RAZORPAY',status:'SUCCESS',paidAt:new Date(),note:`Booking payment for ${order.productName} (${order.orderId})`}},{upsert:true});
    res.json({ok:true,orderId:order.orderId,productName:order.productName,amount:order.amount});
  }catch(e){console.error('Razorpay verification failed:',e.message);res.status(502).json({message:'Could not verify the payment right now. Contact support with payment ID '+paymentId+'.'});}
});
app.post('/api/webhooks/razorpay',async(req,res)=>{
  if(!RAZORPAY_WEBHOOK_SECRET)return res.status(503).json({message:'Payment webhook is not configured.'});
  const signature=String(req.headers['x-razorpay-signature']||'');
  const expected=crypto.createHmac('sha256',RAZORPAY_WEBHOOK_SECRET).update(req.rawBody||Buffer.from('')).digest('hex');
  const a=Buffer.from(signature,'hex'),b=Buffer.from(expected,'hex');
  if(!signature||a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(400).json({message:'Invalid webhook signature.'});
  const event=req.body?.event;
  if(event==='payment.captured'){
    const p=req.body?.payload?.payment?.entity;
    if(p?.order_id&&p?.id){
      const order=await Order.findOne({razorpayOrderId:p.order_id});
      if(order&&p.currency==='INR'&&Number(p.amount)===Number(order.amount)*100){
        order.status=Number(order.amount)<Number(order.packagePrice)?'PARTIALLY_PAID':'PAID';order.razorpayPaymentId=p.id;await order.save();
        await Payment.updateOne({transactionId:p.id},{$set:{transactionId:p.id,customer:order.customer,amount:Number(order.amount),gateway:'RAZORPAY',status:'SUCCESS',paidAt:new Date(),note:`Booking payment for ${order.productName} (${order.orderId})`}},{upsert:true});
      }
    }
  }
  res.json({received:true});
});
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
// SaaS catalogue manager API. This is intentionally distinct from legacy agency package catalogue.
async function requireSaasAdmin(req,res,next){try{await requireManager(req,res,()=>{});if(!req.auth)return; if(!['admin','superadmin'].includes(String(req.auth.role||'').toLowerCase()))return res.status(403).json({message:'Administrator role required.'});next();}catch(e){return res.status(401).json({message:'Manager authentication required.'});}}
function cleanSaasProduct(body={}){const plans=Array.isArray(body.plans)?body.plans.map((x,i)=>({code:String(x.code||x.tier||'').trim().toUpperCase(),tier:String(x.tier||'').trim().toUpperCase(),name:String(x.name||x.tier||'').trim(),description:String(x.description||'').trim(),amount:Number(x.amount),currency:String(x.currency||body.currency||'INR').toUpperCase(),interval:String(x.interval||'MONTH').toUpperCase(),trialDays:Number(x.trialDays??3),features:Array.isArray(x.features)?x.features.map(v=>String(v).trim()).filter(Boolean):[],active:x.active!==false,highlight:!!x.highlight,order:Number(x.order??i)})):[];const faqs=Array.isArray(body.faqs)?body.faqs.map(x=>({question:String(x.question||'').trim(),answer:String(x.answer||'').trim()})).filter(x=>x.question&&x.answer):[];return {code:String(body.code||'').trim().toUpperCase(),slug:String(body.slug||slugify(body.name)).trim().toLowerCase(),name:String(body.name||'').trim(),shortDescription:String(body.shortDescription||'').trim(),description:String(body.description||'').trim(),valueProposition:String(body.valueProposition||'').trim(),audience:String(body.audience||'').trim(),icon:String(body.icon||'✦').slice(0,12),category:String(body.category||'').trim(),status:['DRAFT','ACTIVE','ARCHIVED'].includes(body.status)?body.status:'DRAFT',currency:String(body.currency||'INR').toUpperCase(),plans,faqs,seo:{title:String(body.seo?.title||'').trim(),description:String(body.seo?.description||'').trim()},order:Number(body.order||0)};}
app.get('/api/manager/saas-products',requireSaasAdmin,async(req,res)=>{const products=await SaaSProduct.find().sort({order:1,updatedAt:-1});res.json({products});});
app.post('/api/manager/saas-products',requireSaasAdmin,async(req,res)=>{const d=cleanSaasProduct(req.body);if(!d.code||!d.name||!d.slug)return res.status(400).json({message:'Product code, name and slug are required.'});if(d.plans.some(x=>!x.code||!['BASIC','MEDIUM','PREMIUM'].includes(x.tier)||!x.name||!Number.isFinite(x.amount)||x.amount<0||!['MONTH','YEAR'].includes(x.interval)||!Number.isFinite(x.trialDays)||x.trialDays<0||x.trialDays>30))return res.status(400).json({message:'Each plan needs a valid code, Basic/Medium/Premium tier, name, non-negative amount, MONTH/YEAR interval and 0–30 trial days.'});if(new Set(d.plans.map(x=>x.tier)).size!==d.plans.length||new Set(d.plans.map(x=>x.code)).size!==d.plans.length||! /^[A-Z]{3}$/.test(d.currency)||d.plans.some(x=>! /^[A-Z]{3}$/.test(x.currency)))return res.status(400).json({message:'Plan tiers/codes must be unique and currency must be a valid three-letter code.'});if(new Set(d.plans.map(x=>x.tier)).size!==d.plans.length||new Set(d.plans.map(x=>x.code)).size!==d.plans.length||! /^[A-Z]{3}$/.test(d.currency)||d.plans.some(x=>! /^[A-Z]{3}$/.test(x.currency)))return res.status(400).json({message:'Plan tiers/codes must be unique and currency must be a valid three-letter code.'});if(d.status==='ACTIVE'&&!['BASIC','MEDIUM','PREMIUM'].every(t=>d.plans.some(x=>x.tier===t&&x.active)))return res.status(400).json({message:'An active product must have active Basic, Medium and Premium plans.'});try{const product=await SaaSProduct.create(d);res.status(201).json({product});}catch(e){res.status(e.code===11000?409:400).json({message:e.code===11000?'A product with this code or slug already exists.':'Could not save product.'});}});
app.put('/api/manager/saas-products/:id',requireSaasAdmin,async(req,res)=>{const d=cleanSaasProduct(req.body);if(!d.code||!d.name||!d.slug)return res.status(400).json({message:'Product code, name and slug are required.'});if(d.plans.some(x=>!x.code||!['BASIC','MEDIUM','PREMIUM'].includes(x.tier)||!x.name||!Number.isFinite(x.amount)||x.amount<0||!['MONTH','YEAR'].includes(x.interval)||!Number.isFinite(x.trialDays)||x.trialDays<0||x.trialDays>30))return res.status(400).json({message:'One or more plan definitions are invalid.'});if(new Set(d.plans.map(x=>x.tier)).size!==d.plans.length||new Set(d.plans.map(x=>x.code)).size!==d.plans.length||! /^[A-Z]{3}$/.test(d.currency)||d.plans.some(x=>! /^[A-Z]{3}$/.test(x.currency)))return res.status(400).json({message:'Plan tiers/codes must be unique and currency must be a valid three-letter code.'});if(new Set(d.plans.map(x=>x.tier)).size!==d.plans.length||new Set(d.plans.map(x=>x.code)).size!==d.plans.length||! /^[A-Z]{3}$/.test(d.currency)||d.plans.some(x=>! /^[A-Z]{3}$/.test(x.currency)))return res.status(400).json({message:'Plan tiers/codes must be unique and currency must be a valid three-letter code.'});if(d.status==='ACTIVE'&&!['BASIC','MEDIUM','PREMIUM'].every(t=>d.plans.some(x=>x.tier===t&&x.active)))return res.status(400).json({message:'An active product must have active Basic, Medium and Premium plans.'});try{const product=await SaaSProduct.findByIdAndUpdate(req.params.id,d,{new:true,runValidators:true});if(!product)return res.status(404).json({message:'Product not found.'});res.json({product});}catch(e){res.status(e.code===11000?409:400).json({message:e.code===11000?'A product with this code or slug already exists.':'Could not update product.'});}});
app.delete('/api/manager/saas-products/:id',requireSaasAdmin,async(req,res)=>{const product=await SaaSProduct.findByIdAndUpdate(req.params.id,{status:'ARCHIVED'},{new:true});if(!product)return res.status(404).json({message:'Product not found.'});res.json({ok:true,product});});
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
app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found.' }));
app.use((err, req, res, next) => {
  console.error('Unhandled request error:', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ message: 'Something went wrong on the server.' });
});
app.listen(PORT, '0.0.0.0', () => console.log(`Creatarsh server running on 0.0.0.0:${PORT}`));
