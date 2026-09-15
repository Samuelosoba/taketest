import { db, fail } from './core.js';
export const normalize = text => String(text || '').trim().toLocaleLowerCase().replace(/\s+/g,' ');
export function markQuestions(questions, answers, previous = []) {
  return questions.map(q => {
    const answer = answers[q.id];
    if (q.type === 'ESSAY') return previous.find(item=>item.questionId===q.id) || {questionId:q.id,marks:q.marks,awarded:null,correct:false,comment:''};
    const selected = Array.isArray(answer) ? [...new Set(answer)].sort() : [];
    const correctIds = q.options.filter(o=>o.correct).map(o=>o.id).sort();
    const correct = q.type === 'SHORT' ? !!normalize(answer) && q.acceptedAnswers.some(a=>normalize(a)===normalize(answer)) : selected.length>0 && JSON.stringify(selected)===JSON.stringify(correctIds);
    return {questionId:q.id,marks:q.marks,awarded:correct?q.marks:0,correct,comment:''};
  });
}
export function summarize(breakdown, passMark, bands) {
  const totalMarks = breakdown.reduce((s,b)=>s+b.marks,0);
  const obtainedMarks = breakdown.reduce((s,b)=>s+(b.awarded||0),0);
  const percentage = totalMarks ? Math.round(obtainedMarks/totalMarks*10000)/100 : 0;
  const pending = breakdown.some(b=>b.awarded===null);
  return {totalMarks,obtainedMarks,percentage,grade:pending?'—':([...bands].sort((a,b)=>b.min-a.min).find(b=>percentage>=b.min)?.grade||'F'),passed:!pending&&percentage>=passMark,status:pending?'UNDER_REVIEW':'GRADED',breakdown};
}
export async function finishAttempt(id, user, expired = false) {
  return db.$transaction(async tx => {
    const a = await tx.examAttempt.findFirst({where:{id,...(user?{institutionId:user.institutionId,studentId:user.id}:{})},include:{result:true,exam:{include:{institution:true}}}});
    if (!a) fail(404,'Attempt not found.');
    if (a.status !== 'STARTED') return a.result;
    const lock = await tx.examAttempt.updateMany({where:{id,status:'STARTED',version:a.version},data:{status:'SUBMITTED',version:{increment:1},submittedAt:new Date()}});
    if (!lock.count) fail(409,'Attempt changed. Please try again.');
    const breakdown = markQuestions(a.snapshot.questions,a.answers);
    const summary = summarize(breakdown,a.snapshot.passMark,a.snapshot.gradingBands);
    const result = await tx.result.create({data:{institutionId:a.institutionId,attemptId:id,...summary,released:a.exam.releaseResults&&summary.status==='GRADED'}});
    await tx.examAttempt.update({where:{id},data:{status:expired?'EXPIRED':summary.status==='GRADED'?'GRADED':'GRADING'}});
    return result;
  });
}
export async function expireAttempts() {
  const rows = await db.examAttempt.findMany({where:{status:'STARTED',expectedEndAt:{lte:new Date()}},select:{id:true},take:100});
  for(const a of rows) { try { await finishAttempt(a.id,null,true); } catch(e) { if(e.status!==409 && e.code!=='P2002') console.error('Expiry failed',a.id,e.message); } }
}
export function candidateAttempt(a) {
  return {id:a.id,examId:a.examId,title:a.snapshot.title,status:a.status,startedAt:a.startedAt,expectedEndAt:a.expectedEndAt,serverTime:new Date(),answers:a.answers,fullscreen:a.snapshot.fullscreen,questions:a.snapshot.questions.map(({acceptedAnswers,...q})=>({...q,options:q.options.map(({correct,...o})=>o)}))};
}
