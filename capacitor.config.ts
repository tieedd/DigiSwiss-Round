import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.digiswiss.app',
  appName: 'DigiSwiss',
  webDir: 'app/src/main/assets/web',
  server: {
    androidScheme: 'https'
  }
};

export default config;
