import {NextResponse} from 'next/server';
import {embed} from '@/lib/embeddings';
import {searchSuppliers} from '@/lib/supplier-search';

// Node runtime: Transformers.js (ONNX) and the Qdrant client need Node.
export const runtime = 'nodejs';

export async function POST(req: Request) {
  // 1. Require a bearer token.
  const authorization = req.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return NextResponse.json({error: 'missing_bearer_token'}, {status: 401});
  }

  // 2. Verify the agent token through the component and take org_code from the
  //    VERIFIED token. The request body never names the org, so a caller cannot
  //    reach another org's suppliers.
  const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!siteUrl) {
    return NextResponse.json({error: 'server_misconfigured'}, {status: 500});
  }
  const verifyRes = await fetch(`${siteUrl}/agent/verify`, {
    method: 'POST',
    headers: {authorization}
  });
  if (!verifyRes.ok) {
    const detail = await verifyRes.json().catch(() => ({}));
    return NextResponse.json(
      {error: 'token_verification_failed', detail},
      {status: verifyRes.status}
    );
  }
  const verified = (await verifyRes.json()) as {orgCode?: string | null};
  const orgCode = verified.orgCode;
  if (!orgCode) {
    return NextResponse.json({error: 'org_code_required'}, {status: 403});
  }

  // 3. Read only the query text from the body.
  const body = (await req.json().catch(() => ({}))) as {query?: unknown; limit?: unknown};
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) {
    return NextResponse.json({error: 'query_required'}, {status: 400});
  }
  const limit = typeof body.limit === 'number' ? body.limit : 5;

  // 4. Embed the query and search Qdrant with the org filter applied.
  const vector = await embed(query);
  const results = await searchSuppliers(orgCode, vector, {limit});

  return NextResponse.json({orgCode, query, results});
}
