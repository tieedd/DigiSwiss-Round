import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.digiswiss.app',
  appName: 'DigiSwiss',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
