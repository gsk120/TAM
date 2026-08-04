import * as XLSX from 'xlsx';

/**
 * Excel / CSV 파일을 파싱하여 표준 거래 배열로 변환
 */
export async function parseExcelOrCsvFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });

        // 첫 번째 시트 또는 '내역' 시트 우선 탐색
        let sheetName = workbook.SheetNames.includes('내역') ? '내역' : workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // JSON 파싱 (헤더 자동 감지)
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });

        if (!jsonData || jsonData.length === 0) {
          return resolve([]);
        }

        // 헤더 행 찾기 (날짜, 대분류, 금액 등의 열이 포함된 행)
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(10, jsonData.length); i++) {
          const rowStr = jsonData[i].join(' ');
          if (rowStr.includes('날짜') || rowStr.includes('금액') || rowStr.includes('내용')) {
            headerRowIdx = i;
            break;
          }
        }

        if (headerRowIdx === -1) headerRowIdx = 0;

        const headers = jsonData[headerRowIdx].map(h => String(h || '').trim());
        const dataRows = jsonData.slice(headerRowIdx + 1);

        // 컬럼 인덱스 매핑 (A:날짜, B:타입, C:대분류, D:내용, E:금액, F:비고)
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
        if (colMap.memo === -1 && headers.length >= 6) {
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

          // 날짜 정규화 (YYYY-MM-DD)
          let formattedDate = String(dateRaw).trim().replace(/\//g, '-').slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(formattedDate)) {
            try {
              const d = new Date(dateRaw);
              if (!isNaN(d.getTime())) {
                formattedDate = d.toISOString().slice(0, 10);
              }
            } catch (_) {}
          }

          // 금액 및 취소 여부 정규화
          const rawNum = Number(String(amountRaw).replace(/,/g, '')) || 0;
          let numAmount = Math.abs(rawNum);
          let isCancel = false;

          // 거래유형 결정
          let type = typeRaw;
          if (typeRaw.includes('수입')) type = '수입';
          else if (typeRaw.includes('이체')) type = '계좌이체';
          else if (typeRaw.includes('지출')) type = '지출';

          // 지출 카테고리인 경우: 엑셀 원본 E열이 양수(+1000)이거나 내역에 '취소'/'환급' 키워드가 있으면 결제 취소건(-1000) 처리
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
            rawSource: file.name,
          });
        });

        resolve(parsedTransactions);
      } catch (err) {
        reject(err);
      }
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
