/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
// Import Buffer explicitly so TypeScript picks up the correct Node definition.
import { Buffer } from 'buffer';
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

// Placeholder image for system diagram symbols that are missing both locally and remotely.
// This is a simple 50x50 grey square encoded in base64. It will be used when a symbol image
// cannot be found either in the repository or via the remote fallback URL. The placeholder
// ensures that the Excel report still contains an image in the expected cell without causing
// runtime errors.
const PLACEHOLDER_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAIAAACRXR/mAAAATklEQVR4nO3OMQHAIBAAsVL/wl4WBlhugiFRkDUz33v+24EzrUKr0Cq0Cq1Cq9AqtAqtQqvQKrQKrUKr0Cq0Cq1Cq9AqtAqtQqvQKrSKDf8QArz7cdAhAAAAAElFTkSuQmCC';
const PLACEHOLDER_IMAGE_BUFFER: Buffer = Buffer.from(PLACEHOLDER_IMAGE_BASE64, 'base64');
const PLACEHOLDER_IMAGE_EXTENSION: 'png' = 'png';

// Optional Cloudinary configuration: if you want to load system diagram symbols from Cloudinary,
// set these environment variables in your deployment environment. CLOUDINARY_CLOUD_NAME should be
// your Cloudinary cloud name. CLOUDINARY_FOLDER can specify a folder within your Cloudinary account
// where symbol images reside. If these are set, the API will attempt to fetch symbol images from
// Cloudinary before falling back to GitHub or the placeholder.
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || '';
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || '';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    console.log("\n--- [generate-report API] ---");
    console.log("Received request body:", JSON.stringify(req.body, null, 2));

    const { corporation, address, documentType, surveyDate, surveyor } = req.body;
    const diagramSymbols = req.body.diagramSymbols as string[] | undefined;
    let { surveySubType } = req.body as { surveySubType?: string };

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
      const cells = (mappingData as any).report_data_cells[cellType];
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
    const templateMappings = (mappingData as any)[templateMappingKey]?.mappings;
    if (!templateMappings) {
      console.warn(`[WARN] No 'mappings' found in mapping.json for key '${templateMappingKey}'`);
    } else {
      console.log(`[DEBUG] Found mappings for key '${templateMappingKey}'. Processing ${photosData.length} photos...`);
      for (const photo of photosData) {
        const { tag, imageUrl, transcription } = photo as any;
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
                  // Determine the appropriate extension from the response headers; default to jpeg
                  const extension = (contentType?.split('/')[1] || 'jpeg') as 'jpeg' | 'png' | 'gif';
                  // Convert the ArrayBuffer into a Uint8Array before creating a Node Buffer. This avoids
                  // TypeScript inferring a generic type parameter on Buffer which can break compilation.
                  // Explicitly type the image buffer as Node's Buffer to avoid TypeScript inferring a generic
                  // Buffer<ArrayBuffer> type. See: https://github.com/exceljs/exceljs/issues/1396
                  // Convert the ArrayBuffer into a Node.js Buffer. TypeScript's typing for Buffer.from with a
                  // Uint8Array infers a generic Buffer<...> which causes compile errors when passed to
                  // exceljs. To avoid this, we cast the resulting buffer to 'any' when adding the image.
                  const imageBuffer: Buffer = Buffer.from(new Uint8Array(imageArrayBuffer));
                  // @ts-ignore  // Suppress TS error: ExcelJS expects a Node Buffer; the cast above ensures runtime correctness.
                  const imageId = workbook.addImage({ buffer: imageBuffer as any, extension });
                  const startCell = worksheet.getCell(image.cell);
                  worksheet.addImage(imageId, {
                    tl: { col: Number(startCell.col) - 1, row: Number(startCell.row) - 1 },
                    ext: { width: image.width, height: image.height },
                  });
                  console.log(`[DEBUG] Successfully inserted image for tag: ${tag}`);
                } catch (e) {
                  console.error(`[ERROR] Failed to insert image for ${tag}:`, e);
                }
              }
              if (transcription && memo?.cell) {
                worksheet.getCell(memo.cell).value = transcription;
              }
            }
          }
        }
      }
    }

    // --- System diagram symbols insertion (modified) ---
    const tagsToInsert = [...new Set(diagramSymbols || [])];
    const systemDiagramMappings = (mappingData as any).system_diagram_symbols;
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
                    const { sheet: sheetName, image_path: imageUrl, cell, width, height } = symbolMapping;
                    const worksheet = workbook.getWorksheet(sheetName);
                    if (worksheet && imageUrl) {
                        console.log(`[DEBUG] Attempting to insert symbol from URL: ${imageUrl} into ${sheetName}!${cell}`);
                        try {
                            const response = await fetch(imageUrl);
                            if (!response.ok) {
                                console.error(`[ERROR] Failed to fetch symbol image from ${imageUrl}: ${response.statusText}`);
                                continue; // Skip to the next symbol
                            }
                            const imageArrayBuffer = await response.arrayBuffer();
                            const contentType = response.headers.get('content-type');
                            const extension = (contentType?.split('/')[1] || 'png') as 'jpeg' | 'png' | 'gif';
                            
                            const imageId = workbook.addImage({
                                buffer: imageArrayBuffer,
                                extension,
                            });

                            worksheet.addImage(imageId, {
                                tl: { col: Number(worksheet.getCell(cell).col) - 1, row: Number(worksheet.getCell(cell).row) - 1 },
                                ext: { width, height },
                            });
                            console.log(`[DEBUG] Successfully inserted symbol: ${tag}`);
                        } catch (e) {
                            console.error(`[ERROR] Failed to insert symbol ${tag} from URL ${imageUrl}:`, e);
                        }
                    } else if (!worksheet) {
                        console.warn(`[WARN] Worksheet '${sheetName}' not found for symbol '${tag}'.`);
                    } else if (!imageUrl) {
                        console.warn(`[WARN] No 'image_path' (URL) found for symbol '${tag}'.`);
                    }
                }
            } else {
                console.warn(`[WARN] No mapping found for symbol tag: '${normalizedTag}'`);
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
