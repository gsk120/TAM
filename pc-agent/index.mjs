import { readFile, writeFile, mkdir, unlink, access, rename } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { runCodex } from './codex-runner.mjs';
import { ensureRegistration } from './registration.mjs';

const command=process.argv[2]||'run';
const rawUrl=process.argv[3]||process.env.AI_SERVER_URL;
if(!rawUrl)throw new Error('사용법: node pc-agent/index.mjs pair|run|forget https://서버주소');
const url=new URL(rawUrl);
if(url.protocol!=='https:' && !(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('HTTPS 서버 주소가 필요합니다.');
if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('경로 없는 서버 기본 주소를 입력하세요.');
if(process.platform!=='win32')throw new Error('현재 PC 프로그램은 Windows 전용입니다.');
const base=url.origin;
const key=createHash('sha256').update(base).digest('hex').slice(0,24);
const target='FamilyFinanceAI:'+key;
const home=path.join(process.env.LOCALAPPDATA||os.homedir(),'FamilyFinanceAI',key);
await mkdir(home,{recursive:true});
const script=path.join(path.dirname(fileURLToPath(import.meta.url)),'credential.ps1');
const powershell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
function credential(action,input=''){
  return new Promise((resolve,reject)=>{
    const child=spawn(powershell,['-NoProfile','-NonInteractive','-File',script,action,target],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='';child.stdout.setEncoding('utf8');child.stdout.on('data',d=>output+=d.toString());child.stderr.resume();
    child.on('error',reject);child.on('close',code=>code===0?resolve(output):reject(new Error('Windows 자격 증명 처리 실패. PowerShell 실행 정책과 로그인 사용자를 확인하세요.')));child.stdin.end(input);
  });
}
let token='';
async function request(action,body={},authenticated=true){
  const res=await fetch(base+'/api/ai/pc/'+action,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
  const data=await res.json();if(!res.ok)throw Object.assign(new Error(data.error||'서버 요청 실패'),{status:res.status});return data;
}
const register=force=>ensureRegistration({
  force,
  readToken:()=>credential('read'),
  saveToken:value=>credential('write',value),
  pair:code=>request('pair',{code,name:os.hostname()},false),
  prompt:async()=>{
    const rl=createInterface({input:process.stdin,output:process.stdout});
    try{return await rl.question('관리자가 발급한 연결 코드: ');}
    finally{rl.close();}
  },
  notify:message=>console.log(message),
});
if(command==='pair'){
  token=await register(true);
  console.log('run 명령으로 시작할 수 있습니다. 다음부터는 run만 실행하세요.');}else if(command==='forget'){
  await credential('delete');console.log('이 PC의 인증 정보를 삭제했습니다. 서버 설정에서도 PC 연결을 해제하세요.');
}else if(command==='run'){

  const where=await new Promise(resolve=>execFile('where.exe',['codex'],{windowsHide:true},(e,out)=>resolve(e?'':out.trim())));
  let bin=process.env.AI_CODEX_EXECUTABLE||where.split(/\r?\n/).find(p=>p.endsWith('.exe'));
  let binArgs=[];
  if(!bin){
    const cmd=where.split(/\r?\n/).find(p=>p.endsWith('.cmd'));
    const js=process.env.AI_CODEX_JS||(cmd&&path.join(path.dirname(cmd),'node_modules','@openai','codex','bin','codex.js'));
    if(!js)throw new Error('Codex CLI를 찾을 수 없습니다. 설치 및 PATH를 확인하세요.');
    await access(js);bin=process.execPath;binArgs=[js];
  }
  const work=path.join(home,'analysis');await mkdir(work,{recursive:true});
  const spool=path.join(home,'pending-result.bin');
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  token=await register(false);
  let idleAt=Date.now(),failures=0;
  console.log('AI PC 연결 프로그램 실행 중. 종료: Ctrl+C');
  const recoverPrompt=context=>JSON.stringify({instructions:context.snapshot.rules.instructions,question:context.question,defaultQuestionMonth:context.month,snapshot:context.snapshot,previousConversation:context.history});
  while(true){
    try{
      let pending=null;try{pending=JSON.parse(await credential('unprotect',await readFile(spool,'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}
      if(pending){
        try{await request('complete',pending);await unlink(spool);console.log('답변 저장 완료.');}
        catch(e){if(e.status===409){await unlink(spool);console.log('이전 실행이 만료되어 결과를 폐기했습니다. 웹에서 재시도하세요.');}else throw e;}
        continue;
      }
      const {job,sessionId,month}=await request('claim');failures=0;
      if(!job){await sleep(Date.now()-idleAt>60000?10000:3000);continue;}
      idleAt=Date.now();console.log('분석 시작: '+job.id);
      const identity={jobId:job.id,attempt:job.attempt};
      const controller=new AbortController();let heartbeatBusy=false;let lastContact=Date.now();
      const beat=async()=>{
        if(heartbeatBusy)return;heartbeatBusy=true;
        try{await request('heartbeat',identity);lastContact=Date.now();}
        catch(e){if(e.status===409||e.status===401||Date.now()-lastContact>45000)controller.abort();}
        finally{heartbeatBusy=false;}
      };
      const timer=setInterval(()=>void beat(),10000);
      const run=prompt=>runCodex({command:bin,args:binArgs,cwd:work,prompt,sessionId,signal:controller.signal,onSession:async id=>{await request('session',{...identity,sessionId:id});}});
      try{
        let result,recovered=false;
        if(sessionId){
          try{result=await run(JSON.stringify({question:job.question,defaultQuestionMonth:month}));}
          catch(e){
            if(!e.missingSession)throw e;
            const context=await request('context',identity);recovered=true;
            result=await runCodex({command:bin,args:binArgs,cwd:work,prompt:recoverPrompt(context),signal:controller.signal,onSession:async id=>request('session',{...identity,sessionId:id})});
          }
        }else{
          const context=await request('context',identity);
          result=await run(recoverPrompt(context));
        }
        const payload={...identity,...result,recovered};
        await writeFile(spool+'.tmp',await credential('protect',JSON.stringify(payload)),'utf8');
        await rename(spool+'.tmp',spool);
        await request('complete',payload);await unlink(spool);console.log('답변 저장 완료.');
      }catch(e){
        console.error(e.status===409?'작업이 대체되거나 만료됐습니다.':e.message);
        // If the completed response is already spooled, do not rerun or mark failed.
        const hasResult=await access(spool).then(()=>true,()=>false);
        if(!hasResult&&!controller.signal.aborted)await request('fail',{...identity,error:e.message}).catch(()=>{});
      }finally{clearInterval(timer);controller.abort();}
    }catch(e){
      console.error(e.message);
      if(e.status===401){
        token=await register(true);failures=0;
        console.log('PC 재등록 완료. 작업 대기를 재개합니다.');
        continue;
      }
      if(e.status===403)throw new Error('AI 실행 권한이 없습니다. 관리자에게 서버 권한 설정을 확인하세요.');
      await sleep(Math.min(60000,3000*2**Math.min(failures++,5)));
    }
  }
}else throw new Error('pair, run, forget 중 하나를 지정하세요.');
