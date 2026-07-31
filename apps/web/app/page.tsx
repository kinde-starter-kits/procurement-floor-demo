'use client';

import {useEffect, useMemo, useState} from 'react';
import {useQuery} from 'convex/react';
import {api} from '@/convex/_generated/api';
import s from './app.module.css';
import {dollars} from '@/lib/ceilings';
import {DelegationChain} from './components/DelegationChain';
import {Timeline} from './components/Timeline';

type Role = 'requester' | 'buyer' | 'director';

const ROLE_INFO: {role: Role; name: string; can: string; ceiling: number | null}[] = [
  {role: 'requester', name: 'Requester', can: 'Reads procurement and requests quotes. No ordering authority.', ceiling: 0},
  {role: 'buyer', name: 'Buyer', can: 'Also negotiates. Approves orders up to $50,000.', ceiling: 5_000_000},
  {role: 'director', name: 'Director', can: 'Also approves orders up to $250,000 and above.', ceiling: null}
];

const PRESETS = [
  {
    name: 'Cold-chain vaccine distribution',
    budgetCents: 20_000_000,
    description:
      'We need a logistics partner to move temperature-sensitive vaccine shipments and keep them refrigerated in transit across our regional distribution network.'
  },
  {
    name: 'Structural steel for a bridge span',
    budgetCents: 6_000_000,
    description:
      'Heavy structural steel fabrication and welded plate girders for a new bridge span, delivered and erected on site.'
  },
  {
    name: 'Data-center server refresh',
    budgetCents: 40_000_000,
    description:
      'Enterprise servers, storage arrays and network switching for a data-center refresh, with staging and structured cabling.'
  }
];

interface Requester {
  role: Role | 'custom';
  source: 'guest' | 'kinde';
  scopes: string[];
}

export default function Home() {
  const modeResult = useQuery(api.config.mode);
  const mode = modeResult?.mode;

  const [requester, setRequester] = useState<Requester | null>(null);
  const [preset, setPreset] = useState(0);
  const [title, setTitle] = useState(PRESETS[0].name);
  const [description, setDescription] = useState(PRESETS[0].description);
  const [budget, setBudget] = useState(String(PRESETS[0].budgetCents / 100));
  const [byok, setByok] = useState({baseUrl: '', apiKey: '', model: ''});
  const [run, setRun] = useState<{runId: string; orgCode: string} | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSession() {
    const r = await fetch('/api/session').then((x) => x.json());
    setRequester(r.requester ?? null);
  }
  useEffect(() => {
    loadSession();
  }, []);

  async function pickRole(role: Role) {
    await fetch('/api/guest/switch', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({role})
    });
    await loadSession();
  }

  function pickPreset(i: number) {
    setPreset(i);
    setTitle(PRESETS[i].name);
    setDescription(PRESETS[i].description);
    setBudget(String(PRESETS[i].budgetCents / 100));
  }

  async function startRun() {
    setStarting(true);
    setError(null);
    setRun(null);
    const byokReady = byok.baseUrl && byok.apiKey && byok.model;
    const res = await fetch('/api/runs/trigger', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        title,
        description,
        budgetCents: Math.round(Number(budget) * 100),
        byok: byokReady ? byok : undefined
      })
    });
    const j = await res.json();
    if (j.runId) setRun({runId: j.runId, orgCode: j.orgCode});
    else setError(j.error ?? 'Could not start the run.');
    setStarting(false);
  }

  const eventsRaw = useQuery(
    api.events.listByRun,
    run ? {orgCode: run.orgCode, runId: run.runId} : 'skip'
  );
  // Stabilize the array identity so the `?? []` fallback doesn't change the
  // useMemo deps (below) on every render.
  const events = useMemo(() => eventsRaw ?? [], [eventsRaw]);
  const chain =
    useQuery(api.delegations.listByRun, run ? {orgCode: run.orgCode, runId: run.runId} : 'skip') ?? [];

  const started = events.find((e) => e.kind === 'run.started');
  const requesterRole = (started?.payload as {requesterRole?: string} | undefined)?.requesterRole;
  const requesterScopes =
    (started?.payload as {requesterScopes?: string[]} | undefined)?.requesterScopes ?? [];

  const verdict = useMemo(() => computeVerdict(events), [events]);
  const failure = (events.find((e) => e.kind === 'run.failed')?.payload as {reason?: string} | undefined)
    ?.reason;

  return (
    <main className={s.shell}>
      <header className={s.header}>
        <div>
          <div className={s.brandRow}>
            <span className={s.brandMark}>Procurement Floor</span>
          </div>
          <h1 className={s.brand}>Delegated authority in an agent run</h1>
          <p className={s.tagline}>
            A person starts a run and agents act on their behalf. Each hop in the delegation chain
            carries a subset of the requester’s scopes, shown as the largest order it can approve.
            Attenuated mode intersects each hop with the requester, so authority only narrows. Broken
            mode grants each hop the scopes its task needs, so authority can widen past the requester.
          </p>
        </div>
        <ModeBadge mode={mode} />
      </header>

      <div className={s.grid}>
        <aside className={s.aside}>
          <div className={s.panel}>
            <p className={s.panelTitle}>Act as</p>
            <div className={s.roles}>
              {ROLE_INFO.map((r) => (
                <button
                  key={r.role}
                  className={`${s.role} ${requester?.role === r.role ? s.roleActive : ''}`}
                  onClick={() => pickRole(r.role)}
                >
                  <span className={s.roleName}>
                    {r.name}
                    <span className={s.roleCeil}>
                      {r.ceiling === 0 ? 'no approvals' : `up to ${dollars(r.ceiling)}`}
                    </span>
                  </span>
                  <span className={s.roleCan}>{r.can}</span>
                </button>
              ))}
            </div>
            {/* /api/auth/login is a Kinde route handler (server redirect to
                Kinde), not a Next page — next/link is not appropriate here, so a
                plain anchor is correct and the page-link rule is disabled. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className={s.kindeLink} href="/api/auth/login">
              or <u>sign in with Kinde</u> for real →
            </a>
          </div>

          <div className={s.panel}>
            <p className={s.panelTitle}>Requisition</p>
            <div className={s.presets}>
              {PRESETS.map((p, i) => (
                <button
                  key={p.name}
                  className={`${s.preset} ${preset === i ? s.presetActive : ''}`}
                  onClick={() => pickPreset(i)}
                >
                  <span className={s.presetName}>{p.name}</span>
                  <span className={s.presetBudget}>{dollars(p.budgetCents)}</span>
                </button>
              ))}
            </div>

            <div className={s.field}>
              <label className={s.label}>Plain-language brief</label>
              <textarea
                className={s.textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className={s.field}>
              <label className={s.label}>Budget (USD)</label>
              <input className={s.input} value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>

            <details className={s.byok}>
              <summary className={s.byokSummary}>Bring your own model (optional)</summary>
              <div className={s.byokBody}>
                <p className={s.byokNote}>
                  Leave blank for the deterministic path — it always runs with no key. Supply an
                  OpenAI-compatible endpoint to let a real model drive the negotiation.
                </p>
                <div className={s.field}>
                  <input
                    className={s.input}
                    placeholder="Base URL (e.g. https://api.openai.com/v1)"
                    value={byok.baseUrl}
                    onChange={(e) => setByok({...byok, baseUrl: e.target.value})}
                  />
                </div>
                <div className={s.field}>
                  <input
                    className={s.input}
                    placeholder="API key"
                    value={byok.apiKey}
                    onChange={(e) => setByok({...byok, apiKey: e.target.value})}
                  />
                </div>
                <div className={s.field}>
                  <input
                    className={s.input}
                    placeholder="Model (e.g. gpt-4o-mini)"
                    value={byok.model}
                    onChange={(e) => setByok({...byok, model: e.target.value})}
                  />
                </div>
              </div>
            </details>

            <button className={s.startBtn} onClick={startRun} disabled={!requester || starting}>
              {starting ? 'Starting…' : 'Start run'}
            </button>
            {!requester && <p className={s.hint}>Pick a role to start.</p>}
            {error && <p className={s.hint}>{error === 'pick_a_role' ? 'Pick a role to start.' : error}</p>}
          </div>
        </aside>

        <div className={s.main}>
          {failure && (
            <div className={s.failBanner} role="alert">
              <strong>This run couldn’t proceed.</strong> {failure}
            </div>
          )}
          <DelegationChain
            mode={mode}
            requesterRole={requesterRole ?? (run ? undefined : requester?.role)}
            requesterScopes={run ? requesterScopes : (requester?.scopes ?? [])}
            chain={chain}
            verdict={verdict}
          />
          <Timeline events={events} />
        </div>
      </div>
    </main>
  );
}

function ModeBadge({mode}: {mode: 'broken' | 'attenuated' | undefined}) {
  const isAtt = mode === 'attenuated';
  return (
    <div className={s.modeBadge}>
      <div className={s.modeTop}>
        <span
          className={s.modeDot}
          style={{color: mode ? (isAtt ? 'var(--ok)' : 'var(--bad)') : 'var(--text-faint)'}}
        />
        <span className={`${s.modeLabel} ${isAtt ? s.modeAttenuated : mode ? s.modeBroken : ''}`}>
          {mode ? (isAtt ? 'Attenuated' : 'Broken') : '…'}
        </span>
      </div>
      <div className={s.modeNote}>
        {isAtt
          ? 'Hops are intersected with the requester. Authority only narrows.'
          : mode
            ? 'Hops are granted to fit the task. Authority can widen past the requester.'
            : 'Reading mode from the server.'}
      </div>
      <div className={s.modeNote}>AUTHZ_MODE · read server-side, not a toggle</div>
    </div>
  );
}

function computeVerdict(events: {kind: string; payload: Record<string, unknown>}[]) {
  const ranked = events.find((e) => e.kind === 'negotiation.ranked');
  const started = events.find((e) => e.kind === 'run.started');
  const amountFromRanked = (ranked?.payload.winner as {amountCents?: number} | undefined)?.amountCents;
  const amountFromBudget = ((started?.payload.budgetCents as number | undefined) ?? 0) * 0.71;
  const amountCents = amountFromRanked ?? Math.round(amountFromBudget) ?? null;

  const denied = events.find((e) => e.kind === 'order.denied');
  if (denied) {
    return {
      status: 'denied' as const,
      amountCents,
      reason: String(denied.payload.reason),
      requiredScopes: (denied.payload.requiredScopes as string[] | undefined) ?? [],
      correlationId: String(denied.payload.correlationId ?? '')
    };
  }
  const placed = events.find((e) => e.kind === 'ordering.order_placed');
  if (placed) {
    return {
      status: 'placed' as const,
      amountCents: (placed.payload.amountCents as number) ?? amountCents,
      supplier: String(placed.payload.supplier ?? 'the winning supplier')
    };
  }
  return {status: 'pending' as const, amountCents};
}
