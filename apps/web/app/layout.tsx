import type {Metadata} from 'next';
import {Inter, Fira_Code} from 'next/font/google';
import './globals.css';
import {ConvexClientProvider} from './ConvexClientProvider';

// Kinde uses Inter throughout, with a Fira Code mono for code/data.
const inter = Inter({subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body'});
const interDisplay = Inter({subsets: ['latin'], weight: ['600', '700'], variable: '--font-display'});
const mono = Fira_Code({subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono'});

export const metadata: Metadata = {
  title: 'Procurement Floor — delegated authority, watched live',
  description:
    'Watch a run: a human delegates to agents, and authority either holds the line (attenuated) or leaks (broken).'
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${interDisplay.variable} ${inter.variable} ${mono.variable}`}>
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
