/** Register only when needed; credential-store and network errors remain visible. */
export async function ensureRegistration({readToken,saveToken,pair,prompt,notify,force=false}) {
  const saved=force?'':(await readToken()).trim();
  if(saved)return saved;
  notify(force?'PC 인증이 해제됐거나 만료되었습니다. 새 연결 코드로 다시 등록하세요.':'저장된 PC 인증이 없습니다. 연결 코드를 입력하면 등록 후 바로 시작합니다.');
  while(true){
    const code=(await prompt()).trim();
    if(!code){notify('연결 코드를 입력하세요. 종료하려면 Ctrl+C를 누르세요.');continue;}
    let result;
    try {result=await pair(code);}
    catch(error){
      if(error.status!==400&&error.status!==401)throw error;
      notify('연결 코드가 올바르지 않거나 만료됐습니다. 새 코드를 확인하고 다시 입력하세요.');
      continue;
    }
    if(typeof result.token!=='string'||!result.token.trim())throw new Error('서버에서 PC 인증 정보를 받지 못했습니다.');
    await saveToken(result.token);
    notify('PC 등록 완료.');
    return result.token;
  }
}