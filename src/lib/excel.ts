import * as XLSX from 'xlsx';

import path from 'path';

// 型定義
interface ReportData {
  corporation: string;
  documentType: string;
  surveyDate: string;
  surveyor: string;
  // 他に必要なデータがあれば追加
}

/**
 * テンプレートファイルを読み込み、指定したセルにデータを書き込む
 * @param data - 書き込むデータ
 * @returns 生成されたExcelファイルのBuffer
 */
export const createReport = (data: ReportData): Buffer => {
  // 1. テンプレートファイルのパスを取得
  const templateFileName = data.documentType === 'survey_report'
    ? `FTTH調査報告資料（${data.corporation}）.xlsm`
    : `竣工図書（${data.corporation}）.xlsm`;
  const templatePath = path.join(process.cwd(), 'templates', data.corporation, templateFileName);

  // 2. テンプレートファイルを読み込む
  const workbook = XLSX.readFile(templatePath);

  // 3. 最初のシートを取得
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // 4. データをセルに書き込む (例)
  //    実際のセル位置は、テンプレートに合わせて調整してください
  XLSX.utils.sheet_add_aoa(worksheet, [[data.surveyDate]], { origin: 'C5' });
  XLSX.utils.sheet_add_aoa(worksheet, [[data.surveyor]], { origin: 'C6' });

  // 5. 変更を保存したExcelファイルをBufferとして出力
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsm' });

  return buffer;
};
