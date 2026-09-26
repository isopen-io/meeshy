import type { CallSession } from './call-sessions';
import type { CallHistoryFilter, CallHistoryPage, CallRecord } from './calls';

/**
 * **LE JOURNAL D'APPELS DU LECTEUR DE RECETTE** (#6362) — servi par le MÊME
 * chemin que la passerelle (`calls.ts`, garde `__FIXTURES__ && source ===
 * 'fixtures'`), élagué de tout build `VITE_DATA_SOURCE=gateway`
 * (`vite.config.ts § FIXTURE_MODULE`).
 *
 * Cinq appels, et pas un : un MANQUÉ, un ÉMIS en vidéo, un REÇU, un appel de
 * GROUPE (sans pair, nommé par sa conversation) et un manqué vidéo — c'est ce
 * qui fait voir les trois directions, les deux types, une durée passé l'heure
 * et une ligne sans durée. Chaque appel mène à un fil du jeu de fixtures
 * (`c-amina`, `c-kwame`, `c-annonces`, `c-nouvelle`) : ouvrir une ligne ouvre
 * un vrai fil. Les dates suivent l'horloge, pour que l'heure relative se lise.
 *
 * **Chaque date se tient à distance d'une borne d'unité** (`ago` ajoute une
 * demi-unité de marge au compte rond) : l'écran prend son « maintenant » au
 * premier rendu, quelques millisecondes AVANT que ce module ne calcule ses
 * dates, et un appel d'exactement trois heures s'y lisait « 2h ».
 */

const MINUTE = 60_000;

const ago = (minutes: number): string => new Date(Date.now() - (minutes + Math.max(0.5, minutes * 0.05)) * MINUTE).toISOString();

const peer = (userId: string, username: string, displayName: string): CallRecord['peer'] => ({ userId, username, displayName, avatar: null });

const records = (): readonly CallRecord[] => [
  {
    callId: 'call-amina-manque',
    conversationId: 'c-amina',
    conversationType: 'direct',
    conversationTitle: null,
    conversationAvatar: null,
    direction: 'missed',
    isVideo: false,
    startedAt: ago(12),
    durationSec: 0,
    bytes: null,
    peer: peer('u-amina', 'amina', 'Amina Diallo'),
  },
  {
    callId: 'call-kwame-video',
    conversationId: 'c-kwame',
    conversationType: 'direct',
    conversationTitle: null,
    conversationAvatar: null,
    direction: 'outgoing',
    isVideo: true,
    startedAt: ago(3 * 60),
    durationSec: 754,
    bytes: 48_620_000,
    peer: peer('u-kwame', 'kwame', 'Kwame Mensah'),
  },
  {
    callId: 'call-annonces-groupe',
    conversationId: 'c-annonces',
    conversationType: 'public',
    conversationTitle: 'Annonces produit',
    conversationAvatar: null,
    direction: 'incoming',
    isVideo: false,
    startedAt: ago(26 * 60),
    durationSec: 3725,
    bytes: 18_400_000,
    peer: null,
  },
  {
    callId: 'call-amina-recu',
    conversationId: 'c-amina',
    conversationType: 'direct',
    conversationTitle: null,
    conversationAvatar: null,
    direction: 'incoming',
    isVideo: false,
    startedAt: ago(3 * 24 * 60),
    durationSec: 185,
    bytes: 2_310_000,
    peer: peer('u-amina', 'amina', 'Amina Diallo'),
  },
  {
    callId: 'call-fatou-manque',
    conversationId: 'c-nouvelle',
    conversationType: 'direct',
    conversationTitle: null,
    conversationAvatar: null,
    direction: 'missed',
    isVideo: true,
    startedAt: ago(9 * 24 * 60),
    durationSec: 0,
    bytes: null,
    peer: peer('u-fatou', 'fatou', 'Fatou Bâ'),
  },
];

export function fixtureCallHistory(filter: CallHistoryFilter): CallHistoryPage {
  const all = records();
  return { records: filter === 'missed' ? all.filter((record) => record.direction === 'missed') : all, nextCursor: null };
}

/**
 * **L'APPEL EN COURS DU LECTEUR DE RECETTE** (lot 3) — `call-kwame-live`, un
 * appel vidéo VIVANT dans `c-kwame`. Il ne répond à `GET /calls/active` que
 * sur DEMANDE (`FIXTURE_ACTIVE_CALL_KEY` posé dans le stockage local par un
 * gate) : servi à tous, il ferait paraître la bannière « Reprendre l'appel »
 * sur chaque capture de chaque gate. Le lien profond `/call/call-kwame-live`,
 * lui, le lit toujours — c'est une adresse, pas une bannière.
 */
export const FIXTURE_ACTIVE_CALL_KEY = 'meeshy.fixtures.active-call';
export const FIXTURE_LIVE_CALL_ID = 'call-kwame-live';

const liveSession = (): CallSession => ({
  callId: FIXTURE_LIVE_CALL_ID,
  conversationId: 'c-kwame',
  media: 'video',
  live: true,
  initiatorId: 'u-kwame',
  answered: true,
  startedAt: ago(4),
  durationSec: 0,
  participants: [{ userId: 'u-kwame', name: 'Kwame Mensah', avatar: null }],
});

export function fixtureActiveCall(): CallSession | null {
  try {
    return globalThis.localStorage?.getItem(FIXTURE_ACTIVE_CALL_KEY) === FIXTURE_LIVE_CALL_ID ? liveSession() : null;
  } catch {
    return null;
  }
}

/**
 * LE NUMÉRO DE RECETTE DU PAVÉ (#6454) — un seul compte porte un numéro dans
 * le jeu : Amina, dont le direct `c-amina` existe (le démarrage d'appel passe
 * par `createDirectConversation`, idempotent). Tout autre numéro : aucun compte.
 */
export const FIXTURE_PHONE = '+221770000001';

export function fixturePhoneLookup(phone: string): { readonly id: string; readonly username: string; readonly displayName: string; readonly avatar: null } | null {
  return phone.replace(/\D/g, '') === FIXTURE_PHONE.replace(/\D/g, '') ? { id: 'u-amina', username: 'amina.diallo', displayName: 'Amina Diallo', avatar: null } : null;
}

/** Un appel du journal (terminé) ou l'appel vivant, par son identifiant — `null` sinon, comme un 404. */
export function fixtureCallSession(callId: string): CallSession | null {
  if (callId === FIXTURE_LIVE_CALL_ID) return liveSession();
  const record = records().find((entry) => entry.callId === callId);
  if (record === undefined) return null;
  return {
    callId: record.callId,
    conversationId: record.conversationId,
    media: record.isVideo ? 'video' : 'audio',
    live: false,
    initiatorId: record.direction === 'outgoing' ? 'u-viewer' : (record.peer?.userId ?? null),
    answered: record.direction !== 'missed',
    startedAt: record.startedAt,
    durationSec: record.durationSec,
    participants: record.peer === null ? [] : [{ userId: record.peer.userId, name: record.peer.displayName ?? record.peer.username, avatar: record.peer.avatar }],
  };
}
