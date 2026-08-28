/*
 * Public runtime configuration for the static website and Capacitor APK.
 *
 * Put only the deployed Xmanius API origin here, for example:
 *   window.XMANIUS_API_BASE_URL = "https://xmanius.vercel.app";
 *
 * Never put Gemini/provider keys in this file. They belong in Vercel
 * Environment Variables and are read only by /api/xmanius-chat.
 */
// The Android APK needs the deployed HTTPS API. Browser deployments and
// `vercel dev` use their own same-origin `/api` route, so local fixes are not
// accidentally sent to an old remote deployment.
const xmaniusNativeApp = Boolean(window.Capacitor?.isNativePlatform?.()) || /^(capacitor|ionic):$/i.test(window.location.protocol);
window.XMANIUS_API_BASE_URL = xmaniusNativeApp ? : "https://xmanius.vercel.app";
