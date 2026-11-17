import type { Prisma } from '@meeshy/shared/prisma/client';

/**
 * L'agrégation des clics d'un lien de tracking, calculée EN BASE (#4391).
 *
 * `getTrackingLinkStats` faisait `trackingLinkClick.findMany({ where })` — sans
 * `select`, sans `take`, sans borne haute de plage ni de volume — puis pliait
 * TOUS les clics de la période en JavaScript. Une ligne de clic porte une
 * quarantaine de colonnes, dont l'IP du visiteur, son user-agent, son empreinte
 * d'appareil et sa télémétrie navigateur : la charge lue croissait linéairement
 * avec le succès du lien, et elle transportait de la donnée personnelle qu'aucun
 * agrégat ne restitue.
 *
 * Les douze agrégats se calculent en UNE passe MongoDB : un `$match` unique,
 * puis un `$facet` qui rend UN document. Le patron (`aggregateRaw`, agrégats
 * seuls sur le réseau) est celui de `routes/admin/languages.ts`.
 *
 * Ce module tient ENSEMBLE le pipeline et son dépouillement, parce que les deux
 * décrivent la même forme : séparer la construction de la lecture ferait
 * diverger les clés à la première évolution.
 */

/** Ce que la version JS retenait : `if (click.<champ>)` — ni `null`, ni `''`. */
const NON_VIDE = { $nin: [null, ''] };

const HISTOGRAMMES = [
  'country',
  'device',
  'browser',
  'os',
  'language',
  'socialSource',
] as const;

type ChampHistogramme = (typeof HISTOGRAMMES)[number];

type LigneCompte = { _id: string; n: number };
type LigneTotal = { n: number };
type LigneLieu = { _id: { country: string; city?: string | null }; n: number };

/**
 * Le plancher de k-anonymat d'une VILLE (#19412) : sous ce nombre de clics, la
 * ville se replie dans son pays — un clic isolé à Thiès désignerait une
 * personne (#19175), cinq ne la désignent plus.
 */
export const CLICK_CITY_K_ANONYMITY = 5;

/** Un lieu servi : agrégat seul, ni IP, ni empreinte, ni coordonnée (#9609). */
export type ClickPlace = { readonly country: string; readonly city: string | null; readonly count: number };

/** Le document unique rendu par le `$facet`. */
export type ClickStatsFacet = Partial<
  Record<ChampHistogramme, ReadonlyArray<LigneCompte>>
> & {
  readonly total?: ReadonlyArray<LigneTotal>;
  readonly confirmed?: ReadonlyArray<LigneTotal>;
  readonly hour?: ReadonlyArray<LigneCompte>;
  readonly date?: ReadonlyArray<LigneCompte>;
  readonly referrer?: ReadonlyArray<LigneCompte>;
  readonly uniqueIps?: ReadonlyArray<LigneTotal>;
  readonly uniqueFingerprints?: ReadonlyArray<LigneTotal>;
  readonly place?: ReadonlyArray<LigneLieu>;
};

export type ClickStatsAggregate = {
  readonly totalClicks: number;
  readonly confirmedClicks: number;
  readonly uniqueIps: number;
  readonly uniqueFingerprints: number;
  readonly clicksByCountry: Record<string, number>;
  readonly clicksByDevice: Record<string, number>;
  readonly clicksByBrowser: Record<string, number>;
  readonly clicksByOS: Record<string, number>;
  readonly clicksByLanguage: Record<string, number>;
  readonly clicksBySocialSource: Record<string, number>;
  readonly clicksByHour: Record<string, number>;
  readonly clicksByDate: Record<string, number>;
  readonly topReferrers: ReadonlyArray<{ referrer: string; count: number }>;
  readonly countryCount: number;
  readonly clicksByPlace: ReadonlyArray<ClickPlace>;
};

/** Combien de clics par valeur de ce champ — une ligne par valeur DISTINCTE. */
function histogramme(champ: string): unknown[] {
  return [
    { $match: { [champ]: NON_VIDE } },
    { $group: { _id: `$${champ}`, n: { $sum: 1 } } },
  ];
}

/** Combien de valeurs DISTINCTES et non vides sur ce champ — un seul document en retour. */
function cardinal(champ: string): unknown[] {
  return [
    { $match: { [champ]: NON_VIDE } },
    { $group: { _id: `$${champ}` } },
    { $count: 'n' },
  ];
}

/**
 * Le pipeline des statistiques d'un lien.
 *
 * `clickedAt` est borné par la fenêtre demandée quand elle existe ; en son
 * absence le `$match` porte le seul lien, comme avant — la borne du lot est le
 * fait de ne plus RAMENER les lignes, pas de rétrécir la période servie.
 */
export function clickStatsPipeline(options: {
  trackingLinkId: string;
  startDate?: Date;
  endDate?: Date;
}): Prisma.InputJsonValue[] {
  const match: Record<string, unknown> = { trackingLinkId: { $oid: options.trackingLinkId } };

  if (options.startDate || options.endDate) {
    const fenetre: Record<string, unknown> = {};
    if (options.startDate) fenetre.$gte = { $date: options.startDate.toISOString() };
    if (options.endDate) fenetre.$lte = { $date: options.endDate.toISOString() };
    match.clickedAt = fenetre;
  }

  const facet: Record<string, unknown[]> = {
    total: [{ $count: 'n' }],
    confirmed: [{ $match: { redirectStatus: 'confirmed' } }, { $count: 'n' }],
    // Heure et jour bucketés en UTC — les deux histogrammes doivent rester
    // cohérents quel que soit le fuseau de l'hôte (cf. le témoin
    // `TrackingLinkService.clicksByHourUtc`).
    hour: [
      { $group: { _id: { $dateToString: { format: '%H', date: '$clickedAt', timezone: 'UTC' } }, n: { $sum: 1 } } },
    ],
    date: [
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$clickedAt', timezone: 'UTC' } }, n: { $sum: 1 } } },
    ],
    // Le tri secondaire sur `_id` rend l'ordre DÉTERMINISTE à égalité de
    // compte — la version JS le laissait à l'ordre de première rencontre.
    referrer: [...histogramme('referrer'), { $sort: { n: -1, _id: 1 } }, { $limit: 10 }],
    uniqueIps: cardinal('ipAddress'),
    uniqueFingerprints: cardinal('deviceFingerprint'),
    // Le lieu ne lit que `country` et `city` : aucune autre colonne du clic.
    place: [
      { $match: { country: NON_VIDE } },
      { $group: { _id: { country: '$country', city: { $ifNull: ['$city', null] } }, n: { $sum: 1 } } },
    ],
  };

  for (const champ of HISTOGRAMMES) facet[champ] = histogramme(champ);

  return [{ $match: match }, { $facet: facet }] as unknown as Prisma.InputJsonValue[];
}

const compte = (lignes: ReadonlyArray<LigneCompte> | undefined): Record<string, number> =>
  Object.fromEntries((lignes ?? []).map((l) => [l._id, l.n]));

const total = (lignes: ReadonlyArray<LigneTotal> | undefined): number => lignes?.[0]?.n ?? 0;

/**
 * Les lieux servis : une ville sous le plancher, une ville vide ou TOUTE ville
 * quand `citiesServed` est faux (lien d'une adresse de fiche, #19175) se
 * replie dans la ligne sans ville de son pays.
 */
function lieux(lignes: ReadonlyArray<LigneLieu> | undefined, citiesServed: boolean): ClickPlace[] {
  const parCle = (lignes ?? []).reduce((acc, { _id, n }) => {
    const ville = _id.city || null;
    const city = citiesServed && ville !== null && n >= CLICK_CITY_K_ANONYMITY ? ville : null;
    const cle = JSON.stringify([_id.country, city]);
    const precedent = acc.get(cle);
    return new Map(acc).set(cle, { country: _id.country, city, count: (precedent?.count ?? 0) + n });
  }, new Map<string, ClickPlace>());

  return [...parCle.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.country.localeCompare(b.country) ||
      (a.city ?? '').localeCompare(b.city ?? ''),
  );
}

/** Le document du `$facet` → la forme que `getTrackingLinkStats` sert. */
export function foldClickStatsFacet(
  facet: ClickStatsFacet | undefined,
  options: { readonly citiesServed?: boolean } = {},
): ClickStatsAggregate {
  const f: ClickStatsFacet = facet ?? {};
  const clicksByCountry = compte(f.country);

  return {
    totalClicks: total(f.total),
    confirmedClicks: total(f.confirmed),
    uniqueIps: total(f.uniqueIps),
    uniqueFingerprints: total(f.uniqueFingerprints),
    clicksByCountry,
    clicksByDevice: compte(f.device),
    clicksByBrowser: compte(f.browser),
    clicksByOS: compte(f.os),
    clicksByLanguage: compte(f.language),
    clicksBySocialSource: compte(f.socialSource),
    clicksByHour: compte(f.hour),
    clicksByDate: compte(f.date),
    topReferrers: (f.referrer ?? []).map((l) => ({ referrer: l._id, count: l.n })),
    countryCount: Object.keys(clicksByCountry).length,
    clicksByPlace: lieux(f.place, options.citiesServed ?? true),
  };
}
