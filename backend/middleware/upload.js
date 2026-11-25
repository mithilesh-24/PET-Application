import multer from 'multer';
import { config } from '../config.js';

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.multipartLimitBytes,
  },
});
