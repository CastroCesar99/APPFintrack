import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fintrack.app',
  appName: 'FinTrack',
  webDir: 'out',
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '627912670361-hcsfl4egpoeli1e8o2j8sqks6qmk7fn3.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
