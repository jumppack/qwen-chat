import { prisma } from '@/lib/prisma';
import ollama from 'ollama';
import * as lancedb from '@lancedb/lancedb';
import { generateEmbedding } from '@/lib/embeddings';

export async function POST(req) {
  try {
    const { chatId, content, documents: documentIds } = await req.json();

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

    // 3. RAG Retrieval — only if document IDs were supplied
    if (Array.isArray(documentIds) && documentIds.length > 0) {
      console.log(`[RAG] Request received with ${documentIds.length} documentId(s):`, documentIds);
      try {
        // Embed the user's latest question
        const queryVector = await generateEmbedding(content);
        console.log(`[RAG] Embedding generated, vector length: ${queryVector.length}`);

        // Connect to LanceDB and search the documents table
        const db = await lancedb.connect('.lancedb');

        // Guard: table may not exist yet if no document has been fully ingested
        const tableNames = await db.tableNames();
        console.log(`[RAG] LanceDB tables found:`, tableNames);

        if (!tableNames.includes('documents')) {
          console.warn('[RAG] documents table does not exist yet, skipping retrieval.');
        } else {
          const table = await db.openTable('documents');

          // LanceDB query.toArray() returns a plain JS array directly
          const rawArray = await table
            .search(queryVector)
            .limit(20) // Retrieve more candidates
            .toArray();

          const results = rawArray
            .filter(row => documentIds.includes(row.documentId))
            .slice(0, 10); // Provide more context chunks (approx 5000 chars)

          if (results.length > 0) {
            const retrievedContext = results.map(r => r.text).join('\n\n---\n\n');

            const ragMessage = {
              role: 'system',
              content:
                'CRITICAL: The user has uploaded one or more documents. Below are highly relevant snippets ' +
                'from those documents. Use ONLY this information to answer if possible. ' +
                'If the user asks for a summary of a specific part (like a chapter), use these snippets ' +
                'to provide the most accurate details from the text. ' +
                'If the context is insufficient, state that clearly but try your best with what is provided.\n\n' +
                '--- DOCUMENT CONTEXT START ---\n' + 
                retrievedContext + 
                '\n--- DOCUMENT CONTEXT END ---'
            };

            // Insert just before the last message (the user's current question)
            messages.splice(messages.length - 1, 0, ragMessage);
            console.log(`[RAG] ✓ Injected ${results.length} chunks into context.`);
          } else {
            console.warn('[RAG] ✗ No matching chunks found for this query.');
          }
        }
      } catch (ragError) {
        console.error('[RAG] Retrieval Error:', ragError);
      }
    } else {
      console.log('[RAG] No documentIds in payload — standard chat mode.');
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

