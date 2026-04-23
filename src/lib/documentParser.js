import { createRequire } from 'module';
import mammoth from 'mammoth';

const require = createRequire(import.meta.url);

export async function parseDocument(fileBuffer, mimeType) {
  try {
    if (mimeType === 'application/pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(fileBuffer);
      return data.text;
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
      mimeType === 'application/msword'
    ) {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value;
    } else if (mimeType === 'text/plain') {
      return fileBuffer.toString('utf-8');
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }
  } catch (error) {
    console.error('Error parsing document:', error);
    throw error;
  }
}
