import type { IncomingMessage } from 'node:http';

import type { Identite } from './bouchon-socket';
import { CONVERSATION_DU_LECTEUR } from './bouchon-monde';

/**
 * `GET /api/v1/calls/history` — l'historique des appels (#5108).
 *
 * NOUVEAU FICHIER, pas un ajout à `bouchon-compte.ts` (1144 lignes, en bande
 * budgétaire) : le patron déjà suivi par `bouchon-carnet.ts` (les liens
 * partagés, extraits pour la même raison, #4170).
 *
 * COPIE LA LOI DE `calls-consultation.ts:450-553` + `CallService.listHistory`
 * (`services/gateway/src/services/CallService.ts:2414`), pas une réponse
 * inventée (leçon 422) : `preValidation: [requiredAuth]` SEUL — un porteur
 * JWT, jamais une session invitée (`X-Session-Token` n'y donne jamais accès,
 * contrairement à `/anonymous/*`) —, la pagination par CURSEUR (id du dernier
 * appel servi, comme le keyset réel), et les clés EXACTES de `CallHistoryItem`
 * (`callHistory.ts:31-52`) : `direction`, `isVideo`, `durationSec` DÉRIVÉS
 * (ce que le bouchon sert comme le SERVEUR les calcule, jamais comme le client
 * les recalculerait), `peer: null` pour un appel de GROUPE.
 */

type Reponse = (corps: unknown, statut?: number) => void;

type LigneDAppelDeBouchon = {
  readonly callId: string;
  readonly conversationId: string;
  readonly conversationType: 'direct' | 'group';
  readonly conversationTitle: string | null;
  readonly direction: 'incoming' | 'outgoing' | 'missed';
  readonly isVideo: boolean;
  readonly startedAt: string;
  readonly durationSec: number;
  readonly peer: {
    readonly userId: string;
    readonly username: string;
    readonly displayName: string | null;
    readonly isOnline: boolean;
  } | null;
};

/**
 * QUATRE LIGNES NOMMÉES — la matière EXACTE de la cible (manqué entrant, audio
 * 12 min, vidéo 41 min) plus une quatrième. La ligne VIDÉO pointe
 * `CONVERSATION_DU_LECTEUR` (même identifiant ET même titre, « Équipe Lagos ») :
 * c'est ce que le clic de ligne doit atteindre — un fil que le bouchon sert
 * déjà, pas une conversation inventée.
 */
const NOMMEES: readonly LigneDAppelDeBouchon[] = [
  {
    callId: 'call-1-manque',
    conversationId: 'conv-support',
    conversationType: 'direct',
    conversationTitle: null,
    direction: 'missed',
    isVideo: false,
    startedAt: '2026-09-05T13:02:00.000Z',
    durationSec: 0,
    peer: { userId: 'u-support', username: 'support', displayName: 'Support produit', isOnline: true },
  },
  {
    callId: 'call-2-audio',
    conversationId: 'conv-marta',
    conversationType: 'direct',
    conversationTitle: null,
    direction: 'incoming',
    isVideo: false,
    startedAt: '2026-09-04T09:00:00.000Z',
    durationSec: 720,
    peer: { userId: 'u-marta', username: 'marta', displayName: 'Marta Ruiz', isOnline: true },
  },
  {
    callId: 'call-3-video',
    conversationId: CONVERSATION_DU_LECTEUR.id,
    conversationType: 'group',
    conversationTitle: CONVERSATION_DU_LECTEUR.titre,
    direction: 'outgoing',
    isVideo: true,
    startedAt: '2026-09-01T09:00:00.000Z',
    durationSec: 2460,
    peer: null,
  },
  {
    callId: 'call-4-ancien',
    conversationId: 'conv-kofi',
    conversationType: 'direct',
    conversationTitle: null,
    direction: 'outgoing',
    isVideo: false,
    startedAt: '2026-08-20T10:00:00.000Z',
    durationSec: 45,
    peer: { userId: 'u-kofi', username: 'kofi', displayName: 'Kofi Owusu', isOnline: false },
  },
];

/**
 * LE REMPLISSAGE QUI REND LA PAGINATION ATTEIGNABLE — et il n'est pas
 * décoratif. La porte demande `limit=30` (`lib/api/appels.ts`) : un bouchon de
 * QUATRE lignes rend `hasMore:false` À TOUT COUP, donc le lien « Appels plus
 * anciens » n'est JAMAIS peint par un navigateur, et l'état paginé de l'écran
 * n'est mesuré par personne. C'est ce trou qui a laissé passer un lien
 * positionné au-dessus de l'en-tête (`.plus-ancien{order:-1}` non porté,
 * `fil-feuille.ts`).
 *
 * TRENTE ET UNE LIGNES AU TOTAL, jamais une seconde page DÉCLARÉE : le keyset
 * du bouchon reste celui de `CallService.listHistory` — `hasMore` se DÉDUIT de
 * ce qui reste après la tranche servie, `nextCursor` est l'id de la DERNIÈRE
 * ligne servie. Un bouchon qui annoncerait `hasMore:true` sur une page plus
 * courte que sa limite mentirait sur le contrat qu'il copie.
 */
const REMPLISSAGE: readonly LigneDAppelDeBouchon[] = Array.from({ length: 27 }, (_, index) => ({
  callId: `call-${index + 5}-ancien`,
  conversationId: `conv-ancien-${index + 5}`,
  conversationType: 'direct' as const,
  conversationTitle: null,
  direction: (index % 2 === 0 ? 'outgoing' : 'incoming') as 'outgoing' | 'incoming',
  isVideo: false,
  startedAt: new Date(Date.UTC(2026, 6, 20 - index, 10, 0, 0)).toISOString(),
  durationSec: 60 + index,
  peer: { userId: `u-ancien-${index + 5}`, username: `ancien${index + 5}`, displayName: null, isOnline: false },
}));

const LIGNES: readonly LigneDAppelDeBouchon[] = [...NOMMEES, ...REMPLISSAGE];

const ligneServie = (l: LigneDAppelDeBouchon) => ({
  callId: l.callId,
  conversationId: l.conversationId,
  conversationType: l.conversationType,
  conversationTitle: l.conversationTitle,
  conversationAvatar: null,
  mode: l.isVideo ? 'video' : 'audio',
  status: l.direction === 'missed' ? 'missed' : 'ended',
  endReason: null,
  direction: l.direction,
  isVideo: l.isVideo,
  startedAt: l.startedAt,
  answeredAt: l.direction === 'missed' ? null : l.startedAt,
  endedAt: l.direction === 'missed' ? null : l.startedAt,
  durationSec: l.durationSec,
  bytesSent: null,
  bytesReceived: null,
  peer:
    l.peer === null
      ? null
      : { userId: l.peer.userId, username: l.peer.username, displayName: l.peer.displayName, avatar: null, phoneNumber: null, isOnline: l.peer.isOnline },
});

export const routesDesAppels =
  (
    creanceDe: (requete: IncomingMessage) => Identite | null,
    options: { readonly vide: () => boolean; readonly reduit?: () => boolean } = { vide: () => false },
  ) =>
  ({ requete, url, json }: { readonly requete: IncomingMessage; readonly url: URL; readonly json: Reponse }): boolean => {
    if (url.pathname !== '/api/v1/calls/history') return false;

    // `preValidation: [requiredAuth]` SEUL — jamais `X-Session-Token`.
    const porteur = requete.headers.authorization ?? '';
    if (!porteur.startsWith('Bearer ')) {
      json({ success: false, error: { code: 'NOT_AUTHENTICATED', message: 'Authentication required' } }, 401);
      return true;
    }
    if (creanceDe(requete)?.genre !== 'membre') {
      json({ success: false, error: { code: 'NOT_AUTHENTICATED', message: 'Invalid JWT token' } }, 401);
      return true;
    }

    if (options.vide()) {
      json({ success: true, data: [], pagination: { limit: 30, hasMore: false } });
      return true;
    }

    /**
     * TROIS LIGNES, SANS REMPLISSAGE — la matière EXACTE de `cible/calls.png`
     * (manqué, audio, vidéo), `hasMore:false` : rien à paginer. Distinct de
     * `vide()` (aucune ligne) — un troisième état de fixture, comme
     * `communautesVides` / `appelsVides` le sont déjà l'un de l'autre.
     * `conformite-des-vues.ts` le demande UNIQUEMENT quand `calls` est parmi
     * les vues comparées : les 31 lignes restent le défaut de tout autre
     * appelant (la pagination doit rester ATTEIGNABLE ailleurs, voir le
     * commentaire de `REMPLISSAGE` ci-dessus).
     */
    if (options.reduit?.()) {
      json({ success: true, data: NOMMEES.slice(0, 3).map(ligneServie), pagination: { limit: 30, hasMore: false } });
      return true;
    }

    const limite = Number(url.searchParams.get('limit') ?? '30') || 30;
    const curseur = url.searchParams.get('cursor');
    const debut = curseur === null ? 0 : LIGNES.findIndex((l) => l.callId === curseur) + 1;
    const page = LIGNES.slice(debut, debut + limite);
    const dernier = page.length === 0 ? undefined : page[page.length - 1]?.callId;
    const hasMore = debut + page.length < LIGNES.length;

    json({
      success: true,
      data: page.map(ligneServie),
      pagination: { limit: limite, hasMore, ...(hasMore && dernier !== undefined ? { nextCursor: dernier } : {}) },
    });
    return true;
  };
