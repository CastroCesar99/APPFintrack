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
    ? "Seu nome é Arya. Você é uma consultora financeira especialista e carismática do app Athena. Analise os dados financeiros fornecidos e dê insights curtos, diretos e acionáveis. Use formatação Markdown (negrito, listas) para facilitar a leitura. Seja encorajadora, mas realista."
    : "Your name is Arya. You are an expert and charismatic financial advisor for the Athena app. Analyze the provided financial data and give short, direct, and actionable insights. Use Markdown formatting (bold, lists) for readability. Be encouraging but realistic.";

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

export async function askArya(
  question: string,
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
    ? `Seu nome é Arya. Você é uma consultora financeira especialista do app Athena.
    Sua missão é responder perguntas específicas do usuário sobre os dados financeiros dele para o período de ${monthYear}.
    Seja direta, carismática e precisa. Use os dados fornecidos (transações e orçamentos) para fundamentar suas respostas.
    Se não encontrar a informação nos dados, admita que não sabe ou peça mais detalhes.
    Use Markdown para formatar valores monetários e listas.`
    : `Your name is Arya. You are an expert financial advisor for the Athena app.
    Your mission is to answer specific user questions about their financial data for the period of ${monthYear}.
    Be direct, charismatic, and precise. Use the provided data (transactions and budgets) to base your answers.
    If you can't find the information in the data, admit you don't know or ask for more details.
    Use Markdown to format monetary values and lists.`;

  const prompt = `Pergunta do Usuário: "${question}"
  
  Dados Relacionados:
  - Mês/Ano: ${monthYear}
  - Transações: ${JSON.stringify(transactions)}
  - Orçamentos: ${JSON.stringify(budgets)}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-lite-latest",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.3, // Lower temperature for more factual Q&A
      },
    });

    return response.text || (language === 'pt' ? "Desculpe, não consegui processar sua pergunta agora." : "Sorry, I couldn't process your question right now.");
  } catch (error) {
    console.error("Error in askArya:", error);
    throw error;
  }
}

export async function extractTransactionFromText(
  text: string,
  language: 'en' | 'pt',
  categories: any[] = [],
  paymentMethods: any[] = [],
  history: any[] = [],
  currentDate?: string
): Promise<any> {
  // Safely get current date in ISO format for Safari compatibility
  let safeCurrentDate: string;
  try {
    if (currentDate && /^\d{4}-\d{2}-\d{2}$/.test(currentDate)) {
      // Date is already in YYYY-MM-DD format
      safeCurrentDate = currentDate;
    } else {
      // Use Date.now() and manual formatting to avoid Safari issues
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      safeCurrentDate = `${year}-${month}-${day}`;
    }
  } catch (dateError) {
    console.error('Date parsing error:', dateError);
    // Fallback to a safe default
    safeCurrentDate = '2024-01-01';
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Safely prepare context strings with error handling
    let categoriesContext = '';
    let paymentMethodsContext = '';
    let historyContext = '';

    try {
      categoriesContext = categories.map(c => {
        const label = c.label ? ` (${c.label.pt || c.label.en || ''})` : "";
        return `"${String(c.name || '').replace(/"/g, '\\"')}"${label}`;
      }).join(", ");
    } catch (e) {
      console.error('Error preparing categories context:', e);
      categoriesContext = '';
    }

    try {
      paymentMethodsContext = paymentMethods.map(p => {
        const label = p.label ? ` (${p.label.pt || p.label.en || ''})` : "";
        return `"${String(p.name || '').replace(/"/g, '\\"')}"${label}`;
      }).join(", ");
    } catch (e) {
      console.error('Error preparing payment methods context:', e);
      paymentMethodsContext = '';
    }

    try {
      historyContext = history.map(h => {
        const desc = String(h.description || '').replace(/:/g, ' ');
        const nature = String(h.expenseNature || 'variable').replace(/:/g, ' ');
        return `${desc}: ${nature}`;
      }).join(", ");
    } catch (e) {
      console.error('Error preparing history context:', e);
      historyContext = '';
    }

    // Sanitize input text to prevent regex issues
    let sanitizedText = text;
    try {
      // Remove any characters that might cause regex issues in Safari
      sanitizedText = String(text || '').replace(/[\x00-\x1F\x7F]/g, '').trim();
    } catch (e) {
      console.error('Error sanitizing text:', e);
      sanitizedText = String(text || '').trim();
    }

    const systemInstruction = language === 'pt'
      ? `Você é a Arya, assistente inteligente do app Athena.
      Sua missão é extrair dados de uma transação financeira a partir de um texto e retornar APENAS um JSON válido.
      
      Categorias do Usuário: ${categoriesContext}
      Meios de Pagamento do Usuário: ${paymentMethodsContext}
      Histórico Recente (Descrição: Natureza): ${historyContext}

      Regras:
      1. Se a data for "hoje", use: ${safeCurrentDate}.
      2. Identifique se é despesa ou receita (pelo contexto).
      3. Tente mapear o gasto para uma das "Categorias do Usuário" acima. Se não souber, use "Other".
      4. Tente mapear o pagamento para um dos "Meios de Pagamento do Usuário" acima (procure por nomes como "The One", "Nubank", "Crédito", etc).
      5. O valor deve ser um número.
      6. Verifique o "Histórico Recente". Se já existir um gasto com a mesma descrição, use a mesma natureza (fixed ou variable). Caso contrário, tente inferir pelo contexto (ex: aluguel é fixed, restaurante é variable).`
      : `Your name is Arya, the smart assistant for the Athena app.
      Your mission is to extract financial transaction data from text and return ONLY a valid JSON.
      
      User Categories: ${categoriesContext}
      User Payment Methods: ${paymentMethodsContext}
      Recent History (Description: Nature): ${historyContext}

      Rules:
      1. If the date is "today", use: ${safeCurrentDate}.
      2. Identify if it is an expense or income (based on context).
      3. Try to map to one of the "User Categories" above. If unsure, use "Other".
      4. Try to map to one of the "User Payment Methods" above (e.g., look for names the user mentioned).
      5. The value must be a number.
      6. Check "Recent History". If a transaction with the same description exists, use the same nature (fixed or variable). Otherwise, infer from context (e.g., rent is fixed, dining is variable).`;

    // Explicit schema for structured output
    const prompt = `Texto do Usuário: "${sanitizedText}"
    
    Retorne um JSON no seguinte formato (use os IDs de categoria e pagamento se possível):
    {
      "amount": number,
      "description": string,
      "category": string,
      "paymentMethod": string,
      "date": "YYYY-MM-DD",
      "type": "expense" | "income",
      "expenseNature": "fixed" | "variable"
    }`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-flash-lite-latest",
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.1, // Very low for high precision
          responseMimeType: "application/json",
        },
      });

      const resultText = response.text || "{}";
      
      // Safely parse JSON with error handling
      try {
        // Additional sanitization for JSON parsing on iOS
        const cleanJson = resultText.replace(/[\x00-\x1F\x7F]/g, '').trim();
        return JSON.parse(cleanJson);
      } catch (parseError: any) {
        console.error("Failed to parse AI JSON response:", resultText);
        console.error("Parse error details:", parseError.message);
        return null;
      }
    } catch (aiError: any) {
      console.error("AI generation error:", aiError);
      throw aiError;
    }
  } catch (outerError: any) {
    console.error("Critical error in extractTransactionFromText:", outerError);
    console.error("Error stack:", outerError.stack);
    throw new Error(`Extraction failed: ${outerError.message || 'Unknown error'}`);
  }
}
