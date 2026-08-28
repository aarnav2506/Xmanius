/*
 * Public runtime configuration for the static website and Capacitor APK.
 *
 * Put only the deployed Xmanius API origin here, for example:
 *   window.XMANIUS_API_BASE_URL = "https://xmanius.vercel.app";
 *
 * Never put Gemini/provider keys in this file. They belong in Vercel
 * Environment Variables and are read only by /api/xmanius-chat.
 */
// For the Android APK, set this to the HTTPS origin of the deployed API.
// Never put a Gemini/provider API key in this public file.
window.XMANIUS_API_BASE_URL = "xmanius.vercel.app";
