export const APP_BASE_URL = "https://project.ethinos.com";
export const MOBILE_APP_URL = `${APP_BASE_URL}/mobile/`;
export const APP_LOGO_URL = `${APP_BASE_URL}/ethinos-logo.png`;

export function replaceLegacyAppHost(url: string): string {
  return url.replace(/^https:\/\/pmt\.ethinos\.com(?=\/|$)/i, APP_BASE_URL);
}