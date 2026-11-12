import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Self-contained server bundle for the production Docker image (Vercel builds its own way).
  output: process.env.VERCEL ? undefined : 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  reactStrictMode: true,
  turbopack: {
    root: path.join(__dirname, '../..'),
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
