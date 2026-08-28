const { sb } = require('./_supabase');

function bearer(req){const h=req.headers.authorization||'';return h.startsWith('Bearer ')?h.slice(7):''}
async function authUser(req){const token=bearer(req);if(!token)throw Object.assign(new Error('Authentication required'),{status:401});const db=sb();const {data,error}=await db.auth.getUser(token);if(error||!data.user)throw Object.assign(new Error('Invalid or expired session'),{status:401});return data.user}
async function role(db,user){
  const emails=String(process.env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(emails.includes(String(user.email||'').toLowerCase())) return {role:'admin',department_id:null};
  const {data,error}=await db.from('user_roles').select('role,department_id').eq('user_id',user.id).maybeSingle();
  if(error)throw error;return data||{role:null,department_id:null};
}
async function access(db,id){const {data,error}=await db.from('member_access').select('*').eq('user_id',id).maybeSingle();if(error)throw error;return data}
function body(req){return typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{})}
function cleanEmoji(v){const x=String(v||'').trim();return x.length>0&&x.length<=16?x:null}
async function uploadChatMedia(db,user,payload){
  if(!payload?.dataUrl)return null;
  const type=String(payload.type||'').toLowerCase();
  const allowed={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
  if(!allowed[type])throw Object.assign(new Error('Only JPG, PNG, WebP or GIF images are supported.'),{status:400});
  const raw=String(payload.dataUrl);
  const m=raw.match(/^data:[^;]+;base64,(.+)$/);if(!m)throw Object.assign(new Error('Invalid image upload.'),{status:400});
  const buf=Buffer.from(m[1],'base64');if(buf.length>2*1024*1024)throw Object.assign(new Error('Chat images must be 2 MB or smaller.'),{status:400});
  const safe=String(payload.name||'image').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,80)||'image';
  const path=user.id+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'.'+allowed[type];
  const {error}=await db.storage.from('community-chat-media').upload(path,buf,{contentType:type,upsert:false,cacheControl:'3600'});if(error)throw error;
  const {data,error:se}=await db.storage.from('community-chat-media').createSignedUrl(path,60*60*24*7);if(se)throw se;
  return {url:data.signedUrl,name:safe,type};
}
module.exports=async(req,res)=>{
 try{
  const user=await authUser(req),db=sb(),r=req.query.action||'me',rl=await role(db,user);
  const me=await access(db,user.id);
  if(req.method==='GET' && r==='me'){
    const {data:profile}=await db.from('member_profiles').select('*').eq('user_id',user.id).maybeSingle();
    const {data:privacy}=await db.from('community_privacy').select('*').eq('user_id',user.id).maybeSingle();
    let accessWithDepartment=me;
    if(me?.department_id){const {data:dept,error:de}=await db.from('departments').select('id,name').eq('id',me.department_id).maybeSingle();if(de)throw de;accessWithDepartment={...me,departments:dept};}
    return res.json({user:{id:user.id,email:user.email},role:rl,access:accessWithDepartment,profile,privacy:privacy||{user_id:user.id,discoverable:true,allow_connections:true,allow_messages:true,show_online:true}});
  }
  if(req.method==='GET' && r==='members'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access has not been granted to this account'});
    const {data,error}=await db.from('member_profiles').select('user_id,full_name,username,avatar_url,bio,member_access!inner(department_id,departments(name)),community_privacy!inner(discoverable,allow_connections,allow_messages,show_online)').eq('member_access.status','active').eq('community_privacy.discoverable',true).order('full_name').limit(200);
    if(error)throw error;return res.json({items:data||[]});
  }
  if(req.method==='GET' && r==='connections'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const {data:rows,error}=await db.from('community_connections').select('requester_id,addressee_id,status,created_at,updated_at')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`).order('updated_at',{ascending:false});
    if(error)throw error;
    const otherIds=[...new Set((rows||[]).map(c=>c.requester_id===user.id?c.addressee_id:c.requester_id))];
    let profiles={};
    if(otherIds.length){
      const {data:profs,error:pe}=await db.from('member_profiles').select('user_id,full_name,username,avatar_url').in('user_id',otherIds);
      if(pe)throw pe;
      profiles=Object.fromEntries((profs||[]).map(p=>[p.user_id,p]));
    }
    const items=(rows||[]).map(c=>({...c,other:profiles[c.requester_id===user.id?c.addressee_id:c.requester_id]||null}));
    return res.json({items});
  }
  if(req.method==='POST' && r==='conversation'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});const {other_user_id}=body(req);if(!other_user_id||other_user_id===user.id)return res.status(400).json({error:'Invalid member'});
    const target=await access(db,other_user_id);if(!target||target.status!=='active')return res.status(403).json({error:'Member is not active'});
    const {data:targetPrivacy}=await db.from('community_privacy').select('allow_messages').eq('user_id',other_user_id).maybeSingle();
    if(targetPrivacy && !targetPrivacy.allow_messages)return res.status(403).json({error:'This member is not accepting private messages'});
    const conn=await connectionBetween(user.id,other_user_id);if(!conn||conn.status!=='accepted')return res.status(403).json({error:'You can chat only with accepted connections'});
    const {data:mine}=await db.from('conversation_members').select('conversation_id').eq('user_id',user.id);const ids=(mine||[]).map(x=>x.conversation_id);
    if(ids.length){const {data:theirs}=await db.from('conversation_members').select('conversation_id').eq('user_id',other_user_id).in('conversation_id',ids);if(theirs?.length)return res.json({id:theirs[0].conversation_id});}
    const {data:cv,error:ce}=await db.from('conversations').insert({}).select().single();if(ce)throw ce;
    const {error:meErr}=await db.from('conversation_members').insert([{conversation_id:cv.id,user_id:user.id},{conversation_id:cv.id,user_id:other_user_id}]);if(meErr)throw meErr;return res.status(201).json({id:cv.id});
  }
  if(req.method==='GET' && r==='department-groups'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const dept=me.department_id;
    if(!dept)return res.status(403).json({error:'Your account is not assigned to a department'});
    let {data:group,error}=await db.from('department_group_chats').select('id,name,department_id,departments(name)').eq('department_id',dept).maybeSingle();
    if(error)throw error;
    if(!group){
      const {data:g,error:ge}=await db.from('department_group_chats').insert({department_id:dept,name:'Department Group Chat',created_by:user.id}).select('id,name,department_id,departments(name)').single();
      if(ge)throw ge; group=g;
    }
    // Keep the departmental room membership synchronized with active approved members.
    const {data:activeMembers,error:ae}=await db.from('member_access').select('user_id').eq('department_id',dept).eq('status','active');if(ae)throw ae;
    // Reconcile membership on every load: only currently active approved members remain in the room.
    const {error:clearErr}=await db.from('department_group_members').delete().eq('group_id',group.id);if(clearErr)throw clearErr;
    if(activeMembers?.length){const rows=activeMembers.map(x=>({group_id:group.id,user_id:x.user_id}));const {error:je}=await db.from('department_group_members').insert(rows);if(je)throw je;}
    const {data:members,error:memErr}=await db.from('department_group_members').select('user_id,member_profiles(user_id,full_name,username,avatar_url)').eq('group_id',group.id);if(memErr)throw memErr;
    return res.json({group,members:members||[]});
  }
  if(req.method==='GET' && r==='department-group-messages'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const groupId=req.query.group_id;if(!groupId)return res.status(400).json({error:'group_id required'});
    const {data:group}=await db.from('department_group_chats').select('department_id').eq('id',groupId).maybeSingle();if(!group)return res.status(404).json({error:'Group not found'});
    if(group.department_id!==me.department_id)return res.status(403).json({error:'This is not your departmental group'});
    const {data:member}=await db.from('department_group_members').select('user_id').eq('group_id',groupId).eq('user_id',user.id).maybeSingle();if(!member)return res.status(403).json({error:'Not a group member'});
    const {data,error}=await db.from('department_group_messages').select('id,group_id,sender_id,body,created_at,reply_to_id,attachment_url,attachment_name,attachment_type').eq('group_id',groupId).order('created_at',{ascending:true}).limit(500);if(error)throw error;const mids=(data||[]).map(x=>x.id);let reactions=[];if(mids.length){const {data:rr,error:re}=await db.from('department_group_reactions').select('message_id,user_id,emoji').in('message_id',mids);if(re)throw re;reactions=rr||[]}const ids=[...new Set((data||[]).map(x=>x.sender_id))];let names={};if(ids.length){const {data:profiles,error:pe}=await db.from('member_profiles').select('user_id,full_name').in('user_id',ids);if(pe)throw pe;(profiles||[]).forEach(p=>names[p.user_id]=p.full_name)}return res.json({items:(data||[]).map(x=>({...x,sender_name:names[x.sender_id]||'Department member',reactions:reactions.filter(r=>r.message_id===x.id)}))});
  }
  if(req.method==='POST' && r==='department-group-message'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const {group_id,text,reply_to_id,attachment}=body(req);if(!group_id||(!String(text||'').trim()&&!attachment?.dataUrl))return res.status(400).json({error:'Message cannot be empty'});
    const {data:group}=await db.from('department_group_chats').select('department_id').eq('id',group_id).maybeSingle();if(!group)return res.status(404).json({error:'Group not found'});
    if(group.department_id!==me.department_id)return res.status(403).json({error:'You can only use your departmental group'});
    const {data:member}=await db.from('department_group_members').select('user_id').eq('group_id',group_id).eq('user_id',user.id).maybeSingle();if(!member)return res.status(403).json({error:'Not a group member'});
    let media=null;if(attachment?.dataUrl)media=await uploadChatMedia(db,user,attachment);const {data,error}=await db.from('department_group_messages').insert({group_id,sender_id:user.id,body:String(text||'').trim().slice(0,4000)||'(image)',reply_to_id:reply_to_id||null,attachment_url:media?.url||null,attachment_name:media?.name||null,attachment_type:media?.type||null}).select().single();if(error)throw error;const {data:gm}=await db.from('department_group_members').select('user_id').eq('group_id',group_id).neq('user_id',user.id);if(gm?.length)await db.from('community_notifications').insert(gm.map(x=>({user_id:x.user_id,actor_id:user.id,kind:'group_message',title:'Department group message',body:String(text).trim().slice(0,140),group_id,message_id:data.id})));return res.status(201).json(data);
  }
  if(req.method==='POST' && r==='department-group-create'){
    if(!['admin','department_head'].includes(rl.role))return res.status(403).json({error:'Only administrators and department heads can create departmental groups'});
    const reqBody=body(req),dept=reqBody.department_id||rl.department_id;if(!dept)return res.status(400).json({error:'department_id required'});
    if(rl.role==='department_head'&&dept!==rl.department_id)return res.status(403).json({error:'You can only create your own department group'});
    const {data,error}=await db.from('department_group_chats').upsert({department_id:dept,name:String(reqBody.name||'Department Group Chat').trim().slice(0,100),created_by:user.id},{onConflict:'department_id'}).select().single();if(error)throw error;return res.status(201).json(data);
  }
  if(req.method==='GET' && r==='conversations'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const {data,error}=await db.from('conversation_members').select('conversation_id').eq('user_id',user.id);if(error)throw error;const ids=(data||[]).map(x=>x.conversation_id);if(!ids.length)return res.json({items:[]});
    const {data:members,error:em}=await db.from('conversation_members').select('conversation_id,user_id,member_profiles(user_id,full_name,username,avatar_url)').in('conversation_id',ids);if(em)throw em;
    const items=[];for(const id of ids){const mm=(members||[]).filter(x=>x.conversation_id===id).map(x=>x.member_profiles);const {data:last}=await db.from('messages').select('id,body,created_at,sender_id,read_at,attachment_url').eq('conversation_id',id).order('created_at',{ascending:false}).limit(1);const {count:unread}=await db.from('messages').select('id',{count:'exact',head:true}).eq('conversation_id',id).neq('sender_id',user.id).is('read_at',null);items.push({id,members:mm,last_message:last?.[0]||null,unread_count:unread||0});}return res.json({items});
  }
  if(req.method==='GET' && r==='messages'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});const cid=req.query.conversation_id;if(!cid)return res.status(400).json({error:'conversation_id required'});
    const {data:cm,error:cmErr}=await db.from('conversation_members').select('user_id').eq('conversation_id',cid).eq('user_id',user.id).maybeSingle();if(cmErr)throw cmErr;if(!cm)return res.status(403).json({error:'Not a conversation member'});
    const {data,error}=await db.from('messages').select('id,conversation_id,sender_id,body,created_at,read_at,reply_to_id,attachment_url,attachment_name,attachment_type').eq('conversation_id',cid).order('created_at',{ascending:true}).limit(500);if(error)throw error;const ids=(data||[]).map(x=>x.id);let reactions=[];if(ids.length){const {data:rr,error:re}=await db.from('message_reactions').select('message_id,user_id,emoji').in('message_id',ids);if(re)throw re;reactions=rr||[]}const items=(data||[]).map(m=>({...m,reactions:reactions.filter(x=>x.message_id===m.id)}));return res.json({items});
  }
  if(req.method==='POST' && r==='message'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});const {conversation_id,body:text,reply_to_id,attachment}=body(req);if(!conversation_id&&!attachment?.dataUrl)return res.status(400).json({error:'Message cannot be empty'});
    const {data:cm,error:cmErr}=await db.from('conversation_members').select('user_id').eq('conversation_id',conversation_id).eq('user_id',user.id).maybeSingle();if(cmErr)throw cmErr;if(!cm)return res.status(403).json({error:'Not a conversation member'});
    let media=null;if(attachment?.dataUrl)media=await uploadChatMedia(db,user,attachment);const insert={conversation_id,sender_id:user.id,body:String(text||'').trim().slice(0,4000)||'(image)',reply_to_id:reply_to_id||null,attachment_url:media?.url||null,attachment_name:media?.name||null,attachment_type:media?.type||null};const {data,error}=await db.from('messages').insert(insert).select().single();if(error)throw error;const {data:others}=await db.from('conversation_members').select('user_id').eq('conversation_id',conversation_id).neq('user_id',user.id);if(others?.length)await db.from('community_notifications').insert(others.map(x=>({user_id:x.user_id,actor_id:user.id,kind:'direct_message',title:'New message',body:String(text).trim().slice(0,140),conversation_id,message_id:data.id})));return res.status(201).json(data);
  }
  if(req.method==='POST' && r==='reaction'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const b=body(req),emoji=cleanEmoji(b.emoji),kind=b.kind==='group'?'group':'direct';if(!b.message_id||!emoji)return res.status(400).json({error:'message_id and emoji required'});
    if(kind==='direct'){
      const {data:m,error:meErr}=await db.from('messages').select('conversation_id').eq('id',b.message_id).maybeSingle();if(meErr)throw meErr;if(!m)return res.status(404).json({error:'Message not found'});const {data:cm}=await db.from('conversation_members').select('user_id').eq('conversation_id',m.conversation_id).eq('user_id',user.id).maybeSingle();if(!cm)return res.status(403).json({error:'Not a conversation member'});const {data,error}=await db.from('message_reactions').upsert({message_id:b.message_id,user_id:user.id,emoji},{onConflict:'message_id,user_id'}).select().single();if(error)throw error;return res.json(data);
    }
    const {data:m,error:meErr}=await db.from('department_group_messages').select('group_id').eq('id',b.message_id).maybeSingle();if(meErr)throw meErr;if(!m)return res.status(404).json({error:'Message not found'});const {data:g}=await db.from('department_group_chats').select('department_id').eq('id',m.group_id).maybeSingle();if(!g||g.department_id!==me.department_id)return res.status(403).json({error:'Not your departmental group'});const {data:gm}=await db.from('department_group_members').select('user_id').eq('group_id',m.group_id).eq('user_id',user.id).maybeSingle();if(!gm)return res.status(403).json({error:'Not a group member'});const {data,error}=await db.from('department_group_reactions').upsert({message_id:b.message_id,user_id:user.id,emoji},{onConflict:'message_id,user_id'}).select().single();if(error)throw error;return res.json(data);
  }
  if(req.method==='DELETE' && r==='reaction'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});const b=body(req),kind=b.kind==='group'?'group':'direct';if(!b.message_id)return res.status(400).json({error:'message_id required'});const table=kind==='group'?'department_group_reactions':'message_reactions';const {error}=await db.from(table).delete().eq('message_id',b.message_id).eq('user_id',user.id);if(error)throw error;return res.json({ok:true});
  }
  if(req.method==='POST' && r==='block'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});const {blocked_id}=body(req);if(!blocked_id||blocked_id===user.id)return res.status(400).json({error:'Invalid member'});const {error}=await db.from('blocks').upsert({blocker_id:user.id,blocked_id});if(error)throw error;return res.json({ok:true});
  }
  if(req.method==='POST' && r==='report'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});const b=body(req);const {data,error}=await db.from('community_reports').insert({reporter_id:user.id,reported_id:b.reported_id||null,conversation_id:b.conversation_id||null,message_id:b.message_id||null,reason:String(b.reason||'').trim()}).select().single();if(error)throw error;return res.status(201).json(data);
  }
  // Community structure administration: departments, group names and scoped department heads.
  if((req.method==='GET'||req.method==='POST') && r==='manage-structure'){
    if(!['admin','department_head'].includes(rl.role))return res.status(403).json({error:'Structure management is restricted'});
    if(req.method==='GET'){
      let q=db.from('departments').select('id,name,is_active,department_group_chats(id,name,created_by)').eq('is_active',true).order('display_order',{ascending:true});
      if(rl.role==='department_head')q=q.eq('id',rl.department_id);
      const {data:departments,error}=await q;if(error)throw error; const ids=(departments||[]).map(d=>d.id); let heads=[];
      if(ids.length){const {data:h,error:he}=await db.from('user_roles').select('user_id,department_id,role,member_profiles(user_id,full_name,username)').eq('role','department_head').in('department_id',ids);if(he)throw he;heads=h||[];}
      return res.json({items:(departments||[]).map(d=>({...d,head:heads.find(h=>h.department_id===d.id)||null,group:(d.department_group_chats||[])[0]||null})),role:rl});
    }
    const b=body(req),action=b.action,dept=b.department_id||null;if(!dept)return res.status(400).json({error:'department_id required'});
    if(rl.role==='department_head'&&dept!==rl.department_id)return res.status(403).json({error:'You can only manage your own department'});
    if(action==='group-name'){const name=String(b.name||'').trim().slice(0,100);if(!name)return res.status(400).json({error:'Group name is required'});const {data,error}=await db.from('department_group_chats').upsert({department_id:dept,name,created_by:user.id},{onConflict:'department_id'}).select().single();if(error)throw error;return res.json(data);}
    if(action==='assign-head'){if(rl.role!=='admin')return res.status(403).json({error:'Only a super admin can assign department heads'});const email=String(b.email||'').trim().toLowerCase();if(!email)return res.status(400).json({error:'Email is required'});const {data:list,error:le}=await db.auth.admin.listUsers({page:1,perPage:1000});if(le)throw le;const target=(list?.users||[]).find(u=>String(u.email||'').toLowerCase()===email);if(!target)return res.status(404).json({error:'No Supabase user exists with that email. Grant community access first.'});const a=await access(db,target.id);if(!a||a.status!=='active'||a.department_id!==dept)return res.status(403).json({error:'User must have active community access in this department'});await db.from('user_roles').delete().eq('user_id',target.id).eq('role','department_head');const {data,error}=await db.from('user_roles').upsert({user_id:target.id,role:'department_head',department_id:dept},{onConflict:'user_id'}).select().single();if(error)throw error;return res.json(data);}
    if(action==='remove-head'){if(rl.role!=='admin')return res.status(403).json({error:'Only a super admin can remove department heads'});const {error}=await db.from('user_roles').delete().eq('department_id',dept).eq('role','department_head');if(error)throw error;return res.json({ok:true});}
    return res.status(400).json({error:'Unknown structure action'});
  }
  // Controlled member provisioning. Admins can use any department; department heads only their department.
  if((req.method==='GET'||req.method==='POST') && r==='manage-members'){
    if(!['admin','department_head'].includes(rl.role))return res.status(403).json({error:'Member management is restricted to administrators and department heads'});
    if(req.method==='GET'){
      let q=db.from('member_access').select('*,member_profiles(user_id,full_name,username,avatar_url,bio),departments(id,name)').order('created_at',{ascending:false}).limit(500);
      if(rl.role==='department_head')q=q.eq('department_id',rl.department_id);const {data,error}=await q;if(error)throw error;return res.json({items:data||[],role:rl});
    }
    const b=body(req),action=b.action||'grant';
    if(action==='grant'){
      const email=String(b.email||'').trim().toLowerCase(),dept=b.department_id||null;if(!email)return res.status(400).json({error:'Email is required'});if(rl.role==='department_head'&&dept!==rl.department_id)return res.status(403).json({error:'You can only grant access to your own department'});
      let target=null;const {data:list}=await db.auth.admin.listUsers({page:1,perPage:1000});target=(list?.users||[]).find(u=>String(u.email||'').toLowerCase()===email);
      if(!target){const {data:newUser,error:ie}=await db.auth.admin.inviteUserByEmail(email,{data:{invited_by:user.id,department_id:dept}});if(ie)throw ie;target=newUser.user;}
      const isNew=!list?.users?.some(u=>u.id===target.id);
      const {data,error}=await db.from('member_access').upsert({user_id:target.id,department_id:dept,status:'pending',granted_by:user.id,granted_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'user_id'}).select().single();if(error)throw error;
      const full=String(b.full_name||target.user_metadata?.full_name||email.split('@')[0]).trim();await db.from('member_profiles').upsert({user_id:target.id,full_name:full,username:b.username||null,bio:b.bio||null,updated_at:new Date().toISOString()},{onConflict:'user_id'});
      return res.status(201).json({access:data,user_id:target.id,invited:isNew,pending_verification:true});
    }
    if(action==='approve'){
      const targetId=b.user_id;if(!targetId)return res.status(400).json({error:'user_id required'});
      const current=await access(db,targetId);if(!current)return res.status(404).json({error:'Member not found'});
      if(rl.role==='department_head'&&current.department_id!==rl.department_id)return res.status(403).json({error:'You can only approve members in your own department'});
      if(current.status==='active')return res.json(current);
      const {data,error}=await db.from('member_access').update({status:'active',identity_status:'verified',verified_by:user.id,verified_at:new Date().toISOString(),verification_note:String(b.verification_note||'').trim()||null,updated_at:new Date().toISOString()}).eq('user_id',targetId).select().single();if(error)throw error;
      await db.from('community_notifications').insert({user_id:targetId,actor_id:user.id,kind:'community_access_approved',title:'Community access approved',body:'Your church community access has been approved.'});await db.from('community_identity_audit').insert({user_id:targetId,actor_id:user.id,action:'verified',department_id:current.department_id,note:String(b.verification_note||'').trim().slice(0,1000)||'Member identity verified'});
      return res.json(data);
    }
    if(action==='status'){
      const targetId=b.user_id;if(!targetId)return res.status(400).json({error:'user_id required'});const current=await access(db,targetId);if(!current)return res.status(404).json({error:'Member not found'});if(rl.role==='department_head'&&current.department_id!==rl.department_id)return res.status(403).json({error:'You can only manage your own department'});const status=b.status;if(!['active','suspended','revoked'].includes(status))return res.status(400).json({error:'Invalid status'});const identity_status=status==='active'?'verified':status;const {data,error}=await db.from('member_access').update({status,identity_status,updated_at:new Date().toISOString()}).eq('user_id',targetId).select().single();if(error)throw error;const auditAction=status==='active'?'reactivated':status;await db.from('community_identity_audit').insert({user_id:targetId,actor_id:user.id,action:auditAction,department_id:current.department_id,note:String(b.note||'').trim().slice(0,1000)||null});return res.json(data);
    }
  }

  if(req.method==='GET' && r==='groups'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const dept=me.department_id||'00000000-0000-0000-0000-000000000000';
    const {data,error}=await db.from('community_groups').select('id,name,description,department_id,is_official').or(`department_id.is.null,department_id.eq.${dept}`).order('name');if(error)throw error;return res.json({items:data||[]});
  }
  if(req.method==='GET' && r==='events'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const dept=me.department_id||'00000000-0000-0000-0000-000000000000';
    const {data,error}=await db.from('community_events').select('*').or(`department_id.is.null,department_id.eq.${dept}`).gte('starts_at',new Date().toISOString()).order('starts_at',{ascending:true}).limit(100);if(error)throw error;
    const ids=(data||[]).map(x=>x.id);let rs=[];if(ids.length){const q=await db.from('community_event_rsvps').select('event_id,user_id,status').in('event_id',ids);if(q.error)throw q.error;rs=q.data||[];}return res.json({items:(data||[]).map(e=>({...e,rsvps:rs.filter(x=>x.event_id===e.id),my_rsvp:rs.find(x=>x.event_id===e.id&&x.user_id===user.id)?.status||null}))});
  }
  if(req.method==='POST' && r==='event-rsvp'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});const b=body(req);if(!b.event_id||!['going','interested','not_going'].includes(b.status))return res.status(400).json({error:'Invalid RSVP'});
    const {data:e,error:ee}=await db.from('community_events').select('id,department_id').eq('id',b.event_id).maybeSingle();if(ee)throw ee;if(!e)return res.status(404).json({error:'Event not found'});if(e.department_id&&e.department_id!==me.department_id)return res.status(403).json({error:'This event is outside your department'});
    const {data,error}=await db.from('community_event_rsvps').upsert({event_id:b.event_id,user_id:user.id,status:b.status,updated_at:new Date().toISOString()},{onConflict:'event_id,user_id'}).select().single();if(error)throw error;return res.json(data);
  }
  if(req.method==='GET' && r==='announcements'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});const dept=me.department_id||'00000000-0000-0000-0000-000000000000';const {data,error}=await db.from('community_announcements').select('*').eq('published',true).or(`department_id.is.null,department_id.eq.${dept}`).order('created_at',{ascending:false}).limit(100);if(error)throw error;return res.json({items:data||[]});
  }

  // v16: administrative content management.
  // Uses the existing authenticated user and service-role db client.
  const isSuperAdmin = !!(me && (me.role === 'super_admin' || me.role === 'admin'));
  const isDeptHead = !!(me && (me.role === 'department_head' || me.role === 'dept_head'));

  async function contentScopeOk(department_id){
    if(isSuperAdmin) return true;
    if(!isDeptHead) return false;
    return !!department_id && department_id===me.department_id;
  }


  // v17: notification center

  // v18: member connections and private-chat gate
  async function connectionBetween(a,b){
    const direct=await db.from('community_connections').select('requester_id,addressee_id,status').eq('requester_id',a).eq('addressee_id',b).maybeSingle();
    if(direct.error)throw direct.error;
    if(direct.data)return direct.data;
    const reverse=await db.from('community_connections').select('requester_id,addressee_id,status').eq('requester_id',b).eq('addressee_id',a).maybeSingle();
    if(reverse.error)throw reverse.error;
    return reverse.data||null;
  }
  async function activeMember(uid){
    const q=await db.from('member_access').select('user_id,status,department_id').eq('user_id',uid).eq('status','active').maybeSingle();
    if(q.error)throw q.error;
    return q.data;
  }

  // v18 member connections: community.html's Discover/Connections views and
  // the older `connections` table have both been retired in favor of this
  // table. The GET r==='connections' handler above (near the top of this
  // file) now reads from community_connections, not the old table.

  if(req.method==='POST' && r==='connection-request'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const b=body(req), target=b.user_id;
    if(!target||target===user.id)return res.status(400).json({error:'Invalid member'});
    const targetAccess=await activeMember(target);
    if(!targetAccess)return res.status(404).json({error:'Member is not an active Community member'});
    const {data:privacy,error:privacyError}=await db.from('community_privacy').select('discoverable,allow_connections').eq('user_id',target).maybeSingle();
    if(privacyError && privacyError.code!=='PGRST116')throw privacyError;
    if(privacy && (!privacy.discoverable || !privacy.allow_connections))return res.status(403).json({error:'This member is not accepting connection requests'});
    const {data:blocked}=await db.from('blocks').select('*').or(`and(blocker_id.eq.${user.id},blocked_id.eq.${target}),and(blocker_id.eq.${target},blocked_id.eq.${user.id})`).limit(1);
    if(blocked?.length)return res.status(403).json({error:'Connection unavailable'});
    const existing=await connectionBetween(user.id,target);
    if(existing){
      if(existing.status==='accepted')return res.json(existing);
      if(existing.status==='pending')return res.status(409).json({error:'Connection request already pending'});
      if(existing.status==='blocked')return res.status(403).json({error:'Connection is blocked'});
      // status is 'declined' from an earlier request in this same direction — fall
      // through to upsert below rather than insert, since (requester_id, addressee_id)
      // is the table's primary key and a plain insert would hit a duplicate-key error.
    }
    const {data,error}=await db.from('community_connections').upsert({requester_id:user.id,addressee_id:target,status:'pending',updated_at:new Date().toISOString()},{onConflict:'requester_id,addressee_id'}).select().single();
    if(error)throw error;
    await db.from('community_notifications').insert({user_id:target,actor_id:user.id,kind:'connection_request',title:'New connection request',body:'A Community member wants to connect with you.',link:'/community.html?view=discover',metadata:{requester_id:user.id}});
    return res.status(201).json(data);
  }

  if(req.method==='POST' && r==='connection-response'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const b=body(req), requester=b.requester_id, status=b.status;
    if(!requester||!['accepted','declined'].includes(status))return res.status(400).json({error:'Invalid response'});
    const {data:row,error}=await db.from('community_connections').select('*').eq('requester_id',requester).eq('addressee_id',user.id).maybeSingle();
    if(error)throw error;if(!row)return res.status(404).json({error:'Connection request not found'});
    if(row.status!=='pending')return res.status(409).json({error:'This request has already been handled'});
    const {data,error:updateError}=await db.from('community_connections').update({status,updated_at:new Date().toISOString()}).eq('requester_id',requester).eq('addressee_id',user.id).select().single();
    if(updateError)throw updateError;
    if(status==='accepted')await db.from('community_notifications').insert({user_id:requester,actor_id:user.id,kind:'connection_accepted',title:'Connection accepted',body:'Your connection request was accepted.',link:'/community.html?view=discover',metadata:{user_id:user.id}});
    return res.json(data);
  }

  // Blocking is handled by the existing block/unblock/blocked routes below
  // (the `blocks` table), which are already wired to the chat header's Block
  // button and the profile's blocked-members list. A separate
  // community_connections-based block status would duplicate that and could
  // drift out of sync with it, so connection-request above checks `blocks`
  // directly instead of maintaining a second blocking mechanism.

  if(req.method==='GET' && r==='can-chat'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const target=new URL(req.url,'http://localhost').searchParams.get('user_id');
    if(!target||target===user.id)return res.json({allowed:false});
    const targetAccess=await activeMember(target);if(!targetAccess)return res.json({allowed:false});
    const {data:blocked}=await db.from('blocks').select('*').or(`and(blocker_id.eq.${user.id},blocked_id.eq.${target}),and(blocker_id.eq.${target},blocked_id.eq.${user.id})`).limit(1);
    if(blocked?.length)return res.json({allowed:false,reason:'Messaging is unavailable'});
    const c=await connectionBetween(user.id,target);
    if(!c || c.status!=='accepted')return res.json({allowed:false,reason:'An accepted connection is required'});
    const {data:privacy,error:privacyError}=await db.from('community_privacy').select('allow_messages').eq('user_id',target).maybeSingle();
    if(privacyError && privacyError.code!=='PGRST116')throw privacyError;
    if(privacy && privacy.allow_messages===false)return res.json({allowed:false,reason:'This member is not accepting private messages'});
    return res.json({allowed:true});
  }

  if(req.method==='GET' && r==='notifications'){
    if(!user?.id)return res.status(401).json({error:'Authentication required'});
    const limit=Math.min(Number(new URL(req.url,'http://localhost').searchParams.get('limit')||50),100);
    const {data,error}=await db.from('community_notifications')
      .select('id,actor_id,kind,title,body,link,metadata,read_at,created_at')
      .eq('user_id',user.id).order('created_at',{ascending:false}).limit(limit);
    if(error)throw error;
    const {count,error:ce}=await db.from('community_notifications').select('id',{count:'exact',head:true}).eq('user_id',user.id).is('read_at',null);
    if(ce)throw ce;
    return res.json({items:data||[],unread_count:count||0});
  }

  if(req.method==='POST' && r==='notifications-read'){
    if(!user?.id)return res.status(401).json({error:'Authentication required'});
    const b=body(req);
    let q=db.from('community_notifications').update({read_at:new Date().toISOString()}).eq('user_id',user.id).is('read_at',null);
    if(b.id)q=q.eq('id',b.id);
    const {error}=await q;if(error)throw error;
    return res.json({ok:true});
  }

  if(req.method==='POST' && r==='notifications-read-all'){
    if(!user?.id)return res.status(401).json({error:'Authentication required'});
    const {error}=await db.from('community_notifications').update({read_at:new Date().toISOString()}).eq('user_id',user.id).is('read_at',null);
    if(error)throw error;
    return res.json({ok:true});
  }

  if(req.method==='POST' && r==='notifications-create'){
    if(!isSuperAdmin && !isDeptHead)return res.status(403).json({error:'Administrative access required'});
    const b=body(req);
    if(!b.user_id||!b.title)return res.status(400).json({error:'Recipient and title are required'});
    const {data,error}=await db.from('community_notifications').insert({
      user_id:b.user_id, actor_id:user.id, kind:'admin',
      title:String(b.title).trim().slice(0,160),
      body:String(b.body||'').slice(0,2000), link:b.link||null,
      metadata:b.metadata||{}
    }).select().single();
    if(error)throw error;
    return res.status(201).json(data);
  }

  if(req.method==='GET' && r==='manage-events'){
    if(!isSuperAdmin && !isDeptHead)return res.status(403).json({error:'Administrative access required'});
    let q=db.from('community_events').select('*').order('starts_at',{ascending:false}).limit(200);
    if(isDeptHead)q=q.eq('department_id',me.department_id);
    const {data,error}=await q;if(error)throw error;
    return res.json({items:data||[]});
  }

  if(req.method==='POST' && r==='manage-event'){
    if(!isSuperAdmin && !isDeptHead)return res.status(403).json({error:'Administrative access required'});
    const b=body(req);
    const department_id=b.department_id||null;
    if(!(await contentScopeOk(department_id)) && !(isSuperAdmin && !department_id))
      return res.status(403).json({error:'You cannot manage content for this department'});
    if(!b.title||!b.starts_at)return res.status(400).json({error:'Title and start time are required'});
    const payload={
      title:String(b.title).trim().slice(0,160),
      description:String(b.description||'').slice(0,5000),
      starts_at:b.starts_at,
      ends_at:b.ends_at||null,
      location:String(b.location||'').slice(0,300)||null,
      department_id,
      created_by:user.id,
      published:b.published!==false,
      cancelled:false,
      max_attendees:b.max_attendees?Number(b.max_attendees):null
    };
    if(b.id){
      const {data:old,error:oe}=await db.from('community_events').select('id,created_by,department_id').eq('id',b.id).maybeSingle();if(oe)throw oe;if(!old)return res.status(404).json({error:'Event not found'});
      if(!(await contentScopeOk(old.department_id)) && !(isSuperAdmin && !old.department_id))return res.status(403).json({error:'Not allowed'});
      delete payload.created_by;
      const {data,error}=await db.from('community_events').update(payload).eq('id',b.id).select().single();if(error)throw error;
      await db.from('community_content_audit').insert({actor_id:user.id,department_id:data.department_id,content_type:'event',content_id:data.id,action:'update',details:{title:data.title}});
      return res.json(data);
    }
    const {data,error}=await db.from('community_events').insert(payload).select().single();if(error)throw error;
    await db.from('community_content_audit').insert({actor_id:user.id,department_id:data.department_id,content_type:'event',content_id:data.id,action:'create',details:{title:data.title}});
    return res.status(201).json(data);
  }

  if(req.method==='DELETE' && r==='manage-event'){
    if(!isSuperAdmin && !isDeptHead)return res.status(403).json({error:'Administrative access required'});
    const b=body(req); if(!b.id)return res.status(400).json({error:'id required'});
    const {data:e,error:ee}=await db.from('community_events').select('id,department_id,title').eq('id',b.id).maybeSingle();if(ee)throw ee;if(!e)return res.status(404).json({error:'Event not found'});
    if(!(await contentScopeOk(e.department_id)) && !(isSuperAdmin && !e.department_id))return res.status(403).json({error:'Not allowed'});
    const {error}=await db.from('community_events').delete().eq('id',b.id);if(error)throw error;
    await db.from('community_content_audit').insert({actor_id:user.id,department_id:e.department_id,content_type:'event',content_id:e.id,action:'delete',details:{title:e.title}});
    return res.json({ok:true});
  }

  if(req.method==='GET' && r==='manage-announcements'){
    if(!isSuperAdmin && !isDeptHead)return res.status(403).json({error:'Administrative access required'});
    let q=db.from('community_announcements').select('*').order('created_at',{ascending:false}).limit(200);
    if(isDeptHead)q=q.eq('department_id',me.department_id);
    const {data,error}=await q;if(error)throw error;
    return res.json({items:data||[]});
  }

  if(req.method==='POST' && r==='manage-announcement'){
    if(!isSuperAdmin && !isDeptHead)return res.status(403).json({error:'Administrative access required'});
    const b=body(req),department_id=b.department_id||null;
    if(!(await contentScopeOk(department_id)) && !(isSuperAdmin && !department_id))return res.status(403).json({error:'You cannot manage content for this department'});
    if(!b.title||!b.body)return res.status(400).json({error:'Title and body are required'});
    const payload={title:String(b.title).trim().slice(0,160),body:String(b.body).slice(0,5000),department_id,published:b.published!==false,updated_at:new Date().toISOString()};
    if(b.id){
      const {data:old,error:oe}=await db.from('community_announcements').select('id,department_id,title').eq('id',b.id).maybeSingle();if(oe)throw oe;if(!old)return res.status(404).json({error:'Announcement not found'});
      if(!(await contentScopeOk(old.department_id)) && !(isSuperAdmin && !old.department_id))return res.status(403).json({error:'Not allowed'});
      const {data,error}=await db.from('community_announcements').update(payload).eq('id',b.id).select().single();if(error)throw error;
      await db.from('community_content_audit').insert({actor_id:user.id,department_id:data.department_id,content_type:'announcement',content_id:data.id,action:'update',details:{title:data.title}});
      return res.json(data);
    }
    const {data,error}=await db.from('community_announcements').insert({...payload,created_by:user.id}).select().single();if(error)throw error;
    await db.from('community_content_audit').insert({actor_id:user.id,department_id:data.department_id,content_type:'announcement',content_id:data.id,action:'create',details:{title:data.title}});
    return res.status(201).json(data);
  }

  if(req.method==='DELETE' && r==='manage-announcement'){
    if(!isSuperAdmin && !isDeptHead)return res.status(403).json({error:'Administrative access required'});
    const b=body(req);if(!b.id)return res.status(400).json({error:'id required'});
    const {data:a,error:ae}=await db.from('community_announcements').select('id,department_id,title').eq('id',b.id).maybeSingle();if(ae)throw ae;if(!a)return res.status(404).json({error:'Announcement not found'});
    if(!(await contentScopeOk(a.department_id)) && !(isSuperAdmin && !a.department_id))return res.status(403).json({error:'Not allowed'});
    const {error}=await db.from('community_announcements').delete().eq('id',b.id);if(error)throw error;
    await db.from('community_content_audit').insert({actor_id:user.id,department_id:a.department_id,content_type:'announcement',content_id:a.id,action:'delete',details:{title:a.title}});
    return res.json({ok:true});
  }

  if(req.method==='GET' && r==='feed'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const dept=me.department_id||null;
    const {data:posts,error}=await db.from('community_posts').select('id,author_id,department_id,body,created_at,updated_at').or(`department_id.is.null,department_id.eq.${dept||'00000000-0000-0000-0000-000000000000'}`).order('created_at',{ascending:false}).limit(100);
    if(error)throw error;
    const rows=posts||[], ids=rows.map(x=>x.id), authors=[...new Set(rows.map(x=>x.author_id))];
    let profiles=[], likes=[], comments=[];
    if(authors.length){const q=await db.from('member_profiles').select('user_id,full_name,username,avatar_url').in('user_id',authors);if(q.error)throw q.error;profiles=q.data||[];}
    if(ids.length){
      const l=await db.from('community_post_likes').select('post_id,user_id').in('post_id',ids);if(l.error)throw l.error;likes=l.data||[];
      const c=await db.from('community_post_comments').select('id,post_id,author_id,body,created_at').in('post_id',ids).order('created_at',{ascending:true}).limit(1000);if(c.error)throw c.error;comments=c.data||[];
    }
    const pmap=Object.fromEntries(profiles.map(p=>[p.user_id,p]));
    const cAuthors=[...new Set(comments.map(c=>c.author_id))].filter(x=>!pmap[x]);
    if(cAuthors.length){const q=await db.from('member_profiles').select('user_id,full_name,username,avatar_url').in('user_id',cAuthors);if(q.error)throw q.error;(q.data||[]).forEach(p=>pmap[p.user_id]=p);}
    return res.json({items:rows.map(p=>({
      ...p,author:pmap[p.author_id]||{full_name:'Community member'},
      likes:likes.filter(x=>x.post_id===p.id),
      comments:comments.filter(x=>x.post_id===p.id).map(c=>({...c,author:pmap[c.author_id]||{full_name:'Community member'}}))
    }))});
  }

  if(req.method==='POST' && r==='feed-post'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const b=body(req),text=String(b.body||'').trim().slice(0,4000);
    if(!text)return res.status(400).json({error:'Post cannot be empty'});
    const department_id=b.department_id||null;
    if(department_id && department_id!==me.department_id)return res.status(403).json({error:'You can only post to your own department feed'});
    const {data,error}=await db.from('community_posts').insert({author_id:user.id,department_id,body:text}).select().single();if(error)throw error;
    return res.status(201).json(data);
  }

  if(req.method==='POST' && r==='feed-like'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const b=body(req);if(!b.post_id)return res.status(400).json({error:'post_id required'});
    const {data:p,error:pe}=await db.from('community_posts').select('id,department_id').eq('id',b.post_id).maybeSingle();if(pe)throw pe;if(!p)return res.status(404).json({error:'Post not found'});
    if(p.department_id && p.department_id!==me.department_id)return res.status(403).json({error:'This post is outside your department'});
    const {error}=await db.from('community_post_likes').upsert({post_id:b.post_id,user_id:user.id},{onConflict:'post_id,user_id'});if(error)throw error;
    return res.json({ok:true});
  }

  if(req.method==='DELETE' && r==='feed-like'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const b=body(req);if(!b.post_id)return res.status(400).json({error:'post_id required'});
    const {error}=await db.from('community_post_likes').delete().eq('post_id',b.post_id).eq('user_id',user.id);if(error)throw error;
    return res.json({ok:true});
  }

  if(req.method==='POST' && r==='feed-comment'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const b=body(req),text=String(b.body||'').trim().slice(0,1000);if(!b.post_id||!text)return res.status(400).json({error:'Post and comment are required'});
    const {data:p,error:pe}=await db.from('community_posts').select('id,department_id,author_id').eq('id',b.post_id).maybeSingle();if(pe)throw pe;if(!p)return res.status(404).json({error:'Post not found'});
    if(p.department_id && p.department_id!==me.department_id)return res.status(403).json({error:'This post is outside your department'});
    const {data,error}=await db.from('community_post_comments').insert({post_id:b.post_id,author_id:user.id,body:text}).select().single();if(error)throw error;
    if(p.author_id!==user.id)await db.from('community_notifications').insert({user_id:p.author_id,actor_id:user.id,kind:'feed_comment',title:'New comment on your post',body:text.slice(0,140),link:'/community.html?view=feed',metadata:{post_id:p.id}});
    return res.status(201).json(data);
  }

  if(req.method==='DELETE' && r==='feed-post'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const b=body(req);if(!b.post_id)return res.status(400).json({error:'post_id required'});
    const {data:p,error:pe}=await db.from('community_posts').select('author_id').eq('id',b.post_id).maybeSingle();if(pe)throw pe;if(!p)return res.status(404).json({error:'Post not found'});if(p.author_id!==user.id)return res.status(403).json({error:'You can only delete your own posts'});
    const {error}=await db.from('community_posts').delete().eq('id',b.post_id).eq('author_id',user.id);if(error)throw error;return res.json({ok:true});
  }

  if(req.method==='GET' && r==='privacy'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const {data,error}=await db.from('community_privacy').select('*').eq('user_id',user.id).maybeSingle();if(error)throw error;
    return res.json(data||{user_id:user.id,discoverable:true,allow_connections:true,allow_messages:true,show_online:true});
  }
  if(req.method==='PATCH' && r==='privacy'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const b=body(req),clean={discoverable:Boolean(b.discoverable),allow_connections:Boolean(b.allow_connections),allow_messages:Boolean(b.allow_messages),show_online:Boolean(b.show_online),updated_at:new Date().toISOString()};
    const {data,error}=await db.from('community_privacy').upsert({user_id:user.id,...clean},{onConflict:'user_id'}).select().single();if(error)throw error;return res.json(data);
  }
  if(req.method==='GET' && r==='notifications'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const {data,error}=await db.from('community_notifications').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(50);if(error)throw error;
    return res.json({items:data||[],unread:(data||[]).filter(x=>!x.read_at).length});
  }
  if(req.method==='POST' && r==='notifications-read'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});
    const b=body(req);let q=db.from('community_notifications').update({read_at:new Date().toISOString()}).eq('user_id',user.id);
    if(b.id)q=q.eq('id',b.id);else q=q.is('read_at',null);const {error}=await q;if(error)throw error;return res.json({ok:true});
  }
  if(req.method==='POST' && r==='message-read'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});const {message_id}=body(req);if(!message_id)return res.status(400).json({error:'message_id required'});
    const {data:m,error:meErr}=await db.from('messages').select('conversation_id').eq('id',message_id).maybeSingle();if(meErr)throw meErr;if(!m)return res.status(404).json({error:'Message not found'});
    const {data:member}=await db.from('conversation_members').select('user_id').eq('conversation_id',m.conversation_id).eq('user_id',user.id).maybeSingle();if(!member)return res.status(403).json({error:'Not a conversation member'});
    const {error}=await db.from('message_reads').upsert({message_id,user_id:user.id,read_at:new Date().toISOString()},{onConflict:'message_id,user_id'});if(error)throw error;return res.json({ok:true});
  }
  if(req.method==='POST' && r==='group-message-read'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});const {message_id}=body(req);if(!message_id)return res.status(400).json({error:'message_id required'});
    const {data:m,error:meErr}=await db.from('department_group_messages').select('group_id').eq('id',message_id).maybeSingle();if(meErr)throw meErr;if(!m)return res.status(404).json({error:'Message not found'});
    const {data:g}=await db.from('department_group_chats').select('department_id').eq('id',m.group_id).maybeSingle();if(!g||g.department_id!==me.department_id)return res.status(403).json({error:'Not your departmental group'});
    const {data:member}=await db.from('department_group_members').select('user_id').eq('group_id',m.group_id).eq('user_id',user.id).maybeSingle();if(!member)return res.status(403).json({error:'Not a group member'});
    const {error}=await db.from('department_group_reads').upsert({message_id,user_id:user.id,read_at:new Date().toISOString()},{onConflict:'message_id,user_id'});if(error)throw error;return res.json({ok:true});
  }
  if(req.method==='DELETE' && r==='delete-message'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});const {message_id}=body(req);if(!message_id)return res.status(400).json({error:'message_id required'});
    const {data:m,error:e}=await db.from('messages').select('id,sender_id,created_at').eq('id',message_id).maybeSingle();if(e)throw e;if(!m)return res.status(404).json({error:'Message not found'});if(m.sender_id!==user.id)return res.status(403).json({error:'You can only delete your own messages'});
    const {error}=await db.from('messages').delete().eq('id',message_id).eq('sender_id',user.id);if(error)throw error;return res.json({ok:true});
  }
  if(req.method==='POST' && r==='unblock'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});const {blocked_id}=body(req);if(!blocked_id)return res.status(400).json({error:'blocked_id required'});const {error}=await db.from('blocks').delete().eq('blocker_id',user.id).eq('blocked_id',blocked_id);if(error)throw error;return res.json({ok:true});
  }
  if(req.method==='GET' && r==='blocked'){
    if(!me||me.status!=='active')return res.status(403).json({error:'Community access required'});const {data,error}=await db.from('blocks').select('blocked_id,created_at').eq('blocker_id',user.id);if(error)throw error;return res.json({items:data||[]});
  }
  if((req.method==='GET'||req.method==='PATCH') && r==='moderation-reports'){
    if(!['admin','department_head'].includes(rl.role))return res.status(403).json({error:'Moderation access restricted'});
    if(req.method==='GET'){
      const {data,error}=await db.from('community_reports').select('*').order('created_at',{ascending:false}).limit(500);if(error)throw error;
      let items=data||[];
      if(rl.role==='department_head'&&items.length){const ids=[...new Set(items.map(x=>x.reported_id).filter(Boolean))];const {data:a}=await db.from('member_access').select('user_id,department_id').in('user_id',ids);const allowed=new Set((a||[]).filter(x=>x.department_id===rl.department_id).map(x=>x.user_id));items=items.filter(x=>!x.reported_id||allowed.has(x.reported_id));}
      return res.json({items,role:rl});
    }
    const b=body(req),status=b.status;if(!['open','reviewed','closed'].includes(status))return res.status(400).json({error:'Invalid status'});const {data,error}=await db.from('community_reports').update({status}).eq('id',b.id).select().single();if(error)throw error;return res.json(data);
  }
  if(req.method==='GET' && r==='identity-audit'){
    if(!['admin','department_head'].includes(rl.role))return res.status(403).json({error:'Identity audit access restricted'});
    let q=db.from('community_identity_audit').select('*,departments(name)').order('created_at',{ascending:false}).limit(500);
    if(rl.role==='department_head')q=q.eq('department_id',rl.department_id);
    if(req.query.user_id)q=q.eq('user_id',req.query.user_id);
    const {data,error}=await q;if(error)throw error;return res.json({items:data||[],role:rl});
  }
  return res.status(404).json({error:'Unknown community action'});
 }catch(e){console.error(e);return res.status(e.status||500).json({error:e.message||'Server error'})}
};
