import { spawn, execFile } from 'node:child_process';

export class CodexFailure extends Error {
  constructor(message, missingSession=false) {super(message);this.missingSession=missingSession;}
}
export function runCodex({command,args=[],cwd,env,prompt,sessionId,signal,onSession=async()=>{},spawnProcess=spawn}) {
  return new Promise((resolve,reject)=>{
    const flags=['exec','--json','--ignore-user-config','--ignore-rules','--skip-git-repo-check','--sandbox','read-only','-c','approval_policy="never"','-c','cli_auth_credentials_store="file"'];
    if(sessionId)flags.push('resume',sessionId);
    flags.push('-');
    // No shell interpolation. The prompt travels only through stdin.
    const child=spawnProcess(command,[...args,...flags],{cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    const stop=()=>{
      if(process.platform==='win32'&&child.pid)execFile('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>{});
      else child.kill?.();
    };
    if(signal?.aborted)stop();else signal?.addEventListener('abort',stop,{once:true});
    let buffer='',errors='',answer='',thread=sessionId,started=false,usage=null,failed=false;
    let checkpoint=Promise.resolve();let checkpointError;
    const consume=line=>{
      let event;try{event=JSON.parse(line);}catch{return;}
      if(event.type==='thread.started'){thread=event.thread_id;checkpoint=checkpoint.then(()=>onSession(thread)).catch(e=>{checkpointError=e;stop();});}
      if(event.type==='turn.started')started=true;
      if(event.type==='item.completed'&&event.item?.type==='agent_message')answer=event.item.text||answer;
      if(event.type==='turn.completed')usage=event.usage;
      if(event.type==='error'||event.type==='turn.failed'){failed=true;errors+='\n'+(event.message||event.error?.message||'Codex 실행 실패');}
    };
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',data=>{buffer+=data.toString();let i;while((i=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,i));buffer=buffer.slice(i+1);}});
    child.stderr.on('data',data=>{errors=(errors+data.toString()).slice(-12000);});
    child.on('error',reject);
    child.stdin.on('error',()=>{});
    child.stdin.end(prompt);
    child.on('close',async code=>{
      signal?.removeEventListener('abort',stop);
      try{
        if(buffer.trim())consume(buffer);
        await checkpoint;
        if(checkpointError)throw checkpointError;
        if(code!==0||failed||!answer||!thread){
          const missing=!!sessionId&&!started&&/session.*(not found|does not exist)|no.*(session|rollout).*found|failed to (find|load).*session/i.test(errors);
          reject(new CodexFailure(missing?'저장된 AI 세션을 찾지 못했습니다.':'Codex 실행 실패. PC의 로그인·사용 한도·CLI 버전을 확인하세요.',missing));
        }else resolve({answer,sessionId:thread,usage});
      }catch(e){reject(e);}
    });
  });
}
