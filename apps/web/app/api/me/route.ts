import {NextResponse} from 'next/server';
import {getActingUser} from '@/lib/kinde-session';

// Returns the acting user's { subject, orgCode, permissions } from the verified
// session, or 401 if the session fails closed. Used to demonstrate that each
// signed-in role resolves to the correct permissions.
export async function GET() {
  try {
    const acting = await getActingUser();
    return NextResponse.json(acting);
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'unauthorized'},
      {status: 401}
    );
  }
}
