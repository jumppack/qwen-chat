import { prisma } from '@/lib/prisma';
import ollama from 'ollama';

export async function POST(req) {
  try {
    const { chatId, content } = await req.json();

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

    // 3. Request streaming response from Ollama
    const responseStream = await ollama.chat({
      model: 'qwen2.5-coder:32b',
      messages,
      stream: true,
    });

    // 4. Create a ReadableStream to send to the client and save to DB
    const encoder = new TextEncoder();
    let assistantFullResponse = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            const text = chunk.message.content;
            assistantFullResponse += text;
            controller.enqueue(encoder.encode(text));
          }
        } catch (e) {
          console.error("Stream error", e);
          controller.error(e);
        } finally {
          // 5. When done streaming, save the assistant message
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
