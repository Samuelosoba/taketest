import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { db, roles, tenant, fail, audit } from './core.js';
import { z, parse } from './validation.js';
import { candidateAttempt, finishAttempt, summarize } from './grading.js';
export const attempts = Router();
const student=roles('STUDENT'),author=roles('INSTITUTION_ADMIN','EXAMINER');
const shuffle = items => {const a=[...items];for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
attempts.post('/exams/:id/start',student,async(req,res)=>{
  const institutionId=tenant(req);
  const a=await db.$transaction(async tx=>{
    const exam=await tx.exam.findFirst({where:{id:req.params.id,institutionId,status:'PUBLISHED',course:{status:'PUBLISHED'}},include:{questions:{include:{question:true}},institution:true}});
    if(!exam)fail(404,'Exam not found.');
    const now=new Date();
    if(exam.startsAt&&exam.startsAt>now||exam.endsAt&&exam.endsAt<=now)fail(403,'This exam is not currently available.');
    const old=await tx.examAttempt.findMany({where:{examId:exam.id,studentId:req.user.id},orderBy:{number:'desc'}});
    const active=old.find(a=>a.status==='STARTED');if(active)return active;
    if(old.length>=exam.maxAttempts)fail(403,'You have used all available attempts.');
    if(exam.price>0&&!await tx.payment.findFirst({where:{institutionId,examId:exam.id,studentId:req.user.id,status:'SUCCESS'}}))fail(402,'A verified payment is required to start this exam.');
    if(!exam.questions.length)fail(400,'This exam has no questions.');
    let questions=exam.questions.map(({question:q})=>({...q,options:exam.shuffleOptions?shuffle(q.options):q.options}));if(exam.shuffleQuestions)questions=shuffle(questions);
    const end=new Date(Math.min(now.getTime()+exam.duration*60000,exam.endsAt?.getTime()||Infinity));
    return tx.examAttempt.create({data:{institutionId,examId:exam.id,studentId:req.user.id,number:(old[0]?.number||0)+1,expectedEndAt:end,answers:{},snapshot:{title:exam.title,questions,passMark:exam.passMark,gradingBands:exam.institution.settings.gradingBands,fullscreen:exam.fullscreen},ip:req.ip||'',userAgent:(req.headers['user-agent']||'').slice(0,250)}});
  });
  if(a.expectedEndAt<=new Date()&&a.status==='STARTED'){await finishAttempt(a.id,req.user,true);fail(410,'Your attempt has expired and has been submitted.');}
  await audit(req.user,'EXAM_STARTED',a.id);res.json(candidateAttempt(a));
});
attempts.get('/attempts/:id',student,async(req,res)=>{
  const a=await db.examAttempt.findFirst({where:{id:req.params.id,institutionId:tenant(req),studentId:req.user.id}});if(!a)fail(404,'Attempt not found.');
  if(a.status==='STARTED'&&a.expectedEndAt<=new Date()){await finishAttempt(a.id,req.user,true);a.status='EXPIRED';}
  res.json(candidateAttempt(a));
});
attempts.put('/attempts/:id/answers',student,async(req,res)=>{
  const {answers}=parse(z.object({answers:z.record(z.string(),z.union([z.string().max(20000),z.array(z.string().max(200)).max(10)]))}),req.body);
  const a=await db.examAttempt.findFirst({where:{id:req.params.id,institutionId:tenant(req),studentId:req.user.id}});if(!a)fail(404,'Attempt not found.');
  if(a.status!=='STARTED')fail(409,'This attempt has already been submitted.');
  if(a.expectedEndAt<=new Date()){await finishAttempt(a.id,req.user,true);fail(410,'Time is up. Your saved answers were submitted.');}
  for(const [id,value] of Object.entries(answers)){
    const q=a.snapshot.questions.find(q=>q.id===id);if(!q)fail(400,'Question does not belong to this attempt.');
    if(['ESSAY','SHORT'].includes(q.type)){if(typeof value!=='string')fail(400,'A text answer is required.');}
    else if(!Array.isArray(value)||value.some(id=>!q.options.some(o=>o.id===id))||q.type!=='MULTIPLE'&&value.length>1)fail(400,'Invalid option selection.');
  }
  const updated=await db.examAttempt.updateMany({where:{id:a.id,status:'STARTED',version:a.version,expectedEndAt:{gt:new Date()}},data:{answers:{...a.answers,...answers},version:{increment:1}}});
  if(!updated.count)fail(409,'Attempt changed while saving. Retry your answer.');res.json({savedAt:new Date()});
});
attempts.post('/attempts/:id/submit',student,async(req,res)=>{const a=await db.examAttempt.findFirst({where:{id:req.params.id,institutionId:tenant(req),studentId:req.user.id}});if(!a)fail(404,'Attempt not found.');const r=await finishAttempt(a.id,req.user,a.expectedEndAt<=new Date());await audit(req.user,'EXAM_SUBMITTED',a.id);res.json({id:r.id,status:r.status,released:r.released});});
attempts.post('/attempts/:id/events',student,async(req,res)=>{const {type}=parse(z.object({type:z.enum(['TAB_HIDDEN','FULLSCREEN_EXIT','PASTE_ATTEMPT'])}),req.body);const a=await db.examAttempt.findFirst({where:{id:req.params.id,studentId:req.user.id,institutionId:tenant(req),status:'STARTED'}});if(!a)fail(404,'Active attempt not found.');if(await db.examViolation.count({where:{attemptId:a.id}})<200)await db.examViolation.create({data:{attemptId:a.id,type}});res.json({ok:true});});
attempts.get('/results',async(req,res)=>{const rows=await db.result.findMany({where:{institutionId:tenant(req),...(req.user.role==='STUDENT'?{released:true,attempt:{studentId:req.user.id}}:{})},include:{attempt:{select:{id:true,student:{select:{name:true,email:true}},exam:{select:{title:true}},submittedAt:true}},certificate:true},orderBy:{createdAt:'desc'}});res.json(rows);});
attempts.post('/results/:id/release',author,async(req,res)=>{const row=await db.result.updateMany({where:{id:req.params.id,institutionId:tenant(req),status:'GRADED'},data:{released:true}});if(!row.count)fail(404,'A completed result was not found.');await audit(req.user,'RESULT_RELEASED',req.params.id);res.json({ok:true});});
attempts.get('/grading',author,async(req,res)=>res.json(await db.result.findMany({where:{institutionId:tenant(req),status:'UNDER_REVIEW'},include:{attempt:{include:{student:{select:{name:true}},exam:{select:{title:true}},violations:true}}},orderBy:{createdAt:'asc'}})));
attempts.post('/grading/:id',author,async(req,res)=>{
  const {grades}=parse(z.object({grades:z.array(z.object({questionId:z.string(),awarded:z.number().min(0),comment:z.string().max(2000).default('')})).min(1)}),req.body);
  const result=await db.$transaction(async tx=>{
    const r=await tx.result.findFirst({where:{id:req.params.id,institutionId:tenant(req),status:'UNDER_REVIEW'},include:{attempt:{include:{exam:true}}}});if(!r)fail(404,'Pending result not found.');
    const lock=await tx.examAttempt.updateMany({where:{id:r.attemptId,version:r.attempt.version},data:{version:{increment:1}}});if(!lock.count)fail(409,'This result changed. Refresh and retry.');
    const breakdown=r.breakdown.map(b=>({...b}));
    for(const g of grades){const q=r.attempt.snapshot.questions.find(q=>q.id===g.questionId);if(!q||q.type!=='ESSAY'||g.awarded>q.marks)fail(400,'Marks must be within the essay question maximum.');Object.assign(breakdown.find(b=>b.questionId===q.id),g);}
    const summary=summarize(breakdown,r.attempt.snapshot.passMark,r.attempt.snapshot.gradingBands);
    if(summary.status==='GRADED')await tx.examAttempt.update({where:{id:r.attemptId},data:{status:'GRADED'}});
    return tx.result.update({where:{id:r.id},data:{...summary,released:summary.status==='GRADED'&&r.attempt.exam.releaseResults}});
  });await audit(req.user,'ESSAY_GRADED',result.id);res.json(result);
});
