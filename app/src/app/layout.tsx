import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Foundry RAG · OpenChoreo',
  description:
    'RAG chat over an OpenChoreo-provisioned Azure AI Foundry model and vector store.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
