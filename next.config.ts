import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['xlsx'],
  // The weekly workbooks are read from disk at runtime, so make sure they ship with the deployment.
  outputFileTracingIncludes: { '/': ['./data/**/*'] },
};

export default nextConfig;
