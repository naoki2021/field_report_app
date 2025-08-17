import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const mappingPath = path.join(process.cwd(), 'mapping.json');
    const fileContents = fs.readFileSync(mappingPath, 'utf-8');
    const mappingData = JSON.parse(fileContents);

    const systemDiagramSymbols = mappingData.system_diagram_symbols;

    if (systemDiagramSymbols) {
      res.status(200).json(systemDiagramSymbols);
    } else {
      res.status(404).json({ message: 'System diagram symbols not found in mapping.json' });
    }
  } catch (error) {
    console.error('Failed to read system diagram symbols from mapping.json:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
}