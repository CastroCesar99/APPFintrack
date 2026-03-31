import { NextRequest, NextResponse } from 'next/server';
import { askArya } from '@/lib/ai';

// CORS Headers - Required for Capacitor/WebKit cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// OPTIONS handler - Required for CORS preflight requests
export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  let language: 'en' | 'pt' = 'pt';
  try {
    const body = await req.json();
    const { question, transactions, budgets, monthYear } = body;
    language = body.language || 'pt';

    if (!question || !transactions || !monthYear) {
      return NextResponse.json({ 
        error: 'Missing required fields.' 
      }, { status: 400, headers: corsHeaders });
    }

    try {
      const answer = await askArya(
        question,
        transactions,
        budgets || [],
        language,
        monthYear
      );
      return NextResponse.json({ answer }, { status: 200, headers: corsHeaders });
    } catch (aiError: any) {
      console.error('Ask Arya AI Error:', aiError);

      const rawStringified = JSON.stringify(aiError);
      const isQuotaError = rawStringified.includes('429') ||
        rawStringified.toLowerCase().includes('quota') ||
        rawStringified.toLowerCase().includes('resource_exhausted');

      if (isQuotaError) {
        const quotaMessage = language === 'pt'
          ? '⚠️ Limite atingido por hoje. Athena precisa descansar um pouco. Tente novamente amanhã.'
          : '⚠️ Daily limit reached. Athena needs to rest for a bit. Please try again tomorrow.';
        return NextResponse.json({ error: quotaMessage }, { status: 429, headers: corsHeaders });
      }

      return NextResponse.json(
        { 
          success: false,
          error: language === 'pt' ? 'Athena não conseguiu responder agora.' : 'Athena couldn\'t answer right now.' 
        },
        { status: 500, headers: corsHeaders }
      );
    }
  } catch (error: any) {
    console.error('API /ask critical error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Internal Server Error'
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
