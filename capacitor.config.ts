import type { CapacitorConfig } from "@capacitor/cli";

// Bundle id and display name are placeholders: set your own in Xcode
// (Signing & Capabilities) before archiving for the App Store.
const config: CapacitorConfig = {
  appId: "com.guixuanjin.chesstrainer",
  appName: "Chess Quest",
  webDir: "out",
  ios: { contentInset: "never", backgroundColor: "#0b0d10" },
};
export default config;
