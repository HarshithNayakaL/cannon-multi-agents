import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import type { AgentDefinition } from '@/lib/agents/types';
import type { CannonStore } from '@/lib/db/types';
import {
  EXPENSE_CATEGORIES,
  normalizeCategory,
  summarizeSpending,
} from '@/lib/agents/finance/logic';
import type { ExpenseLoggedResult } from '@/lib/agents/tool-results';
import { ingest } from '@/lib/rag/retrieve';
import { daysAgoISO, today } from '@/lib/utils';

const SYSTEM_PROMPT = `You are the Finance Agent inside Cannon, Harshith's personal multi-agent assistant.

SCOPE
Expense capture, spending patterns and budget awareness. You are not a financial
adviser. Do not recommend investments, products or tax positions — flag and defer.

DATA
You have retrieval over Harshith's own logged spend. Check the tools before
commenting on any pattern. Never estimate a total you were not given.

TOOLS
- log_expense: record a spend the moment it is described in the past tense.
- get_spending_summary: pull real totals before commenting on a trend or budget.

STYLE
Plain and unsentimental. Lead with the number, then the observation. No shaming,
no cheerleading, no budgeting platitudes. Under six lines unless asked for detail.`;

function buildTools(store: CannonStore): ToolSet {
  return {
    log_expense: tool({
      description: 'Record a completed spend. Use for anything described in the past tense.',
      inputSchema: z.object({
        merchant: z.string().min(1).max(120).describe('Where the money went.'),
        amount: z.number().min(0).max(1_000_000),
        category: z
          .enum(EXPENSE_CATEGORIES)
          .default('other')
          .describe('Best-fit bucket for this spend.'),
        note: z.string().nullable().default(null),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .default(null)
          .describe('ISO date. Defaults to today when omitted.'),
      }),
      execute: async ({ merchant, amount, category, note, date }): Promise<ExpenseLoggedResult> => {
        const expense = await store.logExpense({
          date: date ?? today(),
          merchant,
          amount,
          category: normalizeCategory(category),
          note,
        });

        const monthToDate = (await store.listExpenses({ since: daysAgoISO(30) })).reduce(
          (sum, entry) => sum + entry.amount,
          0,
        );

        // Every logged spend also becomes retrievable context.
        await ingest(
          store,
          'finance',
          `${expense.date} — ${merchant} ${amount} (${expense.category})${note ? `. ${note}` : ''}`,
          { source: 'expense-log', date: expense.date, category: expense.category },
        );

        return {
          kind: 'expense-logged',
          expense,
          monthToDate: Math.round(monthToDate * 100) / 100,
        };
      },
    }),

    get_spending_summary: tool({
      description:
        'Compute real spend totals and category breakdown over a window. Call before any trend claim.',
      inputSchema: z.object({
        rangeDays: z.number().int().min(1).max(365).default(30),
        category: z.enum(EXPENSE_CATEGORIES).nullable().default(null),
        budget: z
          .number()
          .min(0)
          .nullable()
          .default(null)
          .describe('Budget for the window, when the user states one.'),
      }),
      execute: async ({ rangeDays, category, budget }) => {
        const expenses = await store.listExpenses({
          since: daysAgoISO(rangeDays),
          category: category ?? undefined,
        });
        return summarizeSpending(expenses, rangeDays, budget);
      },
    }),
  };
}

export const financeAgent: AgentDefinition = {
  id: 'finance',
  name: 'Finance',
  title: 'Finance Agent',
  tagline: 'Spend capture, category patterns, budget reality',
  accent: '#32d583',
  accentSoft: 'rgba(50, 213, 131, 0.14)',
  systemPrompt: SYSTEM_PROMPT,
  ragSources: ['expense-log'],
  toolSummaries: [
    {
      name: 'log_expense',
      description: 'Records a spend and re-embeds it for retrieval.',
      signature: 'log_expense(merchant, amount, category, note?, date?)',
    },
    {
      name: 'get_spending_summary',
      description: 'Totals, daily average, category split and budget usage.',
      signature: 'get_spending_summary(rangeDays = 30, category?, budget?)',
    },
  ],
  suggestions: [
    'Spent 840 at BigBasket on groceries',
    "What's my spend over the last 30 days?",
    'How much is going to subscriptions?',
    'Am I under 20000 this month?',
  ],
  keywords: [
    'spend',
    'spent',
    'expense',
    'cost',
    'budget',
    'money',
    'paid',
    'bill',
    'subscription',
    'salary',
    'rent',
    'invoice',
    'price',
    'saving',
    'burn',
  ],
  custom: false,
  buildTools,
};
