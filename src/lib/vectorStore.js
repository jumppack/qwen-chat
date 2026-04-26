import * as lancedb from '@lancedb/lancedb';
import { generateEmbedding } from './embeddings.js';

export function chunkText(text, chunkSize = 500, chunkOverlap = 50) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    if (i + chunkSize >= text.length) break;
    i += chunkSize - chunkOverlap;
  }
  return chunks;
}

export async function storeDocumentChunks(documentId, text) {
  const chunks = chunkText(text);
  const records = [];
  
  // Generating embeddings for all chunks. 
  // Doing it sequentially to avoid overloading the local Ollama API.
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    // Skipping empty chunks
    if (chunk.trim().length === 0) continue;
    
    const embedding = await generateEmbedding(chunk);
    records.push({
      id: `${documentId}-${i}`,
      documentId,
      text: chunk,
      vector: embedding
    });
  }

  if (records.length === 0) return 0;

  // Connect to LanceDB
  const db = await lancedb.connect('.lancedb');
  
  // Create or open the 'documents' table
  let table;
  try {
    const tableNames = await db.tableNames();
    if (tableNames.includes('documents')) {
      table = await db.openTable('documents');
      await table.add(records);
    } else {
      table = await db.createTable('documents', records);
    }
  } catch (error) {
    console.error('Error with LanceDB:', error);
    throw error;
  }

  return records.length;
}

/**
 * Removes all vector chunks associated with a specific documentId from LanceDB.
 */
export async function deleteDocumentVectors(documentId) {
  try {
    const db = await lancedb.connect('.lancedb');
    const tableNames = await db.tableNames();
    
    if (tableNames.includes('documents')) {
      const table = await db.openTable('documents');
      // LanceDB delete takes a filter string
      await table.delete(`documentId = "${documentId}"`);
      console.log(`[LanceDB] Deleted vectors for documentId: ${documentId}`);
    }
  } catch (error) {
    console.error('[LanceDB] Error deleting vectors:', error);
    throw error;
  }
}
