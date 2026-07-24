// Negotiation revision strategy — two paths.
//
// Deterministic (default): a fixed ~4% concession per round. No model call, so
// the demo always runs with no LLM key. This is the path that must always work.
//
// BYOK (optional): when NEGOTIATION_STRATEGY=byok and BYOK_* are set, ask a real
// model (any OpenAI-compatible endpoint) for the revised offer. On ANY error or
// misconfiguration it falls back to deterministic, so a run never depends on it.

export interface RevisionContext {
  round: number;
  supplierName: string;
  requisitionTitle: string;
}

function deterministicRevision(amountCents: number): number {
  return Math.round(amountCents * 0.96);
}

async function byokRevision(amountCents: number, ctx: RevisionContext): Promise<number> {
  const baseUrl = process.env.BYOK_BASE_URL;
  const apiKey = process.env.BYOK_API_KEY;
  const model = process.env.BYOK_MODEL;
  if (!baseUrl || !apiKey || !model) return deterministicRevision(amountCents);

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {'content-type': 'application/json', authorization: `Bearer ${apiKey}`},
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You are a procurement negotiator. Reply with ONLY the revised offer as an integer number of cents, strictly lower than the current offer.'
          },
          {
            role: 'user',
            content: `Round ${ctx.round}. Supplier "${ctx.supplierName}" for "${ctx.requisitionTitle}". Current offer is ${amountCents} cents. Propose a lower revised offer.`
          }
        ]
      })
    });
    const data = (await res.json()) as {choices?: Array<{message?: {content?: string}}>};
    const parsed = Number.parseInt(
      (data.choices?.[0]?.message?.content ?? '').replace(/[^0-9]/g, ''),
      10
    );
    if (Number.isFinite(parsed) && parsed > 0 && parsed < amountCents) return parsed;
  } catch {
    // fall through to deterministic
  }
  return deterministicRevision(amountCents);
}

/** Revise one offer using the configured strategy. */
export function reviseOffer(amountCents: number, ctx: RevisionContext): Promise<number> {
  if (process.env.NEGOTIATION_STRATEGY === 'byok') {
    return byokRevision(amountCents, ctx);
  }
  return Promise.resolve(deterministicRevision(amountCents));
}
