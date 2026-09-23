import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {},
  outputFileTracingIncludes: {
    '/*': ['./demo/vendor-responses/**/*'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.externals = [...(config.externals as []), { canvas: 'canvas' }];
    }
    return config;
  },
};

export default nextConfig;
