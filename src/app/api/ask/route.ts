import { NextRequest, NextResponse } from 'next/server';
import { askArya } from '@/lib/ai';

export async function POST(req: NextRequest) {
  let language: 'en' | 'pt' = 'pt';
  try {
    const body = await req.json();
    const { question, transactions, budgets, monthYear } = body;
    language = body.language || 'pt';

    if (!question || !transactions || !monthYear) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    try {
      const answer = await askArya(
        question,
        transactions,
        budgets || [],
        language,
        monthYear
      );
      return NextResponse.json({ answer });
    } catch (aiError: any) {
      console.error('Ask Arya AI Error:', aiError);

      const rawStringified = JSON.stringify(aiError);
      const isQuotaError = rawStringified.includes('429') ||
        rawStringified.toLowerCase().includes('quota') ||
        rawStringified.toLowerCase().includes('resource_exhausted');

      if (isQuotaError) {
        const quotaMessage = language === 'pt'
          ? '⚠️ Limite atingido por hoje. Arya precisa descansar um pouco. Tente novamente amanhã.'
          : '⚠️ Daily limit reached. Arya needs to rest for a bit. Please try again tomorrow.';
        return NextResponse.json({ error: quotaMessage }, { status: 429 });
      }

      return NextResponse.json(
        { error: language === 'pt' ? 'Arya não conseguiu responder agora.' : 'Arya couldn\'t answer right now.' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('API /ask critical error:', error);
    return NextResponse.json(
      { error: 'Error processing request.' },
      { status: 500 }
    );
  }
}
