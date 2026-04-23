import { NextResponse } from 'next/server';
import { parseDocument } from '@/lib/documentParser';
import { storeDocumentChunks } from '@/lib/vectorStore';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || 'text/plain';

    // Parse the document text
    const text = await parseDocument(buffer, mimeType);

    // Chunk and store embeddings in LanceDB
    const documentId = uuidv4();
    const chunksStored = await storeDocumentChunks(documentId, text);

    return NextResponse.json({ 
      success: true, 
      documentId, 
      chunksStored,
      message: 'Document successfully ingested'
    });
  } catch (error) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
