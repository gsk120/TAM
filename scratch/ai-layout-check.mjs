import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const { chromium }=require('C:/Users/gsk12/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5177','--strictPort'],{windowsHide:true,stdio:'ignore'});
let browser;
try {
  for(let i=0;i<30;i++){try{await fetch('http://127.0.0.1:5177');break;}catch{await new Promise(r=>setTimeout(r,300));}}
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1660,height:918}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const db={userInfo:{id:'test',username:'togom',householdName:'UI 테스트'},categories:[],incomeCategories:[],transactions:[],monthlyBudgets:{},monthlyAssetSnapshots:{},customBudgetPresets:{},assetStructure:{cashItems:[],investItems:[],debtItems:[]},familyMembers:[],activeScenario:'basic'};
  const c={id:'layout-conversation',title:'가계부 분석 테스트',month:'2026-10',metadata:{at:'2026-10-15T00:00:00Z',transactionCount:2343,months:['2026-01','2026-12'],rulesVersion:'finance-v1'}};
  const messages=Array.from({length:40},(_,i)=>({id:'m'+i,role:i%2?'assistant':'user',content:'메시지 '+i+'\n'+('가상 데이터 분석 내용입니다. '.repeat(20))}));
  let job={id:'j',status:'running',createdAt:new Date().toISOString(),connectionLost:false};
  await page.addInitScript(()=>localStorage.setItem('finance_app_token','layout-test'));
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let data={success:true};
    if(path==='/api/auth/me')data=db.userInfo;
    else if(path==='/api/db')data=db;
    else if(path==='/api/ai/capabilities')data={enabled:true};
    else if(path==='/api/ai/overview')data={conversations:[c],devices:[]};
    else if(path==='/api/ai/conversations/'+c.id)data={conversation:c,messages,job};
    await route.fulfill({json:data});
  });
  await page.goto('http://127.0.0.1:5177');
  await page.getByRole('button',{name:'AI 분석',exact:true}).click();
  await page.getByText('메시지 39',{exact:false}).waitFor();
  const geometry=await page.evaluate(()=>{
    const area=document.querySelector('.ai-messages'),composer=document.querySelector('.ai-composer');
    return {height:area.clientHeight,composer:composer.getBoundingClientRect().bottom,viewport:innerHeight,pageHeight:document.documentElement.scrollHeight,pageWidth:document.documentElement.scrollWidth};
  });
  assert.ok(await page.locator('.ai-history-item').first().evaluate(el=>el.getBoundingClientRect().height>35));
  assert.ok(geometry.height>550,JSON.stringify(geometry));
  assert.ok(geometry.composer<=918,JSON.stringify(geometry));
  assert.ok(geometry.pageHeight<=919,JSON.stringify(geometry));
  await page.locator('.ai-messages').evaluate(el=>{el.scrollTop=220;el.dispatchEvent(new Event('scroll'));});
  const before=await page.locator('.ai-messages').evaluate(el=>el.scrollTop);
  messages.push({id:'new-answer',role:'assistant',content:'새로운 답변 테스트'});job={...job,status:'completed'};
  await page.getByRole('button',{name:'새 답변 보기 ↓',exact:true}).waitFor();
  const after=await page.locator('.ai-messages').evaluate(el=>el.scrollTop);
  assert.ok(Math.abs(before-after)<2,'reading position moved');
  assert.equal(await page.locator('.ai-composer').evaluate(el=>el.getBoundingClientRect().bottom),geometry.composer);
  await page.getByRole('button',{name:'새 답변 보기 ↓',exact:true}).click();
  assert.ok(await page.locator('.ai-messages').evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight<3));
  await page.getByLabel('질문',{exact:true}).fill(Array(20).fill('긴 질문 입력').join('\n'));
  assert.ok(await page.getByLabel('질문',{exact:true}).evaluate(el=>el.clientHeight<=160));
  await page.getByLabel('질문',{exact:true}).fill('');
  await mkdir('scratch/ai-ui',{recursive:true});
  await page.screenshot({path:'scratch/ai-ui/layout-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>!document.querySelector('.ai-history').open);
  await page.screenshot({path:'scratch/ai-ui/layout-mobile.png',fullPage:true});
  const mobile=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,viewport:innerHeight,composer:document.querySelector('.ai-composer').getBoundingClientRect().bottom}));
  assert.ok(mobile.width<=390,JSON.stringify(mobile));
  assert.ok(mobile.height<=845,JSON.stringify(mobile));
  assert.ok(mobile.composer<=844,JSON.stringify(mobile));
  await page.getByRole('button',{name:'대시보드',exact:true}).click();
  assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('ai-chat-page')),false);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({desktop:geometry,mobile,readingPositionPreserved:true,jumpToLatest:true,inputHeightCapped:true,otherScreensRestored:true,errors},null,2));
} finally {
  if(browser)await browser.close();
  if(vite.pid)spawn('taskkill.exe',['/PID',String(vite.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
}