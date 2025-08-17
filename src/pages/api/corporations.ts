
import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<string[]>
) {
  try {
    const templatesDirectory = path.join(process.cwd(), 'templates');
    const directories = fs.readdirSync(templatesDirectory, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    res.status(200).json(directories);
  } catch (error) {
    console.error('Error reading templates directory:', error);
    res.status(500).json([]);
  }
}
