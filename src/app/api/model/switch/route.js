import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { currentModel, newModel } = await request.json();

    if (!currentModel || !newModel) {
      return NextResponse.json({ error: 'Missing currentModel or newModel' }, { status: 400 });
    }

    // 1. Unload the current model from RAM
    try {
      await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: currentModel,
          prompt: '',
          keep_alive: 0
        })
      });
      console.log(`[Model Switch] Unloaded model: ${currentModel}`);
    } catch (err) {
      console.error(`[Model Switch] Failed to unload ${currentModel}:`, err);
    }

    // 2. Load the new model into RAM
    try {
      await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: newModel,
          prompt: '',
          keep_alive: '5m'
        })
      });
      console.log(`[Model Switch] Loaded model: ${newModel}`);
    } catch (err) {
      console.error(`[Model Switch] Failed to load ${newModel}:`, err);
      return NextResponse.json({ error: 'Failed to load new model' }, { status: 500 });
    }

    return NextResponse.json({ success: true, activeModel: newModel });
  } catch (error) {
    console.error('[Model Switch] Error:', error);
    return NextResponse.json({ error: 'Failed to perform model switch' }, { status: 500 });
  }
}
