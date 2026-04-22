import { Multer } from 'multer';

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
    namespace Multer {
      interface File {
        fieldname:    string;
        originalname: string;
        encoding:     string;
        mimetype:     string;
        size:         number;
        buffer:       Buffer;
        destination?: string;
        filename?:    string;
        path?:        string;
        stream?:      NodeJS.ReadableStream;
      }
    }
  }
}