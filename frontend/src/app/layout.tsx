'use client';

import './globals.css';
import React from 'react';
import { NhostProvider } from '@nhost/nextjs';
import { nhost } from '@/lib/nhost';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-gray-100 min-h-screen antialiased">
        <NhostProvider nhost={nhost}>
          {children}
        </NhostProvider>
      </body>
    </html>
  );
}
