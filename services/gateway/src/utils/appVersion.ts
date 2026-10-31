export function getAppVersionFloor(): string {
  return process.env.MIN_APP_VERSION ?? '';
}

const EXEMPT_PLATFORMS: ReadonlySet<string> = new Set(['web', 'pwa', 'android-shell']);

const normalizePlatform = (platform: string | undefined): string =>
  typeof platform === 'string' ? platform.trim().toLowerCase() : '';

/**
 * D-5 (#13947) — le plancher d'UNE plateforme : iOS (1.1.x), Android (3.0.x) et
 * le web (2.0.x) ne se numérotent pas ensemble, un seul numéro armé pour l'une
 * bloquerait les autres. `MIN_APP_VERSION_IOS` / `MIN_APP_VERSION_ANDROID`
 * l'emportent, `MIN_APP_VERSION` sert de repli (plateforme absente ou inconnue :
 * c'est le comportement de la porte des stories). Le web, la PWA et la coque
 * Capacitor ne sont jamais jugés. Tous vides (défaut) ⇒ porte désarmée.
 */
export function getAppVersionFloorFor(platform?: string): string {
  const key = normalizePlatform(platform);
  if (EXEMPT_PLATFORMS.has(key)) return '';
  const own = key === 'ios' ? process.env.MIN_APP_VERSION_IOS : key === 'android' ? process.env.MIN_APP_VERSION_ANDROID : undefined;
  return own || getAppVersionFloor();
}

export function getShellLatestVersion(): string {
  return process.env.SHELL_LATEST_VERSION ?? '';
}

export function getAppStoreUrl(platform?: string): string {
  if (typeof platform === 'string' && platform.trim().toLowerCase() === 'android') {
    return process.env.PLAY_STORE_URL ?? 'https://play.google.com/store/apps/details?id=me.meeshy.app';
  }
  return process.env.APP_STORE_URL ?? 'https://apps.apple.com/app/id6760208591';
}

export function compareAppVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function isBelowFloor(header: string | undefined, floor: string): boolean {
  if (!floor) return false;      // porte désarmée par défaut
  if (!header) return false;     // ABSENCE = web ou binaire d'avant l'en-tête :
                                 // le FORMAT (A5) juge, jamais l'en-tête absent (R6)
  return compareAppVersions(header, floor) < 0;
}
