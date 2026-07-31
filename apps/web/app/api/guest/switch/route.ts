import {NextResponse} from 'next/server';
import {isRole} from '@/convex/authz';
import {GUEST_COOKIE} from '@/lib/requester';

// One-tap guest role switch over the three real pre-provisioned users — no email
// code. The role scopes are derived server-side from the role, not trusted from
// the client. Real Kinde login (/api/auth/login) stays available and takes priority.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {role?: unknown};
  if (!isRole(body.role)) {
    return NextResponse.json({error: 'invalid_role'}, {status: 400});
  }
  const res = NextResponse.json({ok: true, role: body.role});
  res.cookies.set(GUEST_COOKIE, body.role, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8
  });
  return res;
}
