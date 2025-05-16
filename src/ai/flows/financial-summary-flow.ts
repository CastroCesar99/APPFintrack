
'use server';
/**
 * @fileOverview Um fluxo Genkit para gerar um resumo financeiro e insights.
 *
 * - generateFinancialSummary - Uma função que lida com a geração do resumo financeiro.
 * - FinancialSummaryInput - O tipo de entrada para a função generateFinancialSummary.
 * - FinancialSummaryOutput - O tipo de retorno para a função generateFinancialSummary.
 */

import {ai} from '@/ai/genkit';
import type { Transaction, CategoryName } from '@/types';
import {z} from 'genkit';

// Definição do esquema de transação para Genkit (simplificado)
const TransactionSchema = z.object({
  id: z.string(),
  date: z.string().describe("Data da transação no formato YYYY-MM-DD"),
  description: z.string(),
  amount: z.number(),
  type: z.enum(['income', 'expense']),
  category: z.string().describe("Nome da categoria em inglês"), // Usando string genérica para categoria
  paymentMethod: z.string().optional(),
  installments: z.number().optional(),
  isRecurring: z.boolean().optional(),
  expenseNature: z.enum(['fixed', 'variable']).optional(),
});

const FinancialSummaryInputSchema = z.object({
  transactionsForMonth: z.array(TransactionSchema).describe("Uma lista de transações para o mês especificado."),
  // budgetsForMonth: z.record(z.nativeEnum(CategoryName), z.number()).optional().describe("Orçamentos definidos para cada categoria no mês. Chave é o nome da categoria, valor é o montante orçado."),
  // A linha acima foi comentada porque CategoryName é um tipo complexo para Zod. Usaremos string por enquanto.
  budgetsForMonth: z.record(z.string(), z.number()).optional().describe("Orçamentos definidos para cada categoria no mês. Chave é o nome da categoria, valor é o montante orçado."),
  monthYearLabel: z.string().describe("Rótulo do mês e ano para o qual o resumo está sendo gerado (ex: 'Maio 2025').")
});
export type FinancialSummaryInput = z.infer<typeof FinancialSummaryInputSchema>;

const FinancialSummaryOutputSchema = z.object({
  overallStatus: z.string().describe("Uma breve avaliação geral da saúde financeira do usuário para o mês."),
  keyObservations: z.array(z.string()).describe("Uma lista de 2-3 observações importantes sobre os gastos ou receitas."),
  actionableAdvice: z.array(z.string()).describe("Uma lista de 1-2 dicas práticas baseadas nos dados."),
});
export type FinancialSummaryOutput = z.infer<typeof FinancialSummaryOutputSchema>;

export async function generateFinancialSummary(input: FinancialSummaryInput): Promise<FinancialSummaryOutput> {
  return financialSummaryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'financialSummaryPrompt',
  input: {schema: FinancialSummaryInputSchema},
  output: {schema: FinancialSummaryOutputSchema},
  prompt: `Você é um consultor financeiro amigável e prestativo. Analise os seguintes dados financeiros para {{monthYearLabel}}.

Transações do Mês:
{{#if transactionsForMonth.length}}
  {{#each transactionsForMonth}}
  - {{this.description}}: {{this.amount}} (tipo: {{this.type}}, categoria: {{this.category}}, data: {{this.date}})
  {{/each}}
{{else}}
  Nenhuma transação registrada para este mês.
{{/if}}

{{#if budgetsForMonth}}
Orçamentos Definidos para o Mês:
  {{#each budgetsForMonth}}
  - Categoria {{../this.key}}: Orçado {{this.value}}
  {{/each}}
{{else}}
  Nenhum orçamento específico foi fornecido para este mês.
{{/if}}

Com base nesses dados, forneça um resumo conciso em português brasileiro, incluindo:
1.  **Status Geral**: Uma avaliação geral da saúde financeira do usuário para o mês (ex: gastos saudáveis, potencial para economizar, atenção aos gastos elevados, etc.).
2.  **Observações Chave**: 2 a 3 observações importantes (ex: qual foi a maior despesa, se as receitas cobriram as despesas, categorias com gastos significativos). Se os orçamentos forem fornecidos, compare os gastos com os orçamentos para as categorias relevantes.
3.  **Conselhos Práticos**: 1 a 2 dicas práticas e acionáveis com base nos dados.

Mantenha uma linguagem positiva e encorajadora. Se não houver transações, mencione isso. Se os dados de orçamento não forem fornecidos, concentre os insights nos padrões de gastos e na relação entre receitas e despesas.
Se não houver dados suficientes para uma análise profunda (ex: poucas transações ou apenas receitas sem despesas), ajuste os insights para serem mais gerais ou focados no que é possível analisar.

Seja breve e direto ao ponto. Formate a saída no esquema JSON especificado.
`,
});

const financialSummaryFlow = ai.defineFlow(
  {
    name: 'financialSummaryFlow',
    inputSchema: FinancialSummaryInputSchema,
    outputSchema: FinancialSummaryOutputSchema,
  },
  async (input) => {
    // Calcular totais aqui se a IA não for fazer isso ou para passar para o prompt de forma mais explícita
    let totalIncome = 0;
    let totalExpenses = 0;
    input.transactionsForMonth.forEach(t => {
      if (t.type === 'income') totalIncome += t.amount;
      else if (t.type === 'expense') totalExpenses += t.amount;
    });

    // Poderíamos adicionar esses totais ao input para o prompt se quiséssemos
    // Por enquanto, o prompt atual pede à IA para derivar isso das transações.

    const {output} = await prompt(input);
    if (!output) {
      // Fallback em caso de falha da IA em gerar o output no formato esperado
      return {
        overallStatus: "Não foi possível gerar o resumo financeiro neste momento.",
        keyObservations: ["Verifique os dados fornecidos ou tente novamente mais tarde."],
        actionableAdvice: []
      };
    }
    return output;
  }
);
