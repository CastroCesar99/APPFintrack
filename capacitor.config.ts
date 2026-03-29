import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fintrackcastromanagement.app',
  appName: 'Athena',
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
