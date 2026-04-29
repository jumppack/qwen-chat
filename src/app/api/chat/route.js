import { prisma } from '@/lib/prisma';
import ollama from 'ollama';
import * as lancedb from '@lancedb/lancedb';
import { generateEmbedding } from '@/lib/embeddings';

export async function POST(req) {
  try {
    const { chatId, content, documents: documentMetas, model } = await req.json();

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
        await prisma.attachedDocument.upsert({
          where: { id: `${chatId}-${doc.documentId}` },
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

    // Determine which model to use
    // Priority: Request body > DB saved model > default
    const activeModel = model || chat.model || 'qwen2.5-coder:32b';

    // If the model changed or this is the first message (title generation needed)
    let chatUpdates = {};
    if (chat.model !== activeModel) {
      chatUpdates.model = activeModel;
    }
    if (chat.messages.length === 1 || chat.title === 'New Chat') {
      chatUpdates.title = content.length > 30 ? content.substring(0, 30) + '...' : content;
    }
    
    if (Object.keys(chatUpdates).length > 0) {
      await prisma.chat.update({
        where: { id: chatId },
        data: chatUpdates
      });
    }

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
          const filterStr = `documentId IN (${docIds.map(id => `"${id}"`).join(', ')})`;
          
          const results = await table
            .search(queryVector)
            .where(filterStr)
            .limit(10)
            .toArray();

          let usedSourceNames = [];
          if (results.length > 0) {
            const retrievedContext = results.map(r => r.text).join('\n\n---\n\n');
            
            // Identify unique source names for citations
            const uniqueDocIds = [...new Set(results.map(r => r.documentId))];
            const attachedDocs = await prisma.attachedDocument.findMany({
              where: { documentId: { in: uniqueDocIds }, chatId }
            });
            usedSourceNames = [...new Set(attachedDocs.map(d => d.name))];

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
            console.log(`[RAG] ✓ Injected ${results.length} chunks from ${usedSourceNames.join(', ')}.`);
          }
          
          // Store used sources in a variable accessible to the stream finisher
          req.usedSourceNames = usedSourceNames;
        }
      } catch (ragError) {
        console.error('[RAG] Retrieval Error:', ragError);
      }
    } else {
      console.log('[RAG] Standard chat mode (no documents).');
    }

    // 4. Request streaming response from Ollama
    const responseStream = await ollama.chat({
      model: activeModel,
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
          // 6. When done streaming, append sources if any were used
          if (req.usedSourceNames && req.usedSourceNames.length > 0) {
            const sourcesBlock = `\n\n<div class="sources-citation">**Sources:** ${req.usedSourceNames.join(', ')}</div>`;
            assistantFullResponse += sourcesBlock;
            controller.enqueue(encoder.encode(sourcesBlock));
          }

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

