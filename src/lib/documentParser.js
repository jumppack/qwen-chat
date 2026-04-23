import { createRequire } from 'module';
import mammoth from 'mammoth';

const require = createRequire(import.meta.url);

export async function parseDocument(fileBuffer, mimeType) {
  try {
    if (mimeType === 'application/pdf') {
      console.log(`[Parser] Processing PDF, buffer size: ${fileBuffer.length} bytes`);
      
      // Basic magic number check for PDF (%PDF)
      const magic = fileBuffer.slice(0, 4).toString();
      if (magic !== '%PDF') {
        console.error(`[Parser] Invalid PDF header: ${magic}`);
        throw new Error('File does not appear to be a valid PDF (missing %PDF header)');
      }

      const pdfParseModule = require('pdf-parse');
      const pdfParse = typeof pdfParseModule === 'function' ? pdfParseModule : pdfParseModule.default;
      
      if (typeof pdfParse !== 'function') {
        throw new Error('pdf-parse module is not a function');
      }

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
