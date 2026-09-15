import { Router } from 'express';
import bcrypt from 'bcrypt';
import { rateLimit } from 'express-rate-limit';
import { db, auth, fail, session, hash, random, mail, publicUser, defaultSettings, audit } from './core.js';
import { z, parse, loginSchema, registerSchema } from './validation.js';
export const authRouter = Router();
authRouter.use(rateLimit({windowMs:15*60*1000,limit:60,standardHeaders:'draft-7',legacyHeaders:false}));
authRouter.post('/login',async(req,res)=>{
  const data=parse(loginSchema,req.body);
  const u=await db.user.findUnique({where:{email:data.email},include:{institution:true}});
  if(!u||!await bcrypt.compare(data.password,u.password)) fail(401,'Email or password is incorrect.');
  if(!u.active||u.institution&&u.institution.status!=='ACTIVE') fail(403,'Your account or institution is inactive.');
  await audit(u,'SIGNED_IN',u.id); res.json(await session(u,res));
});
authRouter.post('/register',async(req,res)=>{
  const data=parse(registerSchema,req.body);
  const password=await bcrypt.hash(data.password,12);
  const u=await db.$transaction(async tx=>{
    let institution;
    if(data.institutionName) institution=await tx.institution.create({data:{name:data.institutionName,slug:data.slug,email:data.email,settings:defaultSettings,subscriptions:{create:{endsAt:new Date(Date.now()+30*86400000)}}}});
    else institution=await tx.institution.findUnique({where:{slug:data.slug}});
    if(!institution||institution.status!=='ACTIVE') fail(400,'Institution is unavailable.');
    return tx.user.create({data:{name:data.name,email:data.email,password,role:data.institutionName?'INSTITUTION_ADMIN':'STUDENT',institutionId:institution.id},include:{institution:true}});
  });
  const token=random();await db.accountToken.create({data:{id:hash(token),userId:u.id,type:'VERIFY',expiresAt:new Date(Date.now()+86400000)}});
  const sent=await mail(u.email,'Verify your AssessmentDesk account',`${process.env.APP_URL}/verify-email?token=${token}`).catch(()=>false);
  res.status(201).json({...await session(u,res),emailSent:sent});
});
authRouter.post('/refresh',async(req,res)=>{
  const id=hash(req.cookies.refresh||'');
  const token=await db.refreshToken.findUnique({where:{id},include:{user:{include:{institution:true}}}});
  if(!token||token.expiresAt<new Date()||!token.user.active||token.user.institution&&token.user.institution.status!=='ACTIVE')fail(401,'Please sign in again.');
  const consumed=await db.refreshToken.deleteMany({where:{id}});if(!consumed.count)fail(401,'Please sign in again.');
  res.json(await session(token.user,res));
});
authRouter.post('/logout',async(req,res)=>{await db.refreshToken.deleteMany({where:{id:hash(req.cookies.refresh||'')}});res.clearCookie('refresh',{path:'/api/auth'});res.json({ok:true});});
authRouter.get('/me',auth,(req,res)=>res.json(publicUser(req.user)));
authRouter.post('/forgot-password',async(req,res)=>{
  const {email}=parse(z.object({email:z.string().email()}),req.body);
  if(!process.env.SMTP_HOST)fail(503,'Password recovery email is not configured. Contact your administrator.');
  const u=await db.user.findUnique({where:{email:email.toLowerCase()}});
  if(u){const token=random();await db.accountToken.create({data:{id:hash(token),userId:u.id,type:'RESET',expiresAt:new Date(Date.now()+3600000)}});await mail(u.email,'Reset your password',`${process.env.APP_URL}/reset-password?token=${token}`);}
  res.json({message:'If that account exists, a reset link has been sent.'});
});
authRouter.post('/reset-password',async(req,res)=>{
  const data=parse(z.object({token:z.string(),password:z.string().min(10).max(128)}),req.body);
  const password=await bcrypt.hash(data.password,12);
  await db.$transaction(async tx=>{const t=await tx.accountToken.findFirst({where:{id:hash(data.token),type:'RESET',expiresAt:{gt:new Date()}}});if(!t)fail(400,'This link is invalid or expired.');await tx.accountToken.delete({where:{id:t.id}});await tx.user.update({where:{id:t.userId},data:{password}});await tx.refreshToken.deleteMany({where:{userId:t.userId}});});res.json({ok:true});
});
authRouter.post('/verify-email',async(req,res)=>{const {token}=parse(z.object({token:z.string()}),req.body);await db.$transaction(async tx=>{const t=await tx.accountToken.findFirst({where:{id:hash(token),type:'VERIFY',expiresAt:{gt:new Date()}}});if(!t)fail(400,'This link is invalid or expired.');await tx.accountToken.delete({where:{id:t.id}});await tx.user.update({where:{id:t.userId},data:{emailVerified:true}});});res.json({ok:true});});
authRouter.post('/change-password',auth,async(req,res)=>{const data=parse(z.object({currentPassword:z.string(),password:z.string().min(10).max(128)}),req.body);if(!await bcrypt.compare(data.currentPassword,req.user.password))fail(400,'Current password is incorrect.');await db.user.update({where:{id:req.user.id},data:{password:await bcrypt.hash(data.password,12)}});await db.refreshToken.deleteMany({where:{userId:req.user.id}});res.json({ok:true});});
