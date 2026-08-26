import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Latent Fabric - Gesture Elicitation Study',
  description: 'Projected and researcher-facing Wizard-of-Oz interfaces for embodied generative design research.',
  openGraph: {
    title: 'Latent Fabric',
    description: 'Gesture Elicitation Study - an embodied generative-design research instrument.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Latent Fabric gesture elicitation study instrument' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Latent Fabric',
    description: 'Gesture Elicitation Study - an embodied generative-design research instrument.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
