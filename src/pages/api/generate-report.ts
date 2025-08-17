import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import fetch from 'node-fetch';
import admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';

// --- Firebase Admin SDK Initialization ---
const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountKey) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set.');
}
const serviceAccount = JSON.parse(serviceAccountKey);
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}
const db = admin.firestore();
const bucket = admin.storage().bucket();

// --- Load mapping.json ---
const mappingPath = path.join(process.cwd(), 'mapping.json');
const mappingData = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log("\n--- RUNNING LATEST VERSION OF GENERATE-REPORT (v3) ---"); // Diagnostic Log

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    console.log("Request body:", req.body);
    const { corporation, address, documentType, surveySubType, surveyDate, surveyor } = req.body;

    if (!corporation || !documentType || !surveyDate || !surveyor) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }

    // --- Template Selection Logic ---
    let templateFileName = '';
    let templateMappingKey = '';
    let displayDocumentType = '';

    if (documentType === 'completion_drawings') {
      templateFileName = `竣工図書.xlsm`;
      templateMappingKey = 'completion_drawings';
      displayDocumentType = '竣工図書';
    } else if (documentType === 'survey_report') {
      const subTypeToTemplate: { [key: string]: string } = {
        'FTTH': `template_sanitized.xlsx`,
        'introduction': `導入調査報告資料.xlsx`,
        'migration': `マイグレーション調査報告資料.xlsx`,
      };
      templateFileName = subTypeToTemplate[surveySubType as string];
      templateMappingKey = `survey_report_${surveySubType}`;
      displayDocumentType = '調査報告資料';
    }

    if (!templateFileName) {
      return res.status(400).json({ message: 'Could not determine template file.' });
    }
    const templatePath = path.join(process.cwd(), 'templates', templateFileName);
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ message: `Template file not found: ${templateFileName}` });
    }

    // --- Workbook Creation and Data Population ---
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    const writeToCells = (cellType: string, value: any) => {
      const cells = mappingData.report_data_cells[cellType];
      if (cells) {
        for (const cellInfo of cells) {
          const sheet = workbook.getWorksheet(cellInfo.sheet);
          if (sheet && value) sheet.getCell(cellInfo.cell).value = value;
        }
      }
    };

    writeToCells('corporation', corporation);
    writeToCells('surveyDate', surveyDate);
    writeToCells('address', address);
    writeToCells('surveyor', surveyor);
    writeToCells('documentType', displayDocumentType);
    if (documentType === 'survey_report' && surveySubType) {
      writeToCells('surveySubType', surveySubType);
    }

    // --- Fetch Photos from Firestore ---
    const photosRef = db.collection('photos');
    const q = photosRef
      .where('corporation', '==', corporation)
      .where('documentType', '==', documentType)
      .where('surveySubType', '==', surveySubType)
      .where('surveyDate', '==', surveyDate)
      .where('surveyor', '==', surveyor);
    const querySnapshot = await q.get();
    const photosData = querySnapshot.docs.map(doc => doc.data());
    console.log("Photos fetched. Number of docs:", querySnapshot.docs.length);

    // --- Image and Symbol Insertion Logic ---
    const templateMappings = mappingData[templateMappingKey]?.mappings;
    if (templateMappings) {
      for (const photo of photosData) {
        const { tag, imageUrl, transcription } = photo;
        const mappingsForTag = templateMappings[tag];
        if (mappingsForTag) {
          const mappingArray = Array.isArray(mappingsForTag) ? mappingsForTag : [mappingsForTag];
          for (const mapping of mappingArray) {
            const { sheet: sheetName, image, memo } = mapping;
            const worksheet = workbook.getWorksheet(sheetName);
            if (worksheet) {
              if (imageUrl && image?.cell && image?.width && image?.height) {
                console.log(`Attempting to insert image for tag: ${tag}`);
                try {
                  const response = await fetch(imageUrl);
                  if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
                  const imageArrayBuffer = await response.arrayBuffer();
                  const contentType = response.headers.get('content-type');
                  const extension = (contentType?.split('/')[1] || 'jpeg') as 'jpeg' | 'png' | 'gif';
                  const imageId = workbook.addImage({ buffer: imageArrayBuffer, extension });
                  worksheet.addImage(imageId, {
                    tl: { col: worksheet.getCell(image.cell).col - 1, row: worksheet.getCell(image.cell).row - 1 },
                    ext: { width: image.width, height: image.height },
                  });
                   console.log(`Successfully inserted image for tag: ${tag}`);
                } catch (e) { console.error(`Failed to insert image for ${tag}:`, e); }
              }
              if (transcription && memo?.cell) {
                worksheet.getCell(memo.cell).value = transcription;
              }
            }
          }
        }
      }
    }

    const allSymbols = photosData.flatMap(photo => photo.diagramSymbols || []);
    const tagsToInsert = [...new Set(allSymbols)];
    const systemDiagramMappings = mappingData.system_diagram_symbols;
    if (systemDiagramMappings && tagsToInsert.length > 0) {
        console.log('Attempting to insert system diagram symbols:', tagsToInsert);
        for (const tag of tagsToInsert) {
            const symbolMappings = systemDiagramMappings[tag];
            if (symbolMappings) {
                const mappingArray = Array.isArray(symbolMappings) ? symbolMappings : [symbolMappings];
                for (const symbolMapping of mappingArray) {
                    const { sheet: sheetName, image_path, cell, width, height } = symbolMapping;
                    const worksheet = workbook.getWorksheet(sheetName);
                    const fullImagePath = path.join(process.cwd(), image_path);
                    if (worksheet && fs.existsSync(fullImagePath)) {
                        console.log(`Attempting to insert symbol: ${tag} into ${sheetName}!${cell}`);
                        try {
                            const imageBuffer = fs.readFileSync(fullImagePath);
                            const extension = path.extname(image_path).substring(1) as 'jpeg' | 'png' | 'gif';
                            const imageId = workbook.addImage({ buffer: imageBuffer, extension });
                            worksheet.addImage(imageId, {
                                tl: { col: worksheet.getCell(cell).col - 1, row: worksheet.getCell(cell).row - 1 },
                                ext: { width, height },
                            });
                            console.log(`Successfully inserted symbol: ${tag}`);
                        } catch (e) { console.error(`Failed to insert symbol ${tag}:`, e); }
                    }
                }
            }
        }
    }

    // --- Upload to Firebase Storage ---
    const buffer = await workbook.xlsx.writeBuffer();
    const outputFileName = `${corporation}_${displayDocumentType}_${new Date().toISOString()}.xlsx`;
    const filePath = `reports/${outputFileName}`;
    const file = bucket.file(filePath);
    await file.save(Buffer.from(buffer), {
      metadata: {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        metadata: { firebaseStorageDownloadTokens: uuidv4() },
      },
    });
    console.log(`File uploaded to ${filePath}`);

    const [url] = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' });
    console.log(`Generated download URL: ${url}`);

    res.status(200).json({
      message: 'Report generated successfully!',
      downloadUrl: url,
      fileName: outputFileName
    });

  } catch (error: any) {
    console.error('Error generating report:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
}