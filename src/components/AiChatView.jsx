import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { aiRequest } from '../utils/aiApi';
import './AiChatView.css';

export default function AiChatView() {
  const {token,selectedMonth}=useApp();
  const [conversations,setConversations]=useState([]);
  const [id,setId]=useState(null);
  const [detail,setDetail]=useState(null);
  const [draft,setDraft]=useState('');
  const [month,setMonth]=useState(selectedMonth);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [serviceAvailable,setServiceAvailable]=useState(false);
  const layout=useRef(null);
  const historyPanel=useRef(null);
  const messages=useRef(null);
  const input=useRef(null);
  const followLatest=useRef(true);
  const previousMessage=useRef(null);
  const [hasNewMessages,setHasNewMessages]=useState(false);
  const submitLock=useRef(false);
  const composing=useRef(false);
  const loadList=async()=>{
    const r=await aiRequest(token,'overview');setConversations(r.conversations);setServiceAvailable(r.available===true);return r;
  };
  useEffect(()=>{
    const controller=new AbortController();
    aiRequest(token,'overview',undefined,controller.signal).then(r=>{
      setConversations(r.conversations);setServiceAvailable(r.available===true);setId(r.conversations[0]?.id||null);
    }).catch(e=>{if(e.name!=='AbortError')setError(e.message);});
    return ()=>controller.abort();
  },[token]);
  useEffect(()=>{
    setError('');if(!id)return undefined;
    const controller=new AbortController();let timer;let failures=0;
    const refresh=async()=>{
      try{
        const r=await aiRequest(token,'conversations/'+id,undefined,controller.signal);
        if(controller.signal.aborted)return;
        setDetail(r);if(typeof r.available==='boolean')setServiceAvailable(r.available);setMonth(r.conversation.month);setError('');failures=0;
        if(['queued','running'].includes(r.job?.status))timer=setTimeout(refresh,Date.now()-Date.parse(r.job.createdAt)>60000?5000:2000);
      }catch(e){if(!controller.signal.aborted){setError(e.message);timer=setTimeout(refresh,Math.min(60000,2000*2**failures++));}}
    };
    void refresh();return ()=>{controller.abort();clearTimeout(timer);};
  },[id,token,busy]);
  useEffect(()=>{
    setDetail(null);
    followLatest.current=true;
    previousMessage.current=null;
    setHasNewMessages(false);
  },[id,token]);
  useLayoutEffect(()=>{
    document.body.classList.add('ai-chat-page');
    const mobile=window.matchMedia('(max-width:760px)');
    const updateHistory=()=>{if(historyPanel.current)historyPanel.current.open=!mobile.matches;};
    updateHistory();mobile.addEventListener('change',updateHistory);
    const area=messages.current;
    const observer=new ResizeObserver(()=>{
      if(followLatest.current && area) area.scrollTop=area.scrollHeight;
    });
    if(area)observer.observe(area);
    return ()=>{observer.disconnect();mobile.removeEventListener('change',updateHistory);document.body.classList.remove('ai-chat-page');};
  },[]);
  useLayoutEffect(()=>{
    const field=input.current;
    if(!field)return;
    field.style.height='0px';
    field.style.height=Math.min(160,Math.max(44,field.scrollHeight))+'px';
    field.style.overflowY=field.scrollHeight>160?'auto':'hidden';
  },[draft]);
  useLayoutEffect(()=>{
    if(!detail || detail.conversation.id!==id)return;
    const last=detail.messages.at(-1)?.id || null;
    const changed=last!==previousMessage.current;
    if(changed && messages.current){
      if(followLatest.current)messages.current.scrollTop=messages.current.scrollHeight;
      else if(previousMessage.current)setHasNewMessages(true);
    }
    previousMessage.current=last;
  },[detail,id]);
  const goToLatest=()=>{
    followLatest.current=true;
    setHasNewMessages(false);
    if(messages.current)messages.current.scrollTop=messages.current.scrollHeight;
  };
  const handleMessageScroll=()=>{
    const area=messages.current;
    if(!area)return;
    followLatest.current=area.scrollHeight-area.scrollTop-area.clientHeight<=48;
    if(followLatest.current)setHasNewMessages(false);
  };
  const job=detail?.job;
  const pending=['queued','running'].includes(job?.status);
  const blocked=busy || (!!id&&!detail) || (pending&&!job.connectionLost);
  const connected=serviceAvailable;
  const send=async(retry=false)=>{
    if(submitLock.current||blocked||(!retry&&!draft.trim()))return;
    submitLock.current=true;setBusy(true);setError('');
    try{
      let target=id;
      if(!target){const c=await aiRequest(token,'create',{month});target=c.id;setId(target);}
      await aiRequest(token,retry?'retry':'send',{conversationId:target,text:draft});
      followLatest.current=true;setHasNewMessages(false);setDraft('');await loadList();
    }catch(e){setError(e.message);}finally{submitLock.current=false;setBusy(false);}
  };
  const progressing=busy || (pending&&!job.connectionLost);
  const statusText=busy?'분석 대기 중':pending?(job.connectionLost?'AI 서비스 연결이 지연되고 있습니다. 재질문하거나 재시도할 수 있습니다.':job.status==='queued'?'분석 대기 중':'답변 생성 중'):job?.status==='failed'?'분석에 실패했습니다.':job?.status==='completed'?'답변이 완료되었습니다.':'';
  const handleQuestionKeyDown=e=>{
    if(e.key!=='Enter'||e.shiftKey||e.ctrlKey||e.altKey||e.metaKey)return;
    if(composing.current||e.nativeEvent.isComposing||e.nativeEvent.keyCode===229)return;
    e.preventDefault();
    if(!e.repeat)void send();
  };
  const metadata=detail?.conversation.metadata;
  return <section className="ai-chat" ref={layout}>
    <aside className="glass-card ai-sidebar">
      <details ref={historyPanel} className="ai-history" open>
        <summary>AI 분석 · 대화 목록</summary>
        <div className="ai-history-content">
          <button className="btn btn-secondary" disabled={busy} onClick={()=>{setId(null);setDetail(null);setMonth(selectedMonth);setDraft('');setError('');}}>새 대화</button>
          <nav className="ai-history-list" aria-label="이전 AI 대화">
            {conversations.map(c=><button key={c.id} className={'ai-history-item '+(c.id===id?'selected':'')} disabled={busy} onClick={()=>{setId(c.id);setDraft('');}}>{c.title}</button>)}
          </nav>
        </div>
      </details>
      <details className="ai-analysis-info">
        <summary>분석 정보</summary>
        <div className="ai-info-content">
          <p>질문 기준월: {detail?.conversation.month||month}</p>
          {!id&&<label>새 대화 기준월 <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>}
          <p>제공 자료: 본인 계정의 전체 저장 기간</p>
          <p>{pending?(job.connectionLost?'AI 서비스 연결 지연 · 재질문 또는 재시도 가능':job.status==='queued'?'분석 대기 중':'답변 생성 중'):connected?'AI 서비스 연결됨':'AI 서비스 연결 대기 중'}</p>
          {metadata&&<>
            <p>자료 기준: {new Date(metadata.at).toLocaleString('ko-KR')}</p>
            <p>거래 {metadata.transactionCount}건</p>
            <p>기간 {metadata.months[0]||'자료 없음'} ~ {metadata.months.at(-1)||'자료 없음'}</p>
            <details><summary>상세 정보</summary><p>계산 규칙: {metadata.rulesVersion}</p></details>
          </>}
        </div>
      </details>
    </aside>
    <div className="glass-card ai-conversation">
      <header className="ai-conversation-header">
        <h2>{detail?.conversation.title && detail.conversation.title!=='새 대화'?detail.conversation.title:'AI 분석'}</h2>
      </header>
      <div className="ai-message-area">
        <div className="ai-messages" ref={messages} onScroll={handleMessageScroll} aria-live="polite" aria-busy={pending&&!job.connectionLost} tabIndex={0} aria-label="대화 내역">
          {!id&&<p className="ai-empty">가계부에 대해 질문해 보세요.<br/>“이번 달 예산 대비 지출을 분석해줘”<br/>“최근 1년 순자산은 어떻게 변했어?”</p>}
          {detail?.messages.map(m=><article key={m.id} className={'ai-message '+m.role}>
            <strong>{m.role==='user'?'나':m.role==='assistant'?'AI':'안내'}</strong>
            <div>{m.content}</div>
            {m.metadata&&<small>자료 기준 {new Date(m.metadata.at).toLocaleString('ko-KR')}</small>}
          </article>)}
          {job?.status==='failed'&&<p role="alert">{job.error||'분석에 실패했습니다.'}</p>}
        </div>
        {hasNewMessages&&<button type="button" className="btn btn-secondary ai-jump-latest" onClick={goToLatest}>새 답변 보기 ↓</button>}
      </div>
      <form className="ai-composer" onSubmit={e=>{e.preventDefault();void send();}}>
        {statusText&&<div className={'ai-progress '+(progressing?'is-active':pending&&job.connectionLost?'is-delayed':job?.status==='failed'?'is-failed':'is-complete')} role="status" aria-live="polite" aria-atomic="true">
          <span className="ai-progress-icon" aria-hidden="true">{progressing?'':pending&&job.connectionLost?'!':job?.status==='failed'?'!':'✓'}</span>
          <span>{statusText}</span>
        </div>}
        {error&&<p role="alert">{error}</p>}
        {pending&&job.connectionLost&&<button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>send(true)}>이전 질문 재시도</button>}
        <label className="ai-input-label" htmlFor="ai-question">질문</label>
        <div className="ai-composer-row">
          <textarea ref={input} id="ai-question" value={draft} maxLength={10000} onChange={e=>setDraft(e.target.value)} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={handleQuestionKeyDown} placeholder="질문할 기간·항목을 자유롭게 적어주세요." rows={1}/>
          <button className="btn btn-primary" disabled={blocked||!draft.trim()}>{busy?'전송 중…':pending&&!job.connectionLost?(job.status==='queued'?'분석 대기 중':'답변 생성 중'):'전송'}</button>
        </div>
      </form>
    </div>
  </section>;
}
