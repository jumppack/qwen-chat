# RAG Citations & Document Library Implementation Plan (Plan 5)

This plan combines two major enhancements: **Citations** for AI transparency and a **Document Library** for centralized knowledge management.

## User Review Required

> [!IMPORTANT]
> - **Global Deletion**: Deleting a document from the Library will remove it from **all** chats where it was attached and purge its vectors from LanceDB.

## Proposed Changes

### 1. RAG Citations

#### [MODIFY] [route.js (chat)](file:///Users/karan/Desktop/Code/qwen3_5_model_prompting/src/app/api/chat/route.js)
- After the LanceDB search, extract the unique `documentId`s from the results.
- Look up the filenames for these IDs.
- Append a formatted `**Sources:**` list to the end of the AI's response text before saving it to the database and finishing the stream.

#### [MODIFY] [page.js](file:///Users/karan/Desktop/Code/qwen3_5_model_prompting/src/app/page.js)
- Update the CSS to make the `**Sources:**` section in markdown look like subtle, secondary information (e.g., smaller font, slightly dimmed, or styled as pills).

### 2. Document Library

#### [NEW] [route.js (list)](file:///Users/karan/Desktop/Code/qwen3_5_model_prompting/src/app/api/documents/list/route.js)
- Implement a GET endpoint that returns all unique `documentId`s from the `AttachedDocument` table, along with their names and creation dates.

#### [NEW] [route.js (delete)](file:///Users/karan/Desktop/Code/qwen3_5_model_prompting/src/app/api/documents/%5BdocumentId%5D/route.js)
- Implement a DELETE endpoint for global removal.
- Logic: Call `deleteDocumentVectors` (LanceDB) and delete all Prisma `AttachedDocument` records for that ID.

#### [MODIFY] [page.js](file:///Users/karan/Desktop/Code/qwen3_5_model_prompting/src/app/page.js)
- Add a "Manage Library" button to the sidebar.
- Create a Modal component that fetches and displays the list of unique documents.
- Add "Delete" functionality to the list that updates the UI globally.

---

## Verification Plan

### Manual Testing
1. **Citations**: Ask a question about an uploaded PDF and verify the filename appears at the bottom of the answer.
2. **Library View**: Open the library and ensure all uploaded documents (from any chat) are listed.
3. **Global Delete**: Delete a document from the library and verify it disappears from the "staged files" of all chats it was attached to.
