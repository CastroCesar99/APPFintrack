
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
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
  allowedDevOrigins: ["9000-firebase-fintrackapp-1754659687803.cluster-vpxjqdstfzgs6qeiaf7rdlsqrc.cloudworkstations.dev"]
};

export default nextConfig;
