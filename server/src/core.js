import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomBytes, createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';

export const db = new PrismaClient();
export const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
export const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) throw new Error('Set JWT_SECRET to at least 32 random characters. Run npm run db:setup for local setup.');
export const hash = value => createHash('sha256').update(value).digest('hex');
export const random = () => randomBytes(32).toString('hex');
export const publicUser = u => ({id:u.id,name:u.name,email:u.email,role:u.role,institutionId:u.institutionId,emailVerified:u.emailVerified,institution:u.institution});
export const audit = (u, action, targetId) => db.auditLog.create({data:{institutionId:u?.institutionId,userId:u?.id,action,targetId}});
export async function auth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    const payload = jwt.verify(token || '', secret, {algorithms:['HS256']});
    const user = await db.user.findUnique({where:{id:payload.sub},include:{institution:true}});
    if (!user?.active) fail(401,'Please sign in again.');
    if (user.institution && user.institution.status !== 'ACTIVE') fail(403,'Your institution is not active. Contact your administrator.');
    req.user = user; next();
  } catch (e) { next(e.status ? e : Object.assign(new Error('Please sign in again.'),{status:401})); }
}
export const roles = (...allowed) => (req,res,next) => allowed.includes(req.user.role) ? next() : next(Object.assign(new Error('You do not have permission for this action.'),{status:403}));
export const tenant = req => { if (!req.user.institutionId) fail(403,'This action requires an institution workspace.'); return req.user.institutionId; };
export async function session(user, res) {
  const refresh = random();
  await db.refreshToken.create({data:{id:hash(refresh),userId:user.id,expiresAt:new Date(Date.now()+7*86400000)}});
  res.cookie('refresh',refresh,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/auth',maxAge:7*86400000});
  return {token:jwt.sign({sub:user.id},secret,{algorithm:'HS256',expiresIn:'15m'}),user:publicUser(user)};
}
export async function mail(to, subject, text) {
  if (!process.env.SMTP_HOST) return false;
  const transport = nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_PORT==='465',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined});
  await transport.sendMail({from:process.env.MAIL_FROM,to,subject,text}); return true;
}
export const defaultSettings = {gradingBands:[{min:70,grade:'A'},{min:60,grade:'B'},{min:50,grade:'C'},{min:40,grade:'D'},{min:0,grade:'F'}]};
