# RAG Pipeline Implementation Plan

This document outlines the full architecture and plan for integrating Retrieval-Augmented Generation (RAG) into the Next.js local chat application using LanceDB and Ollama.

## Phase 1: The Ingestion Pipeline (✅ Completed)

**Goal:** Allow users to upload documents, parse them into raw text, chunk the text, generate embeddings via the local Ollama API (`nomic-embed-text`), and store them in a local Vector DB.

### Components Built

- **Dependencies Installed:** `@lancedb/lancedb`, `pdf-parse`, `mammoth`.
- **`[NEW] src/lib/embeddings.js`**:
  - Exposes `generateEmbedding(text)` connecting to `http://127.0.0.1:11434` to retrieve embeddings from `nomic-embed-text`.
- **`[NEW] src/lib/documentParser.js`**:
  - Exposes `parseDocument(fileBuffer, mimeType)` handling `.pdf`, `.docx`, and `.txt` files.
- **`[NEW] src/lib/vectorStore.js`**:
  - Handles string chunking (`chunkText`) with 500 characters and 50 character overlap.
  - Generates embeddings for each chunk sequentially and persists them in the `.lancedb` directory inside a `documents` table.
- **`[NEW] src/app/api/documents/route.js`**:
  - POST endpoint handling `FormData` file uploads, connecting the parser and vector store logic.

---

## Phase 2: Modifying the Chat Route (🚀 Proposed Next Step)

**Goal:** Intercept user queries during a chat, convert the query into a vector, perform a semantic search against the `.lancedb` store, and inject the relevant document chunks into the LLM's system prompt before streaming the response.

### Proposed Changes

#### [MODIFY] `src/app/api/chat/route.js`
- Retrieve the latest user message from the incoming request.
- **Vector Search:**
  - Call `generateEmbedding(latestUserMessage)` to get the query vector.
  - Connect to LanceDB `.lancedb` and open the `documents` table.
  - Perform a semantic similarity search (`table.search(queryVector).limit(5).execute()`) to find the top 5 most relevant chunks.
- **Prompt Augmentation:**
  - Map over the search results and concatenate the chunk texts into a single context block.
  - Create or update the `system` prompt in the messages array passed to `ollama.chat()`, dynamically injecting: 
    _"Use the following retrieved context to answer the user's question..."_
- **Streaming Response:**
  - Proceed with the existing Ollama streaming logic back to the client.

## User Review Required
> [!IMPORTANT]
> - Do you want the augmented context to be added as a **System Message** (hidden from the UI, guides the model) or injected directly into the **User's Prompt**? (Typically, System Message is preferred).
> - Are there any specific confidence thresholds or distance metrics you want to enforce for the vector search, or is returning the top 5 nearest neighbors sufficient for now?

## Verification Plan
### Manual Verification
1. Upload a PDF with specific, non-general knowledge using the Phase 1 endpoint.
2. Ask the chat application a question specifically related to that PDF.
3. Observe if the model correctly utilizes the localized context to formulate its answer.
