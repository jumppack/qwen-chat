import { prisma } from '@/lib/prisma';
import ollama from 'ollama';
import * as lancedb from '@lancedb/lancedb';
import { generateEmbedding } from '@/lib/embeddings';

export async function POST(req) {
  try {
    const { chatId, content, documents: documentMetas } = await req.json();

    if (!chatId || !content) {
      return new Response(JSON.stringify({ error: 'Missing chatId or content' }), { status: 400 });
    }

    // 1. Save user message
    await prisma.message.create({
      data: {
        chatId,
        role: 'user',
        content
      }
    });

    // 1.5 Persist document metadata if provided
    if (Array.isArray(documentMetas) && documentMetas.length > 0) {
      for (const doc of documentMetas) {
        // Use upsert to avoid duplicates if the message is retried or sent with same docs
        await prisma.attachedDocument.upsert({
          where: { 
            // We need a unique constraint for upsert to work effectively, 
            // or we just use findFirst + create.
            // Since we don't have a unique constraint on (chatId, documentId), 
            // let's just do a check then create.
            id: `${chatId}-${doc.documentId}` // We'll manually construct a deterministic ID for idempotency
          },
          update: {},
          create: {
            id: `${chatId}-${doc.documentId}`,
            chatId,
            documentId: doc.documentId,
            name: doc.name
          }
        }).catch(err => console.error('[RAG] Metadata persist error:', err));
      }
    }

    // 2. Fetch full history for context
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    // We only need role and content for Ollama
    const messages = chat.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Prepend the System Prompt silently on the backend
    messages.unshift({
      role: 'system',
      content: "You are an AI assistant running locally and securely on Karan's Apple Silicon Mac. You are not connected to Alibaba Cloud servers or any remote APIs. If asked about your identity or location, state that you are a local AI running on this Apple M5 Mac. Never mention Alibaba Cloud."
    });

    // If this is the first real user message, optionally update the chat title
    if (chat.messages.length === 1 || chat.title === 'New Chat') {
      const generatedTitle = content.length > 30 ? content.substring(0, 30) + '...' : content;
      await prisma.chat.update({
        where: { id: chatId },
        data: { title: generatedTitle }
      });
    }

    // 3. RAG Retrieval — only if document metadata was supplied
    if (Array.isArray(documentMetas) && documentMetas.length > 0) {
      const docIds = documentMetas.map(d => d.documentId);
      console.log(`[RAG] Request received with ${docIds.length} documentId(s)`);
      
      try {
        const queryVector = await generateEmbedding(content);

        // Connect to LanceDB
        const db = await lancedb.connect('.lancedb');
        const tableNames = await db.tableNames();

        if (!tableNames.includes('documents')) {
          console.warn('[RAG] documents table does not exist yet.');
        } else {
          const table = await db.openTable('documents');

          // OPTIMIZATION: Use native LanceDB SQL-like filtering for the specific document IDs
          // Format: documentId IN ("id1", "id2")
          const filterStr = `documentId IN (${docIds.map(id => `"${id}"`).join(', ')})`;
          
          const results = await table
            .search(queryVector)
            .where(filterStr)
            .limit(10)
            .toArray();

          if (results.length > 0) {
            const retrievedContext = results.map(r => r.text).join('\n\n---\n\n');

            const ragMessage = {
              role: 'system',
              content:
                'CRITICAL: The user has uploaded relevant documents. Below are excerpts. ' +
                'Use ONLY this information to answer if possible.\n\n' +
                '--- DOCUMENT CONTEXT START ---\n' + 
                retrievedContext + 
                '\n--- DOCUMENT CONTEXT END ---'
            };

            // Insert just before the last message
            messages.splice(messages.length - 1, 0, ragMessage);
            console.log(`[RAG] ✓ Injected ${results.length} chunks.`);
          }
        }
      } catch (ragError) {
        console.error('[RAG] Retrieval Error:', ragError);
      }
    } else {
      console.log('[RAG] Standard chat mode (no documents).');
    }

    // 4. Request streaming response from Ollama
    const responseStream = await ollama.chat({
      model: 'qwen2.5-coder:32b',
      messages,
      stream: true,
    });

    // 5. Create a ReadableStream to send to the client and save to DB
    const encoder = new TextEncoder();
    let assistantFullResponse = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            if (req.signal.aborted) {
              break;
            }
            const text = chunk.message.content;
            assistantFullResponse += text;
            controller.enqueue(encoder.encode(text));
          }
        } catch (e) {
          console.error("Stream error", e);
          controller.error(e);
        } finally {
          // 6. When done streaming, save the assistant message
          if (assistantFullResponse) {
            await prisma.message.create({
              data: {
                chatId,
                role: 'assistant',
                content: assistantFullResponse
              }
            });
            // Update chat's updatedAt timestamp
            await prisma.chat.update({
              where: { id: chatId },
              data: { updatedAt: new Date() }
            });
          }
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat API Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to process chat' }), { status: 500 });
  }
}

