import type { NextConfig } from 'next';

const basePath = '/bonnesondes';
const config: NextConfig = {
  devIndicators: false,
  output: 'export',
  trailingSlash: true,
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};
export default config;
