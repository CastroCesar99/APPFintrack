import { NextRequest, NextResponse } from 'next/server';
import { extractTransactionFromText } from '@/lib/ai';

export async function POST(req: NextRequest) {
  let language: 'en' | 'pt' = 'pt';
  
  // Add detailed error tracking for iOS debugging
  const requestId = `extract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[${requestId}] Extract API called`);
  
  try {
    let body: any;
    
    // Safely parse request body
    try {
      body = await req.json();
      console.log(`[${requestId}] Request body parsed successfully`);
    } catch (parseError: any) {
      console.error(`[${requestId}] Failed to parse request body:`, parseError);
      return NextResponse.json({ 
        error: 'Invalid request body',
        details: parseError.message 
      }, { status: 400 });
    }
    
    const { text, categories, paymentMethods, history } = body;
    language = body.language || 'pt';

    if (!text || typeof text !== 'string') {
      console.error(`[${requestId}] Missing or invalid text field`);
      return NextResponse.json({ 
        error: 'Missing text field.',
        details: 'Text must be a non-empty string'
      }, { status: 400 });
    }

    // Sanitize text input
    const sanitizedText = text.trim().replace(/[\x00-\x1F\x7F]/g, '');
    console.log(`[${requestId}] Sanitized text length:`, sanitizedText.length);

    try {
      console.log(`[${requestId}] Calling extractTransactionFromText...`);
      
      const data = await extractTransactionFromText(
        sanitizedText, 
        language, 
        categories, 
        paymentMethods, 
        history
      );
      
      console.log(`[${requestId}] Extraction successful`);
      return NextResponse.json({ data });
      
    } catch (aiError: any) {
      console.error(`[${requestId}] Extract AI Error:`, aiError);
      console.error(`[${requestId}] Error stack:`, aiError.stack);
      
      // Check for specific error types
      const errorString = String(aiError);
      const rawStringified = JSON.stringify(aiError);
      
      const isQuotaError = rawStringified.includes('429') || 
                           rawStringified.toLowerCase().includes('quota') || 
                           rawStringified.toLowerCase().includes('resource_exhausted');

      const isSyntaxError = errorString.includes('SyntaxError') || 
                           errorString.includes('pattern') ||
                           errorString.includes('match');

      if (isQuotaError) {
        const quotaMessage = language === 'pt' 
          ? '⚠️ Limite atingido por hoje. Athena precisa pausar. Tente novamente amanhã.'
          : '⚠️ Daily limit reached. Athena needs a break. Please try again tomorrow.';
        return NextResponse.json({ error: quotaMessage }, { status: 429 });
      }

      if (isSyntaxError) {
        const syntaxMessage = language === 'pt'
          ? '⚠️ Erro de processamento. Tente reformular o texto.'
          : '⚠️ Processing error. Try rephrasing your text.';
        return NextResponse.json({ 
          error: syntaxMessage,
          details: aiError.message,
          requestId 
        }, { status: 500 });
      }

      return NextResponse.json(
        { 
          error: 'Failed to extract data.',
          details: aiError.message || 'Unknown error',
          requestId
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error(`[${requestId}] API /extract critical error:`, error);
    console.error(`[${requestId}] Error stack:`, error.stack);
    
    return NextResponse.json(
      { 
        error: 'Error processing request.',
        details: error.message || 'Unknown error',
        requestId
      },
      { status: 500 }
    );
  }
}
