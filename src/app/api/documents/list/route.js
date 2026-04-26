import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Get unique documents by documentId
    // We group by documentId to avoid duplicates across chats in the library view
    const documents = await prisma.attachedDocument.findMany({
      orderBy: { createdAt: 'desc' },
      distinct: ['documentId']
    });

    return NextResponse.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
  }
}
