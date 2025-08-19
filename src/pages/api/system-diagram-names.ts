import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<string[] | { message: string }>
) {
  try {
    const mappingPath = path.join(process.cwd(), 'mapping.json');
    const fileContents = fs.readFileSync(mappingPath, 'utf-8');
    const mappingData = JSON.parse(fileContents);

    const systemDiagramSymbols = mappingData.system_diagram_symbols;
    if (systemDiagramSymbols) {
      const symbolNames = Object.keys(systemDiagramSymbols).map(name => name.normalize('NFC'));
      res.status(200).json(symbolNames);
    } else {
      res.status(404).json({ message: 'System diagram symbols not found in mapping.json' });
    }
  } catch (error: unknown) {
    let message = 'Unknown Error';
    if (error instanceof Error) message = error.message;
    console.error('Error reading system diagram names from mapping.json:', error);
    res.status(500).json({ message: `Internal Server Error: ${message}` });
  }
}