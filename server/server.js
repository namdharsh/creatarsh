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
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.json({ limit: '2mb' }));
// Optional single-service deployment: the API can also serve both web clients.
const customerDir=path.join(__dirname,'..','customer');
const managerDir=path.join(__dirname,'..','manager');
app.use('/manager',express.static(managerDir));
app.use('/customer',express.static(customerDir));
app.get('/',(req,res)=>res.sendFile(path.join(customerDir,'index.html')));


const serviceSchema = new mongoose.Schema({ title:{type:String,required:true,trim:true}, description:{type:String,default:''}, icon:{type:String,default:'✦'}, features:[String], startingPrice:{type:Number,default:0}, timeline:{type:String,default:''}, active:{type:Boolean,default:true}, order:{type:Number,default:0} }, {timestamps:true});
const portfolioSchema = new mongoose.Schema({ title:{type:String,required:true,trim:true}, description:{type:String,default:''}, category:{type:String,default:'Project'}, client:{type:String,default:''}, technologies:[String], projectUrl:{type:String,default:''}, githubUrl:{type:String,default:''}, featured:{type:Boolean,default:false}, active:{type:Boolean,default:true}, order:{type:Number,default:0}, media:[String], results:[String] }, {timestamps:true});
const leadSchema = new mongoose.Schema({ enquiryId:{type:String,unique:true,index:true}, name:{type:String,required:true}, company:String, email:{type:String,required:true}, whatsapp:String, projectType:String, budget:String, deadline:String, referenceUrl:String, requirements:{type:String,required:true}, status:{type:String,default:'New'}, notes:{type:String,default:''} }, {timestamps:true});
const testimonialSchema = new mongoose.Schema({ name:{type:String,required:true}, company:String, role:String, quote:{type:String,required:true}, rating:{type:Number,default:5}, avatar:String, approved:{type:Boolean,default:false}, order:{type:Number,default:0} }, {timestamps:true});
const faqSchema = new mongoose.Schema({ question:{type:String,required:true}, answer:{type:String,required:true}, active:{type:Boolean,default:true}, order:{type:Number,default:0} }, {timestamps:true});
const bannerSchema = new mongoose.Schema({ eyebrow:String, title:{type:String,required:true}, text:String, ctaText:{type:String,default:'Start a Project'}, ctaUrl:{type:String,default:'#contact'}, image:String, active:{type:Boolean,default:true}, order:{type:Number,default:0} }, {timestamps:true});
const siteSchema = new mongoose.Schema({ key:{type:String,unique:true}, heroTitle:String, heroText:String, footerText:String, email:String, whatsapp:String, phone:String, instagram:String, linkedin:String, youtube:String, github:String, announcement:String }, {timestamps:true});
const managerSchema = new mongoose.Schema({ username:{type:String,required:true,unique:true,trim:true,lowercase:true}, passwordHash:{type:String,required:true}, role:{type:String,default:'manager'}, active:{type:Boolean,default:true}, lastLoginAt:Date }, {timestamps:true});

const Service=mongoose.model('Service',serviceSchema), Portfolio=mongoose.model('Portfolio',portfolioSchema), Lead=mongoose.model('Lead',leadSchema), Testimonial=mongoose.model('Testimonial',testimonialSchema), FAQ=mongoose.model('FAQ',faqSchema), Banner=mongoose.model('Banner',bannerSchema), Site=mongoose.model('Site',siteSchema), Manager=mongoose.model('Manager',managerSchema);
const customerSchema=new mongoose.Schema({name:{type:String,required:true},email:{type:String,required:true,index:true},phone:String,company:String,passwordHash:String,active:{type:Boolean,default:true}},{timestamps:true});
const projectSchema=new mongoose.Schema({projectId:{type:String,unique:true,index:true},customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'},name:{type:String,required:true},description:String,status:{type:String,default:'Planning'},progress:{type:Number,default:0,min:0,max:100},value:{type:Number,default:0},startDate:Date,dueDate:Date,notes:String},{timestamps:true});
const quoteSchema=new mongoose.Schema({quoteId:{type:String,unique:true,index:true},customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'},project:{type:mongoose.Schema.Types.ObjectId,ref:'Project'},items:[{name:String,quantity:Number,price:Number}],discount:{type:Number,default:0},gst:{type:Number,default:18},subtotal:Number,total:Number,status:{type:String,default:'DRAFT'},validUntil:Date},{timestamps:true});
const invoiceSchema=new mongoose.Schema({invoiceId:{type:String,unique:true,index:true},customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'},project:{type:mongoose.Schema.Types.ObjectId,ref:'Project'},items:[{name:String,quantity:Number,price:Number}],subtotal:Number,gst:{type:Number,default:18},total:Number,status:{type:String,default:'UNPAID'},dueDate:Date},{timestamps:true});
const paymentSchema=new mongoose.Schema({transactionId:{type:String,index:true},customer:{type:mongoose.Schema.Types.ObjectId,ref:'Customer'},project:{type:mongoose.Schema.Types.ObjectId,ref:'Project'},amount:{type:Number,required:true},gateway:String,status:{type:String,default:'PENDING'},paidAt:Date},{timestamps:true});
const Customer=mongoose.model('Customer',customerSchema),Project=mongoose.model('Project',projectSchema),Quote=mongoose.model('Quote',quoteSchema),Invoice=mongoose.model('Invoice',invoiceSchema),Payment=mongoose.model('Payment',paymentSchema);

const loginLimiter=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:true,legacyHeaders:false,message:{message:'Too many login attempts. Please try again later.'}});
function signToken(m){if(!process.env.MANAGER_JWT_SECRET)throw new Error('MANAGER_JWT_SECRET is not configured');return jwt.sign({sub:m._id.toString(),username:m.username,role:m.role},process.env.MANAGER_JWT_SECRET,{expiresIn:'12h'});}
function requireManager(req,res,next){try{const auth=req.headers.authorization||'';const token=auth.startsWith('Bearer ')?auth.slice(7):null;if(!token)return res.status(401).json({message:'Authentication required'});req.manager=jwt.verify(token,process.env.MANAGER_JWT_SECRET);next();}catch(e){res.status(401).json({message:'Invalid or expired session'});}}
function cleanArray(v){return Array.isArray(v)?v.map(x=>String(x).trim()).filter(Boolean):[];}
function safeBody(body, fields){const out={};fields.forEach(f=>{if(body[f]!==undefined)out[f]=body[f];});return out;}

app.get('/api/health',(req,res)=>res.json({ok:true,service:'creatarsh-api'}));
app.get('/api/public/content',async(req,res)=>{try{const [services,portfolio,testimonials,faqs,banners,site]=await Promise.all([Service.find({active:true}).sort({order:1}),Portfolio.find({active:true}).sort({order:1}),Testimonial.find({approved:true}).sort({order:1}),FAQ.find({active:true}).sort({order:1}),Banner.find({active:true}).sort({order:1}),Site.findOne({key:'main'})]);res.json({services,portfolio,testimonials,faqs,banners,site});}catch(e){res.status(500).json({message:'Failed to load website content'});}});
app.get('/api/public/services',async(req,res)=>{try{res.json(await Service.find({active:true}).sort({order:1}));}catch(e){res.status(500).json({message:'Failed to load services'});}});
app.get('/api/public/portfolio',async(req,res)=>{try{res.json(await Portfolio.find({active:true}).sort({order:1}));}catch(e){res.status(500).json({message:'Failed to load portfolio'});}});
app.post('/api/public/leads',async(req,res)=>{try{const d=safeBody(req.body,['name','company','email','whatsapp','projectType','budget','deadline','referenceUrl','requirements']);if(!d.name||!d.email||!d.requirements)return res.status(400).json({message:'Name, email and requirements are required'});d.enquiryId=`CR-${Date.now().toString(36).toUpperCase()}`;const lead=await Lead.create(d);res.status(201).json({message:'Project brief received',enquiryId:lead.enquiryId});}catch(e){res.status(400).json({message:'Invalid lead data'});}});
app.post('/api/manager/login',loginLimiter,async(req,res)=>{try{const username=String(req.body.username||'').trim().toLowerCase(),password=String(req.body.password||'');const manager=await Manager.findOne({username,active:true});if(!username||!password||!manager||!(await bcrypt.compare(password,manager.passwordHash)))return res.status(401).json({message:'Invalid username or password'});manager.lastLoginAt=new Date();await manager.save();res.json({token:signToken(manager),manager:{username:manager.username,role:manager.role}});}catch(e){res.status(500).json({message:'Login service is unavailable'});}});
app.get('/api/manager/me',requireManager,async(req,res)=>{const manager=await Manager.findById(req.manager.sub).select('username role active lastLoginAt');if(!manager||!manager.active)return res.status(401).json({message:'Manager account is inactive'});res.json({manager});});
app.post('/api/manager/change-password',requireManager,async(req,res)=>{try{const currentPassword=String(req.body.currentPassword||''),newPassword=String(req.body.newPassword||'');if(newPassword.length<8)return res.status(400).json({message:'New password must be at least 8 characters'});const manager=await Manager.findById(req.manager.sub);if(!manager||!manager.active)return res.status(401).json({message:'Manager account is inactive'});if(!(await bcrypt.compare(currentPassword,manager.passwordHash)))return res.status(401).json({message:'Current password is incorrect'});manager.passwordHash=await bcrypt.hash(newPassword,12);await manager.save();res.json({message:'Password changed successfully'});}catch(e){res.status(500).json({message:'Could not change password'});}});

const resources={services:Service,portfolio:Portfolio,testimonials:Testimonial,faqs:FAQ,banners:Banner};
const fields={services:['title','description','icon','features','startingPrice','timeline','active','order'],portfolio:['title','description','category','client','technologies','projectUrl','githubUrl','featured','active','order','media','results'],testimonials:['name','company','role','quote','rating','avatar','approved','order'],faqs:['question','answer','active','order'],banners:['eyebrow','title','text','ctaText','ctaUrl','image','active','order']};
for(const [name,Model] of Object.entries(resources)){
  app.get(`/api/manager/${name}`,requireManager,async(req,res)=>{try{res.json(await Model.find().sort({order:1,createdAt:-1}));}catch(e){res.status(500).json({message:`Failed to load ${name}`});}});
  app.post(`/api/manager/${name}`,requireManager,async(req,res)=>{try{const d=safeBody(req.body,fields[name]);if(['features','technologies','media','results'].some(k=>d[k]!==undefined))['features','technologies','media','results'].forEach(k=>{if(d[k]!==undefined)d[k]=cleanArray(d[k]);});const item=await Model.create(d);res.status(201).json(item);}catch(e){res.status(400).json({message:'Could not create item'});}});
  app.put(`/api/manager/${name}/:id`,requireManager,async(req,res)=>{try{const d=safeBody(req.body,fields[name]);['features','technologies','media','results'].forEach(k=>{if(d[k]!==undefined)d[k]=cleanArray(d[k]);});const item=await Model.findByIdAndUpdate(req.params.id,d,{new:true,runValidators:true});if(!item)return res.status(404).json({message:'Item not found'});res.json(item);}catch(e){res.status(400).json({message:'Could not update item'});}});
  app.delete(`/api/manager/${name}/:id`,requireManager,async(req,res)=>{try{const item=await Model.findByIdAndDelete(req.params.id);if(!item)return res.status(404).json({message:'Item not found'});res.json({message:'Deleted'});}catch(e){res.status(400).json({message:'Could not delete item'});}});
}
app.get('/api/manager/leads',requireManager,async(req,res)=>{try{res.json(await Lead.find().sort({createdAt:-1}));}catch(e){res.status(500).json({message:'Failed to load leads'});}});
app.put('/api/manager/leads/:id',requireManager,async(req,res)=>{try{const d=safeBody(req.body,['status','notes']);const item=await Lead.findByIdAndUpdate(req.params.id,d,{new:true,runValidators:true});if(!item)return res.status(404).json({message:'Lead not found'});res.json(item);}catch(e){res.status(400).json({message:'Could not update lead'});}});
app.get('/api/manager/site',requireManager,async(req,res)=>{res.json(await Site.findOne({key:'main'})||{});});
app.put('/api/manager/site',requireManager,async(req,res)=>{try{const d=safeBody(req.body,['heroTitle','heroText','footerText','email','whatsapp','phone','instagram','linkedin','youtube','github','announcement']);const site=await Site.findOneAndUpdate({key:'main'},{$set:{...d,key:'main'}},{upsert:true,new:true,setDefaultsOnInsert:true});res.json(site);}catch(e){res.status(400).json({message:'Could not save website content'});}});
app.get('/api/manager/customers',requireManager,async(req,res)=>res.json(await Customer.find().select('-passwordHash').sort({createdAt:-1})));
app.get('/api/manager/projects',requireManager,async(req,res)=>res.json(await Project.find().populate('customer','name email company').sort({createdAt:-1})));
app.get('/api/manager/quotes',requireManager,async(req,res)=>res.json(await Quote.find().populate('customer','name email company').sort({createdAt:-1})));
app.get('/api/manager/invoices',requireManager,async(req,res)=>res.json(await Invoice.find().populate('customer','name email company').sort({createdAt:-1})));
app.get('/api/manager/payments',requireManager,async(req,res)=>res.json(await Payment.find().populate('customer','name email company').sort({createdAt:-1})));
app.get('/api/manager/stats',requireManager,async(req,res)=>{try{const [portfolio,services,leads,customers,activeProjects,approvedTestimonials]=await Promise.all([Portfolio.countDocuments({active:true}),Service.countDocuments({active:true}),Lead.countDocuments(),Customer.countDocuments({active:true}),Project.countDocuments({status:{$nin:['Completed','Cancelled']}}),Testimonial.countDocuments({approved:true})]);res.json({portfolio,services,leads,customers,activeProjects,approvedTestimonials});}catch(e){res.status(500).json({message:'Failed to load dashboard stats'});}});

async function seedInitialManager(){const username=String(process.env.MANAGER_INITIAL_USERNAME||'').trim().toLowerCase(),password=String(process.env.MANAGER_INITIAL_PASSWORD||'');if(!username||!password)return;if(password.length<8)throw new Error('MANAGER_INITIAL_PASSWORD must be at least 8 characters');if(await Manager.findOne({username}))return;await Manager.create({username,passwordHash:await bcrypt.hash(password,12),role:'manager'});console.log(`Initial manager created: ${username}`);}
async function seedSite(){if(!await Site.findOne({key:'main'}))await Site.create({key:'main',heroTitle:'We build digital systems that move businesses forward.',heroText:'Creatarsh designs and develops modern websites, applications, business systems, automation and AI-powered products.',footerText:'Digital Systems & Development'});}
const port=process.env.PORT||5000;
async function start(){if(process.env.MONGODB_URI){try{await mongoose.connect(process.env.MONGODB_URI);console.log('MongoDB connected');await seedInitialManager();await seedSite();}catch(e){console.error('MongoDB connection failed:',e.message);}}else console.log('No MONGODB_URI configured; API starts in demo mode.');app.listen(port,()=>console.log(`Creatarsh API running on ${port}`));}
start();
