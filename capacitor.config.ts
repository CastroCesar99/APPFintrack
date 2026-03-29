import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fintrack.app',
  appName: 'FinTrack',
  webDir: 'out',
  plugins: {
    SocialLogin: {
      providers: {
        google: true,
      },
    },
  },
};

export default config;
