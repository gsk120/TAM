import test from 'node:test';
import assert from 'node:assert/strict';
import { AiService, connectionLost, makeSnapshot } from '../server/ai-core.js';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { runCodex } from '../pc-agent/codex-runner.mjs';

function fixture() {
  const users=new Map();let now=Date.parse('2026-10-15T00:00:00Z');
  let chain=Promise.resolve();
  const withUser=(uid,fn)=>{
    const op=chain.then(async()=>{
      const records=structuredClone(users.get(uid)||new Map());
      const s={get:async(k,id)=>records.get(k+':'+id)||null,list:async(k,c)=>[...records.entries()].filter(([key,v])=>key.startsWith(k+':')&&(!c||v.conversationId===c)).map(([,v])=>structuredClone(v)).sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||'')),put:async(k,id,v)=>{records.set(k+':'+id,structuredClone(v));return v;},remove:async(k,id)=>records.delete(k+':'+id)};
      const r=await fn(s);users.set(uid,records);return r;
    });chain=op.catch(()=>{});return op;
  };
  const db={transactions:[],categories:[],incomeCategories:[],monthlyBudgets:{},monthlyAssetSnapshots:{},assetStructure:{cashItems:[],investItems:[],debtItems:[]}};
  const service=new AiService({withUser,allowed:async uid=>uid==='owner',clock:()=>new Date(now).toISOString(),snapshot:async()=>db,findCredential:async(k,id)=>{for(const [uid,records]of users){const data=records.get(k+':'+id);if(data)return {user_id:uid,data};}return null;}});
  return {service,db,advance:ms=>{now+=ms;},withUser};
}
async function paired(f){const p=await f.service.web('owner','pair');return f.service.pair(p.code,'PC');}
async function conversation(f){return f.service.web('owner','create',{month:'2026-10'});}

test('AI authorization, single-use pairing and revoked credentials',async()=>{
  const f=fixture();await assert.rejects(f.service.web('other','overview'),{status:403});
  const pair=await f.service.web('owner','pair');const d=await f.service.pair(pair.code,'PC');
  await assert.rejects(f.service.pair(pair.code,'PC'),{status:401});
  await assert.rejects(f.service.device('invalid','claim'),{status:401});
  await f.service.web('owner','revoke',{deviceId:d.deviceId});
  await assert.rejects(f.service.device(d.token,'claim'),{status:401});
});
test('pairing expires and new pairing revokes the previous PC',async()=>{
  const f=fixture();const p=await f.service.web('owner','pair');f.advance(300001);
  await assert.rejects(f.service.pair(p.code,'PC'),{status:401});
  const old=await paired(f);await paired(f);
  await assert.rejects(f.service.device(old.token,'claim'),{status:401});
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
  assert.equal(detail.job.snapshot,undefined);
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
  const result=await runCodex({command:'codex',cwd:'.',sessionId:'session_1234',prompt:'가계부 질문 $(ignored)',onSession:async()=>{},spawnProcess:(cmd,args,opts)=>{
    observed=args;return fakeSpawn([{type:'thread.started',thread_id:'session_1234'},{type:'turn.started'},{type:'item.completed',item:{type:'agent_message',text:'분석 완료'}},{type:'turn.completed',usage:{input_tokens:10}}])(cmd,args,opts);
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
    const pairing=await (await call('pair',{})).json();
    const device=await (await call('pc/pair',{code:pairing.code,name:'test-PC'},'')).json();
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
