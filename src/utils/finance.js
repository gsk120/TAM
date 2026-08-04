// 카테고리 정의 및 기본 예산 (PRD 8.2 & 엑셀 기준)
export const DEFAULT_CATEGORIES = [
  { id: 'cat_loan', name: '대출', defaultBudget: 2900000, isFixed: true, type: '지출' },
  { id: 'cat_ins', name: '보험', defaultBudget: 550000, isFixed: true, type: '지출' },
  { id: 'cat_comm', name: '통신비', defaultBudget: 140000, isFixed: true, type: '지출' },
  { id: 'cat_house', name: '주거비', defaultBudget: 210000, isFixed: true, type: '지출' },
  { id: 'cat_fixed_life', name: '생활고정비', defaultBudget: 260000, isFixed: true, type: '지출' },
  { id: 'cat_fixed_fin', name: '금융고정비', defaultBudget: 420000, isFixed: true, type: '지출' },
  { id: 'cat_trans', name: '교통', defaultBudget: 150000, isFixed: false, type: '지출' },
  { id: 'cat_food', name: '식비', defaultBudget: 800000, isFixed: false, type: '지출' },
  { id: 'cat_child', name: '육아', defaultBudget: 500000, isFixed: false, type: '지출' },
  { id: 'cat_med', name: '의료비', defaultBudget: 150000, isFixed: false, type: '지출' },
  { id: 'cat_edu', name: '교육비', defaultBudget: 0, isFixed: false, type: '지출' },
  { id: 'cat_etc_life', name: '기타생활비', defaultBudget: 300000, isFixed: false, type: '지출' },
  { id: 'cat_event', name: '이벤트', defaultBudget: 100000, isFixed: false, type: '지출' },
  { id: 'cat_tax', name: '세금', defaultBudget: 0, isFixed: false, type: '지출' },
  { id: 'cat_allow_gk', name: '기석용돈', defaultBudget: 200000, isFixed: false, type: '지출' },
  { id: 'cat_allow_sj', name: '승주용돈', defaultBudget: 200000, isFixed: false, type: '지출' },
];

export const INCOME_CATEGORIES = [
  { id: 'inc_gk_sal', name: '기석월급', owner: '기석' },
  { id: 'inc_gk_bon', name: '기석상여', owner: '기석' },
  { id: 'inc_sj_sal', name: '승주월급', owner: '승주' },
  { id: 'inc_sj_bon', name: '승주상여', owner: '승주' },
  { id: 'inc_med_ref', name: '실비', owner: '가족공동' },
  { id: 'inc_etc', name: '기타수입', owner: '가족공동' },
];

export const CASH_ASSET_ITEMS = [
  { id: 'acc_ibk_gk', name: '기업은행(기석)', owner: '기석', defaultBalance: 0 },
  { id: 'acc_hana_gk', name: '하나은행(기석)', owner: '기석', defaultBalance: 83127 },
  { id: 'acc_kbank_gk', name: '케이뱅크(기석)', owner: '기석', defaultBalance: 66454 },
  { id: 'acc_ibk_sj', name: '기업은행(승주)', owner: '승주', defaultBalance: 90176 },
  { id: 'acc_woori_sj', name: '우리은행(승주)', owner: '승주', defaultBalance: 244382 },
  { id: 'acc_busan_sj', name: '부산은행(승주)', owner: '승주', defaultBalance: 100000 },
  { id: 'acc_kbank_sj', name: '케이뱅크(승주)', owner: '승주', defaultBalance: 23766 },
  { id: 'acc_cma', name: '미래에셋CMA', owner: '가족공동', defaultBalance: 36493386 },
  { id: 'acc_bonds', name: '기업은행중금채', owner: '가족공동', defaultBalance: 1843037 },
  { id: 'acc_hana_sav', name: '하나은행적금', owner: '기석', defaultBalance: 0 },
  { id: 'acc_woori_sav', name: '우리은행적금', owner: '승주', defaultBalance: 1200000 },
  { id: 'acc_house_gk', name: '주택청약(기석)', owner: '기석', defaultBalance: 16520000 },
  { id: 'acc_house_sj', name: '주택청약(승주)', owner: '승주', defaultBalance: 9620000 },
  { id: 'acc_busan_dep', name: '부산은행예금', owner: '승주', defaultBalance: 1500000 },
];

export const INVEST_ASSET_ITEMS = [
  { id: 'inv_toss_gk', name: '토스증권(기석)', owner: '기석', defaultBalance: 0 },
  { id: 'inv_mirae_gk', name: '미래에셋(기석)', owner: '기석', defaultBalance: 0 },
  { id: 'inv_upbit_gk', name: '업비트(기석)', owner: '기석', defaultBalance: 0 },
  { id: 'inv_nh_sj', name: '농협투자(승주)', owner: '승주', defaultBalance: 0 },
  { id: 'inv_toss_sj', name: '토스증권(승주)', owner: '승주', defaultBalance: 0 },
  { id: 'inv_pension_gk', name: '퇴직연금(기석)', owner: '기석', defaultBalance: 0 },
  { id: 'inv_pension_sj', name: '퇴직연금(승주)', owner: '승주', defaultBalance: 0 },
  { id: 'inv_realestate', name: '부동산', owner: '가족공동', defaultBalance: 0, isRealEstate: true },
];

export const DEBT_ITEMS = [
  { id: 'debt_mortgage', name: '주담대', owner: '가족공동', defaultBalance: 510000000 },
  { id: 'debt_minus', name: '마통', owner: '가족공동', defaultBalance: 90000000 },
];

export const DEFAULT_ASSET_STRUCTURE = {
  cashItems: CASH_ASSET_ITEMS,
  investItems: INVEST_ASSET_ITEMS,
  debtItems: DEBT_ITEMS,
};

export function getInitialAssetSnapshot(assetStructure = DEFAULT_ASSET_STRUCTURE) {
  const cashList = assetStructure?.cashItems || CASH_ASSET_ITEMS;
  const investList = assetStructure?.investItems || INVEST_ASSET_ITEMS;
  const debtList = assetStructure?.debtItems || DEBT_ITEMS;

  const cashMap = {};
  cashList.forEach(item => { cashMap[item.id] = 0; });

  const investMap = {};
  investList.forEach(item => { investMap[item.id] = 0; });

  const debtMap = {};
  debtList.forEach(item => { debtMap[item.id] = 0; });

  return { cash: cashMap, invest: investMap, debt: debtMap };
}

export const DEFAULT_ACCOUNTS = CASH_ASSET_ITEMS.map(item => ({
  id: item.id,
  name: item.name,
  type: '입출금',
  owner: item.owner,
  balance: item.defaultBalance,
  isAsset: true,
}));

export const BUDGET_SCENARIOS = {
  basic: { name: '기본안', loanBudget: 2900000, eduBudget: 0 },
};

// 원 단위 수치를 예산 사용률 및 상태로 변환
export function getCategoryBudgetStatus(categoryName, spentAmount, budgetAmount) {
  if (categoryName === '세금' || budgetAmount === 0) {
    return {
      usageRate: budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0,
      status: '안정',
      badgeClass: 'badge-stable',
      barClass: 'bar-stable',
    };
  }

  const usageRate = (spentAmount / budgetAmount) * 100;
  if (usageRate >= 100) {
    return {
      usageRate,
      status: '초과',
      badgeClass: 'badge-danger',
      barClass: 'bar-danger',
    };
  } else if (usageRate >= 80) {
    return {
      usageRate,
      status: '주의',
      badgeClass: 'badge-warning',
      barClass: 'bar-warning',
    };
  }
  return {
    usageRate,
    status: '안정',
    badgeClass: 'badge-stable',
    barClass: 'bar-stable',
  };
}

// 월간 재무 종합 집계 함수 (3가지 관점 회계 처리)
export function calculateMonthlyMetrics(transactions, yearMonth, categoryBudgets = {}, categoriesList = DEFAULT_CATEGORIES) {
  const activeCategories = Array.isArray(categoriesList) && categoriesList.length > 0 ? categoriesList : DEFAULT_CATEGORIES;

  // 해당 월 거래 필터링 (YYYY-MM)
  const monthTxs = transactions.filter(t => t.date.startsWith(yearMonth));

  let totalIncome = 0;
  let totalCashOutflow = 0;
  let realConsumption = 0;
  let assetIncrease = 0;
  let debtReduction = 0;
  let totalMedicalExpense = 0;
  let medicalRefund = 0;

  const categorySpentMap = {};
  activeCategories.forEach(cat => {
    categorySpentMap[cat.name] = 0;
  });

  const incomeMap = {
    '기석월급': 0,
    '기석상여': 0,
    '승주월급': 0,
    '승주상여': 0,
    '실비': 0,
    '기타수입': 0,
  };

  monthTxs.forEach(tx => {
    const rawAmt = Number(tx.amount) || 0;
    const absAmt = Math.abs(rawAmt);
    const type = tx.type; // '수입', '지출', '계좌이체', '자산증가', '부채상환'
    const category = tx.category;

    if (type === '수입') {
      totalIncome += absAmt;
      if (incomeMap[category] !== undefined) {
        incomeMap[category] += absAmt;
      } else {
        incomeMap['기타수입'] += absAmt;
      }

      if (category === '실비') {
        medicalRefund += absAmt;
      }
    } else if (type === '지출') {
      // 결제 취소건(rawAmt < 0 또는 tx.isCancel)은 부호를 유지하여 카테고리 지출에서 차감/상쇄 (-1000)
      realConsumption += rawAmt;
      totalCashOutflow += rawAmt;

      if (categorySpentMap[category] !== undefined) {
        categorySpentMap[category] += rawAmt;
      } else {
        categorySpentMap[category] = rawAmt;
      }

      if (category === '의료비') {
        totalMedicalExpense += rawAmt;
      }
    } else if (type === '자산증가') {
      totalCashOutflow += rawAmt;
      assetIncrease += rawAmt;
      if (categorySpentMap[category] !== undefined) {
        categorySpentMap[category] += rawAmt;
      }
    } else if (type === '부채상환') {
      totalCashOutflow += rawAmt;
      debtReduction += rawAmt;
      if (categorySpentMap[category] !== undefined) {
        categorySpentMap[category] += rawAmt;
      }
    } else if (type === '계좌이체') {
      // 내계좌이체 / 카드대금결제는 총수입, 실제소비에서 모두 제외
    }
  });

  // 순의료비 = MAX(0, 해당월 의료비 총지출 - 해당월 실비 수입)
  const netMedicalExpense = Math.max(0, totalMedicalExpense - medicalRefund);

  // 카테고리별 예산 및 위험 TOP3 집계
  const categoryDetails = activeCategories.map(cat => {
    const budget = categoryBudgets[cat.name] ?? (Number(cat.defaultBudget) || 0);
    let spent = categorySpentMap[cat.name] || 0;

    // PRD 9.10: 의료비 예산 사용액은 순의료비 = MAX(0, 의료비 총지출 - 실비 수입) 기준 적용
    if (cat.name === '의료비' || cat.id === 'cat_med') {
      spent = netMedicalExpense;
    }

    const remaining = budget - spent;
    const statusInfo = getCategoryBudgetStatus(cat.name, spent, budget);

    return {
      ...cat,
      budget,
      spent,
      grossMedicalSpent: (cat.name === '의료비' || cat.id === 'cat_med') ? totalMedicalExpense : undefined,
      medicalRefund: (cat.name === '의료비' || cat.id === 'cat_med') ? medicalRefund : undefined,
      remaining,
      ...statusInfo,
    };
  });

  // 위험 TOP 3 (세금 제외, 사용률 높은 순 정렬)
  const riskTop3 = [...categoryDetails]
    .filter(c => c.name !== '세금' && c.id !== 'cat_tax' && c.budget > 0)
    .sort((a, b) => b.usageRate - a.usageRate)
    .slice(0, 3);

  // 총 지출 = 내역에서 지출 합계
  const totalExpense = realConsumption;

  // 실 지출 = 카테고리별 사용합계금 (또는 총지출 - 실비수입)
  const categoryTotalSpent = categoryDetails.reduce((acc, cat) => acc + cat.spent, 0);

  // 월 잉여자금 = 총수입 - 총지출
  const monthlySurplus = totalIncome - totalExpense;

  // 저축률
  const cashflowSavingsRate = totalIncome > 0 ? ((totalIncome - totalCashOutflow) / totalIncome) * 100 : 0;
  const assetSavingsRate = totalIncome > 0 ? ((assetIncrease + debtReduction + Math.max(0, monthlySurplus)) / totalIncome) * 100 : 0;

  return {
    yearMonth,
    totalIncome,
    totalExpense,
    categoryTotalSpent,
    totalCashOutflow,
    realConsumption,
    assetIncrease,
    debtReduction,
    totalMedicalExpense,
    medicalRefund,
    netMedicalExpense,
    monthlySurplus,
    cashflowSavingsRate,
    assetSavingsRate,
    categoryDetails,
    riskTop3,
    incomeMap,
  };
}

export function formatKRW(val) {
  const num = Math.round(Number(val) || 0);
  return num.toLocaleString('ko-KR') + '원';
}

export function formatManWon(val) {
  const num = Math.round((Number(val) || 0) / 10000);
  return num.toLocaleString('ko-KR') + '만원';
}

// 인풋 박스용 1,000원 단위 콤마 포맷팅 헬퍼 함수
export function formatInputNumber(val) {
  if (val === undefined || val === null || val === '') return '';
  // 음수 지원
  const str = String(val);
  const isNegative = str.startsWith('-');
  const cleanStr = str.replace(/[^0-9]/g, '');
  if (!cleanStr) return isNegative ? '-' : '';
  const formatted = Number(cleanStr).toLocaleString('ko-KR');
  return isNegative ? `-${formatted}` : formatted;
}

export function parseInputNumber(str) {
  if (str === undefined || str === null || str === '') return 0;
  const clean = String(str).replace(/,/g, '');
  const num = Number(clean);
  return isNaN(num) ? 0 : num;
}
