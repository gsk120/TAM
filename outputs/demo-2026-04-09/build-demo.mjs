import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const dir="C:/Users/gsk12/OneDrive/바탕 화면/자산관리프로그램/outputs/demo-2026-04-09";
let seed=260409; function rnd(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;}
const budgets={'대출':250000,'보험':450000,'통신비':200000,'주거비':450000,'생활고정비':120000,'금융고정비':80000,'교통':400000,'식비':1450000,'육아':550000,'의료비':200000,'교육비':400000,'기타생활비':350000,'이벤트':400000,'세금':0,'남편용돈':550000,'아내용돈':150000};
const ids=['cat_loan','cat_ins','cat_comm','cat_house','cat_fixed_life','cat_fixed_fin','cat_trans','cat_food','cat_child','cat_med','cat_edu','cat_etc_life','cat_event','cat_tax','cat_allow_h','cat_allow_w'];
const categories=Object.entries(budgets).map(([name,defaultBudget],i)=>({id:ids[i],name,defaultBudget,isFixed:i<6,costType:i<6?'fixed':name==='이벤트'||name==='세금'?'one_off':'variable',type:'지출'}));
const incomeCategories=[{id:'inc_h_salary',name:'남편월급',owner:'남편'},{id:'inc_w_leave',name:'육아휴직급여',owner:'아내'},{id:'inc_w_support',name:'부모급여등지원금',owner:'아내'},{id:'inc_interest',name:'이자수입',owner:'가족공동'},{id:'inc_med_ref',name:'실비',owner:'가족공동'},{id:'inc_etc',name:'기타수입',owner:'가족공동'}];
const catMap=new Map([...categories,...incomeCategories].map(c=>[c.name,c.id]));
const members=[{id:'demo_m_h',name:'남편',color:'#3b82f6'},{id:'demo_m_w',name:'아내',color:'#ec4899'},{id:'demo_m_joint',name:'가족공동',color:'#10b981'}];
const all=[];let sequence=0;
function add(m,d,owner,type,category,description,amount,memo='',account=''){
const date='2026-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
const tx={id:'demo_'+date.replaceAll('-','')+'_'+String(++sequence).padStart(4,'0'),date,amount,category,category_id:catMap.get(category)||'',subcategory:'',type,description,memo:'가상 시연 데이터'+(memo?' / '+memo:''),account:account||(owner==='남편'?'데모 급여통장':owner==='아내'?'데모 생활비통장':'데모 공동통장'),payment_method:type==='지출'?'데모카드':'계좌',asset_type:'',owner,created_at:date+'T03:00:00.000Z'}; all.push(tx);return tx;
}
function pieces(total,n){const weights=Array.from({length:n},()=>0.5+rnd());const sum=weights.reduce((a,b)=>a+b,0);let remaining=total;return weights.map((w,i)=>{const v=i===n-1?remaining:Math.floor(total*w/sum/100)*100;remaining-=v;return v;});}
function spend(m,owner,category,total,n,labels){pieces(total,n).forEach((amount,i)=>add(m,Math.min(28,1+Math.floor(i*27/n)+Math.floor(rnd()*2)),owner,'지출',category,labels[i%labels.length]+' '+String(i+1).padStart(2,'0'),amount));}
const salaries=[6800000,7100000,7000000,7200000,6900000,7000000];
const expenseTargets=[5750000,5900000,6050000,6300000,5950000,6050000];
for(let m=4;m<=9;m++){
const index=m-4;
add(m,25,'남편','수입','남편월급','데모컴퍼니 급여',salaries[index]);
add(m,10,'아내','수입','육아휴직급여','가상 육아휴직 급여',2000000,'시연용 가정 금액');
add(m,25,'아내','수입','부모급여등지원금','가상 부모급여 등 지원금 합계',1000000,'시연용 가정 금액');
add(m,5,'남편','계좌이체','내계좌이체','아내 생활비 송금',850000,'이체출금 / 연결: 생활비-'+m);
add(m,5,'아내','계좌이체','내계좌이체','남편 생활비 수령',850000,'이체입금 / 연결: 생활비-'+m);
add(m,26,'남편','계좌이체','저축','정기 적금 납입',2000000,'이체출금 / 데모 적금통장');
add(m,26,'남편','계좌이체','저축','비상금 적립',500000,'이체출금 / 데모 비상금통장');
add(m,26,'남편','계좌이체','투자','국내 ETF 투자금 이동',400000,'이체출금 / 국내 ETF 보유액 증가');
add(m,26,'남편','계좌이체','투자','해외 ETF 투자금 이동',300000,'이체출금 / 해외 ETF 보유액 증가');
add(m,26,'아내','계좌이체','저축','자녀 교육자금 적금 납입',800000,'이체출금 / 데모 교육자금 적금');
const targets={...budgets};
for(const name of ['식비','육아','의료비','교육비','기타생활비','교통','남편용돈','아내용돈']) targets[name]=Math.round(budgets[name]*(0.85+rnd()*0.28)/100)*100;
targets['이벤트']=expenseTargets[index]-Object.entries(targets).filter(([k])=>k!=='이벤트').reduce((s,[,v])=>s+v,0);
assert(targets['이벤트']>0);
add(m,28,'남편','지출','대출','공동주택 대출 이자',250000);
add(m,15,'남편','지출','보험','가상 가족보험 자동납부',450000);
add(m,21,'남편','지출','통신비','데모 통신요금 및 구독',200000);
add(m,20,'남편','지출','주거비','데모아파트 관리비·공과금',450000);
add(m,12,'남편','지출','생활고정비','가상 정기 생활서비스',120000);
add(m,18,'남편','지출','금융고정비','가상 금융서비스 정기비용',80000);
spend(m,'아내','식비',targets['식비'],18,['데모마트 장보기','가상식당 가족식사','데모배달 저녁']);
spend(m,'아내','육아',targets['육아'],8,['데모베이비 기저귀','가상키즈 돌봄용품','데모아동 의류']);
spend(m,'아내','교육비',targets['교육비'],4,['가상 어린이 체험교실','데모북스 아동도서']);
spend(m,'아내','의료비',targets['의료비'],4,['데모소아과 진료','가상약국 의약품']);
spend(m,'아내','기타생활비',targets['기타생활비']-50000,5,['데모홈 생활용품','가상주방 소모품']);
spend(m,'남편','기타생활비',50000,1,['데모홈 수리용품']);
spend(m,'남편','교통',targets['교통'],9,['가상주유소 주유','데모교통 정기권','가상주차장']);
const coffee=Math.round(targets['남편용돈']*0.18/100)*100;
spend(m,'남편','남편용돈',coffee,16,['가상커피 시청점','데모카페 직장앞']);
spend(m,'남편','남편용돈',targets['남편용돈']-coffee,12,['데모식당 직장점심','가상스토어 개인용품']);
spend(m,'아내','아내용돈',targets['아내용돈'],4,['데모카페 휴식','가상스토어 개인용품']);
spend(m,'남편','이벤트',targets['이벤트'],3,m===7?['가상리조트 여름휴가','데모가족 여행']:m===9?['가상명절 선물','데모가족 나들이']:['가상가족 주말나들이','데모경조사']);
// 동일 결제에 연결된 취소 1건: 순지출은 변하지 않음.
add(m,13,'아내','지출','육아','데모베이비 추가 주문',59000,'주문번호 DEMO-'+m+'-A');
add(m,16,'아내','지출','육아','데모베이비 추가 주문 취소',-59000,'결제취소 / 주문번호 DEMO-'+m+'-A');
if(m<9){add(m,30-(m===4||m===6?0:0),'가족공동','수입','이자수입','데모 공동예금 이자',42000+(m-4)*100);add(m,17,'가족공동','수입','기타수입','용도 미확인 입금 DEMO-'+m+'-01',27000+m*1000);add(m,23,'가족공동','수입','기타수입','가상 소액 정산 입금 DEMO-'+m+'-02',18000+m*500);if([4,6,8].includes(m))add(m,24,'가족공동','수입','실비','가상 의료비 실비 수령',45000,'당월 의료비 일부 보전');}
}
all.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
const assetStructure={cashItems:[{id:'demo_h_main',name:'데모 급여통장',owner:'남편'},{id:'demo_h_emg',name:'데모 비상금통장',owner:'남편'},{id:'demo_h_saving',name:'데모 적금통장',owner:'남편'},{id:'demo_w_main',name:'데모 생활비통장',owner:'아내'},{id:'demo_w_deposit',name:'데모 정기예금',owner:'아내'},{id:'demo_w_edu',name:'데모 교육자금 적금',owner:'아내'},{id:'demo_joint_deposit',name:'데모 공동 정기예금',owner:'가족공동'},{id:'demo_joint_main',name:'데모 공동통장',owner:'가족공동'}],investItems:[{id:'demo_h_domestic',name:'가상 국내 주식·ETF',owner:'남편'},{id:'demo_h_foreign',name:'가상 해외 주식·ETF',owner:'남편'},{id:'demo_joint_home',name:'서울 가상 공동주택',owner:'가족공동',isRealEstate:true},{id:'demo_h_car',name:'가상 가족차량',owner:'남편',isRealEstate:false}],debtItems:[{id:'demo_joint_mortgage',name:'가상 주택담보대출',owner:'가족공동'}]};
const final={cash:{demo_h_main:10000000,demo_h_emg:10000000,demo_h_saving:40000000,demo_w_main:15000000,demo_w_deposit:30000000,demo_w_edu:20000000,demo_joint_deposit:20000000,demo_joint_main:5000000},invest:{demo_h_domestic:30000000,demo_h_foreign:20000000,demo_joint_home:620000000,demo_h_car:20000000},debt:{demo_joint_mortgage:100000000}};
const valuation=[150000,-200000,350000,-100000,250000,180000];
function delta(m){const t=all.filter(t=>t.date.startsWith('2026-'+String(m).padStart(2,'0')));const out={cash:{},invest:{},debt:{}};const inflow=o=>t.filter(t=>t.owner===o&&t.type==='수입').reduce((s,t)=>s+t.amount,0);const expense=o=>t.filter(t=>t.owner===o&&t.type==='지출').reduce((s,t)=>s+t.amount,0);
out.cash.demo_h_main=inflow('남편')-expense('남편')-850000-3200000;
out.cash.demo_h_emg=500000;out.cash.demo_h_saving=2000000;
out.cash.demo_w_main=inflow('아내')-expense('아내')+850000-800000;out.cash.demo_w_edu=800000;
out.cash.demo_joint_main=inflow('가족공동');out.invest.demo_h_domestic=400000+valuation[m-4];out.invest.demo_h_foreign=300000;return out;}
const snapshots={};let state=structuredClone(final);for(let m=9;m>=4;m--){snapshots['2026-'+String(m).padStart(2,'0')]=structuredClone(state);const d=delta(m);for(const group of ['cash','invest','debt'])for(const [id,amount]of Object.entries(d[group]))state[group][id]-=amount;}
const opening=structuredClone(state);const total=s=>Object.values(s.cash).reduce((a,b)=>a+b,0)+Object.values(s.invest).reduce((a,b)=>a+b,0);assert.equal(total(final),840000000);
for(const s of [opening,...Object.values(snapshots)])for(const group of ['cash','invest','debt'])for(const v of Object.values(s[group]))assert(v>=0&&Number.isSafeInteger(v));
for(const group of ['cashItems','investItems','debtItems']){const sg=group==='cashItems'?'cash':group==='investItems'?'invest':'debt';for(const item of assetStructure[group]){item.defaultBalance=0;item.startMonth='2026-04';}}
const monthlyBudgets={};for(let m=4;m<=9;m++)monthlyBudgets['2026-'+String(m).padStart(2,'0')]={...budgets};
const db={familyMembers:members,categories,incomeCategories,accounts:assetStructure.cashItems.map(i=>({id:i.id,name:i.name,type:i.name.includes('적금')?'적금':i.name.includes('예금')?'예금':'입출금',owner:i.owner,balance:snapshots['2026-08'].cash[i.id],isAsset:true})),transactions:all.filter(t=>t.date<'2026-09-01'),monthlyBudgets,monthlyAssetSnapshots:Object.fromEntries(Object.entries(snapshots).filter(([ym])=>ym<'2026-09')),customBudgetPresets:{basic:{id:'basic',name:'시연 기본안 · 소비 600만원 / 저축 400만원',createdAt:'2026-04-01T00:00:00.000Z',budgets:{...budgets}}},activeScenario:'basic',assetStructure};
assert.equal(Object.values(budgets).reduce((a,b)=>a+b,0),6000000);
assert.equal(new Set(all.map(t=>t.id)).size,all.length);
assert(!all.some(t=>t.owner==='가족공동'&&t.type==='지출'));
assert.equal(salaries.reduce((a,b)=>a+b,0)/6,7000000);
assert.equal(all.filter(t=>t.type==='지출').reduce((a,b)=>a+b.amount,0),expenseTargets.reduce((a,b)=>a+b,0));
assert.equal(all.filter(t=>t.type==='계좌이체'&&['저축','투자'].includes(t.category)).reduce((a,b)=>a+b.amount,0),24000000);
const backupText=JSON.stringify(db,null,2)+'\n';assert(!backupText.includes('user_id'));await fs.writeFile(dir+'/demo_2026_04-08_등록용.json',backupText,'utf8');
const summary=[];
for(let m=4;m<=9;m++){const ym='2026-'+String(m).padStart(2,'0');const tx=all.filter(t=>t.date.startsWith(ym));summary.push({month:ym,count:tx.length,income:tx.filter(t=>t.type==='수입').reduce((s,t)=>s+t.amount,0),expense:tx.filter(t=>t.type==='지출').reduce((s,t)=>s+t.amount,0),savingTransfers:4000000,asset:total(snapshots[ym]),debt:100000000});}
const workbooks=[];
for(const owner of ['남편','아내']){
const tx=all.filter(t=>t.date.startsWith('2026-09')&&t.owner===owner);const wb=Workbook.create();const sheet=wb.worksheets.add('내역');sheet.showGridLines=false;
const values=[['날짜','타입','대분류','내용','금액','비고','소유자'],...tx.map(t=>[new Date(t.date+'T12:00:00Z'),t.type,t.category,t.description,t.type==='지출'?-t.amount:t.amount,t.memo,t.owner])];
sheet.getRange('A1:G'+values.length).values=values;
sheet.getRange('A1:G'+values.length).format.font={name:'Arial',size:11,color:'#1e293b'};sheet.getRange('A1:G'+values.length).format.rowHeight=22;
sheet.getRange('A1:G1').format={fill:'#334155',font:{name:'Arial',size:11,bold:true,color:'#ffffff'},rowHeight:28};
sheet.getRange('A2:A'+values.length).setNumberFormat('yyyy-mm-dd');sheet.getRange('E2:E'+values.length).setNumberFormat('#,##0;[Red]-#,##0');
for(const [col,width]of [['A',15],['B',13],['C',20],['D',40],['E',17],['F',75],['G',12]])sheet.getRange(col+'1:'+col+values.length).format.columnWidth=width;
sheet.getRange('F2:F'+values.length).format.font={name:'Arial',size:11,color:'#64748b'};sheet.freezePanes.freezeRows(1);
sheet.tables.add('A1:G'+values.length,true,owner==='남편'?'DemoHusbandTransactions':'DemoWifeTransactions');
console.log(owner,tx.length,(await wb.inspect({kind:'table',range:'내역!A1:G6',include:'values',tableMaxRows:6,tableMaxCols:7,maxChars:1800})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!',options:{useRegex:true,maxResults:10},maxChars:600})).ndjson);
const preview=await wb.render({sheetName:'내역',range:'A1:G9',scale:1.3,format:'png'});await fs.writeFile(dir+'/'+owner+'_preview.png',new Uint8Array(await preview.arrayBuffer()));
const output=await SpreadsheetFile.exportXlsx(wb);await output.save(dir+'/demo_2026_09_'+owner+'_거래내역.xlsx');workbooks.push({owner,count:tx.length});
}
const finalRows=[...assetStructure.cashItems.map(i=>[i.name,final.cash[i.id]]),...assetStructure.investItems.map(i=>[i.name,final.invest[i.id]]),...assetStructure.debtItems.map(i=>[i.name,final.debt[i.id]])];
const readme=['# demo 시연 데이터','', '모든 이름·상호·거래금액·자산금액은 가상 데이터입니다. 기존 백업의 카테고리와 거래 빈도만 참고했습니다.','', '## 등록 순서','', '1. 직접 만든 demo 계정으로 로그인합니다.','2. 설정 화면의 JSON 데이터베이스 복원에서 demo_2026_04-08_등록용.json을 선택합니다. 로그인한 계정의 기존 거래·예산·자산·설정이 교체되므로 demo 계정에서만 사용합니다.','3. 거래내역 가져오기에서 demo_2026_09_남편_거래내역.xlsx를 선택하고 소유자가 남편인지 확인한 뒤 등록합니다.','4. demo_2026_09_아내_거래내역.xlsx를 선택하고 소유자가 아내인지 확인한 뒤 등록합니다.','5. 같은 Excel을 다시 올리면 완전 중복 판정을 확인할 수 있습니다.','', '## 구성과 회계 규칙','', '- JSON: 4~8월 거래 '+db.transactions.length+'건, 가족 구성원 3개, 지출·수입 카테고리, 자산 구조, 4~8월 월말 자산, 4~9월 예산과 기본 프리셋.','- 9월 Excel: 남편 '+workbooks[0].count+'건, 아내 '+workbooks[1].count+'건. 9월 가족공동 거래는 포함하지 않았습니다.','- 월 정기수입: 남편 월급은 680만~720만원으로 6개월 평균 700만원, 아내는 육아휴직급여 200만원과 지원금 합계 100만원. 제도 지급액은 시연용 가정입니다.','- 월 소비 예산 600만원, 저축·투자 목표 400만원. 정기 적금 200만원, 비상금 50만원, 교육 적금 80만원, 국내·해외 투자 합계 70만원.','- 저축·투자는 계좌이체로 입력해 소비 지출에서 제외했습니다. 소비 예산표의 합계는 600만원이며 저축 목표는 별도입니다.','- Excel 금액은 앱 파서에 맞춰 일반 지출을 음수, 결제취소를 양수로 저장했습니다. JSON에서는 일반 지출이 양수, 결제취소가 음수입니다.','- 생활비 송금 85만원의 출금·입금은 모두 계좌이체이며 가구 수입과 소비에서 제외합니다.','- 총자산과 부채는 월별 스냅샷입니다. 거래 업로드만으로 자동 갱신되지 않습니다.','- 9월 최종 총자산 840,000,000원, 부채 100,000,000원, 순자산 740,000,000원. 주택 가격은 고정이며 주식 평가손익은 월별 가상 값입니다.','- 통계 기준: 2025년 가계금융복지조사 서울 전체 가구 평균 총자산 836,490,000원을 참고해 반올림했습니다. 서울 4인 가구의 정확한 교차집계 평균은 아닙니다.','- 출처: https://www.mods.go.kr/board.es?act=view&bid=215&list_no=439535&mid=b80501010000','', '## 월별 현황','', '| 월 | 거래 수 | 수입 | 순소비 지출 | 저축·투자 이체 | 총자산 |','|---|---:|---:|---:|---:|---:|',...summary.map(s=>'| '+s.month+' | '+s.count+' | '+s.income.toLocaleString('ko-KR')+' | '+s.expense.toLocaleString('ko-KR')+' | '+s.savingTransfers.toLocaleString('ko-KR')+' | '+s.asset.toLocaleString('ko-KR')+' |'),'','## 9월 월말 자산 입력값','', '9월 시연 후 총자산 화면에서 아래 값을 직접 입력합니다. JSON에는 9월 스냅샷을 미리 넣지 않았습니다.','', '| 항목 | 잔액·평가액(원) |','|---|---:|',...finalRows.map(([name,v])=>'| '+name+' | '+v.toLocaleString('ko-KR')+' |'),''];
await fs.writeFile(dir+'/사용안내.md',readme.join('\n'),'utf8');
console.log(JSON.stringify({jsonTransactions:db.transactions.length,workbooks,summary},null,2));
