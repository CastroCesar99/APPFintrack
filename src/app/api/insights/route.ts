import { NextRequest, NextResponse } from 'next/server';
import { generateFinancialInsights } from '@/lib/ai';

// Local fallback: generates insights from the data without AI
function generateLocalInsights(
  transactions: any[],
  budgets: Record<string, number>,
  language: 'en' | 'pt',
  monthYear: string
): string {
  const isPt = language === 'pt';
  const expenses = transactions.filter((t: any) => t.type === 'expense');
  const income = transactions.filter((t: any) => t.type === 'income');

  const totalExpenses = expenses.reduce((s: number, t: any) => s + t.amount, 0);
  const totalIncome = income.reduce((s: number, t: any) => s + t.amount, 0);
  const balance = totalIncome - totalExpenses;

  // Top spending category
  const byCategory: Record<string, number> = {};
  expenses.forEach((t: any) => {
    byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
  });
  const sortedCats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const topCat = sortedCats[0];

  // Budget analysis
  const budgetEntries = Object.entries(budgets || {});
  const overBudget = budgetEntries.filter(([cat, limit]) => (byCategory[cat] || 0) > limit);
  const underBudget = budgetEntries.filter(([cat, limit]) => (byCategory[cat] || 0) <= limit && (byCategory[cat] || 0) > 0);

  const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
  const lines: string[] = [];

  // Overview paragraph
  if (totalIncome === 0 && totalExpenses === 0) {
    return isPt
      ? `**Resumo de ${monthYear}**\n\nNenhuma transação registrada neste período. Comece adicionando suas receitas e despesas para obter insights personalizados!`
      : `**${monthYear} Summary**\n\nNo transactions recorded in this period. Start adding your income and expenses to get personalized insights!`;
  }

  lines.push(isPt
    ? `**📊 Resumo da Athena — ${monthYear}**`
    : `**📊 Athena's Summary — ${monthYear}**`);

  lines.push('');

  if (totalIncome > 0) {
    lines.push(isPt
      ? `💰 **Receita total:** ${fmt(totalIncome)}`
      : `💰 **Total income:** ${fmt(totalIncome)}`);
  }
  lines.push(isPt
    ? `💸 **Despesa total:** ${fmt(totalExpenses)}`
    : `💸 **Total expenses:** ${fmt(totalExpenses)}`);

  if (balance >= 0) {
    lines.push(isPt
      ? `✅ **Saldo positivo:** ${fmt(balance)} — Ótimo trabalho! Você gastou menos do que ganhou.`
      : `✅ **Positive balance:** ${fmt(balance)} — Great job! You spent less than you earned.`);
  } else {
    lines.push(isPt
      ? `⚠️ **Saldo negativo:** ${fmt(Math.abs(balance))} — Suas despesas superaram a receita este mês.`
      : `⚠️ **Negative balance:** ${fmt(Math.abs(balance))} — Your expenses exceeded income this month.`);
  }

  lines.push('');
  lines.push(isPt ? '**🔍 Observações principais:**' : '**🔍 Key observations:**');

  if (topCat) {
    lines.push(isPt
      ? `- Sua maior categoria de gasto foi **${topCat[0]}** com ${fmt(topCat[1])} (${Math.round((topCat[1] / totalExpenses) * 100)}% do total).`
      : `- Your top spending category was **${topCat[0]}** with ${fmt(topCat[1])} (${Math.round((topCat[1] / totalExpenses) * 100)}% of total).`);
  }

  if (overBudget.length > 0) {
    const names = overBudget.map(([cat]) => cat).join(', ');
    lines.push(isPt
      ? `- ⛔ Orçamento ultrapassado em: **${names}**`
      : `- ⛔ Budget exceeded in: **${names}**`);
  }

  if (underBudget.length > 0) {
    lines.push(isPt
      ? `- ✅ Você ficou dentro do orçamento em ${underBudget.length} categoria(s).`
      : `- ✅ You stayed within budget in ${underBudget.length} category(ies).`);
  }

  if (sortedCats.length > 1) {
    lines.push(isPt
      ? `- Você teve gastos em **${sortedCats.length} categorias** diferentes.`
      : `- You had spending across **${sortedCats.length} different categories**.`);
  }

  lines.push('');
  lines.push(isPt ? '**💡 Dica para o próximo mês:**' : '**💡 Tip for next month:**');

  if (balance < 0) {
    lines.push(isPt
      ? `- Tente reduzir os gastos em **${topCat?.[0] || 'suas principais categorias'}** para equilibrar o orçamento.`
      : `- Try reducing spending on **${topCat?.[0] || 'your main categories'}** to balance your budget.`);
  } else if (overBudget.length > 0) {
    lines.push(isPt
      ? `- Revise o orçamento de **${overBudget[0][0]}** ou reduza os gastos nessa categoria.`
      : `- Review the budget for **${overBudget[0][0]}** or reduce spending in that category.`);
  } else {
    const savingsRate = totalIncome > 0 ? ((balance / totalIncome) * 100).toFixed(0) : 0;
    lines.push(isPt
      ? `- Continue assim! Você economizou ${savingsRate}% da sua renda. Considere investir esse valor.`
      : `- Keep it up! You saved ${savingsRate}% of your income. Consider investing this amount.`);
  }

  lines.push('');
  lines.push(isPt
    ? `> _Análise gerada localmente. Configure a chave Gemini para que a Athena use IA real._`
    : `> _Analysis generated locally. Configure the Gemini key for Athena to use real AI._`);

  return lines.join('\n');
}

export async function POST(req: NextRequest) {
  let language: 'en' | 'pt' = 'pt';
  try {
    const body = await req.json();
    const { transactions, budgets, monthYear } = body;
    language = body.language || 'pt';

    if (!transactions || !monthYear) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    try {
      // Try Gemini AI first
      const insights = await generateFinancialInsights(
        transactions,
        budgets || [],
        language,
        monthYear
      );
      return NextResponse.json({ insights });
    } catch (aiError: any) {
      console.error('Gemini AI Error Object:', JSON.stringify(aiError, null, 2));
      
      const rawMessage = aiError?.message || '';
      const rawStringified = JSON.stringify(aiError);
      
      const isQuotaError = rawMessage.includes('429') || 
                           rawStringified.includes('429') ||
                           rawMessage.toLowerCase().includes('quota') || 
                           rawStringified.toLowerCase().includes('quota') ||
                           rawMessage.toLowerCase().includes('resource_exhausted') ||
                           rawStringified.toLowerCase().includes('resource_exhausted');

      // Se for erro de quota, mostrar explicitamente como o usuário pediu
      if (isQuotaError || aiError?.status === 429) {
        console.warn('Quota reached. Returning error message.');
        const quotaMessage = language === 'pt' 
          ? '⚠️ Limite atingido por hoje. O plano gratuito do Gemini foi esgotado. Tente novamente amanhã.'
          : '⚠️ Daily limit reached. Gemini free quota has been exhausted. Please try again tomorrow.';
        return NextResponse.json({ error: quotaMessage }, { status: 429 });
      }

      // Para outros erros (ex: rede), ainda podemos tentar o fallback local se for preferível.
      console.warn('Gemini AI unavailable for other reason, using local fallback.');
      const insights = generateLocalInsights(transactions, budgets || {}, language, monthYear);
      return NextResponse.json({ insights, fallback: true });
    }
  } catch (error: any) {
    console.error('API /insights critical error:', error);
    return NextResponse.json(
      { error: language === 'pt' ? 'Erro ao processar os dados.' : 'Error processing data.' },
      { status: 500 }
    );
  }
}
