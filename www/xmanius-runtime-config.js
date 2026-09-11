/*
 * Public runtime configuration for the static website and Capacitor APK.
 *
 * Put only the deployed Xmanius API origin here, for example:
 *   window.XMANIUS_API_BASE_URL = "https://xmanius.vercel.app";
 *
 * Never put Gemini/provider keys in this file. They belong in Vercel
 * Environment Variables and are read only by /api/xmanius-chat.
 */
// Point to the deployed production API on Vercel whenever running on local static servers, file://, or mobile
const isDeployedOnVercel = typeof window !== "undefined" && (window.location.hostname.endsWith(".vercel.app"));
window.XMANIUS_API_BASE_URL = isDeployedOnVercel ? "" : "https://xmanius.vercel.app";

