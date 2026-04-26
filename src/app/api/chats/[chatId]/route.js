import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request, { params }) {
  try {
    const { chatId } = await params;
    
    if (!chatId) {
      return NextResponse.json({ error: 'Missing chatId' }, { status: 400 });
    }

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        },
        documents: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    return NextResponse.json(chat);
  } catch (error) {
    console.error('Error fetching chat details:', error);
    return NextResponse.json({ error: 'Failed to fetch chat details' }, { status: 500 });
  }
}

import { deleteDocumentVectors } from '@/lib/vectorStore';

export async function DELETE(request, { params }) {
  try {
    const { chatId } = await params;
    
    // 1. Fetch all associated document IDs first
    const attachedDocs = await prisma.attachedDocument.findMany({
      where: { chatId }
    });

    // 2. Cleanup vectors in LanceDB
    for (const doc of attachedDocs) {
      await deleteDocumentVectors(doc.documentId);
    }

    // 3. Delete the chat (Cascade will handle AttachedDocument records in SQLite)
    await prisma.chat.delete({ where: { id: chatId } });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete chat:', error);
    return NextResponse.json({ error: 'Failed to delete chat' }, { status: 500 });
  }
}
