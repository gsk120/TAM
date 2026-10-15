import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { aiRequest } from '../utils/aiApi';

export default function AiDevices() {
  const { token } = useApp();
  const [devices,setDevices]=useState([]);
  const [code,setCode]=useState(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    aiRequest(token,'overview',undefined,controller.signal).then(r=>setDevices(r.devices)).catch(e=>{if(e.name!=='AbortError')setError(e.message);});
    return ()=>controller.abort();
  },[token]);
  const act=async(action,body={})=>{
    setBusy(true);setError('');
    try{
      const result=await aiRequest(token,action,body);
      if(action==='pair')setCode({value:result.code,expiresAt:Date.now()+result.expiresIn*1000});
      else setCode(null);
      setDevices((await aiRequest(token,'overview')).devices);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  return <section className="glass-card" style={{padding:20,marginBottom:20}}>
    <h3>AI 분석용 PC 연결</h3>
    <p>본인 PC에서 연결 프로그램을 실행하고 아래 코드를 입력하세요. 코드는 5분간 한 번만 사용할 수 있습니다. 새 PC 등록 시 이전 연결은 해제됩니다.</p>
    <button className="btn btn-primary" disabled={busy} onClick={()=>act('pair')}>연결 코드 발급</button>
    {code && <p style={{overflowWrap:'anywhere'}}>연결 코드: <code>{code.value}</code><br/>만료: {new Date(code.expiresAt).toLocaleTimeString('ko-KR')}</p>}
    <ul>{devices.filter(d=>!d.revoked).map(d=><li key={d.id}>{d.name} · 마지막 접속 {new Date(d.lastSeen).toLocaleString('ko-KR')} <button className="btn btn-secondary" disabled={busy} onClick={()=>act('revoke',{deviceId:d.id})}>연결 해제</button></li>)}</ul>
    {error && <p role="alert">{error}</p>}
  </section>;
}
