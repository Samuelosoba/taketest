import { Router } from 'express';
import bcrypt from 'bcrypt';
import { db, roles, tenant, fail, audit } from './core.js';
import { z, parse, courseSchema, questionSchema, examSchema, userSchema } from './validation.js';
export const workspace = Router();
const author = roles('INSTITUTION_ADMIN','EXAMINER');
const admin = roles('INSTITUTION_ADMIN');
const userSelect={id:true,name:true,email:true,role:true,active:true,studentNumber:true,createdAt:true};
workspace.get('/users',admin,async(req,res)=>res.json(await db.user.findMany({where:{institutionId:tenant(req)},select:userSelect,orderBy:{createdAt:'desc'}})));
workspace.post('/users',admin,async(req,res)=>{const data=parse(userSchema,req.body);if(!data.password)fail(400,'A temporary password is required.');const u=await db.user.create({data:{...data,password:await bcrypt.hash(data.password,12),institutionId:tenant(req)},select:userSelect});await audit(req.user,'USER_CREATED',u.id);res.status(201).json(u);});
workspace.patch('/users/:id',admin,async(req,res)=>{const data=parse(userSchema.omit({password:true}).partial(),req.body);if(req.params.id===req.user.id&&(data.active===false||data.role&&data.role!==req.user.role))fail(400,'You cannot deactivate or change your own role.');const result=await db.user.updateMany({where:{id:req.params.id,institutionId:tenant(req)},data});if(!result.count)fail(404,'User not found.');await audit(req.user,'USER_UPDATED',req.params.id);res.json({ok:true});});
workspace.get('/users/:id/history',admin,async(req,res)=>{const u=await db.user.findFirst({where:{id:req.params.id,institutionId:tenant(req)},select:userSelect});if(!u)fail(404,'User not found.');const attempts=await db.examAttempt.findMany({where:{studentId:u.id,institutionId:tenant(req)},select:{id:true,status:true,startedAt:true,exam:{select:{title:true}},result:true}});const payments=await db.payment.findMany({where:{studentId:u.id,institutionId:tenant(req)}});res.json({user:u,attempts,payments});});
workspace.get('/courses',async(req,res)=>res.json(await db.course.findMany({where:{institutionId:tenant(req),...(req.user.role==='STUDENT'?{status:'PUBLISHED'}:{})},include:{_count:{select:{exams:true}}},orderBy:{createdAt:'desc'}})));
workspace.post('/courses',author,async(req,res)=>{const row=await db.course.create({data:{...parse(courseSchema,req.body),institutionId:tenant(req)}});await audit(req.user,'COURSE_CREATED',row.id);res.status(201).json(row);});
workspace.patch('/courses/:id',author,async(req,res)=>{const result=await db.course.updateMany({where:{id:req.params.id,institutionId:tenant(req)},data:parse(courseSchema.partial(),req.body)});if(!result.count)fail(404,'Course not found.');await audit(req.user,'COURSE_UPDATED',req.params.id);res.json({ok:true});});
workspace.get('/questions',author,async(req,res)=>res.json(await db.question.findMany({where:{institutionId:tenant(req)},orderBy:{createdAt:'desc'}})));
workspace.post('/questions',author,async(req,res)=>{const row=await db.question.create({data:{...parse(questionSchema,req.body),institutionId:tenant(req)}});await audit(req.user,'QUESTION_CREATED',row.id);res.status(201).json(row);});
workspace.put('/questions/:id',author,async(req,res)=>{const result=await db.question.updateMany({where:{id:req.params.id,institutionId:tenant(req)},data:parse(questionSchema,req.body)});if(!result.count)fail(404,'Question not found.');await audit(req.user,'QUESTION_UPDATED',req.params.id);res.json({ok:true});});
workspace.delete('/questions/:id',author,async(req,res)=>{const q=await db.question.findFirst({where:{id:req.params.id,institutionId:tenant(req)},include:{_count:{select:{exams:true}}}});if(!q)fail(404,'Question not found.');if(q._count.exams)fail(409,'Remove this question from its exams first.');await db.question.delete({where:{id:q.id}});res.json({ok:true});});
workspace.get('/exams',async(req,res)=>{
  const student=req.user.role==='STUDENT';
  const exams=await db.exam.findMany({where:{institutionId:tenant(req),...(student?{status:'PUBLISHED',course:{status:'PUBLISHED'}}:{})},include:{course:{select:{title:true,code:true}},_count:{select:{questions:true,attempts:true}},questions:{select:{questionId:true,question:{select:{marks:true}}}}},orderBy:{createdAt:'desc'}});
  const payments=student?await db.payment.findMany({where:{studentId:req.user.id,status:'SUCCESS'},select:{examId:true}}):[];
  const attempts=student?await db.examAttempt.findMany({where:{studentId:req.user.id,institutionId:tenant(req)},select:{id:true,examId:true,status:true}}):[];
  res.json(exams.map(({questions,...e})=>({...e,totalMarks:questions.reduce((sum,q)=>sum+q.question.marks,0),questionIds:student?undefined:questions.map(q=>q.questionId),hasAccess:e.price===0||payments.some(p=>p.examId===e.id),myAttempts:attempts.filter(a=>a.examId===e.id)})));
});
async function saveExam(req,id){
  const {questionIds,...data}=parse(examSchema,req.body);const institutionId=tenant(req);
  return db.$transaction(async tx=>{
    if(id&&!await tx.exam.findFirst({where:{id,institutionId}}))fail(404,'Exam not found.');
    if(!await tx.course.findFirst({where:{id:data.courseId,institutionId}}))fail(400,'Choose a course from this institution.');
    const ids=[...new Set(questionIds)];
    if(await tx.question.count({where:{id:{in:ids},institutionId}})!==ids.length)fail(400,'Question does not belong to this institution.');
    if(data.status==='PUBLISHED'&&!ids.length)fail(400,'Add at least one question before publishing.');
    if(id)await tx.examQuestion.deleteMany({where:{examId:id}});
    const record={...data,startsAt:data.startsAt?new Date(data.startsAt):null,endsAt:data.endsAt?new Date(data.endsAt):null,questions:{create:ids.map(questionId=>({questionId}))}};
    return id?tx.exam.update({where:{id},data:record}):tx.exam.create({data:{...record,institutionId}});
  });
}
workspace.post('/exams',author,async(req,res)=>{const row=await saveExam(req);await audit(req.user,'EXAM_CREATED',row.id);res.status(201).json(row);});
workspace.put('/exams/:id',author,async(req,res)=>{const row=await saveExam(req,req.params.id);await audit(req.user,'EXAM_UPDATED',row.id);res.json(row);});
workspace.get('/settings',admin,async(req,res)=>res.json(await db.institution.findUnique({where:{id:tenant(req)}})));
workspace.patch('/settings',admin,async(req,res)=>{
  const data=parse(z.object({name:z.string().min(1).max(200),email:z.string().email(),phone:z.string().max(100),address:z.string().max(500),website:z.union([z.literal(''),z.string().url()]),description:z.string().max(2000),settings:z.object({gradingBands:z.array(z.object({min:z.number().min(0).max(100),grade:z.string().min(1).max(10)})).min(1).max(20).refine(b=>b.some(x=>x.min===0),'Include a grading band starting at 0.')})}),req.body);
  res.json(await db.institution.update({where:{id:tenant(req)},data}));await audit(req.user,'SETTINGS_UPDATED',tenant(req));
});
workspace.get('/audit',admin,async(req,res)=>res.json(await db.auditLog.findMany({where:{institutionId:tenant(req)},orderBy:{createdAt:'desc'},take:100})));
workspace.get('/dashboard',async(req,res)=>{
  const institutionId=tenant(req),student=req.user.role==='STUDENT';
  const [students,exams,courses,payments,attempts,results,activity]=await Promise.all([
    db.user.count({where:{institutionId,role:'STUDENT',active:true}}),db.exam.findMany({where:{institutionId},include:{course:{select:{title:true}},_count:{select:{questions:true,attempts:true}}},orderBy:{createdAt:'desc'}}),db.course.count({where:{institutionId}}),
    db.payment.findMany({where:{institutionId,...(student?{studentId:req.user.id}:{})},orderBy:{createdAt:'desc'}}),
    db.examAttempt.findMany({where:{institutionId,...(student?{studentId:req.user.id}:{})},select:{id:true,startedAt:true,status:true,student:{select:{name:true}},exam:{select:{title:true}}},orderBy:{startedAt:'desc'}}),
    db.result.findMany({where:{institutionId,...(student?{released:true,attempt:{studentId:req.user.id}}:{})},select:{percentage:true,passed:true,status:true,createdAt:true}}),
    db.auditLog.findMany({where:{institutionId,...(student?{userId:req.user.id}:{})},orderBy:{createdAt:'desc'},take:5})]);
  const graded=results.filter(r=>r.status==='GRADED');
  const chart=Array.from({length:7},(_,i)=>{const date=new Date();date.setDate(date.getDate()-6+i);const key=date.toISOString().slice(0,10);return {day:date.toLocaleDateString('en-US',{weekday:'short'}),attempts:attempts.filter(a=>a.startedAt.toISOString().startsWith(key)).length,completed:attempts.filter(a=>a.startedAt.toISOString().startsWith(key)&&a.status!=='STARTED').length};});
  res.json({students,courses,examCount:exams.length,published:exams.filter(e=>e.status==='PUBLISHED').length,revenue:payments.filter(p=>p.status==='SUCCESS').reduce((s,p)=>s+p.amount,0),attemptCount:attempts.length,passRate:graded.length?Math.round(graded.filter(r=>r.passed).length/graded.length*100):0,pendingGrading:results.filter(r=>r.status==='UNDER_REVIEW').length,chart,exams:student?exams.filter(e=>e.status==='PUBLISHED'):exams.slice(0,4),recentAttempts:attempts.slice(0,5),activity,distribution:[{name:'Passed',value:graded.filter(r=>r.passed).length},{name:'Needs improvement',value:graded.filter(r=>!r.passed).length},{name:'Under review',value:results.length-graded.length}]});
});
workspace.get('/platform',roles('SUPER_ADMIN'),async(req,res)=>{const [institutions,users,payments,auditLogs]=await Promise.all([db.institution.findMany({include:{_count:{select:{users:true,exams:true}},subscriptions:true},orderBy:{createdAt:'desc'}}),db.user.count(),db.payment.aggregate({where:{status:'SUCCESS'},_sum:{amount:true}}),db.auditLog.findMany({orderBy:{createdAt:'desc'},take:50})]);res.json({institutions,users,revenue:payments._sum.amount||0,audit:auditLogs});});
workspace.patch('/platform/institutions/:id',roles('SUPER_ADMIN'),async(req,res)=>{const data=parse(z.object({status:z.enum(['PENDING','ACTIVE','SUSPENDED'])}),req.body);res.json(await db.institution.update({where:{id:req.params.id},data}));await audit(req.user,'INSTITUTION_'+data.status,req.params.id);});
workspace.post('/platform/subscriptions',roles('SUPER_ADMIN'),async(req,res)=>{const data=parse(z.object({institutionId:z.string(),plan:z.enum(['STARTER','GROWTH','ENTERPRISE']),status:z.enum(['TRIAL','ACTIVE','EXPIRED','CANCELLED']),endsAt:z.string().datetime()}),req.body);res.json(await db.subscription.create({data:{...data,endsAt:new Date(data.endsAt)}}));await audit(req.user,'SUBSCRIPTION_UPDATED',data.institutionId);});
