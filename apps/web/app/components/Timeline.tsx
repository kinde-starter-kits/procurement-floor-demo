'use client';

import s from '../app.module.css';
import {dollars} from '@/lib/ceilings';

interface Ev {
  seq: number;
  kind: string;
  payload: Record<string, unknown>;
}

function describe(e: Ev): {text: React.ReactNode; who: string} {
  const p = e.payload;
  const money = (c: unknown) => dollars(typeof c === 'number' ? c : 0);
  switch (e.kind) {
    case 'run.started':
      return {text: <>Run started for the {String(p.requesterRole)} — “{String(p.title)}”</>, who: 'requester'};
    case 'delegation.minted':
      return {text: <>Hop {String(p.hop)}: <em>{String(p.step)}</em> delegation minted</>, who: String(p.step)};
    case 'sourcing.searching':
      return {text: <>Searched suppliers for the requisition</>, who: 'sourcing'};
    case 'sourcing.shortlisted':
      return {
        text: <>Shortlisted {(p.suppliers as {name: string}[] | undefined)?.map((x) => x.name).join(', ')}</>,
        who: 'sourcing'
      };
    case 'handoff':
      return {text: <>{String(p.from)} handed off to {String(p.to)}</>, who: String(p.from)};
    case 'negotiation.quotes_requested':
      return {text: <>Requested opening quotes</>, who: 'negotiation'};
    case 'negotiation.round':
      return {text: <>Negotiation round {String(p.round)}</>, who: 'negotiation'};
    case 'negotiation.ranked':
      return {
        text: <>Ranked winner: {(p.winner as {name: string})?.name} at {money((p.winner as {amountCents: number})?.amountCents)}</>,
        who: 'negotiation'
      };
    case 'ordering.order_placed':
      return {text: <>Order placed: {String(p.supplier)} at {money(p.amountCents)}</>, who: 'ordering'};
    case 'order.denied':
      return {
        text: <>Order denied — {String(p.reason)}, needs {(p.requiredScopes as string[] | undefined)?.join(', ')}</>,
        who: 'ordering'
      };
    case 'run.completed':
      return {text: <>Run complete</>, who: 'ordering'};
    case 'run.terminated':
      return {text: <>Run terminated — {String(p.reason)}</>, who: 'ordering'};
    case 'run.failed':
      return {text: <>Run failed — {String(p.reason)}</>, who: ''};
    default:
      return {text: <>{e.kind}</>, who: ''};
  }
}

export function Timeline({events}: {events: Ev[]}) {
  return (
    <section className={s.timeline} aria-label="Run timeline">
      <p className={s.panelTitle}>Timeline — the run as it happens</p>
      {events.length === 0 ? (
        <div className={s.emptyTl}>Events stream here top to bottom once a run starts.</div>
      ) : (
        <div className={s.tlList}>
          {events.map((e) => {
            const d = describe(e);
            const kindClass =
              e.kind === 'order.denied' || e.kind === 'run.terminated' || e.kind === 'run.failed'
                ? s.tlKindDeny
                : e.kind === 'ordering.order_placed' || e.kind === 'run.completed'
                  ? s.tlKindDone
                  : '';
            return (
              <div className={s.tlRow} key={e.seq}>
                <span className={s.tlSeq}>{String(e.seq).padStart(2, '0')}</span>
                <span className={`${s.tlKind} ${kindClass}`}>{e.kind}</span>
                <span className={s.tlText}>{d.text}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
