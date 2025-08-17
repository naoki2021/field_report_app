
import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<string[] | { error: string }>
) {
  try {
    const mappingPath = path.join(process.cwd(), 'mapping.json');
    console.log('Attempting to read file from:', mappingPath); // 追加
    const mappingData = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    console.log('File contents length (after readFileSync):', fs.readFileSync(mappingPath, 'utf-8').length); // 追加
    console.log('Parsed mappingData keys:', Object.keys(mappingData)); // 追加

    // Assuming 'survey_report' is the relevant document type for tags on the upload page
    // You might want to make this dynamic based on a query parameter if needed
    const tags = mappingData.survey_report_FTTH?.tags || [];
    res.status(200).json(tags);
  } catch (error: unknown) { 
    let message = 'Unknown Error';
    if (error instanceof Error) message = error.message;
    console.error('Error reading tags from mapping.json:', error);
    // エラーメッセージをフロントエンドに返す
    res.status(500).json({ error: `Failed to load tags: ${message}` });
  }
}
