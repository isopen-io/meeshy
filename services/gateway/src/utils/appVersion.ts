export function getAppVersionFloor(): string {
  return process.env.MIN_APP_VERSION ?? '';
}

export function getAppStoreUrl(platform?: string): string {
  if (typeof platform === 'string' && platform.trim().toLowerCase() === 'android') {
    return process.env.PLAY_STORE_URL ?? 'https://play.google.com/store/apps/details?id=me.meeshy.app';
  }
  return process.env.APP_STORE_URL ?? 'https://apps.apple.com/app/meeshy';
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
