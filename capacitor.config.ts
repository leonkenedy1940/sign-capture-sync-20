import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.local.app',
  appName: 'sign-capture-sync-20',
  webDir: 'dist',
  server: {
    url: 'https://358ac9a0-142f-4960-9a4a-5c49770d258d.lovableproject.com?forceHideBadge=true',
    cleartext: true,
    androidScheme: 'https'
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#1a1a1a",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: true,
      androidSpinnerStyle: "large",
      iosSpinnerStyle: "small",
      spinnerColor: "#22d3ee",
      splashFullScreen: true,
      splashImmersive: true,
      layoutName: "launch_screen",
      useDialog: true,
    },
    Camera: {
      permissions: ["camera"]
    },
    Device: {
      permissions: ["camera", "microphone"]
    }
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true
  }
};

export default config;