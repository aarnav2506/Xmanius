/*
 * Public runtime configuration for the static website and Capacitor APK.
 *
 * Put only the deployed Xmanius API origin here, for example:
 *   window.XMANIUS_API_BASE_URL = "https://your-project.vercel.app";
 *
 * Never put Gemini/provider keys in this file. They belong in Vercel
 * Environment Variables and are read only by /api/xmanius-chat.
 */
// The APK is a static Capacitor bundle, so it must call the deployed API.
// Browser deployments and `vercel dev` use their same-origin `/api` route.
const xmaniusNativeApp = Boolean(window.Capacitor?.isNativePlatform?.()) || /^(capacitor|ionic|file):$/i.test(window.location.protocol);
window.XMANIUS_API_BASE_URL = xmaniusNativeApp ? "https://xmanius.vercel.app" : "";
