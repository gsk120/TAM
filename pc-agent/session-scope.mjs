import { readFile, writeFile, mkdir, unlink, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Only server-issued scope fields determine local paths. Never use --last.
export async function prepareCodexScope({home,scope,authHome,credential}) {
  if(!scope||typeof scope.userId!=='string'||!scope.userId||typeof scope.conversationId!=='string'||!scope.conversationId)throw new Error('서버의 계정·대화 식별자가 없습니다. AP와 PC 프로그램을 함께 업데이트하세요.');
  const key=createHash('sha256').update(JSON.stringify([scope.userId,scope.conversationId])).digest('hex');
  const root=path.join(home,'scopes',key),cwd=path.join(root,'work'),codexHome=path.join(root,'codex');
  await mkdir(cwd,{recursive:true});await mkdir(codexHome,{recursive:true});
  const authFile=path.join(codexHome,'auth.json'),cache=path.join(home,'codex-auth.bin');
  let source;
  try{source=await readFile(path.join(authHome,'auth.json'),'utf8');}
  catch(error){if(error.code!=='ENOENT')throw error;throw new Error('Codex 로그인 파일이 없습니다. 관리자 CLI에서 파일 방식으로 로그인한 뒤 실행하세요.');}
  const sourceVersion=createHash('sha256').update(source).digest('hex');
  let auth=source;
  try{
    const saved=JSON.parse(await credential('unprotect',await readFile(cache,'utf8')));
    if(saved.sourceVersion===sourceVersion)auth=saved.auth;
  }catch(error){if(error.code!=='ENOENT')throw error;}
  await writeFile(authFile,auth,{encoding:'utf8',mode:0o600});
  return {
    cwd,env:cliEnvironment(codexHome),
    async finish(){
      try{
        const updated=await readFile(authFile,'utf8');
        await writeFile(cache+'.tmp',await credential('protect',JSON.stringify({sourceVersion,auth:updated})),'utf8');
        await rename(cache+'.tmp',cache);
      }finally{await unlink(authFile).catch(error=>{if(error.code!=='ENOENT')throw error;});}
    },
  };
}
function cliEnvironment(codexHome){
  const env={...process.env,CODEX_HOME:codexHome};
  for(const key of Object.keys(env))if(['AI_WORKER_SECRET','JWT_SECRET','DATABASE_URL'].includes(key.toUpperCase()))delete env[key];
  return env;
}
