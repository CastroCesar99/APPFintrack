import { GoogleGenAI } from "@google/genai";

export async function generateFinancialInsights(
  transactions: any[],
  budgets: any[],
  language: 'en' | 'pt',
  monthYear: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = language === 'pt' 
    ? "Seu nome é Arya. Você é uma consultora financeira especialista e carismática do app FinTrack. Analise os dados financeiros fornecidos e dê insights curtos, diretos e acionáveis. Use formatação Markdown (negrito, listas) para facilitar a leitura. Seja encorajadora, mas realista."
    : "Your name is Arya. You are an expert and charismatic financial advisor for the FinTrack app. Analyze the provided financial data and give short, direct, and actionable insights. Use Markdown formatting (bold, lists) for readability. Be encouraging but realistic.";

  const prompt = language === 'pt'
    ? `Analise os seguintes dados financeiros para o período de ${monthYear}:
    Transações: ${JSON.stringify(transactions)}
    Orçamentos: ${JSON.stringify(budgets)}
    
    Por favor, forneça um resumo de 2 a 3 parágrafos com os principais insights (ex: onde o usuário gastou mais, se estourou algum orçamento, e uma dica para o próximo mês).`
    : `Analyze the following financial data for the period of ${monthYear}:
    Transactions: ${JSON.stringify(transactions)}
    Budgets: ${JSON.stringify(budgets)}
    
    Please provide a 2-3 paragraph summary with key insights (e.g., where the user spent the most, if they exceeded any budgets, and a tip for next month).`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-lite-latest",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    return response.text || (language === 'pt' ? "Não foi possível gerar insights no momento." : "Could not generate insights at this time.");
  } catch (error) {
    console.error("Error generating insights:", error);
    throw error;
  }
}
