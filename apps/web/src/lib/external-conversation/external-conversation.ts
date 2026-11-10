/**
 * **ÉCRIRE À UN AMI WHATSAPP DEPUIS LE WEB** (#17118, chantier #17007, design
 * `docs/superpowers/specs/2026-11-08-dma-whatsapp-interop-design.md` § 2 et § 6).
 *
 * La passerelle ouvre, ou retrouve, une conversation externe par
 * `POST /conversations/external` (#17117) : toujours chiffrée de bout en bout,
 * adressée par le numéro E.164 de l'ami, réservée à un compte au numéro VÉRIFIÉ.
 * Ce module porte ce que le client en décide — où l'entrée existe, quelle forme
 * part, quel état dessiner pour chaque réponse — sans rien rendre.
 *
 * **L'ENTRÉE EST ÉTEINTE EN PRODUCTION** (design § 6, jusqu'à la signature avec
 * Meta). La même image web sert le staging et la production
 * (`.github/workflows/docker.yml`) : un drapeau de CONSTRUCTION ne saurait pas
 * les distinguer. Le client lit donc la passerelle qu'il joint
 * (`apiConfig.base`) contre une liste POSITIVE — le staging et le développement,
 * miroir de `isPreSignatureEnvironment` côté passerelle — et toute autre origine,
 * celle de la production comprise, reste fermée. Au staging, l'entrée n'est
 * offerte qu'à l'ÉQUIPE (`isPlatformTeam`), la même porte que celle du pair
 * externe qui relaiera les messages (#17116). La passerelle garde son propre
 * drapeau (`EXTERNAL_CONVERSATIONS`) : une entrée visible contre un serveur
 * éteint dit « pas encore disponible ici », jamais un échec muet.
 */
import { isPlatformTeam } from '@meeshy/shared/types/role-types';
import { EXTERNAL_CONVERSATION_ERROR_CODES } from '@meeshy/shared/types/external-conversation';

import type { ApiResult } from '@/lib/api/http';

export type ExternalNetwork = 'whatsapp';

export type ExternalOpening = {
  readonly conversationId: string;
  readonly type: 'external';
  readonly encryptionMode: 'e2ee';
  readonly network: ExternalNetwork;
  readonly created: boolean;
};

export type ExternalOpeningRefusal = 'disabled' | 'reserved' | 'limit' | 'invalid' | 'rate-limited' | 'offline' | 'failed';

export type ExternalOpeningOutcome =
  | { readonly kind: 'open'; readonly conversationId: string; readonly created: boolean }
  | { readonly kind: 'phone-unverified' }
  | { readonly kind: 'consent-required' }
  | { readonly kind: 'refused'; readonly reason: ExternalOpeningRefusal };

const STAGING_GATEWAY = 'gate.staging.meeshy.me';
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Les hôtes où le développement joint sa passerelle sans domaine (miroir de `gatewayOfPage`, `config.ts`). */
const isLocalHost = (hostname: string): boolean => hostname === 'localhost' || IPV4.test(hostname) || !hostname.includes('.');

const hostnameOf = (base: string): string | null => {
  try {
    return new URL(base).hostname.toLowerCase();
  } catch {
    return null;
  }
};

/**
 * La passerelle jointe accepte-t-elle des conversations externes AVANT la
 * signature ? `''` est la base relative du seul serveur de développement
 * (`config.ts` § `resolveBase`, proxy Vite).
 */
export function externalConversationsReachable(base: string): boolean {
  if (base === '') return true;
  const hostname = hostnameOf(base);
  if (hostname === null) return false;
  return hostname === STAGING_GATEWAY || isLocalHost(hostname);
}

export function externalConversationEntryVisible(params: { readonly base: string; readonly platformRole: string | null }): boolean {
  return externalConversationsReachable(params.base) && isPlatformTeam(params.platformRole);
}

/** La forme que la passerelle exige (`e164Schema`, `external-peer-contract.ts`). */
const E164 = /^\+[1-9][0-9]{6,14}$/;
const SEPARATORS = /[\s().\-‐-―]/g;

/**
 * Le numéro saisi, en E.164 — ou `null`. Les séparateurs usuels tombent et le
 * préfixe international `00` vaut `+` ; rien n'est DEVINÉ (aucun indicatif
 * ajouté à un numéro national) : écrire au mauvais pays adresserait un message
 * à un inconnu.
 */
export function normalizeExternalHandle(raw: string): string | null {
  const compact = raw.trim().replace(SEPARATORS, '');
  const international = compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
  return E164.test(international) ? international : null;
}

const REFUSAL_OF_CODE: Readonly<Record<string, ExternalOpeningRefusal>> = {
  [EXTERNAL_CONVERSATION_ERROR_CODES.DISABLED]: 'disabled',
  [EXTERNAL_CONVERSATION_ERROR_CODES.END_TO_END_RESERVED]: 'reserved',
  [EXTERNAL_CONVERSATION_ERROR_CODES.LIMIT_REACHED]: 'limit',
  [EXTERNAL_CONVERSATION_ERROR_CODES.INVALID]: 'invalid',
};

/**
 * Le refus d'un statut sans code connu. `404` : une passerelle d'avant #17117
 * ne connaît pas la route — pour le lecteur, c'est « pas encore disponible ici ».
 */
const refusalOfStatus = (status: number): ExternalOpeningRefusal => {
  if (status === 429) return 'rate-limited';
  if (status === 404) return 'disabled';
  return 'failed';
};

/**
 * L'état à dessiner. Une réponse « ouverte » qui ne dirait pas une conversation
 * externe chiffrée de bout en bout n'ouvre RIEN : le client ne s'engage jamais
 * auprès d'un ami d'un réseau tiers sur la foi d'une réponse inattendue.
 */
export function externalOpeningOutcomeOf(params: { readonly result: ApiResult<ExternalOpening>; readonly online: boolean }): ExternalOpeningOutcome {
  const { result } = params;
  if (result.ok) {
    const { conversationId, type, encryptionMode, created } = result.data;
    const sealed = type === 'external' && encryptionMode === 'e2ee' && typeof conversationId === 'string' && conversationId !== '';
    return sealed ? { kind: 'open', conversationId, created: created === true } : { kind: 'refused', reason: 'failed' };
  }
  if (!params.online) return { kind: 'refused', reason: 'offline' };
  if (result.code === EXTERNAL_CONVERSATION_ERROR_CODES.PHONE_UNVERIFIED) return { kind: 'phone-unverified' };
  if (result.code === EXTERNAL_CONVERSATION_ERROR_CODES.CONSENT_REQUIRED) return { kind: 'consent-required' };
  const known = result.code === undefined ? undefined : REFUSAL_OF_CODE[result.code];
  return { kind: 'refused', reason: known ?? refusalOfStatus(result.status) };
}
