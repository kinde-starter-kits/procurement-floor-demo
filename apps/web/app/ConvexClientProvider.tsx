'use client';

import {ReactNode, useMemo} from 'react';
import {ConvexProvider, ConvexReactClient} from 'convex/react';

export function ConvexClientProvider({children}: {children: ReactNode}) {
  const client = useMemo(
    () => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL as string),
    []
  );
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
