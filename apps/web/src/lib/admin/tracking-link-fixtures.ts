/**
 * **LES LIENS DE SUIVI TELS QUE LA PASSERELLE LES SERT** — l'usine commune des
 * témoins du lot « liens » pour les liens de suivi (décodeurs, liste, fiche, geste).
 * Un module de TÉMOINS : aucun code de production ne l'importe.
 *
 * La forme est celle de `GET /admin/tracking-links` (liste) et de
 * `GET /admin/tracking-links/:linkId` (fiche : la ligne, ses agrégats, ses vingt
 * derniers clics). Les témoins qui veulent prouver que le décodeur ne recopie ni IP,
 * ni user-agent, ni empreinte les AJOUTENT par surcharge — la passerelle ne les sert
 * pas.
 */
export const OBJECT_ID = (seed: number): string => seed.toString(16).padStart(24, '0');

export const servedPerson = (seed: number, overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: OBJECT_ID(seed),
  username: `membre${seed}`,
  displayName: `Membre ${seed}`,
  avatar: null,
  ...overrides,
});

export const servedTrackingLink = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: OBJECT_ID(1),
  token: 'Ab3xYz',
  name: 'Lancement de rentrée',
  campaign: 'rentree-2026',
  source: 'newsletter',
  medium: 'email',
  originalUrl: 'https://exemple.test/rentree?ref=meeshy',
  shortUrl: 'https://m.meeshy.me/l/Ab3xYz',
  targetType: 'POST',
  target: { type: 'POST', id: OBJECT_ID(4), label: 'Awa Diop' },
  conversation: null,
  creator: servedPerson(2, { displayName: 'Awa Diop', username: 'awa' }),
  totalClicks: 1204,
  uniqueClicks: 980,
  isActive: true,
  expiresAt: '2026-12-31T23:00:00.000Z',
  lastClickedAt: '2026-09-30T11:40:00.000Z',
  createdAt: '2026-09-01T09:00:00.000Z',
  ...overrides,
});

export const servedTrackingStats = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  confirmedClicks: 900,
  clicksByDate: [
    { date: '2026-09-27', count: 10 },
    { date: '2026-09-29', count: 40 },
    { date: '2026-09-30', count: 25 },
  ],
  byCountry: [
    { key: 'FR', count: 700 },
    { key: 'SN', count: 300 },
    { key: 'ZZZ', count: 4 },
  ],
  byDevice: [
    { key: 'mobile', count: 800 },
    { key: 'desktop', count: 380 },
    { key: 'tablet', count: 24 },
  ],
  byBrowser: [
    { key: 'Chrome', count: 600 },
    { key: 'Safari', count: 500 },
  ],
  byOs: [
    { key: 'iOS', count: 500 },
    { key: 'Android', count: 400 },
  ],
  bySocialSource: [{ key: 'whatsapp', count: 120 }],
  topReferrers: [
    { referrer: 'https://newsletter.exemple.test/', count: 300 },
    { referrer: 'https://t.co/', count: 90 },
  ],
  byRedirectStatus: [
    { key: 'confirmed', count: 900 },
    { key: 'pending', count: 200 },
    { key: 'failed', count: 104 },
  ],
  ...overrides,
});

export const servedTrackingClick = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: OBJECT_ID(31),
  country: 'FR',
  city: 'Lyon',
  device: 'mobile',
  browser: 'Safari',
  os: 'iOS',
  referrer: 'https://newsletter.exemple.test/',
  socialSource: null,
  redirectStatus: 'confirmed',
  clickedAt: '2026-09-30T11:40:00.000Z',
  ...overrides,
});

export const servedTrackingLinkFiche = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  ...servedTrackingLink(),
  stats: servedTrackingStats(),
  recentClicks: [
    servedTrackingClick(),
    servedTrackingClick({ id: OBJECT_ID(32), country: null, city: null, device: 'desktop', browser: 'Chrome', os: 'Windows', referrer: null, redirectStatus: 'failed', clickedAt: '2026-09-30T10:00:00.000Z' }),
  ],
  ...overrides,
});
