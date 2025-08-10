import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { extname } from 'path';

// Allowed mime types
const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];

export const multerConfig: MulterOptions = {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error('Invalid file type. Only PDF, JPG, and PNG are allowed.'),
        false,
      );
    }
  },
  // Optionally, you can customize storage here (e.g., memoryStorage for further processing)
  storage: undefined, // Use default memory storage for now
};
