import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { authRouter } from './core.js';
import { apiRouter } from './routes.js';

if(!process.env.JWT_SECRET){console.error('Set JWT_SECRET in .env');process.exit(1);}
const app=express();app.use(helmet());app.use(cors({origin:process.env.CLIENT_URL||'http://localhost:5173'}));app.use(express.json({limit:'1mb'}));app.use('/api/auth',rateLimit({windowMs:15*60*1000,limit:100}),authRouter);app.use('/api',apiRouter);app.get('/api/health',(req,res)=>res.json({ok:true,service:'ShopCore'}));app.use((err,req,res,next)=>{console.error(err);res.status(err.status||500).json({error:err.status?err.message:'Internal server error'});});
await mongoose.connect(process.env.MONGO_URI||'mongodb://127.0.0.1:27017/shopcore');
app.listen(process.env.PORT||4102,()=>console.log("API ready on port 4102"));
