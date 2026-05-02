# Goal Description

The objective is to audit the current Retrieval-Augmented Generation (RAG) implementation and identify why the local Qwen model fails to understand that documents are attached, and why it fails to cite specific resources in its responses. After the audit, this document outlines the proposed architectural changes to fix these issues.

## Audit Findings

After reviewing the codebase (`src/app/api/chat/route.js`, `src/lib/vectorStore.js`), here is why the model is failing to cite documents and understand its context:

1. **Missing Inline Source Context:**
   Currently, when document chunks are retrieved from LanceDB, only the raw text (`r.text`) is concatenated and passed to the model. 
   The model is never provided with the **name of the document** associated with each text chunk. Since it doesn't know the file names, it cannot cite them.

2. **Artificial "Sources" Appending:**
   The backend mechanically appends `<div class="sources-citation">**Sources:** file.pdf</div>` at the very end of the streaming response. The LLM does not generate this text, nor is it aware of it. The model operates under the illusion it is just answering a standard prompt, completely oblivious to the fact that it is acting as a RAG system.

3. **Suboptimal Prompt Injection Strategy:**
   The RAG context is injected as a secondary `system` message right before the latest user message. Many instruction-tuned models (like Qwen) struggle when multiple system prompts are scattered throughout the chat history, often ignoring the later ones.

## Proposed Changes

To enable the model to understand its sources and actively cite them inline, the following modifications will be made:

### `src/app/api/chat/route.js`

- **Map Document Names to Context:** 
  After fetching results from LanceDB, I will map the `documentId` of each chunk to its human-readable `name` (using the `attachedDocs` query). 
- **Format Context with Citations:**
  Instead of blindly concatenating text, I will format the injected context like this:
  `[Source: filename.pdf]`
  `Excerpt: ...`
- **Update the Prompting Strategy:**
  I will modify the injected instructions to explicitly command the model: *"You must use the provided document context to answer the user's query. When using information from the context, explicitly cite the source document name."*
  This context will be appended directly to the **user's** current message, rather than creating a separate floating `system` message, ensuring the model pays full attention to it.
- **Remove Hardcoded Source Footer:**
  I will remove the mechanical backend code that artificially appends `**Sources:**` at the end of the stream, empowering the model to cite sources naturally within its prose.
