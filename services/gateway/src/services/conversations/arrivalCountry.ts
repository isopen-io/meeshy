/**
 * LE PAYS D'UNE ARRIVÉE PAR LIEN D'INVITATION (#7797).
 *
 * L'admission forçait `country: null` depuis #4167, et avec raison :
 * l'heuristique qu'elle appelait (`extractCountryFromIP`, premier octet de
 * l'IP, repli `'FR'`) était décorative. Le pays vient désormais de la VRAIE
 * géolocalisation du dépôt — `lookupGeoIp` (`services/GeoIPService.ts`), celle
 * que l'inscription et la connexion emploient déjà —, et il est enregistré sur
 * `Participant.joinCountry`. L'IP ne l'est pas : elle sert à la recherche, puis
 * elle est oubliée.
 *
 * La recherche part APRÈS la réponse de jointure (`AfterResponse`) : un appel
 * vers un tiers n'a rien à faire sur le chemin d'entrée d'une conversation, et
 * l'arrivée est rendue avec ou sans pays.
 *
 * Le pays sert la répartition « par pays » et le drapeau des arrivées récentes
 * que `GET /links/:linkId/stats` rend à l'auteur du lien — jamais une décision
 * d'accès : `allowedCountries` reste INERTE (#4167, critère 5).
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { lookupGeoIp } from '../GeoIPService';

export type ArrivalCountryLookup = (ip: string) => Promise<string | null>;

const ISO_ALPHA2 = /^[A-Za-z]{2}$/;

/** ISO 3166-1 alpha-2 en majuscules, ou `null` — jamais une autre forme. */
export function arrivalCountryFromGeo(geo: { readonly country: string | null } | null): string | null {
  const candidate = geo?.country?.trim() ?? '';
  return ISO_ALPHA2.test(candidate) ? candidate.toUpperCase() : null;
}

/** Recherche de production — une adresse privée ne quitte jamais le processus (`isPrivateIp`). */
export const lookupArrivalCountry: ArrivalCountryLookup = async (ip) => arrivalCountryFromGeo(await lookupGeoIp(ip));

export async function recordArrivalCountry(params: {
  readonly prisma: Pick<PrismaClient, 'participant'>;
  readonly participantId: string;
  readonly requestIp: string;
  readonly lookupCountry: ArrivalCountryLookup;
}): Promise<void> {
  const joinCountry = arrivalCountryFromGeo({ country: await params.lookupCountry(params.requestIp) });
  if (!joinCountry) return;

  await params.prisma.participant.update({
    where: { id: params.participantId },
    data: { joinCountry },
  });
}
