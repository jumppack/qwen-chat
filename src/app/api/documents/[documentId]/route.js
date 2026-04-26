import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { deleteDocumentVectors } from '@/lib/vectorStore';

export async function DELETE(request, { params }) {
  try {
    const { documentId } = await params;

    if (!documentId) {
      return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });
    }

    // 1. Delete vectors from LanceDB
    await deleteDocumentVectors(documentId);

    // 2. Delete all attachment records in SQLite
    await prisma.attachedDocument.deleteMany({
      where: { documentId }
    });

    return NextResponse.json({ success: true, message: 'Document globally deleted' });
  } catch (error) {
    console.error('Global delete error:', error);
    return NextResponse.json({ error: 'Failed to delete document globally' }, { status: 500 });
  }
}
