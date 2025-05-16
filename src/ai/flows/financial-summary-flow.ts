
'use server';
/**
 * @fileOverview Um fluxo Genkit para gerar um resumo financeiro e insights.
 *
 * - generateFinancialSummary - Uma função que lida com a geração do resumo financeiro.
 * - FinancialSummaryInput - O tipo de entrada para a função generateFinancialSummary.
 * - FinancialSummaryOutput - O tipo de retorno para a função generateFinancialSummary.
 */

import {ai} from '@/ai/genkit';
import type { Transaction } from '@/types'; // CategoryName import removed as TransactionSchema uses string
import {z} from 'genkit';

// Definição do esquema de transação para Genkit (simplificado)
const TransactionSchema = z.object({
  id: z.string(),
  date: z.string().describe("Data da transação no formato YYYY-MM-DD"),
  description: z.string(),
  amount: z.number(),
  type: z.enum(['income', 'expense']),
  category: z.string().describe("Nome da categoria em inglês"),
  paymentMethod: z.string().optional(),
  installments: z.number().optional(),
  isRecurring: z.boolean().optional(),
  expenseNature: z.enum(['fixed', 'variable']).optional().describe("Natureza da despesa (fixa ou variável)"),
});

const FinancialSummaryInputSchema = z.object({
  transactionsForMonth: z.array(TransactionSchema).describe("Uma lista de transações para o mês especificado."),
  budgetsForMonth: z.record(z.string(), z.number()).optional().describe("Orçamentos definidos para cada categoria no mês. Chave é o nome da categoria em inglês, valor é o montante orçado."),
  monthYearLabel: z.string().describe("Rótulo do mês e ano para o qual o resumo está sendo gerado (ex: 'Maio 2025').")
});
export type FinancialSummaryInput = z.infer<typeof FinancialSummaryInputSchema>;

const FinancialSummaryOutputSchema = z.object({
  overallStatus: z.string().describe("Uma breve avaliação geral da saúde financeira do usuário para o mês."),
  keyObservations: z.array(z.string()).describe("Uma lista de 2-4 observações importantes sobre os gastos, receitas, comparação com orçamento (se disponível), e gastos fixos vs. variáveis."),
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
  prompt: `Você é um consultor financeiro amigável e prestativo. Analise os seguintes dados financeiros para {{monthYearLabel}} em português brasileiro.

Transações do Mês:
{{#if transactionsForMonth.length}}
  {{#each transactionsForMonth}}
  - {{this.description}}: {{this.amount}} (tipo: {{this.type}}, categoria: {{this.category}}, data: {{this.date}}{{#if this.expenseNature}}, natureza: {{this.expenseNature}}{{/if}})
  {{/each}}
{{else}}
  Nenhuma transação registrada para este mês.
{{/if}}

{{#if budgetsForMonth}}
Orçamentos Definidos para o Mês:
  {{#each budgetsForMonth as |budgetAmount categoryName|}}
  - Categoria {{categoryName}}: Orçado {{budgetAmount}}
  {{/each}}
{{else}}
  Nenhum orçamento específico foi fornecido para este mês.
{{/if}}

Com base nesses dados, forneça um resumo conciso, incluindo:
1.  **Status Geral**: Uma avaliação geral da saúde financeira do usuário para o mês (ex: gastos saudáveis, potencial para economizar, atenção aos gastos elevados, etc.).
2.  **Observações Chave**: 2 a 4 observações importantes. Inclua:
    *   Qual foi a maior despesa?
    *   As receitas cobriram as despesas?
    *   Categorias com gastos significativos.
    *   {{#if budgetsForMonth}}Compare os gastos com os orçamentos para as categorias relevantes. Destaque onde o gasto excedeu ou ficou abaixo do orçamento.{{else}}Como não foram fornecidos orçamentos, concentre-se nos padrões de gastos.{{/if}}
    *   Resuma os gastos entre fixos e variáveis, se os dados de 'natureza' da despesa estiverem presentes nas transações.
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
    const {output} = await prompt(input);
    if (!output) {
      return {
        overallStatus: "Não foi possível gerar o resumo financeiro neste momento.",
        keyObservations: ["Verifique os dados fornecidos ou tente novamente mais tarde."],
        actionableAdvice: []
      };
    }
    return output;
  }
);

