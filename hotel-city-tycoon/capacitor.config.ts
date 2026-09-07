import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Development identity. Confirm before the first store/TestFlight release.
  appId: 'com.hotelcitytycoon.app',
  appName: 'Hotel City',
  webDir: 'dist',
  backgroundColor: '#1a1210',
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      style: 'DARK',
      hidden: false,
    },
  },
};

export default config;
