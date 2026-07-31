import {NextResponse} from 'next/server';
import {resolveRequester} from '@/lib/requester';

// The current acting human (guest role or Kinde session) for the UI to display.
export async function GET() {
  const requester = await resolveRequester();
  if (!requester) return NextResponse.json({requester: null});
  return NextResponse.json({
    requester: {
      source: requester.source,
      role: requester.role,
      subject: requester.subject,
      scopes: requester.scopes
    }
  });
}
