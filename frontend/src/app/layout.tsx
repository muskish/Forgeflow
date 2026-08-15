import './globals.css';
import React from 'react';

export const metadata = {
  title: 'AI Agent Workflow Builder',
  description: 'Multi-tenant AI Workflow Automation Platform with Nhost & Hasura',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-gray-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
