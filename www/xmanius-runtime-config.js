/*
 * Public runtime configuration for the static website and Capacitor APK.
 *
 * Put only the deployed Xmanius API origin here, for example:
 *   window.XMANIUS_API_BASE_URL = "https://your-project.vercel.app";
 *
 * Never put Gemini/provider keys in this file. They belong in Vercel
 * Environment Variables and are read only by /api/xmanius-chat.
 */
// The APK is a static Capacitor bundle, so it must call the deployed API
// explicitly instead of resolving /api on a file:// origin.
window.XMANIUS_API_BASE_URL = "https://xmanius.vercel.app";
