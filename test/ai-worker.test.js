import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {requireWorkerSecret,workerSecretMatches} from '../server/worker-auth.js';
const entry=fileURLToPath(new URL('../pc-agent/index.mjs',import.meta.url));
const secret='synthetic-process-key-0123456789abcdef';

test('worker secret validation and constant-length digest comparison',()=>{
  for(const key of [undefined,'','x'.repeat(31),'x'.repeat(32)+' '])assert.throws(()=>requireWorkerSecret(key));
  assert.equal(requireWorkerSecret(secret),secret);
  assert.equal(workerSecretMatches(secret,secret),true);
  for(const candidate of [undefined,'',secret+'x','x'.repeat(secret.length)])assert.equal(workerSecretMatches(candidate,secret),false);
});

test('process fails clearly before setup when secret is missing or old pair command is used',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'ai-process-config-'));
  const run=args=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[entry,...args],{cwd:root,env:{...process.env,AI_WORKER_SECRET:''},windowsHide:true});
    let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',reject);child.on('close',code=>resolve({code,output}));
  });
  try{
    const missing=await run(['run','http://localhost:8080']);assert.notEqual(missing.code,0);assert.match(missing.output,/AI_WORKER_SECRET/);
    const legacy=await run(['pair','http://localhost:8080']);assert.notEqual(legacy.code,0);assert.match(legacy.output,/run 명령만/);
  }finally{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(root,{recursive:true,force:true});}
});

test('Windows process starts polling with configured key without login or pairing', {skip:process.platform!=='win32'}, async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'ai-process-start-'));
  let child,received;
  const requestSeen=new Promise(resolve=>{received=resolve;});
  const server=createServer((req,res)=>{
    received({url:req.url,authorization:req.headers.authorization});
    req.resume();res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({job:null}));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    const base='http://127.0.0.1:'+server.address().port;
    child=spawn(process.execPath,[entry,'run',base],{cwd:root,env:{...process.env,AI_WORKER_SECRET:secret,AI_CODEX_EXECUTABLE:process.execPath,LOCALAPPDATA:root},windowsHide:true});
    let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
    const authenticated=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Process startup timed out')),15000);
      child.stdout.on('data',()=>{if(output.includes('AP 인증 완료')){clearTimeout(timer);resolve();}});
      child.on('error',error=>{clearTimeout(timer);reject(error);});
      child.on('close',code=>{clearTimeout(timer);reject(new Error('Unexpected process exit '+code));});
    });
    await authenticated;
    const request=await requestSeen;
    assert.equal(request.url,'/api/ai/pc/claim');assert.equal(request.authorization,'Bearer '+secret);
    assert.equal(output.includes(secret),false);assert.equal(output.includes('연결 코드:'),false);
  }finally{
    if(child&&child.exitCode===null){const stopped=new Promise(r=>child.once('close',r));child.kill();await stopped;}
    await new Promise(r=>server.close(r));
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(root,{recursive:true,force:true});
  }
});