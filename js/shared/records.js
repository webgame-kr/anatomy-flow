// 학습 기록 저장 (LocalStorage) 과 CSV 다운로드
// 기록 계산과 CSV 문자열 만들기는 Python(record_engine.py)이 한다.

const KEY = 'flowengine.records.v1';
const MAX_RECORDS = 500;

export function loadRecords() {
  try {
    const text = localStorage.getItem(KEY);
    const list = text ? JSON.parse(text) : [];
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
}

export function saveRecord(record) {
  const list = loadRecords();
  list.push(record);
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_RECORDS)));
    return true;
  } catch (err) {
    return false;
  }
}

export function clearRecords() {
  try {
    localStorage.removeItem(KEY);
  } catch (err) {
    /* 저장소를 쓸 수 없는 환경 */
  }
}

export function downloadCsv(fileName, csvText) {
  // 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다
  const blob = new Blob(['﻿' + csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
