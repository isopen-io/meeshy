/**
 * LA FENÊTRE ET LE CIBLAGE D'UN PACK (#11274) — quand et à qui un pack est
 * OFFERT. Décision #11252 (défaut retenu) : un objet manqué revient, aucune
 * exclusivité définitive. La fenêtre et le ciblage gouvernent donc l'OFFRE,
 * jamais la possession (`isPackOwned` ne les lit pas, par construction) : un
 * pack possédé hors fenêtre reste possédé, en rayon et installable.
 *
 * Le ciblage se lit sur des faits que le SERVEUR a lus (communautés actives,
 * pays de l'appareil ou de l'inscription, prisme des langues) : un fait
 * inconnu ne satisfait aucune dimension déclarée (fail-closed sur l'offre).
 */

/** Instants ISO 8601 ; `startsAt` inclus, `endsAt` exclu. Une borne absente est ouverte. */
export type PackAvailability = { readonly startsAt?: string; readonly endsAt?: string };

/** Chaque dimension déclarée doit être satisfaite ; à l'intérieur d'une dimension, une valeur suffit. */
export type PackTargeting = {
  readonly communities?: readonly string[];
  /** ISO 3166-1 alpha-2, en capitales. */
  readonly countries?: readonly string[];
  /** Codes de langue (ISO 639-1), comparés sans région. */
  readonly languages?: readonly string[];
};

export type PackAudience = {
  readonly communityIds: ReadonlySet<string>;
  readonly country: string | null;
  /** Le prisme du lecteur, dans l'ordre (`recipientLanguages`). */
  readonly languages: readonly string[];
};

export type PackWindowState = 'upcoming' | 'open' | 'closed';

export type PackOfferContext = { readonly now: Date; readonly audience: PackAudience };

export type PackOfferable = { readonly availability?: PackAvailability; readonly targeting?: PackTargeting };

export const PACK_TARGETING_LIMITS = { communities: 50, countries: 60, languages: 20 } as const;

const instant = (iso: string | undefined): number | null => {
  if (iso === undefined) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
};

export function packWindowState(availability: PackAvailability | undefined, now: Date): PackWindowState {
  const at = now.getTime();
  const starts = instant(availability?.startsAt);
  const ends = instant(availability?.endsAt);
  if (starts !== null && at < starts) return 'upcoming';
  if (ends !== null && at >= ends) return 'closed';
  return 'open';
}

const baseLanguage = (code: string): string => code.toLowerCase().split(/[-_]/)[0] ?? '';

const declared = (values: readonly string[] | undefined): values is readonly string[] => values !== undefined && values.length > 0;

export function isPackTargeted(targeting: PackTargeting | undefined, audience: PackAudience): boolean {
  if (targeting === undefined) return true;
  const { communities, countries, languages } = targeting;
  if (declared(communities) && !communities.some((id) => audience.communityIds.has(id))) return false;
  if (declared(countries) && (audience.country === null || !countries.includes(audience.country.toUpperCase()))) return false;
  if (declared(languages)) {
    const spoken = new Set(audience.languages.map(baseLanguage));
    if (!languages.some((language) => spoken.has(baseLanguage(language)))) return false;
  }
  return true;
}

/** Le pack est OFFERT à ce lecteur, maintenant : fenêtre ouverte ET ciblage satisfait. */
export const isPackOffered = (pack: PackOfferable, context: PackOfferContext): boolean =>
  packWindowState(pack.availability, context.now) === 'open' && isPackTargeted(pack.targeting, context.audience);

/** Ce que le lecteur a déjà d'un pack : une ligne de possession (achat, jeu, octroi, événement) ou une installation. */
export type PackHolding = { readonly ownedByRow: boolean; readonly installed: boolean };

/** En rayon : offert, ou déjà tenu — un objet manqué ne disparaît jamais de chez qui l'a. */
export const isPackShelved = (pack: PackOfferable, context: PackOfferContext, holding: PackHolding): boolean =>
  holding.ownedByRow || holding.installed || isPackOffered(pack, context);

/** Un ciblage a-t-il besoin de connaître le lecteur ? Sans ciblage, aucune lecture. */
export const needsAudience = (pack: PackOfferable): boolean =>
  pack.targeting !== undefined && [pack.targeting.communities, pack.targeting.countries, pack.targeting.languages].some(declared);

/** Le lecteur dont on ne sait rien : aucune communauté, aucun pays, aucune langue. */
export const UNKNOWN_PACK_AUDIENCE: PackAudience = { communityIds: new Set(), country: null, languages: [] };
