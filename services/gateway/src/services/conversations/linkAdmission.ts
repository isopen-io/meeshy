/**
 * La loi d'admission UNIQUE d'un lien de partage — #4167.
 *
 * Deux portes appliquaient deux polices au même lien : `POST
 * /anonymous/join/:linkId` (`routes/anonymous.ts`) contrôlait neuf propriétés
 * du lien, sa jumelle authentifiée `POST /conversations/join/:linkId`
 * (`routes/conversations/sharing.ts`) n'en contrôlait que deux — si bien qu'un
 * lien « à usage unique » était réutilisable indéfiniment par un compte
 * inscrit. `admitLinkEntry` est l'endroit unique où cette question se
 * tranche, pour les DEUX identités, dans l'ORDRE fixé par l'issue :
 *
 *   isActive → expiresAt → isConversationClosed (410) → maxUses →
 *   maxConcurrentUsers → maxUniqueSessions → allowedCountries →
 *   allowedIpRanges → requireAccount → bannissement → resolveConversationEntry
 *
 * Une porte qui a besoin d'admettre un visiteur APPELLE cette fonction ; elle
 * ne recopie jamais la séquence — c'est exactement la dérive que #4167 ferme.
 *
 * ─── CE QUE LA FONCTION NE FAIT PAS ──────────────────────────────────────────
 *
 * Sa signature — `{ link, identity, request } → Verdict` — ne prend
 * délibérément AUCUN corps de requête. `allowedLanguages`, `requireEmail`,
 * `requireNickname`, `requireBirthday` dépendent de ce que le VISITEUR
 * soumet, pas du lien ni de son identité : ce sont des validations de forme,
 * qu'un appelant fait APRÈS avoir reçu un verdict `granted`. Les mélanger ici
 * ferait de cette loi une loi de FORMULAIRE plutôt qu'une loi d'ACCÈS.
 *
 * ─── LA DÉCISION DU 2026-08-29 SUR `allowedCountries` / `allowedIpRanges` ────
 *
 * `trustProxy` est posé depuis #4137 (`server.ts`) : `request.ip` reflète
 * désormais la vraie IP du visiteur, pas celle du conteneur Traefik.
 * `allowedIpRanges` est donc RÉEL et reste appliqué ci-dessous.
 *
 * `allowedCountries`, lui, reste DÉCORATIF : `extractCountryFromIP`
 * (l'ancienne fonction locale de `routes/anonymous.ts`, RETIRÉE par ce lot —
 * la loi d'admission ne l'appelle plus) devinait un pays sur le premier
 * octet de l'IP et retombait sur `'FR'` — aucun lien avec `trustProxy`,
 * aucune base GeoIP derrière. Un contrôle qui admet ou refuse au hasard, tout
 * en laissant
 * l'opérateur du lien croire qu'il filtre par pays, est PIRE qu'une absence de
 * contrôle : il donne une fausse garantie. La décision retenue ICI (critère 5
 * de #4167) est de RETIRER son application de la loi d'admission plutôt que
 * de l'appliquer sur une donnée qu'on ne sait pas lire — en attendant une
 * vraie base GeoIP (MaxMind/IP2Location) ou le retrait du champ côté API et
 * affichage client, décision hors du territoire de ce lot (voir le rapport de
 * livraison de #4167 — `apps/web`, `routes/links/creation.ts` n'y sont pas).
 * `allowedCountries` n'apparaît donc plus dans la séquence ci-dessous ; le
 * champ reste lu et STOCKÉ (pour la future vraie implémentation), jamais
 * évalué.
 *
 * ─── LE `bannissement` D'UN INVITÉ SANS COMPTE ───────────────────────────────
 *
 * `resolveConversationEntry` clé sa lecture sur `(conversationId, User.id)` —
 * un invité n'en a pas : chaque jointure lui crée une ligne `Participant`
 * NEUVE (`routes/anonymous.ts`, inchangé par ce lot). Il n'existe donc, dans
 * tout le dépôt, AUCUN mécanisme qui retrouve « cet invité précis a déjà été
 * banni de cette conversation » — bannir un participant anonyme aujourd'hui
 * ferme SA ligne, pas la porte. Étendre le bannissement à une identité sans
 * compte persistant (par IP, empreinte d'appareil…) est une capacité NEUVE,
 * hors du critère 1 de #4167 (qui unifie ce qui EXISTE des deux côtés) — elle
 * est signalée en suivi, pas ajoutée ici en silence.
 */

import {
  isConversationClosed,
  type ConversationTerminalStateRow,
} from '../messaging/conversationWriteAdmission';
import {
  resolveConversationEntry,
  type ConversationEntryDecision,
  type ConversationEntryReader,
} from './conversationEntryAdmission';
import { isIpInRange } from '../../utils/ip-range';

/** D'où vient qui entre — jamais du CHEMIN appelé, toujours de la créance. */
export type LinkAdmissionIdentity =
  | { readonly kind: 'guest' }
  | { readonly kind: 'registered'; readonly userId: string };

/**
 * Les colonnes de `ConversationShareLink` que la loi lit. Un sous-ensemble
 * délibéré (structural) : un appelant qui tient le rang Prisma complet le
 * passe tel quel, un test construit un objet littéral minimal.
 */
export interface LinkAdmissionShareLink {
  readonly id: string;
  readonly conversationId: string;
  readonly isActive: boolean;
  readonly expiresAt: Date | null;
  readonly maxUses: number | null;
  readonly currentUses: number;
  readonly maxConcurrentUsers: number | null;
  readonly currentConcurrentUsers: number;
  readonly maxUniqueSessions: number | null;
  readonly currentUniqueSessions: number;
  readonly allowedIpRanges: readonly string[];
  readonly requireAccount: boolean;
}

export interface LinkAdmissionRequestInfo {
  /** IP résolue de l'appelant — `request.ip` sous `trustProxy` (#4137). */
  readonly ip: string;
}

/**
 * Les six codes que #4167 fixe pour `POST /links/:key/members` — exhaustifs :
 * toute autre situation est un `granted`.
 */
export type LinkAdmissionRefusalCode =
  | 'LINK_EXPIRED'
  | 'CONVERSATION_CLOSED'
  | 'LINK_EXHAUSTED'
  | 'REGION_NOT_ALLOWED'
  | 'ACCOUNT_REQUIRED'
  | 'BANNED';

export interface LinkAdmissionRefusal {
  readonly granted: false;
  readonly status: 410 | 409 | 403;
  readonly code: LinkAdmissionRefusalCode;
  readonly message: string;
}

export interface LinkAdmissionGrant {
  readonly granted: true;
  /**
   * `resolveConversationEntry` pour un inscrit ; toujours `{outcome:'create'}`
   * pour un invité — cf. doc-tête § bannissement.
   */
  readonly entry: ConversationEntryDecision;
}

export type LinkAdmissionVerdict = LinkAdmissionRefusal | LinkAdmissionGrant;

export interface AdmitLinkEntryParams {
  readonly prisma: ConversationEntryReader;
  readonly link: LinkAdmissionShareLink;
  readonly conversation: ConversationTerminalStateRow | null;
  readonly identity: LinkAdmissionIdentity;
  readonly request: LinkAdmissionRequestInfo;
}

function refuse(
  status: 410 | 409 | 403,
  code: LinkAdmissionRefusalCode,
  message: string
): LinkAdmissionRefusal {
  return { granted: false, status, code, message };
}

/**
 * Prédicat explicite plutôt qu'un simple `!verdict.granted` au site
 * d'appel : `tsconfig.json` du gateway porte `strict: false` /
 * `strictNullChecks: false`, sous lequel la narrowing automatique d'union
 * discriminée sur un littéral booléen ne se propage pas de façon fiable à
 * travers un `Promise` awaité (mesuré — `tsc` refusait `refusal: verdict`
 * après `if (!verdict.granted)`). Un garde de type NOMMÉ, lui, narrow
 * toujours.
 */
export function isLinkAdmissionRefusal(
  verdict: LinkAdmissionVerdict
): verdict is LinkAdmissionRefusal {
  return verdict.granted === false;
}

/**
 * La loi, une fois. Voir le doc-tête du fichier pour l'ordre et les deux
 * décisions (`allowedCountries` retiré, `allowedIpRanges` réel).
 */
export async function admitLinkEntry(
  params: AdmitLinkEntryParams
): Promise<LinkAdmissionVerdict> {
  const { prisma, link, conversation, identity, request } = params;

  if (!link.isActive) {
    return refuse(410, 'LINK_EXPIRED', "Ce lien n'est plus actif");
  }

  if (link.expiresAt !== null && link.expiresAt < new Date()) {
    return refuse(410, 'LINK_EXPIRED', 'Ce lien a expiré');
  }

  // Porte sur ce vers quoi le lien POINTE, pas sur le lien lui-même : une
  // clôture n'éteint aucun lien de partage (cf. `conversationEntryAdmission.ts`
  // § « L'ÉTAT DU CONTENEUR »).
  if (isConversationClosed(conversation)) {
    return refuse(410, 'CONVERSATION_CLOSED', 'Cette conversation est terminée');
  }

  if (link.maxUses !== null && link.currentUses >= link.maxUses) {
    return refuse(409, 'LINK_EXHAUSTED', "Ce lien a atteint sa limite d'utilisation");
  }

  if (
    link.maxConcurrentUsers !== null &&
    link.currentConcurrentUsers >= link.maxConcurrentUsers
  ) {
    return refuse(409, 'LINK_EXHAUSTED', "Nombre maximum d'utilisateurs concurrents atteint");
  }

  if (
    link.maxUniqueSessions !== null &&
    link.currentUniqueSessions >= link.maxUniqueSessions
  ) {
    return refuse(409, 'LINK_EXHAUSTED', 'Ce lien a atteint sa limite de sessions');
  }

  // `allowedCountries` : DÉLIBÉRÉMENT absent — cf. doc-tête § décision 2026-08-29.

  if (link.allowedIpRanges.length > 0) {
    const allowed = link.allowedIpRanges.some((range) => isIpInRange(request.ip, range));
    if (!allowed) {
      return refuse(403, 'REGION_NOT_ALLOWED', 'Accès non autorisé depuis votre adresse IP');
    }
  }

  if (identity.kind === 'guest' && link.requireAccount) {
    return refuse(403, 'ACCOUNT_REQUIRED', 'Un compte est requis pour rejoindre cette conversation');
  }

  // Un invité n'a pas de `User.id` à retrouver : chaque jointure lui crée une
  // ligne neuve (cf. doc-tête § bannissement). Rien à résoudre de plus.
  if (identity.kind === 'guest') {
    return { granted: true, entry: { outcome: 'create' } };
  }

  const entry = await resolveConversationEntry({
    prisma,
    conversationId: link.conversationId,
    userId: identity.userId,
    conversation,
  });

  if (entry.outcome === 'closed') {
    // Ne devrait plus survenir (la clôture est déjà tranchée plus haut) —
    // fail-closed si l'état a divergé entre les deux lectures.
    return refuse(410, 'CONVERSATION_CLOSED', 'Cette conversation est terminée');
  }

  if (entry.outcome === 'banned') {
    return refuse(403, 'BANNED', 'Vous avez été banni de cette conversation');
  }

  return { granted: true, entry };
}
