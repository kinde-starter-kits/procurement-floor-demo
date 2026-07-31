'use client';

import s from '../app.module.css';
import {approvalCeilingCents, ceilingLabel, dollars, scopeChip} from '@/lib/ceilings';

interface Hop {
  hop: number;
  subject: string;
  scopes: string[];
}
interface Verdict {
  status: 'pending' | 'placed' | 'denied';
  amountCents: number | null;
  supplier?: string;
  reason?: string;
  requiredScopes?: string[];
  correlationId?: string;
}

export function DelegationChain({
  mode,
  requesterRole,
  requesterScopes,
  chain,
  verdict
}: {
  mode: 'broken' | 'attenuated' | undefined;
  requesterRole: string | undefined;
  requesterScopes: string[];
  chain: Hop[];
  verdict: Verdict;
}) {
  const sub =
    mode === 'attenuated'
      ? 'Each hop’s scopes are the requester’s scopes intersected with the agent’s. Scopes can only narrow down the chain.'
      : mode === 'broken'
        ? 'Each hop is granted the scopes its task needs, not bounded by the requester. Scopes can widen down the chain.'
        : 'Each hop holds a subset of scopes. The approval ceiling is the largest order that hop can place.';

  return (
    <section className={s.chain} aria-label="Delegation chain">
      <div className={s.chainHead}>
        <h2 className={s.chainTitle}>The delegation chain</h2>
      </div>
      <p className={s.chainSub}>{sub}</p>

      {chain.length === 0 && requesterRole === undefined ? (
        <div className={s.emptyChain}>No run yet. Pick a role, choose a requisition, and start a run.</div>
      ) : (
        <div className={s.rail}>
          {/* root: the human who started the run */}
          {requesterRole && (
            <div className={s.hop}>
              <div className={`${s.hopDot} ${s.hopDotRoot}`} />
              <div className={s.hopHead}>
                <span className={s.hopStep}>{requesterRole}</span>
                <span className={s.hopWho}>started the run</span>
                <span className={s.hopCeil}>{ceilingLabel(requesterScopes)}</span>
              </div>
              <div className={s.scopeRow}>
                {requesterScopes.map((sc) => {
                  const c = scopeChip(sc);
                  return (
                    <span key={sc} className={`${s.chip} ${c.kind === 'order' ? s.chipOrder : ''}`}>
                      {c.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {chain.map((h) => {
            const isOrdering = h.subject === 'ordering';
            const grew = h.scopes.filter((sc) => !requesterScopes.includes(sc));
            const dotClass =
              isOrdering && verdict.status === 'denied'
                ? s.hopDotLeak
                : isOrdering && verdict.status === 'placed'
                  ? s.hopDotHold
                  : mode === 'attenuated'
                    ? s.hopDotHold
                    : mode === 'broken'
                      ? s.hopDotLeak
                      : '';
            return (
              <div className={s.hop} key={h.hop}>
                <div className={`${s.hopDot} ${dotClass}`} />
                <div className={s.hopHead}>
                  <span className={s.hopStep}>{h.subject}</span>
                  <span className={s.hopWho}>hop {h.hop}</span>
                  <span className={s.hopCeil}>{ceilingLabel(h.scopes)}</span>
                </div>
                <div className={s.scopeRow}>
                  {h.scopes.map((sc) => {
                    const c = scopeChip(sc);
                    const isNew = mode === 'broken' && grew.includes(sc);
                    return (
                      <span
                        key={sc}
                        className={`${s.chip} ${c.kind === 'order' ? s.chipOrder : ''} ${isNew ? s.chipNew : ''}`}
                      >
                        {c.label}
                      </span>
                    );
                  })}
                  {h.scopes.length === 0 && <span className={s.chip}>no authority</span>}
                </div>

                {isOrdering && <VerdictCard verdict={verdict} chainScopes={h.scopes} />}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function VerdictCard({verdict, chainScopes}: {verdict: Verdict; chainScopes: string[]}) {
  const ceiling = approvalCeilingCents(chainScopes);
  if (verdict.status === 'pending') {
    return (
      <div className={`${s.verdict} ${s.verdictPending}`}>
        <div className={s.verdictStamp}>Placing order…</div>
      </div>
    );
  }
  if (verdict.status === 'placed') {
    return (
      <div className={`${s.verdict} ${s.verdictApproved}`}>
        <div className={`${s.verdictStamp} ${s.stampApproved}`}>● Approved</div>
        <div className={s.verdictLine}>
          {verdict.supplier} at <b>{dollars(verdict.amountCents)}</b> — within the chain’s ceiling.
        </div>
      </div>
    );
  }
  return (
    <div className={`${s.verdict} ${s.verdictDenied}`}>
      <div className={`${s.verdictStamp} ${s.stampDenied}`}>● Denied</div>
      <div className={s.verdictLine}>
        This chain can approve up to <b>{dollars(ceiling)}</b>, this order is{' '}
        <b>{dollars(verdict.amountCents)}</b>.
      </div>
      <div className={s.verdictMeta}>
        {verdict.reason} · needs {(verdict.requiredScopes ?? []).map((r) => scopeChip(r).label).join(', ')}
        {verdict.correlationId ? ` · ${verdict.correlationId.slice(0, 8)}` : ''}
      </div>
    </div>
  );
}
