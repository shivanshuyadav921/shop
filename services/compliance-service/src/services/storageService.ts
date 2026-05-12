import fs from 'fs';
import path from 'path';
import { config } from '../config';

export async function ensureUploadPath() {
  const uploadPath = path.resolve(process.cwd(), config.uploadPath);
  await fs.promises.mkdir(uploadPath, { recursive: true });
  return uploadPath;
}

export async function storeDocument(file: Express.Multer.File) {
  const uploadPath = await ensureUploadPath();
  const targetPath = path.join(uploadPath, file.filename);
  await fs.promises.rename(file.path, targetPath);
  return targetPath;
}
