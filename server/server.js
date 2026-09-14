require('dotenv').config();
const express=require('express');
const cors=require('cors');
const mongoose=require('mongoose');
const app=express();
app.use(cors());
app.use(express.json());

const serviceSchema=new mongoose.Schema({title:String,description:String,active:{type:Boolean,default:true},order:{type:Number,default:0}});
const portfolioSchema=new mongoose.Schema({title:String,description:String,category:String,technologies:[String],projectUrl:String,featured:Boolean,active:{type:Boolean,default:true},order:Number,media:[String]},{timestamps:true});
const leadSchema=new mongoose.Schema({name:String,company:String,email:String,whatsapp:String,projectType:String,requirements:String,status:{type:String,default:'New'}},{timestamps:true});
const Service=mongoose.model('Service',serviceSchema);
const Portfolio=mongoose.model('Portfolio',portfolioSchema);
const Lead=mongoose.model('Lead',leadSchema);

app.get('/api/health',(req,res)=>res.json({ok:true,service:'creatarsh-api'}));
app.get('/api/public/services',async(req,res)=>res.json(await Service.find({active:true}).sort({order:1})));
app.get('/api/public/portfolio',async(req,res)=>res.json(await Portfolio.find({active:true}).sort({order:1})));
app.post('/api/public/leads',async(req,res)=>res.status(201).json(await Lead.create(req.body)));
app.get('/api/manager/stats',async(req,res)=>{
  res.json({portfolio:await Portfolio.countDocuments({active:true}),services:await Service.countDocuments({active:true}),leads:await Lead.countDocuments()});
});

const port=process.env.PORT||5000;
async function start(){
  if(process.env.MONGODB_URI){
    try{await mongoose.connect(process.env.MONGODB_URI);console.log('MongoDB connected');}
    catch(e){console.error('MongoDB connection failed:',e.message);}
  } else console.log('No MONGODB_URI configured; API starts in demo mode.');
  app.listen(port,()=>console.log(`Creatarsh API running on ${port}`));
}
start();
