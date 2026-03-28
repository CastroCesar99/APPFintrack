import { NextRequest, NextResponse } from 'next/server';
import { generateFinancialInsights } from '@/lib/ai';

export async function POST(req: NextRequest) {
  try {
    const { transactions, budgets, language, monthYear } = await req.json();

    if (!transactions || !monthYear) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    const insights = await generateFinancialInsights(
      transactions,
      budgets || [],
      language || 'pt',
      monthYear
    );

    return NextResponse.json({ insights });
  } catch (error: any) {
    console.error('API /insights error:', error);
    const message = error?.message || 'Failed to generate insights.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
