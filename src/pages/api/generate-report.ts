import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import fetch from 'node-fetch'; // For downloading images

// Firebase imports for client-side (will use for now, but Admin SDK is better for server)
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, DocumentData } from 'firebase/firestore';

// Load mapping.json
const mappingPath = path.join(process.cwd(), 'mapping.json');
const mappingData = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

// Initialize Firebase (client-side config for now)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    console.log("Request body:", req.body);
    const { corporation, address, documentType, surveySubType, surveyDate, surveyor } = req.body;

    if (!corporation || !documentType || !surveyDate || !surveyor) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }

    // Determine template file name based on new logic
    let templateFileName = '';
    let templateMappingKey = ''; 

    if (documentType === 'completion_drawings') {
      templateFileName = `竣工図書.xlsm`;
      templateMappingKey = 'completion_drawings';
    } else if (documentType === 'survey_report') {
      if (!surveySubType) {
        return res.status(400).json({ message: 'Survey sub type is required for survey reports' });
      }
      const subTypeToTemplate: { [key: string]: string } = {
        'FTTH': `template_sanitized.xlsx`,
        'introduction': `導入調査報告資料.xlsx`,
        'migration': `マイグレーション調査報告資料.xlsx`,
      };
      templateFileName = subTypeToTemplate[surveySubType];
      templateMappingKey = `survey_report_${surveySubType}`; // e.g., survey_report_FTTH
    } else {
      return res.status(400).json({ message: 'Invalid documentType' });
    }

    if (!templateFileName) {
        return res.status(400).json({ message: 'Could not determine template file for the given selection.' });
    }

    const templatePath = path.join(process.cwd(), 'templates', templateFileName);
    console.log('Attempting to load template from:', templatePath); // 追加

    if (!fs.existsSync(templatePath)) {
      console.error(`Template file not found at: ${templatePath}`);
      return res.status(404).json({ message: `Template file not found. Expected: ${templateFileName}` });
    }

    // Load the workbook
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.readFile(templatePath);
      console.log('Successfully loaded workbook from:', templatePath); // 追加
    } catch (readError) {
      console.error('Error reading Excel template file:', readError); // 追加
      return res.status(500).json({ message: 'Failed to read Excel template file.', error: (readError as Error).message });
    }

    // Write corporation to specific cells
    const corporationCells = [
        { sheet: '調査報告表紙', cell: 'A5' },
        { sheet: '調査報告', cell: 'D6' },
        { sheet: '系統図（現状）', cell: 'R114' }, // 修正
        { sheet: '系統図（改修案）', cell: 'R114' }, // 修正
        { sheet: '配管ルート', cell: 'R114' },
        { sheet: '部屋割', cell: 'R114' },
        { sheet: '棟内設備調査シートひかり用', cell: 'C3' },
    ];

    for (const cellInfo of corporationCells) {
        const sheet = workbook.getWorksheet(cellInfo.sheet);
        if (sheet) {
            sheet.getCell(cellInfo.cell).value = corporation;
        } else {
            console.warn(`Sheet "${cellInfo.sheet}" not found for writing corporation name.`);
        }
    }

    // Write survey date to specific cells
    const surveyDateCells = [
        { sheet: '調査報告', cell: 'D21' },
        { sheet: '系統図（現状）', cell: 'H116' }, // 修正
        { sheet: '系統図（改修案）', cell: 'H116' }, // 修正
        { sheet: '配管ルート', cell: 'H116' },
        { sheet: '部屋割', cell: 'H116' },
        { sheet: '棟内設備調査シートひかり用', cell: 'C2' },
    ];

    for (const cellInfo of surveyDateCells) {
        const sheet = workbook.getWorksheet(cellInfo.sheet);
        if (sheet) {
            sheet.getCell(cellInfo.cell).value = surveyDate;
        } else {
            console.warn(`Sheet "${cellInfo.sheet}" not found for writing survey date.`);
        }
    }

    // Write address to specific cells
    const addressCells = [
        { sheet: '調査報告', cell: 'D7' },
        { sheet: '棟内設備調査シートひかり用', cell: 'C4' },
    ];

    for (const cellInfo of addressCells) {
        const sheet = workbook.getWorksheet(cellInfo.sheet);
        if (sheet && address) {
            sheet.getCell(cellInfo.cell).value = address;
        } else if (!address) {
            // Do nothing if address is not provided
        } else {
            console.warn(`Sheet "${cellInfo.sheet}" not found for writing address.`);
        }
    }

    // Fetch photos from Firestore
    const photosRef = collection(db, 'photos');
    const q = query(
      photosRef,
      where('corporation', '==', corporation),
      where('documentType', '==', documentType),
      where('surveySubType', '==', surveySubType),
      where('surveyDate', '==', surveyDate),
      where('surveyor', '==', surveyor)
    );
    console.log("Fetching photos with query:", { corporation, documentType, surveySubType, surveyDate, surveyor });
    const querySnapshot = await getDocs(q);
    console.log("Photos fetched. Number of docs:", querySnapshot.docs.length);
    const photosData = querySnapshot.docs.map(doc => doc.data());
    console.log("Photos data from Firestore:", photosData);

    const templateMappings = mappingData[templateMappingKey]?.mappings;

    if (!templateMappings) {
      console.warn(`No mappings found for documentType: ${documentType}`);
    }

    for (const photo of photosData) {
      const tag = photo.tag;
      const imageUrl = photo.imageUrl;
      const transcription = photo.transcription; // 文字起こし結果を取得

      const mappingsForTag = templateMappings?.[tag];

      if (mappingsForTag) {
        // Handle multiple mappings for a single tag (e.g., "エンブレム" on multiple sheets)
        const mappingArray = Array.isArray(mappingsForTag) ? mappingsForTag : [mappingsForTag];

        for (const mapping of mappingArray) {
          const sheetName = mapping.sheet;
          const imageCell = mapping.image?.cell;
          const memoCell = mapping.memo?.cell;
          const imageWidth = mapping.image?.width; // Max width from mapping.json
          const imageHeight = mapping.image?.height; // Max height from mapping.json

          const worksheet = workbook.getWorksheet(sheetName);

          if (worksheet) {
            // Insert image
            if (imageUrl && imageCell && imageWidth && imageHeight) {
              console.log(`Attempting to insert image for tag: ${tag}, URL: ${imageUrl}, Cell: ${imageCell}`); // 追加
              try {
                const response = await fetch(imageUrl);
                if (!response.ok) { // レスポンスがOKでない場合のエラーハンドリング
                  throw new Error(`Failed to fetch image: ${response.statusText}`);
                }
                const contentType = response.headers.get('content-type');
                const imageArrayBuffer = await response.arrayBuffer();
                console.log(`Image downloaded. Content-Type: ${contentType}, Buffer size: ${imageArrayBuffer.byteLength}`); // 追加

                let extension: 'jpeg' | 'png' | 'gif' = 'jpeg'; // Default
                if (contentType) {
                  if (contentType.includes('jpeg') || contentType.includes('jpg')) {
                    extension = 'jpeg';
                  } else if (contentType.includes('png')) {
                    extension = 'png';
                  } else if (contentType.includes('gif')) {
                    extension = 'gif';
                  }
                }
                
                const imageId = workbook.addImage({
                  buffer: imageArrayBuffer,
                  extension: extension,
                });
                console.log(`Image added to workbook. ImageId: ${imageId}`); // 追加

                // Get cell coordinates for positioning
                const col = worksheet.getCell(imageCell).col;
                const row = worksheet.getCell(imageCell).row;
                console.log(`Image cell coordinates: Col ${col}, Row ${row}`); // 追加

                worksheet.addImage(imageId, {
                  tl: { col: Number(col) - 1, row: Number(row) - 1 }, // top-left corner of the image relative to the worksheet
                  ext: { width: imageWidth, height: imageHeight }, // Use dimensions directly from mapping
                });
                console.log(`Image inserted into worksheet.`); // 追加
              } catch (imageError) {
                console.error(`Failed to insert image for tag ${tag} at ${sheetName}!${imageCell}:`, imageError);
              }
            }

            // Write transcription
            if (transcription && memoCell) {
              worksheet.getCell(memoCell).value = transcription;
            }
          } else {
            console.warn(`Worksheet "${sheetName}" not found in template for tag "${tag}".`);
          }
        }
      } else {
        console.warn(`No mapping found for tag: ${tag} in documentType: ${documentType}`);
      }
    }

    // --- START: System Diagram Symbols Insertion ---
    // 1. Collect all unique symbols from all photos
    const allSymbols = photosData.flatMap(photo => photo.diagramSymbols || []);
    const tagsToInsert = [...new Set(allSymbols)];

    const systemDiagramMappings = mappingData.system_diagram_symbols;

    if (systemDiagramMappings) {
      console.log('Attempting to insert system diagram symbols. Symbols to insert:', tagsToInsert); // 追加
      for (const tag of tagsToInsert) { // Loop through unique tags collected from photos
        const symbolMappings = systemDiagramMappings[tag];
        if (symbolMappings) {
          const mappingArray = Array.isArray(symbolMappings) ? symbolMappings : [symbolMappings];
          for (const symbolMapping of mappingArray) {
            const sheetName = symbolMapping.sheet;
            const imagePath = symbolMapping.image_path;
            const cell = symbolMapping.cell;
            const width = symbolMapping.width;
            const height = symbolMapping.height;

            const worksheet = workbook.getWorksheet(sheetName);

            if (worksheet) {
              console.log(`Attempting to insert symbol for tag: ${tag}, Sheet: ${sheetName}, Path: ${imagePath}, Cell: ${cell}`);
              try {
                const fullImagePath = path.join(process.cwd(), imagePath);
                console.log(`Checking image existence at: ${fullImagePath}`); // 追加
                if (!fs.existsSync(fullImagePath)) {
                  throw new Error(`Image file not found at: ${fullImagePath}`);
                }
                console.log(`Image file exists: ${fs.existsSync(fullImagePath)}`); // 追加
                const imageBuffer = fs.readFileSync(fullImagePath);
                console.log(`Symbol image loaded. Buffer size: ${imageBuffer.length}`);

                const imageId = workbook.addImage({
                  buffer: imageBuffer.buffer,
                  extension: path.extname(imagePath).substring(1) as 'jpeg' | 'png' | 'gif',
                });
                console.log(`Symbol added to workbook. ImageId: ${imageId}`);

                const col = worksheet.getCell(cell).col;
                const row = worksheet.getCell(cell).row;
                console.log(`Symbol cell coordinates: Col ${col}, Row ${row}`);

                worksheet.addImage(imageId, {
                  tl: { col: Number(col) - 1, row: Number(row) - 1 },
                  ext: { width: width, height: height },
                });
                console.log(`Symbol inserted into worksheet.`);
              } catch (symbolError) {
                console.error(`Failed to insert symbol for tag "${tag}" from "${imagePath}":`, symbolError);
              }
            } else {
              console.warn(`Worksheet "${sheetName}" not found for symbol insertion for tag "${tag}". Please check the sheet name in mapping.json and the template.`); // 警告メッセージを修正
            }
          }
        }
      }
    }
    // --- END: System Diagram Symbols Insertion ---

    // Write the modified workbook to a buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Set document type name for the output filename
    let documentTypeName = '';
    if (documentType === 'completion_drawings') {
      documentTypeName = '竣工図書';
    } else if (documentType === 'survey_report') {
      documentTypeName = '調査報告資料';
    }

    // Create the output filename from corporation and document type
    const outputFileName = `${corporation}${documentTypeName}.xlsx`;

    // Set headers and send the file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(outputFileName)}`);
    res.status(200).send(buffer);

  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error generating report:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
}