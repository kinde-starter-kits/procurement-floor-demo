import {getKindeServerSession} from '@kinde-oss/kinde-auth-nextjs/server';

/**
 * The acting human's identity, derived exclusively from the verified Kinde
 * server session. Every field comes from Kinde's signed session/token — never
 * from a header, query param, request body, or any other client-supplied value.
 */
export interface ActingUser {
  subject: string;
  orgCode: string;
  permissions: string[];
}

/**
 * Resolve the current acting user, failing closed.
 *
 * Reads only from `getKindeServerSession()`. If the caller is not authenticated,
 * or the subject, org code, or permissions are missing, this throws — callers
 * get nothing rather than a partial or spoofable identity.
 */
export async function getActingUser(): Promise<ActingUser> {
  const session = getKindeServerSession();

  const [authenticated, user, organization, permissions] = await Promise.all([
    session.isAuthenticated(),
    session.getUser(),
    session.getOrganization(),
    session.getPermissions()
  ]);

  if (authenticated !== true) {
    throw new Error('not_authenticated');
  }

  const subject = user?.id;
  const orgCode = organization?.orgCode ?? undefined;
  const perms = permissions?.permissions;

  // Fail closed: any missing piece denies the whole identity.
  if (!subject || !orgCode || !perms) {
    throw new Error('session_incomplete');
  }

  return {subject, orgCode, permissions: perms};
}
