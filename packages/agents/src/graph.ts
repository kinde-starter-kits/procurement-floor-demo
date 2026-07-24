import {Annotation, END, START, StateGraph} from '@langchain/langgraph';
import {retry} from '@trigger.dev/sdk/v3';
import type {SupplierMatch} from '@procurement-floor/api-client';
import {openSession} from './floor.js';
import {reviseOffer} from './negotiation-strategy.js';

export interface Requisition {
  requisitionId: string;
  title: string;
  description: string;
  budgetCents: number;
}

interface QuoteWork {
  quoteId: string;
  supplierId: string;
  name: string;
  amountCents: number;
  round: number;
}

interface OrderResult {
  orderId: string;
  supplier: string;
  amountCents: number;
}

const State = Annotation.Root({
  requisition: Annotation<Requisition>(),
  runId: Annotation<string>(),
  delegation: Annotation<string>(),
  baseUrl: Annotation<string>(),
  shortlist: Annotation<SupplierMatch[]>({reducer: (_a, b) => b, default: () => []}),
  quotes: Annotation<QuoteWork[]>({reducer: (_a, b) => b, default: () => []}),
  winner: Annotation<QuoteWork | null>({reducer: (_a, b) => b, default: () => null}),
  order: Annotation<OrderResult | null>({reducer: (_a, b) => b, default: () => null}),
  // Each node records the subject its own token resolved to.
  subjects: Annotation<Record<string, string>>({
    reducer: (a, b) => ({...a, ...b}),
    default: () => ({})
  })
});

// Deterministic pricing — no randomness, no model call.
function hashString(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
function initialAmount(budgetCents: number, supplierId: string): number {
  const factor = 0.9 + (hashString(supplierId) % 8) / 100; // 0.90 .. 0.97
  return Math.round(budgetCents * factor);
}

async function sourcingNode(state: typeof State.State) {
  const {client, subject} = await openSession('sourcing', state.delegation, state.baseUrl);
  await client.writeEvent('sourcing.searching', {query: state.requisition.description});

  const matches = await client.searchSuppliers(state.requisition.description, 5);
  const shortlist = matches.slice(0, 3);
  await client.writeEvent('sourcing.shortlisted', {
    suppliers: shortlist.map((s) => ({name: s.name, supplierId: s.supplierId, score: s.score}))
  });
  await client.writeEvent('handoff', {
    from: 'sourcing',
    to: 'negotiation',
    shortlist: shortlist.map((s) => s.name)
  });

  return {shortlist, subjects: {sourcing: subject}};
}

async function negotiationNode(state: typeof State.State) {
  const {client, subject} = await openSession('negotiation', state.delegation, state.baseUrl);
  const {requisitionId, budgetCents} = state.requisition;

  // Round 1: request an initial quote from each shortlisted supplier.
  let quotes: QuoteWork[] = [];
  for (const s of state.shortlist) {
    const amountCents = initialAmount(budgetCents, s.supplierId);
    const {quoteId} = await client.createQuote({
      requisitionId,
      supplierId: s.supplierId,
      amountCents,
      terms: 'net-30',
      round: 1,
      status: 'submitted'
    });
    quotes.push({quoteId, supplierId: s.supplierId, name: s.name, amountCents, round: 1});
  }
  await client.writeEvent('negotiation.quotes_requested', {
    round: 1,
    offers: quotes.map((q) => ({name: q.name, amountCents: q.amountCents}))
  });

  // Rounds 2..3: each revision is a separate retryable step.
  for (let round = 2; round <= 3; round++) {
    quotes = await retry.onThrow(
      async () => {
        const revised: QuoteWork[] = [];
        for (const q of quotes) {
          const amountCents = await reviseOffer(q.amountCents, {
            round,
            supplierName: q.name,
            requisitionTitle: state.requisition.title
          });
          const {quoteId} = await client.createQuote({
            requisitionId,
            supplierId: q.supplierId,
            amountCents,
            terms: 'net-30',
            round,
            status: 'revised'
          });
          revised.push({...q, quoteId, amountCents, round});
        }
        await client.recordNegotiationRound({
          requisitionId,
          round,
          summary: `Round ${round}: revised offers from ${revised.length} suppliers`,
          startedAt: Date.now()
        });
        await client.writeEvent('negotiation.round', {
          round,
          offers: revised.map((q) => ({name: q.name, amountCents: q.amountCents}))
        });
        return revised;
      },
      {maxAttempts: 3}
    );
  }

  // Rank: lowest final offer wins.
  const winner = quotes.reduce((best, q) => (q.amountCents < best.amountCents ? q : best));
  await client.writeEvent('negotiation.ranked', {
    winner: {name: winner.name, amountCents: winner.amountCents, quoteId: winner.quoteId}
  });
  await client.writeEvent('handoff', {from: 'negotiation', to: 'ordering', winner: winner.name});

  return {quotes, winner, subjects: {negotiation: subject}};
}

async function orderingNode(state: typeof State.State) {
  const {client, subject} = await openSession('ordering', state.delegation, state.baseUrl);
  const winner = state.winner;
  if (!winner) throw new Error('ordering: no winner to place');

  const {orderId} = await client.placeOrder({
    requisitionId: state.requisition.requisitionId,
    quoteId: winner.quoteId,
    amountCents: winner.amountCents,
    placedByAgent: 'ordering',
    status: 'placed',
    correlationId: state.runId
  });
  await client.writeEvent('ordering.order_placed', {
    orderId,
    supplier: winner.name,
    amountCents: winner.amountCents
  });
  await client.writeEvent('run.completed', {orderId});

  return {
    order: {orderId, supplier: winner.name, amountCents: winner.amountCents},
    subjects: {ordering: subject}
  };
}

export function buildGraph() {
  return new StateGraph(State)
    .addNode('sourcing', sourcingNode)
    .addNode('negotiation', negotiationNode)
    .addNode('ordering', orderingNode)
    .addEdge(START, 'sourcing')
    .addEdge('sourcing', 'negotiation')
    .addEdge('negotiation', 'ordering')
    .addEdge('ordering', END)
    .compile();
}

export type GraphResult = typeof State.State;
