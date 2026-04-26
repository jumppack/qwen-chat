# RAG Persistence Implementation Plan (Plan 4)

Make document attachments persistent per chat, ensuring they survive page refreshes and are correctly managed throughout the chat lifecycle.

## User Review Required

> [!IMPORTANT]
> - **LanceDB Cleanup**: When a chat is deleted, the associated vectors in `.lancedb` will be permanently removed. 
> - **Prisma Migration**: I will be using `prisma db push` to update your local SQLite schema. This is safe for your local data but will modify the database structure.

## Proposed Changes

### Database Layer

#### [MODIFY] [schema.prisma](file:///Users/karan/Desktop/Code/qwen3_5_model_prompting/prisma/schema.prisma)
- Add `AttachedDocument` model.
- Add `documents AttachedDocument[]` relation to the `Chat` model.

### Library Layer

#### [MODIFY] [vectorStore.js](file:///Users/karan/Desktop/Code/qwen3_5_model_prompting/src/lib/vectorStore.js)
- [NEW] Implement `deleteDocumentVectors(documentId)` to remove entries from LanceDB using `.delete()`.

### API Layer

#### [MODIFY] [route.js (chat)](file:///Users/karan/Desktop/Code/qwen3_5_model_prompting/src/app/api/chat/route.js)
- Update POST to accept `stagedFiles` metadata.
- Persist new document associations to the `AttachedDocument` table.
- Optimize retrieval search using `.where()` for better performance.

#### [MODIFY] [route.js (chat-id)](file:///Users/karan/Desktop/Code/qwen3_5_model_prompting/src/app/api/chats/%5BchatId%5D/route.js)
- **GET**: Include `documents` in the returned chat object.
- **DELETE**: Fetch document IDs, trigger vector cleanup, and then delete the chat.

### Frontend Layer

#### [MODIFY] [page.js](file:///Users/karan/Desktop/Code/qwen3_5_model_prompting/src/app/page.js)
- Update `selectChat` to hydrate `stagedFiles` from the `chat.documents` array.
- Update `sendMessage` to pass the full `stagedFiles` metadata to the backend.

---

## Verification Plan

### Automated/Manual Testing
1. **Persistence Test**:
   - Upload a PDF to a chat.
   - Refresh the page.
   - Verify the PDF pill is still visible and "Ready".
2. **Context Test**:
   - Ask a question about the PDF after a refresh.
   - Verify the AI uses the document context.
3. **Cleanup Test**:
   - Delete the chat.
   - (Internal check) Verify the `AttachedDocument` records and LanceDB vectors are gone.
