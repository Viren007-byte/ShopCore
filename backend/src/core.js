import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { body, validationResult } from 'express-validator';

export const User=mongoose.model('User',new mongoose.Schema({name:{type:String,required:true,trim:true},email:{type:String,required:true,unique:true,lowercase:true,trim:true},password:{type:String,required:true,select:false},role:{type:String,enum:['user','seller','admin'],default:'user'}},{timestamps:true}));
export const auth=async(req,res,next)=>{try{const token=req.headers.authorization?.replace(/^Bearer /,'');if(!token)return res.status(401).json({error:'Authentication required'});const decoded=jwt.verify(token,process.env.JWT_SECRET);const user=await User.findById(decoded.sub);if(!user)return res.status(401).json({error:'Account not found'});req.user=user;next();}catch{return res.status(401).json({error:'Invalid token'});}};
export const admin=(req,res,next)=>req.user.role==='admin'?next():res.status(403).json({error:'Admin access required'});
const validation=(req,res,next)=>{const errors=validationResult(req);return errors.isEmpty()?next():res.status(400).json({errors:errors.array()});};
export const authRouter=Router();
authRouter.post('/register',body('name').trim().isLength({min:2,max:80}),body('email').isEmail().normalizeEmail(),body('password').isLength({min:8}),validation,async(req,res,next)=>{try{const {name,email,password}=req.body;if(await User.exists({email}))return res.status(409).json({error:'Email already registered'});const user=await User.create({name,email,role:req.body.role==='seller'?'seller':'user',password:await bcrypt.hash(password,12)});res.status(201).json({token:jwt.sign({sub:user.id},process.env.JWT_SECRET,{expiresIn:'12h'}),user:{id:user.id,name:user.name,email:user.email,role:user.role}});}catch(e){next(e);}});
authRouter.post('/login',body('email').isEmail(),body('password').notEmpty(),validation,async(req,res,next)=>{try{const user=await User.findOne({email:req.body.email.toLowerCase()}).select('+password');if(!user||!await bcrypt.compare(req.body.password,user.password))return res.status(401).json({error:'Invalid credentials'});res.json({token:jwt.sign({sub:user.id},process.env.JWT_SECRET,{expiresIn:'12h'}),user:{id:user.id,name:user.name,email:user.email,role:user.role}});}catch(e){next(e);}});
authRouter.get('/me',auth,(req,res)=>res.json({id:req.user.id,name:req.user.name,email:req.user.email,role:req.user.role}));

