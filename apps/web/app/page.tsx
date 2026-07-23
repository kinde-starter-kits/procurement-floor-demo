import {LoginLink, LogoutLink} from '@kinde-oss/kinde-auth-nextjs/components';
import {getActingUser} from '@/lib/kinde-session';

export default async function Home() {
  let acting: Awaited<ReturnType<typeof getActingUser>> | null = null;
  try {
    acting = await getActingUser();
  } catch {
    acting = null;
  }

  return (
    <main style={{fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 640}}>
      <h1>Procurement Floor</h1>
      <p>P2 — Kinde human auth. This phase establishes identity only.</p>

      {acting ? (
        <>
          <p>
            Signed in as <strong>{acting.subject}</strong> in org{' '}
            <strong>{acting.orgCode}</strong>.
          </p>
          <p>Permissions:</p>
          <ul>
            {acting.permissions.map((p) => (
              <li key={p}>
                <code>{p}</code>
              </li>
            ))}
          </ul>
          <p>
            <LogoutLink>Sign out</LogoutLink>
          </p>
        </>
      ) : (
        <p>
          <LoginLink>Sign in</LoginLink>
        </p>
      )}

      <p style={{marginTop: '2rem', color: '#666'}}>
        <code>GET /api/me</code> returns the verified{' '}
        <code>{'{ subject, orgCode, permissions }'}</code>.
      </p>
    </main>
  );
}
