import type { ConsentState } from '@meeshy/shared/types/social-events-v2';
import { calculateAge } from '@meeshy/shared/utils/age';
import { compact } from './contentEvents';

/** L'âge du consentement numérique en France (RGPD art. 8, loi Informatique et Libertés art. 45). */
export const DIGITAL_CONSENT_AGE = 15;

/**
 * CE QU'UN ÉVÉNEMENT A LE DROIT DE GARDER de son auteur (#10499 § 6, revue de
 * conformité O1–O4, R4, R5).
 *
 * Quatre situations, et une seule fonction qui les tranche — aucun site
 * d'écriture ne refait la règle :
 *
 * | situation | acteur rangé | contexte rangé | listing rangé |
 * |---|---|---|---|
 * | compte, analyse CONSENTIE (`User.analyticsConsentAt` posé, client non `denied`) | `user` | complet (session d'app comprise) | complet |
 * | compte, analyse NON consentie | `none` | réduit : plateforme, version, OS en MAJEURE, type de réseau, langue d'interface | position et source de classement |
 * | compte, analyse REFUSÉE (client `denied`, retrait hors ligne compris) | `none` | aucun | aucun |
 * | lecteur ANONYME | `none` | plateforme et langue d'interface | position et source de classement |
 *
 * Un identifiant qui relie des événements entre eux (`appSessionId`,
 * `feedRequestId`, `listingSessionId`, `searchId`) n'est rangé QUE sur une
 * ligne rattachée à un compte consentant : sur une ligne `none`, il
 * reconstituerait par jointure ce que l'absence d'acteur promet d'effacer.
 *
 * C'est la passerelle qui fait foi pour ACCORDER ; le client fait foi pour
 * REFUSER — la règle la plus restrictive s'applique toujours.
 */

export type AnalyticsStanding = 'granted' | 'not_granted' | 'denied' | 'anonymous';

type ConsentPrisma = {
  readonly user?: {
    readonly findUnique: (args: {
      where: { id: string };
      select: { analyticsConsentAt: true; dataProcessingConsentAt: true; birthDate: true };
    }) => Promise<{ analyticsConsentAt: Date | null; dataProcessingConsentAt: Date | null; birthDate?: Date | null } | null>;
  };
};

/**
 * Lit le consentement d'analyse d'un compte (et celui de son parent, le
 * traitement des données) — UNE requête par lot. Une lecture
 * en échec vaut « non consenti » : l'absence de preuve n'accorde rien.
 */
export async function readAnalyticsStanding(
  prisma: ConsentPrisma,
  userId: string,
  clientConsent: ConsentState | undefined,
): Promise<Exclude<AnalyticsStanding, 'anonymous'>> {
  if (clientConsent === 'denied') return 'denied';
  try {
    const row = await prisma.user?.findUnique({
      where: { id: userId },
      select: { analyticsConsentAt: true, dataProcessingConsentAt: true, birthDate: true },
    });
    // L'analyse est l'ENFANT du traitement des données (`CONSENT_PARENT`) : sans son parent, elle ne vaut rien.
    if (!row?.analyticsConsentAt || !row.dataProcessingConsentAt) return 'not_granted';
    // R8 : sous l'âge du consentement numérique (15 ans en France), aucun profilage, même consenti.
    return row.birthDate && calculateAge(row.birthDate) < DIGITAL_CONSENT_AGE ? 'not_granted' : 'granted';
  } catch {
    return 'not_granted';
  }
}

export type EventContextInput = {
  readonly appSessionId?: string;
  readonly platform?: string;
  readonly appVersion?: string;
  readonly os?: { readonly name: string; readonly version?: string };
  readonly deviceClass?: string;
  readonly network?: { readonly type?: string; readonly subtype?: string };
  readonly uiLanguage?: string;
};

export type StoredEventContext = {
  readonly appSessionId?: string;
  readonly platform?: string;
  readonly appVersion?: string;
  readonly osName?: string;
  readonly osVersion?: string;
  readonly deviceClass?: string;
  readonly network?: string;
  readonly uiLanguage?: string;
};

const majorOf = (version: string | undefined): string | undefined => version?.split('.')[0];

const networkOf = (network: EventContextInput['network'], withSubtype: boolean): string | undefined => {
  if (!network?.type) return undefined;
  return withSubtype && network.subtype ? `${network.type}/${network.subtype}` : network.type;
};

/** Le contexte de lot que la situation autorise à ranger. */
export function storedContextOf(context: EventContextInput, standing: AnalyticsStanding): StoredEventContext {
  if (standing === 'denied') return {};
  if (standing === 'anonymous') return compact({ platform: context.platform, uiLanguage: context.uiLanguage });
  if (standing === 'not_granted') {
    return compact({
      platform: context.platform,
      appVersion: context.appVersion,
      osName: context.os?.name,
      osVersion: majorOf(context.os?.version),
      network: networkOf(context.network, false),
      uiLanguage: context.uiLanguage,
    });
  }
  return compact({
    appSessionId: context.appSessionId,
    platform: context.platform,
    appVersion: context.appVersion,
    osName: context.os?.name,
    osVersion: context.os?.version,
    deviceClass: context.deviceClass,
    network: networkOf(context.network, true),
    uiLanguage: context.uiLanguage,
  });
}

export type ListingInput = {
  readonly feedRequestId?: string;
  readonly position?: number;
  readonly rankingSource?: string;
  readonly listingSessionId?: string;
};

/** Le contexte de listing que la situation autorise à ranger. */
export function storedListingOf(listing: ListingInput | undefined, standing: AnalyticsStanding): ListingInput | undefined {
  if (!listing || standing === 'denied') return undefined;
  const kept = standing === 'granted'
    ? compact({ ...listing })
    : compact({ position: listing.position, rankingSource: listing.rankingSource });
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/**
 * R5 : bloquer, masquer ou faire taire un auteur sont DÉJÀ des états en base ;
 * l'événement n'apporte rien de plus sur la personne. Il est rangé sans
 * acteur, même consenti.
 */
const NEVER_ATTRIBUTED: ReadonlySet<string> = new Set(['negative:block', 'negative:hide_author', 'negative:mute_author']);

export const isAttributable = (type: string, action: string, standing: AnalyticsStanding): boolean =>
  standing === 'granted' && !NEVER_ATTRIBUTED.has(`${type}:${action}`);

/** Le Prisme est rangé sauf refus explicite : il dit dans quelle langue le contenu a été lu. */
export const keepsPrism = (standing: AnalyticsStanding): boolean => standing !== 'denied';
