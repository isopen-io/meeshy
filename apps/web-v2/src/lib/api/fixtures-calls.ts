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
    peer: peer('u-fatou', 'fatou', 'Fatou Bâ'),
  },
];

export function fixtureCallHistory(filter: CallHistoryFilter): CallHistoryPage {
  const all = records();
  return { records: filter === 'missed' ? all.filter((record) => record.direction === 'missed') : all, nextCursor: null };
}
