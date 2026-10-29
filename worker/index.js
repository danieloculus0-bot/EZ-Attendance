// Secure email-only backend for EZ Attendance. Do not place credentials here.
// Supports Cloudflare native Email Sending (EMAIL binding) or Resend (RESEND_API_KEY).
const REASONS={early:'Leaving early',late:'Running late',absent:'Absent / calling in',timeoff:'Requesting time off',other:'Other attendance notice'};
const trim=(value,max=250)=>typeof value==='string'?value.trim().slice(0,max):'';
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const validTime=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const validEmail=s=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)&&s.length<=254;
function reply(body,status,origin){
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
if(origin)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'});
return new Response(JSON.stringify(body),{status,headers});
}
async function verify(token,ip,env){
const params=new URLSearchParams({secret:env.TURNSTILE_SECRET,response:token});
if(ip)params.set('remoteip',ip);
const check=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:params});
if(!check.ok)return false;
const result=await check.json();
return result.success===true&&result.hostname===(env.APP_HOSTNAME||'danieloculus0-bot.github.io');
}
async function email(env,to,subject,body){
if(env.EMAIL&&typeof env.EMAIL.send==='function'){
await env.EMAIL.send({to,from:env.FROM_EMAIL,subject,text:body});return true;
}
if(env.RESEND_API_KEY){
const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:env.FROM_EMAIL,to:[to],subject,text:body})});
return r.ok;
}
return false;
}
export default {async fetch(request,env){
const origin=request.headers.get('Origin'),allowed=(env.APP_ORIGIN||'https://danieloculus0-bot.github.io').replace(/\/$/,'');
if(origin!==allowed)return reply({ok:false,error:'Origin not permitted'},403);
const path=new URL(request.url).pathname;
if(path!=='/notify')return reply({ok:false,error:'Not found'},404,allowed);
if(request.method==='OPTIONS')return reply({ok:true},200,allowed);
if(request.method!=='POST')return reply({ok:false,error:'Method not allowed'},405,allowed);
if(!env.HR_EMAIL||!validEmail(env.HR_EMAIL)||!env.FROM_EMAIL||!env.TURNSTILE_SECRET||(!env.EMAIL&&!env.RESEND_API_KEY))return reply({ok:false,error:'Service not configured'},503,allowed);
if(!request.headers.get('Content-Type')?.toLowerCase().includes('application/json'))return reply({ok:false,error:'JSON required'},415,allowed);
if(Number(request.headers.get('Content-Length')||0)>10000)return reply({ok:false,error:'Request too large'},413,allowed);
const raw=await request.text();
if(raw.length>10000)return reply({ok:false,error:'Request too large'},413,allowed);
let input;try{input=JSON.parse(raw)}catch{return reply({ok:false,error:'Invalid JSON'},400,allowed)}
if(!input||typeof input!=='object'||Array.isArray(input))return reply({ok:false,error:'Invalid data'},400,allowed);
const d={};
for(const [key,max] of Object.entries({name:100,employeeNumber:30,email:254,phone:30,department:80,reason:25,
leaveDate:10,leaveTime:5,arrivalDate:10,arrivalTime:5,absenceDate:10,returnDate:10,
startDate:10,endDate:10,otherDetails:700,pto:5,ptoHours:8,comments:1000})){d[key]=trim(input[key],max)}
if(!d.name||!d.employeeNumber||!validEmail(d.email)||!d.phone||!REASONS[d.reason])return reply({ok:false,error:'Required fields missing'},400,allowed);
if(/[\r\n]/.test(d.name+d.employeeNumber+d.email+d.phone))return reply({ok:false,error:'Invalid fields'},400,allowed);
if(d.reason==='early'&&(!validDate(d.leaveDate)||!validTime(d.leaveTime)))return reply({ok:false,error:'Date and time required'},400,allowed);
if(d.reason==='late'&&(!validDate(d.arrivalDate)||!validTime(d.arrivalTime)))return reply({ok:false,error:'Date and time required'},400,allowed);
if(d.reason==='absent'&&(!validDate(d.absenceDate)||(d.returnDate&&(!validDate(d.returnDate)||d.returnDate<d.absenceDate))))return reply({ok:false,error:'Invalid absence dates'},400,allowed);
if(d.reason==='timeoff'&&(!validDate(d.startDate)||!validDate(d.endDate)||d.endDate<d.startDate))return reply({ok:false,error:'Invalid time off dates'},400,allowed);
if(d.reason==='other'&&!d.otherDetails)return reply({ok:false,error:'Details required'},400,allowed);
const ptoApplies=['early','absent','timeoff'].includes(d.reason);
if(ptoApplies&&!['yes','no'].includes(d.pto))return reply({ok:false,error:'PTO selection required'},400,allowed);
if(ptoApplies&&d.pto==='yes'&&(!Number.isFinite(Number(d.ptoHours))||Number(d.ptoHours)<0.25||Number(d.ptoHours)>240||!Number.isInteger(Number(d.ptoHours)*4)))return reply({ok:false,error:'Invalid PTO hours'},400,allowed);
if(typeof input.turnstileToken!=='string'||input.turnstileToken.length<10||input.turnstileToken.length>2048)return reply({ok:false,error:'Verification required'},403,allowed);
let verified=false;try{verified=await verify(input.turnstileToken,request.headers.get('CF-Connecting-IP'),env)}catch{}
if(!verified)return reply({ok:false,error:'Verification failed'},403,allowed);
const now=new Date(),reference='EZ-'+now.toISOString().slice(0,10).replaceAll('-','')+'-'+crypto.randomUUID().slice(0,8).toUpperCase();
const stamp=new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Chicago'}).format(now)+' Central';
const detail={
early:'Date: '+d.leaveDate+'\nPlanned departure: '+d.leaveTime,
late:'Arrival date: '+d.arrivalDate+'\nExpected arrival: '+d.arrivalTime,
absent:'Absent date: '+d.absenceDate+'\nExpected return: '+(d.returnDate||'Not provided'),
timeoff:'First day off: '+d.startDate+'\nLast day off: '+d.endDate,
other:'Details: '+d.otherDetails
}[d.reason];
const body=[
'EZ ATTENDANCE NOTIFICATION','Reference: '+reference,'Received: '+stamp,
'Name: '+d.name,'Employee number: '+d.employeeNumber,
'Email: '+d.email,'Phone: '+d.phone,'Department: '+(d.department||'Not provided'),
'Reason: '+REASONS[d.reason],detail,
'PTO requested: '+(ptoApplies?(d.pto==='yes'?'Yes':'No'):'Not applicable'),
...(ptoApplies&&d.pto==='yes'?['PTO hours requested: '+d.ptoHours]:[]),
'Additional comments: '+(d.comments||'None'),
'','PTO requests are not approvals.'
].join('\n');
const subject='[EZ Attendance] '+REASONS[d.reason]+' | '+d.name+' | '+reference;
try{
const accepted=await email(env,env.HR_EMAIL,subject,body);
if(!accepted)return reply({ok:false,error:'HR notification not accepted'},502,allowed);
let receiptSent=false;
try{receiptSent=await email(env,d.email,'EZ Attendance receipt | '+reference,
['EZ Attendance receipt','Reference: '+reference,'Received: '+stamp,'Name: '+d.name,'Reason: '+REASONS[d.reason],detail,
'HR notification accepted by email service. This is not approval of PTO or leave.'].join('\n'))}catch{}
return reply({ok:true,reference,receiptSent},200,allowed);
}catch(err){
console.error('Email sending error',err&&err.code||'unknown');
return reply({ok:false,error:'HR notification not accepted'},502,allowed);
}
}};