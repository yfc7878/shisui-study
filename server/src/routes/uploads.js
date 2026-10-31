import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { imageSize } from 'image-size';
import { config } from '../config.js';
import { db, mapUpload } from '../db.js';
import { HttpError, asyncRoute, nowIso } from '../utils.js';

export const uploadRouter = express.Router();

const ALLOWED = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadDir),
  filename: (req, file, cb) => {
    const ext = ALLOWED.get(file.mimetype) || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 12 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      cb(new HttpError(400, '仅支持 JPG / PNG / WebP / GIF 图片', 'BAD_IMAGE_TYPE'));
      return;
    }
    cb(null, true);
  },
});

function saveUploadRecord(file) {
  const buffer = fs.readFileSync(file.path);
  let dimensions = { width: 0, height: 0 };
  try {
    dimensions = imageSize(buffer);
  } catch {
    fs.unlinkSync(file.path);
    throw new HttpError(400, '无法读取图片，请换一张试试', 'BAD_IMAGE');
  }
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO uploads (id, filename, original_name, mime, size, width, height, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    file.filename,
    Buffer.from(file.originalname || '', 'latin1').toString('utf8').slice(0, 200),
    file.mimetype,
    file.size,
    dimensions.width || 0,
    dimensions.height || 0,
    nowIso(),
  );
  return mapUpload(db.prepare('SELECT * FROM uploads WHERE id = ?').get(id));
}

uploadRouter.post('/', (req, res, next) => {
  upload.array('files', 12)(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        const message = err.code === 'LIMIT_FILE_SIZE'
          ? '单张图片不能超过 20MB'
          : err.code === 'LIMIT_FILE_COUNT'
            ? '一次最多上传 12 张图片'
            : `上传失败：${err.message}`;
        return next(new HttpError(400, message, err.code));
      }
      return next(err);
    }
    try {
      const files = (req.files || []).map(saveUploadRecord);
      if (!files.length) return next(new HttpError(400, '没有收到图片', 'NO_FILE'));
      res.status(201).json({ files });
    } catch (error) {
      next(error);
    }
  });
});

uploadRouter.delete('/:id', asyncRoute(async (req, res) => {
  const row = db.prepare('SELECT * FROM uploads WHERE id = ?').get(req.params.id);
  if (!row) throw new HttpError(404, '图片不存在', 'NOT_FOUND');
  db.prepare('DELETE FROM uploads WHERE id = ?').run(row.id);
  try {
    fs.unlinkSync(path.join(config.uploadDir, row.filename));
  } catch {
    /* 文件可能已被清理 */
  }
  res.json({ ok: true });
}));
