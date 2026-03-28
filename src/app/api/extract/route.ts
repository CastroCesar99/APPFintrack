import { NextRequest, NextResponse } from 'next/server';
import { extractTransactionFromText } from '@/lib/ai';

export async function POST(req: NextRequest) {
  let language: 'en' | 'pt' = 'pt';
  try {
    const body = await req.json();
    const { text, categories, paymentMethods, history } = body;
    language = body.language || 'pt';

    if (!text) {
      return NextResponse.json({ error: 'Missing text field.' }, { status: 400 });
    }

    try {
      const data = await extractTransactionFromText(text, language, categories, paymentMethods, history);
      return NextResponse.json({ data });
    } catch (aiError: any) {
      console.error('Extract AI Error:', aiError);
      
      const rawStringified = JSON.stringify(aiError);
      const isQuotaError = rawStringified.includes('429') || 
                           rawStringified.toLowerCase().includes('quota') || 
                           rawStringified.toLowerCase().includes('resource_exhausted');

      if (isQuotaError) {
        const quotaMessage = language === 'pt' 
          ? '⚠️ Limite atingido por hoje. Arya precisa pausar. Tente novamente amanhã.'
          : '⚠️ Daily limit reached. Arya needs a break. Please try again tomorrow.';
        return NextResponse.json({ error: quotaMessage }, { status: 429 });
      }

      return NextResponse.json(
        { error: 'Failed to extract data.' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('API /extract critical error:', error);
    return NextResponse.json(
      { error: 'Error processing request.' },
      { status: 500 }
    );
  }
}
