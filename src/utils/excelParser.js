import * as XLSX from 'xlsx/xlsx.mjs';

/** 조회월에 속한 거래만 추출한다. */
export function parseTransactionWorkbook(workbook, sourceName, targetMonth) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth || '')) {
    throw new Error('가져올 연·월을 선택하세요.');
  }
  // 뱅샐 거래 시트를 우선하고 거래 헤더가 있는 시트를 탐색
  const sheetNames = [...new Set(['가계부 내역', '내역', ...workbook.SheetNames])];
  let jsonData;
  let headerRowIdx = -1;
  for (const name of sheetNames) {
    if (!workbook.Sheets[name]) continue;
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true });
    const index = rows.slice(0, 10).findIndex(row => {
      const titles = row.map(value => String(value || '').trim());
      return titles.some(h => /날짜|일자/.test(h)) && titles.some(h => /금액/.test(h)) && titles.some(h => /내용|가맹점|사용처/.test(h));
    });
    if (index !== -1) { jsonData = rows; headerRowIdx = index; break; }
  }
  if (!jsonData) throw new Error('날짜, 내용, 금액 열이 있는 거래 시트를 찾을 수 없습니다.');
  const headers = jsonData[headerRowIdx].map(h => String(h || '').trim());
  const dataRows = jsonData.slice(headerRowIdx + 1);

  // 열 제목으로 거래 필드를 매핑
  const colMap = {
    date: headers.findIndex(h => h.includes('날짜') || h.includes('일자')),
    type: headers.findIndex(h => h.includes('타입') || h.includes('유형')),
    category: headers.findIndex(h => h.includes('대분류') || h.includes('카테고리')),
    description: headers.findIndex(h => h.includes('내용') || h.includes('가맹점') || h.includes('사용처')),
    amount: headers.findIndex(h => h.includes('금액')),
    memo: headers.findIndex(h => h.includes('비고') || h.includes('메모') || h.includes('보험')),
    owner: headers.findIndex(h => h.includes('소유자') || h.includes('귀속')),
  };

  // F열(인덱스 5)이 기본 비고열인 경우 처리
  if (colMap.memo === -1 && headers.length === 6) {
    colMap.memo = 5;
  }

  const parsedTransactions = [];

  dataRows.forEach((row, idx) => {
    if (!row || row.length === 0) return;

    const dateRaw = colMap.date !== -1 ? row[colMap.date] : null;
    const typeRaw = colMap.type !== -1 ? String(row[colMap.type] || '지출').trim() : '지출';
    let categoryRaw = colMap.category !== -1 ? String(row[colMap.category] || '미분류').trim() : '미분류';
    if (categoryRaw === '통신') categoryRaw = '통신비';
    const descRaw = colMap.description !== -1 ? String(row[colMap.description] || '').trim() : '';
    const amountRaw = colMap.amount !== -1 ? row[colMap.amount] : 0;
    const memoRaw = colMap.memo !== -1 && row[colMap.memo] !== undefined ? String(row[colMap.memo] || '').trim() : '';
    const ownerRaw = colMap.owner !== -1 ? String(row[colMap.owner] || '가족공동').trim() : '가족공동';

    if (!dateRaw || !descRaw) return; // 필수 열 부재 시 생략

    // Excel 날짜값과 CSV 날짜 문자열을 표시 형식에 의존하지 않고 정규화
    let formattedDate;
    if (dateRaw instanceof Date) {
      formattedDate = `${dateRaw.getFullYear()}-${String(dateRaw.getMonth() + 1).padStart(2, '0')}-${String(dateRaw.getDate()).padStart(2, '0')}`;
    } else if (typeof dateRaw === 'number') {
      const parts = XLSX.SSF.parse_date_code(dateRaw, { date1904: Boolean(workbook.Workbook?.WBProps?.date1904) });
      if (!parts) return;
      formattedDate = `${parts.y}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
    } else {
      const match = String(dateRaw).trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[ T])/);
      if (!match) return;
      formattedDate = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    }
    const [year, month, day] = formattedDate.split('-').map(Number);
    const dateCheck = new Date(Date.UTC(year, month - 1, day));
    if (dateCheck.getUTCFullYear() !== year || dateCheck.getUTCMonth() !== month - 1 || dateCheck.getUTCDate() !== day) return;
    if (formattedDate.slice(0, 7) !== targetMonth) return;

    // 금액 및 취소 여부 정규화
    const rawNum = Number(String(amountRaw).replace(/,/g, '')) || 0;
    let numAmount = Math.abs(rawNum);
    let isCancel = false;

    // 거래유형 결정
    let type = typeRaw;
    if (typeRaw.includes('수입')) type = '수입';
    else if (typeRaw.includes('이체')) type = '계좌이체';
    else if (typeRaw.includes('지출')) type = '지출';

    // 지출 카테고리인 경우: 엑셀 금액 열이 양수(+1000)이거나 내역에 '취소'/'환급' 키워드가 있으면 결제 취소건(-1000) 처리
    if (type === '지출') {
      const isPositiveInExcel = rawNum > 0;
      const hasCancelKeyword = descRaw.includes('취소') || descRaw.includes('환급') || memoRaw.includes('취소') || memoRaw.includes('환급');

      if (isPositiveInExcel || hasCancelKeyword) {
        isCancel = true;
        numAmount = -Math.abs(rawNum); // 지출 차감/상쇄 (-1000)
      } else {
        numAmount = Math.abs(rawNum); // 일반 지출 (+1000)
      }
    }

    parsedTransactions.push({
      id: `import_${Date.now()}__${idx}`,
      date: formattedDate,
      type,
      category: categoryRaw,
      description: descRaw,
      amount: numAmount,
      isCancel,
      memo: isCancel && !memoRaw.includes('결제취소') ? (memoRaw ? `${memoRaw} (결제취소)` : '결제취소') : memoRaw,
      owner: ownerRaw,
      isManual: false,
      rawSource: sourceName,
    });
  });


  return parsedTransactions;
}

export async function parseExcelOrCsvFile(file, targetMonth) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: false });
        resolve(parseTransactionWorkbook(workbook, file.name, targetMonth));
      } catch (err) { reject(err); }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 가져온 거래 목록 중 기존 DB 거래와의 중복 탐지 알고리즘 (PRD 12.3)
 */
export function detectDuplicates(importedTxs, existingTxs) {
  const existingHashSet = new Set();

  existingTxs.forEach(t => {
    const key = `${t.date}_${Math.abs(t.amount)}_${t.category}_${t.description.trim()}`;
    existingHashSet.add(key);
  });

  return importedTxs.map(imp => {
    const exactKey = `${imp.date}_${Math.abs(imp.amount)}_${imp.category}_${imp.description.trim()}`;

    if (existingHashSet.has(exactKey)) {
      return {
        ...imp,
        duplicateStatus: 'EXACT',
        duplicateReason: '날짜, 금액, 카테고리, 내용 완전 일치',
        selected: false,
      };
    }

    const fuzzyMatch = existingTxs.find(ext => {
      const dayDiff = Math.abs(new Date(ext.date) - new Date(imp.date)) / (1000 * 60 * 60 * 24);
      const isAmountMatch = Math.abs(ext.amount) === Math.abs(imp.amount);
      const isDescMatch = ext.description.includes(imp.description) || imp.description.includes(ext.description);
      return dayDiff <= 1 && isAmountMatch && isDescMatch;
    });

    if (fuzzyMatch) {
      return {
        ...imp,
        duplicateStatus: 'FUZZY',
        duplicateReason: `기존 거래(${fuzzyMatch.date} ${fuzzyMatch.description})와 유사`,
        selected: false,
      };
    }

    return {
      ...imp,
      duplicateStatus: 'NONE',
      duplicateReason: '',
      selected: true,
    };
  });
}
