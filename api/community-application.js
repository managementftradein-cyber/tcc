const { sb } = require('./_supabase');
const { checkRateLimit } = require('./_ratelimit');

function bearer(req){const h=req.headers.authorization||'';return h.startsWith('Bearer ')?h.slice(7):''}
function body(req){return typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{})}
async function userFrom(req){const token=bearer(req);if(!token)return null;const db=sb();const {data,error}=await db.auth.getUser(token);if(error||!data.user)return null;return data.user}
async function role(db,user){
  const emails=String(process.env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(emails.includes(String(user.email||'').toLowerCase()))return {role:'admin',department_id:null};
  const {data,error}=await db.from('user_roles').select('role,department_id').eq('user_id',user.id).maybeSingle();
  if(error)throw error;return data||{role:null,department_id:null};
}
module.exports=async(req,res)=>{try{
 const db=sb();
 if(req.method==='POST' && !bearer(req)){
   const b=body(req);
   if(String(b.website||'').trim())return res.status(400).json({error:'Invalid application'});
   const {limited}=await checkRateLimit(db,req,'community-application',{max:3,windowMinutes:30});
   if(limited)return res.status(429).json({error:'Too many applications submitted recently. Please try again later.'});
   const full_name=String(b.full_name||'').trim().slice(0,120),email=String(b.email||'').trim().toLowerCase().slice(0,200),phone=String(b.phone||'').trim().slice(0,40),department_id=String(b.department_id||'').trim(),bio=String(b.bio||'').trim().slice(0,1000),reason=String(b.reason||'').trim().slice(0,1500),username=String(b.username||'').trim().toLowerCase().replace(/[^a-z0-9_.-]/g,'').slice(0,40);
   if(full_name.length<2||!/^\S+@\S+\.\S+$/.test(email)||!department_id)return res.status(400).json({error:'Please provide your full name, a valid email and department'});
   const {data:dept}=await db.from('departments').select('id,name').eq('id',department_id).eq('is_active',true).maybeSingle();if(!dept)return res.status(400).json({error:'Selected department is unavailable'});
   const {data:existing}=await db.from('community_applications').select('id,status').eq('email',email).in('status',['pending','approved']).maybeSingle();if(existing)return res.status(409).json({error:'An application for this email is already under review or approved.'});
   const {data,error}=await db.from('community_applications').insert({full_name,email,phone,department_id,username:username||null,bio:bio||null,reason:reason||null,status:'pending'}).select('id').single();if(error)throw error;
   return res.status(201).json({ok:true,id:data.id,message:'Application submitted. The church team will review it before Community access is created.'});
 }
 const user=await userFrom(req);if(!user)return res.status(401).json({error:'Authentication required'});const rl=await role(db,user);if(!['admin','department_head'].includes(rl.role))return res.status(403).json({error:'Application management is restricted'});
 if(req.method==='GET'){
   let q=db.from('community_applications').select('*,departments(name)').order('created_at',{ascending:false}).limit(500);
   if(rl.role==='department_head')q=q.eq('department_id',rl.department_id);
   const {data,error}=await q;if(error)throw error;return res.json({items:data||[],role:rl});
 }
 if(req.method==='PATCH'){
   const b=body(req),id=b.id; if(!id)return res.status(400).json({error:'id required'});
   const {data:app,error:ae}=await db.from('community_applications').select('*').eq('id',id).maybeSingle();if(ae)throw ae;if(!app)return res.status(404).json({error:'Application not found'});
   if(rl.role==='department_head'&&app.department_id!==rl.department_id)return res.status(403).json({error:'You can only manage your own department'});
   const action=b.action;
   if(action==='reject'){
     const {data,error}=await db.from('community_applications').update({status:'rejected',reviewed_by:user.id,reviewed_at:new Date().toISOString(),review_note:String(b.note||'').trim().slice(0,1500)||null}).eq('id',id).select().single();if(error)throw error;return res.json(data);
   }
   if(action==='approve'){
     if(app.status!=='pending')return res.status(400).json({error:'Only pending applications can be approved'});
     let target=null;const {data:list,error:le}=await db.auth.admin.listUsers({page:1,perPage:1000});if(le)throw le;target=(list?.users||[]).find(u=>String(u.email||'').toLowerCase()===app.email);
     let invited=false;if(!target){const {data:newUser,error:ie}=await db.auth.admin.inviteUserByEmail(app.email,{data:{full_name:app.full_name,department_id:app.department_id,community_application_id:app.id}});if(ie)throw ie;target=newUser.user;invited=true;}
     const {error:ma}=await db.from('member_access').upsert({user_id:target.id,department_id:app.department_id,status:'pending',granted_by:user.id,granted_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'user_id'});if(ma)throw ma;
     const {error:mp}=await db.from('member_profiles').upsert({user_id:target.id,full_name:app.full_name,username:app.username||null,bio:app.bio||null,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(mp)throw mp;
     const {data:updated,error}=await db.from('community_applications').update({status:'approved',reviewed_by:user.id,reviewed_at:new Date().toISOString(),review_note:String(b.note||'').trim().slice(0,1500)||null,provisioned_user_id:target.id}).eq('id',id).select().single();if(error)throw error;
     return res.json({application:updated,invited,pending_verification:true});
   }
   return res.status(400).json({error:'Unknown action'});
 }
 return res.status(405).json({error:'Method not allowed'});
}catch(e){console.error(e);return res.status(e.status||500).json({error:e.message||'Server error'})}};
