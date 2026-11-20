import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bonnes Ondes — Journal musical',
  description: 'Des disques, des radios et des concerts choisis chaque semaine.',
  icons: { icon: [{ url: '/bonnesondes/icon.svg', type: 'image/svg+xml' }], shortcut: '/bonnesondes/icon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
