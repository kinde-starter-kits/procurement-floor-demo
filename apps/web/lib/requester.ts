import {cookies} from 'next/headers';
import {getKindeServerSession} from '@kinde-oss/kinde-auth-nextjs/server';
import {ROLES, isRole, type Role} from '@/convex/authz';

export interface ResolvedRequester {
  source: 'kinde' | 'guest';
  role: Role | 'custom';
  subject: string;
  scopes: string[];
  orgCode: string;
}

const ORG = 'org_d26a1b1345f3d';
export const GUEST_COOKIE = 'pf_role';

function roleFromScopes(scopes: string[]): Role | 'custom' {
  if (scopes.includes('orders:place:t2')) return 'director';
  if (scopes.includes('orders:place:t1')) return 'buyer';
  if (scopes.includes('quotes:request')) return 'requester';
  return 'custom';
}

/**
 * Who is starting the run. A real Kinde session wins; otherwise the one-tap guest
 * role. Either way the chain roots in a real human's subject and role scopes.
 */
export async function resolveRequester(): Promise<ResolvedRequester | null> {
  const session = getKindeServerSession();
  let authed = false;
  try {
    authed = (await session.isAuthenticated()) === true;
  } catch {
    authed = false;
  }
  if (authed) {
    const [user, org, perms] = await Promise.all([
      session.getUser(),
      session.getOrganization(),
      session.getPermissions()
    ]);
    if (user?.id && perms?.permissions) {
      return {
        source: 'kinde',
        role: roleFromScopes(perms.permissions),
        subject: user.id,
        scopes: perms.permissions,
        orgCode: org?.orgCode ?? ORG
      };
    }
  }

  const role = (await cookies()).get(GUEST_COOKIE)?.value;
  if (isRole(role)) {
    const human = ROLES[role as Role];
    return {source: 'guest', role: role as Role, subject: human.subject, scopes: human.scopes, orgCode: ORG};
  }
  return null;
}
