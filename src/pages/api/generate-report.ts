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
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    console.log("\n--- [generate-report API v8] ---");
    console.log("Received request body:", JSON.stringify(req.body, null, 2));



    const { corporation, address, documentType, surveyDate, surveyor } = req.body;
    const diagramSymbols = req.body.diagramSymbols as string[] | undefined;
    let { surveySubType } = req.body;

    if (documentType === 'survey_report' && !surveySubType) {
      console.log("[DEBUG] surveySubType is missing for survey_report, defaulting to 'FTTH'");
      surveySubType = 'FTTH';
    }

    if (!corporation || !documentType || !surveyDate || !surveyor) {
      console.error("[ERROR] Missing required parameters.");
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
      if (!templateFileName) {
         console.error(`[ERROR] Invalid surveySubType '${surveySubType}' for documentType 'survey_report'.`);
         return res.status(400).json({ message: `Invalid surveySubType '${surveySubType}'` });
      }
      templateMappingKey = `survey_report_${surveySubType}`;
      displayDocumentType = '調査報告資料';
    }

    console.log(`[DEBUG] Determined template file: ${templateFileName}`);
    console.log(`[DEBUG] Determined mapping key: ${templateMappingKey}`);

    if (!templateFileName) {
      console.error("[ERROR] Could not determine template file.");
      return res.status(400).json({ message: 'Could not determine template file.' });
    }
    const templatePath = path.join(process.cwd(), 'templates', templateFileName);
    console.log(`[DEBUG] Template path: ${templatePath}`);

    if (!fs.existsSync(templatePath)) {
      console.error(`[ERROR] Template file not found at path: ${templatePath}`);
      return res.status(404).json({ message: `Template file not found: ${templateFileName}` });
    }

    // --- Workbook Creation and Data Population ---
    console.log("[DEBUG] Reading workbook...");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    console.log("[DEBUG] Workbook read successfully.");

    const writeToCells = (cellType: string, value: string | number | null | undefined) => {
      const cells = mappingData.report_data_cells[cellType];
      if (cells) {
        console.log(`[DEBUG] Writing '${value}' to cells for type '${cellType}'`);
        for (const cellInfo of cells) {
          const sheet = workbook.getWorksheet(cellInfo.sheet);
          if (sheet && value !== undefined && value !== null) {
            sheet.getCell(cellInfo.cell).value = value;
          } else if (!sheet) {
            console.warn(`[WARN] Worksheet '${cellInfo.sheet}' not found for cell type '${cellType}'.`);
          }
        }
      } else {
        console.warn(`[WARN] No cell mapping found for type '${cellType}'.`);
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

    // --- Write custom title to photo sheets ---
    const titleText = `${corporation}　光配線写真`;
    const sheetsToUpdateWithTitle = [
      '光配線写真①',
      '光配線写真②',
      '光配線写真③',
      '専有部調査写真'
    ];

    for (const sheetName of sheetsToUpdateWithTitle) {
      const worksheet = workbook.getWorksheet(sheetName);
      if (worksheet) {
        worksheet.getCell('B2').value = titleText;
        worksheet.getCell('G2').value = titleText;
        console.log(`[DEBUG] Wrote title '${titleText}' to ${sheetName}`);
      } else {
        console.warn(`[WARN] Worksheet '${sheetName}' not found for title writing.`);
      }
    }


    // --- Fetch Photos from Firestore ---
    console.log("[DEBUG] Fetching photos from Firestore...");
    const photosRef = db.collection('photos');
    const q = photosRef
      .where('corporation', '==', corporation)
      .where('documentType', '==', documentType)
      .where('surveySubType', '==', surveySubType)
      .where('surveyDate', '==', surveyDate)
      .where('surveyor', '==', surveyor);
    const querySnapshot = await q.get();
    const photosData = querySnapshot.docs.map(doc => doc.data());
    console.log(`[DEBUG] Fetched ${querySnapshot.docs.length} photos.`);

    // --- Image and Symbol Insertion Logic ---
    const templateMappings = mappingData[templateMappingKey]?.mappings;
    if (!templateMappings) {
        console.warn(`[WARN] No 'mappings' found in mapping.json for key '${templateMappingKey}'`);
    } else {
        console.log(`[DEBUG] Found mappings for key '${templateMappingKey}'. Processing ${photosData.length} photos...`);
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
                    console.log(`[DEBUG] Attempting to insert image for tag: ${tag} with original dimensions`);
                    try {
                      const response = await fetch(imageUrl);
                      if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
                      const imageArrayBuffer = await response.arrayBuffer();
                      const contentType = response.headers.get('content-type');
                      const extension = (contentType?.split('/')[1] || 'jpeg') as 'jpeg' | 'png' | 'gif';
                      const imageId = workbook.addImage({ buffer: imageArrayBuffer, extension });
                      const startCell = worksheet.getCell(image.cell);

                      worksheet.addImage(imageId, {
                        tl: { col: Number(startCell.col!) - 1, row: Number(startCell.row!) - 1 },
                        ext: { width: image.width, height: image.height },
                      });
                      
                      console.log(`[DEBUG] Successfully inserted image for tag: ${tag}`);
                    } catch (e) { console.error(`[ERROR] Failed to insert image for ${tag}:`, e); }
                  }
                  if (transcription && memo?.cell) {
                    worksheet.getCell(memo.cell).value = transcription;
                  }
                }
              }
            }
        }
    }

    const tagsToInsert = [...new Set(diagramSymbols || [])];
    const systemDiagramMappings = mappingData.system_diagram_symbols;
    if (!systemDiagramMappings) {
        console.warn(`[WARN] No 'system_diagram_symbols' found in mapping.json.`);
    } else if (tagsToInsert.length > 0) {
        console.log(`[DEBUG] Found system_diagram_symbols. Processing ${tagsToInsert.length} unique symbols...`);
        for (const tag of tagsToInsert) {
            const normalizedTag = tag.normalize('NFC').trim();
            const symbolMappings = systemDiagramMappings[normalizedTag as string];
            if (symbolMappings) {
                const mappingArray = Array.isArray(symbolMappings) ? symbolMappings : [symbolMappings];
                for (const symbolMapping of mappingArray) {
                    const { sheet: sheetName, image_path, cell, width, height } = symbolMapping;
                    const worksheet = workbook.getWorksheet(sheetName);
                    const fullImagePath = path.join(process.cwd(), image_path);
                    if (worksheet && fs.existsSync(fullImagePath)) {
                        console.log(`[DEBUG] Attempting to insert symbol: ${tag} into ${sheetName}!${cell}`);
                        try {
                            const imageBuffer = fs.readFileSync(fullImagePath);
                            const arrayBuffer = imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength);
                            const extension = path.extname(image_path).substring(1) as 'jpeg' | 'png' | 'gif';
                            const imageId = workbook.addImage({ buffer: arrayBuffer, extension });
                            worksheet.addImage(imageId, {
                                tl: { col: Number(worksheet.getCell(cell).col) - 1, row: Number(worksheet.getCell(cell).row) - 1 },
                                ext: { width, height },
                            });
                            console.log(`[DEBUG] Successfully inserted symbol: ${tag}`);
                        } catch (e) { console.error(`[ERROR] Failed to insert symbol ${tag}:`, e); }
                    }
                }
            }
        }
    }

    // --- Upload to Firebase Storage ---
    console.log("[DEBUG] Writing final workbook to buffer...");
    const buffer = await workbook.xlsx.writeBuffer();
    console.log("[DEBUG] Workbook buffer created. Uploading to Firebase Storage...");
    const outputFileName = `${corporation}_${displayDocumentType}_${new Date().toISOString()}.xlsx`;
    const filePath = `reports/${outputFileName}`;
    const file = bucket.file(filePath);
    await file.save(Buffer.from(buffer), {
      metadata: {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        metadata: { firebaseStorageDownloadTokens: uuidv4() },
      },
    });
    console.log(`[DEBUG] Upload to Firebase Storage successful: ${filePath}`);

    const [url] = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' });
    console.log(`[DEBUG] Generated signed URL.`);

    res.status(200).json({
      message: 'Report generated successfully!',
      downloadUrl: url,
      fileName: outputFileName
    });

  } catch (error) {
    console.error('[FATAL ERROR] An unexpected error occurred in generate-report API:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    const errorStack = error instanceof Error ? error.stack : undefined;
    res.status(500).json({ message: 'Internal Server Error', error: errorMessage, stack: errorStack });
  }
}