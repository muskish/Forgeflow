import { NhostClient } from '@nhost/nextjs';

const nhostSubdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'local';
const nhostRegion = process.env.NEXT_PUBLIC_NHOST_REGION || 'local';

export const nhost = new NhostClient({
  subdomain: nhostSubdomain,
  region: nhostRegion,
  backendUrl: process.env.NEXT_PUBLIC_NHOST_BACKEND_URL || 'http://localhost:1337',
});
