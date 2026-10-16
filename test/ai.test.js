import test from 'node:test';
import assert from 'node:assert/strict';
import { AiService, connectionLost, makeSnapshot, hashCredential } from '../server/ai-core.js';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { runCodex } from '../pc-agent/codex-runner.mjs';

function fixture() {
  let users=new Map(),workers=new Map(),now=Date.parse('2026-10-15T00:00:00Z');
  const paid=new Set(['owner']);let secret='synthetic-worker-secret-0123456789abcdef';
  let chain=Promise.resolve();
  const storeFor=(map)=>({
    get:async(k,id)=>structuredClone(map.get(k+':'+id)||null),
    list:async(k,c)=>[...map.entries()].filter(([key,v])=>key.startsWith(k+':')&&(!c||v.conversationId===c)).map(([,v])=>structuredClone(v)).sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||'')),
    put:async(k,id,v)=>{map.set(k+':'+id,structuredClone(v));return v;},
    remove:async(k,id)=>map.delete(k+':'+id),
  });
  const transaction=fn=>{
    const op=chain.then(async()=>{
      const draft=structuredClone(users),w=structuredClone(workers);
      const forUser=uid=>{if(!draft.has(uid))draft.set(uid,new Map());return storeFor(draft.get(uid));};
      const result=await fn({draft,w,forUser});users=draft;workers=w;return result;
    });chain=op.catch(()=>{});return op;
  };
  const withUser=(uid,fn)=>transaction(({forUser})=>fn(forUser(uid)));
  const withWorker=fn=>transaction(({draft,w,forUser})=>fn({
    ...storeFor(w),forUser,
    listJobs:async()=>[...draft].flatMap(([userId,records])=>[...records].filter(([key,j])=>key.startsWith('job:')&&['queued','running'].includes(j.status)&&j.provider==='local_cli').map(([,job])=>({userId,job:structuredClone(job)}))).sort((a,b)=>a.job.createdAt.localeCompare(b.job.createdAt)),
    findJob:async id=>{for(const [userId,records] of draft){const job=records.get('job:'+id);if(job)return {userId,job:structuredClone(job)};}return null;},
    sessionUsed:async(sessionId,uid,cid)=>[...draft].some(([userId,records])=>[...records].some(([key,c])=>key.startsWith('conversation:')&&c.sessionId===sessionId&&!(userId===uid&&c.id===cid))),
  }));
  const db={transactions:[],categories:[],incomeCategories:[],monthlyBudgets:{},monthlyAssetSnapshots:{},assetStructure:{cashItems:[],investItems:[],debtItems:[]}};
  const databases=new Map([['owner',db]]);
  const service=new AiService({withUser,withWorker,allowed:async uid=>paid.has(uid),workerSecret:()=>secret,clock:()=>new Date(now).toISOString(),snapshot:async uid=>databases.get(uid)});
  return {service,db,databases,paid,setSecret:value=>{secret=value;},getSecret:()=>secret,advance:ms=>{now+=ms;},withUser,withWorker};
}
async function paired(f){const token=f.getSecret();await f.service.device(token,'claim');return {token};}
async function conversation(f,user='owner'){return f.service.web(user,'create',{month:'2026-10'});}

test('worker key rejects missing, incorrect, legacy and rotated credentials',async()=>{
  const f=fixture();await assert.rejects(f.service.web('other','overview'),{status:403});
  const d=await paired(f);
  for(const key of ['',undefined,'invalid','legacy-pair-token'])await assert.rejects(f.service.device(key,'claim'),{status:401});
  f.setSecret('new-synthetic-worker-secret-0123456789');
  await assert.rejects(f.service.device(d.token,'claim'),{status:401});
  assert.equal((await f.service.device(f.getSecret(),'claim')).job,null);
});
test('missing or weak server key fails closed without database access',async()=>{
  const f=fixture();
  for(const key of [undefined,'short',' '.repeat(40)]){
    f.setSecret(key);await assert.rejects(f.service.device('anything','claim'),{status:503});
  }
  assert.equal((await f.service.web('owner','overview')).available,false);
});

test('job claim is serialized and healthy pending job blocks another question',async()=>{
  const f=fixture(),d=await paired(f),c=await conversation(f);
  await f.service.web('owner','send',{conversationId:c.id,text:'식비 분석'});
  await assert.rejects(f.service.web('owner','send',{conversationId:c.id,text:'다음'}),{status:409});
  const results=await Promise.all([f.service.device(d.token,'claim'),f.service.device(d.token,'claim')]);
  assert.equal(results.filter(r=>r.job).length,1);
  await assert.rejects(f.service.web('owner','retry',{conversationId:c.id}),{status:409});
});
test('results are idempotent and preserve session ID without storing raw snapshot',async()=>{
  const f=fixture(),d=await paired(f),c=await conversation(f);
  await f.service.web('owner','send',{conversationId:c.id,text:'분석'});
  const {job}=await f.service.device(d.token,'claim');const identity={jobId:job.id,attempt:job.attempt};
  const context=await f.service.device(d.token,'context',identity);
  assert.equal(context.snapshot.rules.version,'finance-v1');
  const result={...identity,answer:'답변',sessionId:'session_1234'};
  await f.service.device(d.token,'complete',result);await f.service.device(d.token,'complete',result);
  const detail=await f.service.web('owner','detail',{conversationId:c.id});
  assert.equal(detail.messages.filter(m=>m.role==='assistant').length,1);
  assert.equal(detail.conversation.sessionId,'session_1234');
  assert.equal(detail.job.snapshot,undefined);assert.equal(detail.job.attempt,undefined);assert.equal(detail.job.deviceId,undefined);
  await f.service.web('owner','send',{conversationId:c.id,text:'이어서'});
  assert.equal((await f.service.device(d.token,'claim')).sessionId,'session_1234');
});
test('lost heartbeat allows retry while late completion cannot overwrite the new attempt',async()=>{
  const f=fixture(),d=await paired(f),c=await conversation(f);
  await f.service.web('owner','send',{conversationId:c.id,text:'분석'});
  const {job}=await f.service.device(d.token,'claim');f.advance(60001);
  assert.equal((await f.service.web('owner','detail',{conversationId:c.id})).job.connectionLost,true);
  assert.equal((await f.service.device(d.token,'claim')).job,null);
  await f.service.web('owner','retry',{conversationId:c.id});
  await assert.rejects(f.service.device(d.token,'complete',{jobId:job.id,attempt:job.attempt,answer:'늦은 결과',sessionId:'session_1234'}),{status:409});
  assert.ok((await f.service.device(d.token,'claim')).job);
});
test('fresh recovery reads current data and leaves a data-refresh notice',async()=>{
  const f=fixture(),d=await paired(f),c=await conversation(f);
  await f.service.web('owner','send',{conversationId:c.id,text:'분석'});
  const {job}=await f.service.device(d.token,'claim');const identity={jobId:job.id,attempt:job.attempt};
  const first=await f.service.device(d.token,'context',identity);
  f.db.transactions.push({date:'2026-10-15',type:'수입',category:'기타',amount:100});
  const latest=await f.service.device(d.token,'context',identity);
  assert.equal(latest.snapshot.metadata.transactionCount,1);
  assert.notEqual(first.snapshot.metadata.version,latest.snapshot.metadata.version);
  await f.service.device(d.token,'complete',{...identity,answer:'최신 기준',sessionId:'session_new1',recovered:true});
  const detail=await f.service.web('owner','detail',{conversationId:c.id});
  assert.equal(detail.messages.filter(m=>m.role==='system').length,1);
});
test('snapshot uses finance calculations, forward budgets and asset totals without credentials',()=>{
  const snapshot=makeSnapshot({userInfo:{password_hash:'secret'},transactions:[{date:'2026-10-01',type:'지출',category:'의료비',amount:1000,user_id:'private'},{date:'2026-10-02',type:'수입',category:'실비',amount:300}],categories:[{id:'cat_med',name:'의료비',defaultBudget:10}],incomeCategories:[],monthlyBudgets:{'2026-09':{'의료비':2000}},monthlyAssetSnapshots:{'2026-10':{cash:{a:100},invest:{b:50},debt:{c:30}}}},'2026-10-15T00:00:00Z');
  const metrics=snapshot.metrics.find(m=>m.yearMonth==='2026-10');
  assert.equal(metrics.netMedicalExpense,700);assert.equal(metrics.monthlySurplus,-700);
  assert.equal(metrics.categoryDetails[0].budget,2000);
  assert.deepEqual(snapshot.assetMetrics,[{month:'2026-10',assets:150,debt:30,netAssets:120}]);
  assert.ok(!JSON.stringify(snapshot).includes('password_hash'));
  assert.equal(snapshot.data.transactions[0].user_id,undefined);
});
test('first heartbeat grace period starts at claim, not missing signal',()=>{
  const now=Date.now();assert.equal(connectionLost({status:'running',startedAt:new Date(now).toISOString()},null,now),false);
});
function fakeSpawn(events,code=0,stderr='') {
  return (command,args,options)=>{
    assert.equal(options.shell,undefined);
    const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();
    child.stdin.on('finish',()=>{for(const e of events)child.stdout.write(JSON.stringify(e)+'\n');child.stderr.write(stderr);child.emit('close',code);});
    child.args=args;return child;
  };
}
test('CLI parser resumes an explicit session, sends prompt via stdin, and reads JSON result',async()=>{
  let observed;
  const result=await runCodex({command:'codex',cwd:'.',env:{CODEX_HOME:'isolated-test-home'},sessionId:'session_1234',prompt:'가계부 질문 $(ignored)',onSession:async()=>{},spawnProcess:(cmd,args,opts)=>{
    assert.equal(opts.env.CODEX_HOME,'isolated-test-home');observed=args;return fakeSpawn([{type:'thread.started',thread_id:'session_1234'},{type:'turn.started'},{type:'item.completed',item:{type:'agent_message',text:'분석 완료'}},{type:'turn.completed',usage:{input_tokens:10}}])(cmd,args,opts);
  }});
  assert.equal(result.answer,'분석 완료');assert.ok(observed.includes('resume'));assert.ok(!observed.includes('--last'));assert.ok(!observed.some(a=>a.includes('ignored')));
});
test('CLI missing session can recover, but failures after turn start cannot automatically rerun',async()=>{
  await assert.rejects(runCodex({command:'codex',prompt:'?',sessionId:'session_1234',spawnProcess:fakeSpawn([],1,'session not found')}),e=>e.missingSession);
  await assert.rejects(runCodex({command:'codex',prompt:'?',sessionId:'session_1234',spawnProcess:fakeSpawn([{type:'turn.started'}],1,'session not found')}),e=>!e.missingSession);
});


test('localhost HTTP routes enforce login, device token, and feature gating',async()=>{
  const { default:express }=await import('express');
  const { createAiRouter }=await import('../server/ai-routes.js');
  const f=fixture();const app=express();app.use(express.json());
  const auth=(req,res,next)=>{if(req.headers.authorization!=='Bearer web-test')return res.sendStatus(401);req.user={id:'owner'};next();};
  app.use('/api/ai',createAiRouter(auth,{enabled:()=>true,allowed:async()=>true,service:f.service}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/ai/';
  const call=(route,body,token='web-test')=>fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  try{
    assert.equal((await call('overview',undefined,'invalid')).status,401);
    assert.equal((await call('capabilities')).status,200);
    const device=await paired(f);
    const c=await (await call('create',{month:'2026-10'})).json();
    await call('send',{conversationId:c.id,text:'질문'});
    assert.equal((await call('pc/claim',{},'invalid')).status,401);
    const claimed=await (await call('pc/claim',{},device.token)).json();
    assert.equal(claimed.job.question,'질문');
    assert.equal((await call('send',{conversationId:c.id,text:'중복'})).status,409);
    const i={jobId:claimed.job.id,attempt:claimed.job.attempt};
    assert.equal((await call('pc/heartbeat',i,device.token)).status,200);
    await call('pc/complete',{...i,answer:'테스트 답변',sessionId:'session_test1'},device.token);
    const detail=await (await call('conversations/'+c.id)).json();
    assert.equal(detail.messages.at(-1).content,'테스트 답변');
  }finally{await new Promise(r=>server.close(r));}
});


test('paid chat is independent from worker authentication and ignores old credentials',async()=>{
  const f=fixture();f.paid.add('paid');
  await assert.rejects(f.service.web('free','create',{month:'2026-10'}),{status:403});
  const d=await paired(f);
  await f.withUser('owner',s=>s.put('device',hashCredential('legacy'),{id:hashCredential('legacy'),revoked:false}));
  await f.withWorker(s=>s.put('device',hashCredential('legacy'),{id:hashCredential('legacy'),revoked:false}));
  await assert.rejects(f.service.device('legacy','claim'),{status:401});
  const overview=await f.service.web('paid','overview');
  assert.equal(overview.available,true);assert.equal(overview.devices,undefined);
  await assert.rejects(f.service.device('paid','claim'),{status:401});
  assert.equal((await f.service.device(d.token,'claim')).job,null);
});

test('shared worker processes multiple paid owners with isolated context, history, result and session',async()=>{
  const f=fixture();f.paid.add('second');
  f.databases.set('second',{...f.db,transactions:[{date:'2026-10-01',type:'수입',category:'기타',amount:987654}]});
  const d=await paired(f),a=await conversation(f),b=await conversation(f,'second');
  await f.service.web('owner','send',{conversationId:a.id,text:'owner question'});
  f.advance(1);
  await f.service.web('second','send',{conversationId:b.id,text:'second question',userId:'owner'});
  await assert.rejects(f.service.web('second','detail',{conversationId:a.id}),{status:404});
  const first=await f.service.device(d.token,'claim');
  assert.equal(first.scope.userId,'owner');
  const i={jobId:first.job.id,attempt:first.job.attempt,userId:'second'};
  assert.equal((await f.service.device(d.token,'context',i)).snapshot.metadata.transactionCount,0);
  await f.service.device(d.token,'complete',{...i,answer:'owner answer',sessionId:'session_owner'});
  const second=await f.service.device(d.token,'claim');
  assert.equal(second.scope.userId,'second');assert.equal(second.scope.conversationId,b.id);assert.equal(second.sessionId,null);
  const j={jobId:second.job.id,attempt:second.job.attempt,userId:'owner'};
  const context=await f.service.device(d.token,'context',j);
  assert.equal(context.snapshot.data.transactions[0].amount,987654);
  assert.deepEqual(context.history,[]);
  await assert.rejects(f.service.device(d.token,'heartbeat',{...j,jobId:first.job.id}),{status:409});
  await assert.rejects(f.service.device(d.token,'session',{...j,sessionId:'session_owner'}),{status:409});
  await assert.rejects(f.service.device(d.token,'complete',{...j,answer:'bad',sessionId:'session_owner'}),{status:409});
  await f.service.device(d.token,'complete',{...j,answer:'second answer',sessionId:'session_second'});
  assert.equal((await f.service.web('owner','detail',{conversationId:a.id})).messages.at(-1).content,'owner answer');
  assert.equal((await f.service.web('second','detail',{conversationId:b.id})).messages.at(-1).content,'second answer');
  await f.service.web('owner','send',{conversationId:a.id,text:'follow up'});
  assert.equal((await f.service.device(d.token,'claim')).sessionId,'session_owner');
});

test('parallel claims are serialized across accounts and revoked entitlement blocks context',async()=>{
  const f=fixture();f.paid.add('second');
  const d=await paired(f),a=await conversation(f),b=await conversation(f,'second');
  await f.service.web('owner','send',{conversationId:a.id,text:'a'});
  await f.service.web('second','send',{conversationId:b.id,text:'b'});
  const results=await Promise.all([f.service.device(d.token,'claim'),f.service.device(d.token,'claim')]);
  assert.equal(results.filter(r=>r.job).length,1);
  const r=results.find(r=>r.job);f.paid.delete(r.scope.userId);
  await assert.rejects(f.service.device(d.token,'context',{jobId:r.job.id,attempt:r.job.attempt}),{status:403});
});

test('legacy session is rebuilt without deleting chat history, queued API jobs are not claimed',async()=>{
  const f=fixture(),d=await paired(f),c=await conversation(f);
  await f.withUser('owner',async s=>{await s.put('conversation',c.id,{...c,sessionId:'legacy_session'});});
  await f.service.web('owner','send',{conversationId:c.id,text:'migrate'});
  const r=await f.service.device(d.token,'claim');assert.equal(r.sessionId,null);assert.equal(r.resetSession,true);
  await f.service.device(d.token,'complete',{jobId:r.job.id,attempt:r.job.attempt,answer:'rebuilt',sessionId:'new_session1',recovered:true});
  const detail=await f.service.web('owner','detail',{conversationId:c.id});
  assert.equal(detail.messages.length,3);
  await f.withUser('owner',s=>s.put('job','api-job',{id:'api-job',status:'queued',provider:'api',createdAt:'2026-10-15'}));
  assert.equal((await f.service.device(d.token,'claim')).job,null);
});

test('HTTP removes all management endpoints and separates JWT from process key',async()=>{
  const {default:express}=await import('express');
  const {createAiRouter}=await import('../server/ai-routes.js');
  const f=fixture();f.paid.add('paid');
  const app=express();app.use(express.json());
  app.use('/api/ai',createAiRouter((req,res,next)=>{
    const id=req.headers.authorization?.replace('Bearer ','');
    if(!['owner','paid','free'].includes(id))return res.sendStatus(401);
    req.user={id};next();
  },{enabled:()=>true,allowed:async id=>f.paid.has(id),service:f.service}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/ai/';
  const call=(user,route,body)=>fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+user,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  try{
    assert.deepEqual(await (await call('free','capabilities')).json(),{enabled:false});
    assert.deepEqual(await (await call('paid','capabilities')).json(),{enabled:true});
    assert.equal((await call('free','overview')).status,403);
    assert.equal((await call('free','create',{month:'2026-10',ai_paid:true})).status,403);
    for(const user of ['owner','paid','free']){
      assert.equal((await call(user,'admin/overview')).status,404);
      for(const route of ['admin/pair','admin/revoke','pair','revoke','pc/pair'])assert.equal((await call(user,route,{})).status,404);
    }
    const d=await paired(f);
    assert.equal((await call(d.token,'overview')).status,401);
    assert.equal((await call('paid','pc/claim',{})).status,401);
    assert.equal((await call(d.token,'pc/claim',{})).status,200);
    f.setSecret('rotated-synthetic-secret-0123456789abcd');
    assert.equal((await call(d.token,'pc/claim',{})).status,401);
    assert.equal((await call(f.getSecret(),'pc/claim',{})).status,200);
    f.setSecret(undefined);
    assert.equal((await call(d.token,'pc/claim',{})).status,503);
  }finally{await new Promise(r=>server.close(r));}
});

test('unpaid queued jobs are skipped and withdrawn running jobs do not block the shared worker',async()=>{
  const f=fixture();f.paid.add('second');
  const d=await paired(f),a=await conversation(f),b=await conversation(f,'second');
  await f.service.web('owner','send',{conversationId:a.id,text:'owner'});
  f.advance(1);
  await f.service.web('second','send',{conversationId:b.id,text:'second'});
  const first=await f.service.device(d.token,'claim');
  f.paid.delete('owner');
  const second=await f.service.device(d.token,'claim');
  assert.equal(second.scope.userId,'second');
  await assert.rejects(f.service.device(d.token,'complete',{jobId:first.job.id,attempt:first.job.attempt,answer:'late',sessionId:'old_session1'}),{status:403});
  const fresh=fixture(),worker=await paired(fresh),c=await conversation(fresh);
  await fresh.service.web('owner','send',{conversationId:c.id,text:'skip'});
  fresh.paid.delete('owner');
  assert.equal((await fresh.service.device(worker.token,'claim')).job,null);
});