import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { loadDatabase, loadDatabaseAsync, saveDatabase, resetDatabase, DEFAULT_BASIC_PRESET } from '../utils/storage';
import { calculateMonthlyMetrics, BUDGET_SCENARIOS, DEFAULT_ASSET_STRUCTURE, CASH_ASSET_ITEMS, INVEST_ASSET_ITEMS, DEBT_ITEMS, getInitialAssetSnapshot } from '../utils/finance';

const AppContext = createContext();

const getCurrentYearMonth = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

export function AppProvider({ children }) {
  const [db, setDb] = useState(() => loadDatabase());
  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentYearMonth());
  const [activeScenario, setActiveScenario] = useState('basic');
  const [isBackendLoaded, setIsBackendLoaded] = useState(false);

  // 현재 DB 내의 동적 자산 구조 (없으면 기본 시드 사용)
  const assetStructure = db.assetStructure || DEFAULT_ASSET_STRUCTURE;
  const cashList = assetStructure.cashItems || CASH_ASSET_ITEMS;
  const investList = assetStructure.investItems || INVEST_ASSET_ITEMS;
  const debtList = assetStructure.debtItems || DEBT_ITEMS;

  // 컴포넌트 마운트 시 백엔드 Node.js + SQLite 데이터베이스 비동기 연동 및 로드
  useEffect(() => {
    let isMounted = true;
    async function fetchBackendData() {
      try {
        const remoteDb = await loadDatabaseAsync();
        if (isMounted) {
          setDb(remoteDb);
          setIsBackendLoaded(true);
        }
      } catch (err) {
        console.error('Failed to load DB from backend:', err);
        if (isMounted) setIsBackendLoaded(true);
      }
    }
    fetchBackendData();
    return () => {
      isMounted = false;
    };
  }, []);

  // DB 변경 시 localStorage 및 백엔드 SQLite 자동 저장
  useEffect(() => {
    if (isBackendLoaded) {
      saveDatabase(db);
    }
  }, [db, isBackendLoaded]);

  // 특정 월의 자산 수기 데이터 조회 (없으면 독립 초기값 0 사용)
  const getAssetSnapshot = (yearMonth) => {
    if (db.monthlyAssetSnapshots && db.monthlyAssetSnapshots[yearMonth]) {
      return db.monthlyAssetSnapshots[yearMonth];
    }
    return getInitialAssetSnapshot(assetStructure);
  };

  // 특정 월의 스냅샷 항목 수기 업데이트
  const updateAssetSnapshot = (yearMonth, group, itemId, newAmount) => {
    setDb(prev => {
      const existingSnapshots = prev.monthlyAssetSnapshots || {};
      const currentMonthSnap = existingSnapshots[yearMonth] || getAssetSnapshot(yearMonth);

      const updatedGroup = {
        ...currentMonthSnap[group],
        [itemId]: Number(newAmount) || 0,
      };

      const updatedSnap = {
        ...currentMonthSnap,
        [group]: updatedGroup,
      };

      return {
        ...prev,
        monthlyAssetSnapshots: {
          ...existingSnapshots,
          [yearMonth]: updatedSnap,
        },
      };
    });
  };

  // 선택된 당월 자산 수기 데이터 전체 초기화
  const clearMonthlyAssetSnapshot = (yearMonth) => {
    setDb(prev => {
      const existingSnapshots = { ...(prev.monthlyAssetSnapshots || {}) };
      delete existingSnapshots[yearMonth];
      return {
        ...prev,
        monthlyAssetSnapshots: existingSnapshots,
      };
    });
  };

  // 자산 항목 신규 추가 (group: 'cashItems' | 'investItems' | 'debtItems')
  const addAssetItem = (group, itemForm) => {
    const name = String(itemForm.name || '').trim();
    if (!name) return { success: false, message: '항목 명칭을 입력해주세요.' };

    const prefixMap = { cashItems: 'acc', investItems: 'inv', debtItems: 'debt' };
    const prefix = prefixMap[group] || 'asset';
    const newId = `${prefix}_user_${Date.now()}`;

    const newItem = {
      id: newId,
      name,
      owner: itemForm.owner || '가족공동',
      defaultBalance: Number(itemForm.defaultBalance) || 0,
      isRealEstate: group === 'investItems' ? Boolean(itemForm.isRealEstate) : false,
    };

    setDb(prev => {
      const prevStruct = prev.assetStructure || DEFAULT_ASSET_STRUCTURE;
      const targetGroupList = prevStruct[group] || [];
      const updatedGroupList = [...targetGroupList, newItem];

      const updatedStruct = {
        ...prevStruct,
        [group]: updatedGroupList,
      };

      // 당월 스냅샷 초기 잔액 할당 (입력된 경우)
      const existingSnapshots = { ...(prev.monthlyAssetSnapshots || {}) };
      const currentSnap = existingSnapshots[selectedMonth] || getInitialAssetSnapshot(updatedStruct);
      const snapGroupKey = group === 'cashItems' ? 'cash' : group === 'investItems' ? 'invest' : 'debt';
      const updatedSnapGroup = {
        ...(currentSnap[snapGroupKey] || {}),
        [newId]: newItem.defaultBalance,
      };

      return {
        ...prev,
        assetStructure: updatedStruct,
        monthlyAssetSnapshots: {
          ...existingSnapshots,
          [selectedMonth]: {
            ...currentSnap,
            [snapGroupKey]: updatedSnapGroup,
          },
        },
      };
    });

    return { success: true };
  };

  // 자산 항목 정보 수정
  const updateAssetItem = (group, id, itemForm) => {
    const name = String(itemForm.name || '').trim();
    if (!name) return { success: false, message: '항목 명칭을 입력해주세요.' };

    setDb(prev => {
      const prevStruct = prev.assetStructure || DEFAULT_ASSET_STRUCTURE;
      const targetGroupList = prevStruct[group] || [];
      const updatedGroupList = targetGroupList.map(item =>
        item.id === id
          ? {
              ...item,
              name,
              owner: itemForm.owner || '가족공동',
              defaultBalance: Number(itemForm.defaultBalance) || 0,
              isRealEstate: group === 'investItems' ? Boolean(itemForm.isRealEstate) : item.isRealEstate,
            }
          : item
      );

      return {
        ...prev,
        assetStructure: {
          ...prevStruct,
          [group]: updatedGroupList,
        },
      };
    });

    return { success: true };
  };

  // 자산 항목 삭제 (전 월 스냅샷 고아 키 자동 청소)
  const deleteAssetItem = (group, id) => {
    setDb(prev => {
      const prevStruct = prev.assetStructure || DEFAULT_ASSET_STRUCTURE;
      const targetGroupList = prevStruct[group] || [];
      if (targetGroupList.length <= 1) {
        return prev;
      }
      const updatedGroupList = targetGroupList.filter(item => item.id !== id);

      const snapGroupKey = group === 'cashItems' ? 'cash' : group === 'investItems' ? 'invest' : 'debt';
      const updatedSnapshots = { ...(prev.monthlyAssetSnapshots || {}) };

      Object.keys(updatedSnapshots).forEach(mKey => {
        if (updatedSnapshots[mKey] && updatedSnapshots[mKey][snapGroupKey]) {
          const snapCopy = { ...updatedSnapshots[mKey][snapGroupKey] };
          delete snapCopy[id];
          updatedSnapshots[mKey] = {
            ...updatedSnapshots[mKey],
            [snapGroupKey]: snapCopy,
          };
        }
      });

      return {
        ...prev,
        assetStructure: {
          ...prevStruct,
          [group]: updatedGroupList,
        },
        monthlyAssetSnapshots: updatedSnapshots,
      };
    });

    return { success: true };
  };

  // 특정 월의 종합 자산 지표 (총자산, 투자자산, 부채, 순자산, 현금성자산) 계산
  const getAssetMetrics = (yearMonth) => {
    const snap = getAssetSnapshot(yearMonth);
    const cashTotal = cashList.reduce((acc, item) => acc + (Number(snap.cash?.[item.id]) || 0), 0);
    const investTotal = investList.reduce((acc, item) => acc + (Number(snap.invest?.[item.id]) || 0), 0);
    
    // 부동산 자산 금액 (isRealEstate === true 인 항목 합산)
    const realEstateAmount = investList
      .filter(item => item.isRealEstate)
      .reduce((acc, item) => acc + (Number(snap.invest?.[item.id]) || 0), 0);

    const assetTotal = cashTotal + investTotal;
    const investRatio = assetTotal > 0 ? ((investTotal - realEstateAmount) / assetTotal) * 100 : 0;

    const debtTotal = debtList.reduce((acc, item) => acc + (Number(snap.debt?.[item.id]) || 0), 0);
    const netAsset = assetTotal - debtTotal;

    return {
      cashTotal,
      investTotal,
      realEstateAmount,
      assetTotal,
      investRatio,
      debtTotal,
      netAsset,
      snap,
      totalCash: cashTotal,
      totalInvest: investTotal,
      totalDebt: debtTotal,
      totalAssets: assetTotal,
      netAssets: netAsset,
      snapshot: snap,
    };
  };

  // 1월~12월 연간 자산 추이 메트릭스
  const yearlyAssetMetrics = useMemo(() => {
    const year = selectedMonth.split('-')[0] || '2026';
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

    return months.map(mStr => {
      const metrics = getAssetMetrics(mStr);
      return {
        month: `${parseInt(mStr.split('-')[1])}월`,
        yearMonth: mStr,
        ...metrics,
      };
    });
  }, [db.monthlyAssetSnapshots, db.assetStructure, selectedMonth]);

  // 특정 월 기준 상속/이월 카테고리 예산 계산 함수 (Forward Propagation & Past Preservation)
  const getEffectiveCategoryBudgets = useCallback((targetMonth) => {
    const scenario = BUDGET_SCENARIOS[activeScenario] || BUDGET_SCENARIOS.basic;
    const result = {};

    // db.monthlyBudgets 중 targetMonth 이하(<= targetMonth)인 월들을 오름차순 정렬
    const recordedMonths = Object.keys(db.monthlyBudgets || {})
      .filter(m => m <= targetMonth)
      .sort();

    db.categories.forEach(cat => {
      // 가장 최근에 수정된 월의 예산 설정값 검색
      let customVal = undefined;
      for (let i = recordedMonths.length - 1; i >= 0; i--) {
        const mKey = recordedMonths[i];
        if (db.monthlyBudgets[mKey] && db.monthlyBudgets[mKey][cat.name] !== undefined) {
          customVal = db.monthlyBudgets[mKey][cat.name];
          break;
        }
      }

      const customPreset = db.customBudgetPresets?.[activeScenario];

      if (customVal !== undefined) {
        result[cat.name] = customVal;
      } else if (customPreset?.budgets?.[cat.name] !== undefined) {
        result[cat.name] = customPreset.budgets[cat.name];
      } else if (cat.name === '대출') {
        result[cat.name] = scenario.loanBudget;
      } else if (cat.name === '교육비') {
        result[cat.name] = scenario.eduBudget;
      } else {
        result[cat.name] = cat.defaultBudget;
      }
    });

    return result;
  }, [db.categories, db.monthlyBudgets, db.customBudgetPresets, activeScenario]);

  // 선택된 당월 적용 카테고리 예산
  const effectiveCategoryBudgets = useMemo(() => {
    return getEffectiveCategoryBudgets(selectedMonth);
  }, [getEffectiveCategoryBudgets, selectedMonth]);

  // 당월 종합 재무 지표 계산
  const currentMetrics = useMemo(() => {
    return calculateMonthlyMetrics(db.transactions, selectedMonth, effectiveCategoryBudgets, db.categories);
  }, [db.transactions, selectedMonth, effectiveCategoryBudgets, db.categories]);

  // 1월~12월 연간 집계 트렌드 계산
  const yearlyMetrics = useMemo(() => {
    const year = selectedMonth.split('-')[0] || '2026';
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
    
    return months.map(mStr => {
      const mBudgets = getEffectiveCategoryBudgets(mStr);
      const mMetrics = calculateMonthlyMetrics(db.transactions, mStr, mBudgets, db.categories);
      return {
        month: `${parseInt(mStr.split('-')[1])}월`,
        yearMonth: mStr,
        totalIncome: mMetrics.totalIncome,
        totalExpense: mMetrics.totalExpense,
        categoryTotalSpent: mMetrics.categoryTotalSpent,
        totalCashOutflow: mMetrics.totalCashOutflow,
        realConsumption: mMetrics.realConsumption,
        monthlySurplus: mMetrics.monthlySurplus,
        netMedicalExpense: mMetrics.netMedicalExpense,
        incomeMap: mMetrics.incomeMap,
        categoryDetails: mMetrics.categoryDetails,
        riskTop3: mMetrics.riskTop3,
      };
    });
  }, [selectedMonth, db.transactions, getEffectiveCategoryBudgets, db.categories]);

  // 1. 카테고리 동적 추가
  const addCategory = ({ name, defaultBudget, isFixed }) => {
    const trimmedName = String(name || '').trim();
    if (!trimmedName) return { success: false, message: '카테고리 이름을 입력해주세요.' };

    const exists = db.categories.some(c => c.name === trimmedName);
    if (exists) return { success: false, message: '이미 존재하는 카테고리 이름입니다.' };

    const isFixedBool = Boolean(isFixed === true || String(isFixed) === 'true' || isFixed === 1);
    const newId = `cat_user_${Date.now()}`;
    const newCategory = {
      id: newId,
      name: trimmedName,
      defaultBudget: Number(defaultBudget) || 0,
      isFixed: isFixedBool,
      type: '지출',
    };

    setDb(prev => {
      const updatedCategories = [...prev.categories, newCategory];
      const updatedMonthly = { ...(prev.monthlyBudgets || {}) };

      // 선택된 당월 및 미래 월 예산에 반영
      Object.keys(updatedMonthly).forEach(mKey => {
        if (mKey >= selectedMonth) {
          updatedMonthly[mKey] = {
            ...updatedMonthly[mKey],
            [trimmedName]: newCategory.defaultBudget,
          };
        }
      });

      // 예산 시나리오 프리셋 업데이트
      const updatedPresets = { ...(prev.customBudgetPresets || {}) };
      if (updatedPresets[activeScenario]) {
        updatedPresets[activeScenario] = {
          ...updatedPresets[activeScenario],
          budgets: {
            ...(updatedPresets[activeScenario].budgets || {}),
            [trimmedName]: newCategory.defaultBudget,
          },
        };
      }

      return {
        ...prev,
        categories: updatedCategories,
        monthlyBudgets: updatedMonthly,
        customBudgetPresets: updatedPresets,
      };
    });

    return { success: true };
  };

  // 2. 카테고리 정보 수정 (이름 변경 시 거래내역/예산 키 일괄 갱신)
  const updateCategory = (id, { name, defaultBudget, isFixed }) => {
    try {
      const trimmedName = String(name || '').trim();
      if (!trimmedName) return { success: false, message: '카테고리 이름을 입력해주세요.' };

      const isFixedBool = Boolean(isFixed === true || String(isFixed) === 'true' || isFixed === 1);

      const categoriesArr = db.categories || [];
      const targetIndex = categoriesArr.findIndex(c => (id && c.id === id) || c.name === trimmedName);
      if (targetIndex === -1) return { success: false, message: '대상 카테고리를 찾을 수 없습니다.' };

      const oldCategory = categoriesArr[targetIndex];
      const oldName = oldCategory.name;
      const targetId = oldCategory.id || id;

      // 이름 중복 검사 (본인 제외)
      const duplicate = categoriesArr.some(c => c.id !== targetId && c.name !== oldName && c.name === trimmedName);
      if (duplicate) return { success: false, message: '이미 동일한 이름의 다른 카테고리가 존재합니다.' };

      setDb(prev => {
        const prevCategories = prev.categories || [];
        const updatedCategories = prevCategories.map(c =>
          (c.id === targetId || c.name === oldName)
            ? { ...c, id: targetId, name: trimmedName, defaultBudget: Number(defaultBudget) || 0, isFixed: isFixedBool }
            : c
        );

        let updatedTransactions = prev.transactions || [];
        let updatedMonthly = { ...(prev.monthlyBudgets || {}) };
        let updatedPresets = { ...(prev.customBudgetPresets || {}) };

        // 이름이 변경된 경우 일괄 갱신
        if (oldName !== trimmedName) {
          // 1) 거래 내역 카테고리 필드 갱신
          updatedTransactions = (prev.transactions || []).map(t =>
            t.category === oldName ? { ...t, category: trimmedName } : t
          );

          // 2) 월별 예산 키 갱신
          Object.keys(updatedMonthly).forEach(mKey => {
            if (updatedMonthly[mKey] && updatedMonthly[mKey][oldName] !== undefined) {
              const val = updatedMonthly[mKey][oldName];
              const copy = { ...updatedMonthly[mKey] };
              delete copy[oldName];
              copy[trimmedName] = val;
              updatedMonthly[mKey] = copy;
            }
          });

          // 3) 커스텀 프리셋 키 갱신
          Object.keys(updatedPresets).forEach(pKey => {
            if (updatedPresets[pKey] && updatedPresets[pKey].budgets && updatedPresets[pKey].budgets[oldName] !== undefined) {
              const val = updatedPresets[pKey].budgets[oldName];
              const bCopy = { ...updatedPresets[pKey].budgets };
              delete bCopy[oldName];
              bCopy[trimmedName] = val;
              updatedPresets[pKey] = {
                ...updatedPresets[pKey],
                budgets: bCopy,
              };
            }
          });
        }

        return {
          ...prev,
          categories: updatedCategories,
          transactions: updatedTransactions,
          monthlyBudgets: updatedMonthly,
          customBudgetPresets: updatedPresets,
        };
      });

      return { success: true };
    } catch (err) {
      console.error('Error in updateCategory:', err);
      return { success: false, message: `카테고리 수정 중 오류 발생: ${err.message}` };
    }
  };

  // 3. 카테고리 삭제 (사용 중 거래 검사 방어)
  const deleteCategory = (id) => {
    if (db.categories.length <= 1) {
      return { success: false, message: '최소 1개 이상의 지출 카테고리가 유지되어야 합니다.' };
    }

    const targetCategory = db.categories.find(c => c.id === id);
    if (!targetCategory) return { success: false, message: '대상 카테고리를 찾을 수 없습니다.' };

    // 사용 중인 거래 내역 수 집계
    const usedCount = db.transactions.filter(t => t.category === targetCategory.name).length;
    if (usedCount > 0) {
      return {
        success: false,
        usedCount,
        message: `해당 카테고리('${targetCategory.name}')를 사용 중인 거래 내역이 ${usedCount}건 있습니다.\n거래 내역의 카테고리를 먼저 변경해 주세요.`,
      };
    }

    setDb(prev => {
      const updatedCategories = prev.categories.filter(c => c.id !== id);

      const updatedMonthly = { ...(prev.monthlyBudgets || {}) };
      Object.keys(updatedMonthly).forEach(mKey => {
        if (updatedMonthly[mKey]) {
          const copy = { ...updatedMonthly[mKey] };
          delete copy[targetCategory.name];
          updatedMonthly[mKey] = copy;
        }
      });

      return {
        ...prev,
        categories: updatedCategories,
        monthlyBudgets: updatedMonthly,
      };
    });

    return { success: true };
  };

  // 커스텀 예산 시나리오 저장 / 덮어쓰기
  const saveCustomBudgetPreset = (presetName, budgetsMap, targetPresetId) => {
    if (!presetName || !presetName.trim()) return;
    const cleanName = presetName.trim();
    const presetId = targetPresetId || `preset_${Date.now()}`;
    const targetBudgets = { ...(budgetsMap || effectiveCategoryBudgets) };

    const newPreset = {
      id: presetId,
      name: cleanName,
      createdAt: new Date().toISOString().split('T')[0],
      budgets: targetBudgets,
    };

    setDb(prev => {
      const updatedMonthly = { ...(prev.monthlyBudgets || {}) };
      updatedMonthly[selectedMonth] = {
        ...(updatedMonthly[selectedMonth] || {}),
        ...targetBudgets,
      };
      Object.keys(updatedMonthly).forEach(mKey => {
        if (mKey > selectedMonth) {
          updatedMonthly[mKey] = {
            ...(updatedMonthly[mKey] || {}),
            ...targetBudgets,
          };
        }
      });

      return {
        ...prev,
        customBudgetPresets: {
          ...(prev.customBudgetPresets || {}),
          [presetId]: newPreset,
        },
        monthlyBudgets: updatedMonthly,
      };
    });
    setActiveScenario(presetId);
  };

  // 커스텀 예산 시나리오 삭제 (기본안 포함)
  const deleteCustomBudgetPreset = (presetId) => {
    let nextKey = activeScenario;
    setDb(prev => {
      const updated = { ...(prev.customBudgetPresets || {}) };
      delete updated[presetId];

      const remainingKeys = Object.keys(updated);
      if (remainingKeys.length === 0) {
        updated.basic = DEFAULT_BASIC_PRESET;
        nextKey = 'basic';
      } else if (activeScenario === presetId) {
        nextKey = remainingKeys[0];
      }

      return {
        ...prev,
        customBudgetPresets: updated,
      };
    });
    setActiveScenario(nextKey);
  };

  // 시나리오 / 커스텀 프리셋 적용
  const applyBudgetPreset = (key) => {
    setActiveScenario(key);
    if (db.customBudgetPresets && db.customBudgetPresets[key]) {
      const presetBudgets = db.customBudgetPresets[key].budgets || {};
      setDb(prev => {
        const updatedMonthly = { ...(prev.monthlyBudgets || {}) };
        updatedMonthly[selectedMonth] = {
          ...(updatedMonthly[selectedMonth] || {}),
          ...presetBudgets,
        };
        Object.keys(updatedMonthly).forEach(mKey => {
          if (mKey > selectedMonth) {
            updatedMonthly[mKey] = {
              ...(updatedMonthly[mKey] || {}),
              ...presetBudgets,
            };
          }
        });

        return {
          ...prev,
          monthlyBudgets: updatedMonthly,
        };
      });
    }
  };

  // 거래 CRUD 작업
  const addTransaction = (newTx) => {
    setDb(prev => ({
      ...prev,
      transactions: [newTx, ...prev.transactions],
    }));
  };

  const updateTransaction = (id, updatedFields) => {
    setDb(prev => ({
      ...prev,
      transactions: prev.transactions.map(t => t.id === id ? { ...t, ...updatedFields } : t),
    }));
  };

  const deleteTransaction = (id) => {
    setDb(prev => ({
      ...prev,
      transactions: prev.transactions.filter(t => t.id !== id),
    }));
  };

  const deleteMonthTransactions = (yearMonth) => {
    setDb(prev => ({
      ...prev,
      transactions: prev.transactions.filter(t => !t.date.startsWith(yearMonth)),
    }));
  };

  const batchImportTransactions = (newTxs) => {
    setDb(prev => ({
      ...prev,
      transactions: [...newTxs, ...prev.transactions],
    }));
  };

  // 거래 분할
  const splitTransaction = (origTxId, splitItems) => {
    setDb(prev => {
      const origTx = prev.transactions.find(t => t.id === origTxId);
      if (!origTx) return prev;

      const remainingTxs = prev.transactions.filter(t => t.id !== origTxId);
      const newSplitTxs = splitItems.map((item, idx) => ({
        ...origTx,
        id: `${origTxId}_split_${idx}`,
        category: item.category,
        amount: item.amount,
        description: `${origTx.description} (${item.memo || item.category})`,
      }));

      return {
        ...prev,
        transactions: [...newSplitTxs, ...remainingTxs],
      };
    });
  };

  // 카테고리 예산 변경 (당월 및 미래 월 적용 - 방안 A)
  const setCategoryBudget = (categoryName, amount) => {
    const num = Number(amount) || 0;
    setDb(prev => {
      const updatedMonthly = { ...(prev.monthlyBudgets || {}) };
      updatedMonthly[selectedMonth] = {
        ...(updatedMonthly[selectedMonth] || {}),
        [categoryName]: num,
      };
      Object.keys(updatedMonthly).forEach(mKey => {
        if (mKey > selectedMonth) {
          updatedMonthly[mKey] = {
            ...(updatedMonthly[mKey] || {}),
            [categoryName]: num,
          };
        }
      });
      return {
        ...prev,
        monthlyBudgets: updatedMonthly,
      };
    });
  };

  // 전체 카테고리 예산 일괄 [적용] (선택월 및 모든 미래 월 동기화 반영, 과거 보존 - 방안 A)
  const setAllCategoryBudgets = (budgetsMap) => {
    setDb(prev => {
      const updatedMonthly = { ...(prev.monthlyBudgets || {}) };
      updatedMonthly[selectedMonth] = {
        ...(updatedMonthly[selectedMonth] || {}),
        ...budgetsMap,
      };
      Object.keys(updatedMonthly).forEach(mKey => {
        if (mKey > selectedMonth) {
          updatedMonthly[mKey] = {
            ...(updatedMonthly[mKey] || {}),
            ...budgetsMap,
          };
        }
      });
      return {
        ...prev,
        monthlyBudgets: updatedMonthly,
      };
    });
  };

  // 계좌 잔액 업데이트
  const updateAccountBalance = (accountId, newBalance) => {
    setDb(prev => ({
      ...prev,
      accounts: prev.accounts.map(a => a.id === accountId ? { ...a, balance: Number(newBalance) } : a),
    }));
  };

  // DB 초기화
  const handleReset = () => {
    const freshDb = resetDatabase();
    setDb(freshDb);
  };

  // 전체 백업 JSON 데이터베이스 복원 및 백엔드 DB 동기화
  const importFullDatabase = (importedDb) => {
    setDb(importedDb);
    saveDatabase(importedDb);
  };

  return (
    <AppContext.Provider
      value={{
        db,
        selectedMonth,
        setSelectedMonth,
        activeScenario,
        setActiveScenario,
        effectiveCategoryBudgets,
        currentMetrics,
        yearlyMetrics,
        getAssetSnapshot,
        updateAssetSnapshot,
        clearMonthlyAssetSnapshot,
        getAssetMetrics,
        yearlyAssetMetrics,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        deleteMonthTransactions,
        batchImportTransactions,
        splitTransaction,
        setCategoryBudget,
        setAllCategoryBudgets,
        saveCustomBudgetPreset,
        deleteCustomBudgetPreset,
        applyBudgetPreset,
        updateAccountBalance,
        handleReset,
        importFullDatabase,
        addCategory,
        updateCategory,
        deleteCategory,
        assetStructure,
        addAssetItem,
        updateAssetItem,
        deleteAssetItem,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
