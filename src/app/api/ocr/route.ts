import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY });

// CORS headers para permitir chamadas do Capacitor
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface OCRResult {
  amount: number;
  date: string;
  establishment: string;
  category: string;
  confidence: number;
}

// Handler para preflight CORS
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType = "image/jpeg" } = await req.json();

    // Log do tamanho do payload para monitoramento
    console.log('Tamanho do Base64 enviado:', imageBase64 ? imageBase64.length : 0, 'caracteres');

    if (!imageBase64) {
      return NextResponse.json(
        { error: "Imagem não fornecida" },
        { status: 400, headers: corsHeaders }
      );
    }

    const prompt = `
Analise esta imagem de recibo/comprovante e extraia as seguintes informações em formato JSON:
{
  "amount": number (valor total em reais, apenas números),
  "date": "YYYY-MM-DD" (data da transação),
  "establishment": "nome do estabelecimento",
  "category": "categoria mais adequada entre: Alimentação, Transporte, Moradia, Saúde, Lazer, Compras, Serviços, Educação, Outros",
  "confidence": number (0-1 indicando confiança na extração)
}

Regras:
- Se não encontrar a data, use a data atual
- Se não encontrar o estabelecimento, use "Estabelecimento não identificado"
- Para o valor, remova R$, vírgulas e pontos extras, converta para número
- Escolha a categoria mais provável baseada no estabelecimento ou itens
`;

    const contents = [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: imageBase64,
            },
          },
        ],
      },
    ];

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents,
      config: {
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
    });

    const text = response.text;
    
    if (!text) {
      return NextResponse.json(
        { error: "Não foi possível analisar a imagem" },
        { status: 500, headers: corsHeaders }
      );
    }

    // Extrair JSON da resposta
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Resposta inválida da IA", rawResponse: text },
        { status: 500, headers: corsHeaders }
      );
    }

    const result: OCRResult = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      success: true,
      data: result,
    }, { headers: corsHeaders });

  } catch (error: any) {
    console.error("[OCR API Error]:", error);
    return NextResponse.json(
      { error: error.message || "Erro ao processar imagem" },
      { status: 500, headers: corsHeaders }
    );
  }
}
