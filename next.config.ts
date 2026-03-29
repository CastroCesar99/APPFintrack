import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  output: process.env.IS_CAPACITOR === 'true' ? 'export' : undefined,
  typescript: {
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
