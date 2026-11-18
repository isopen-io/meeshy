/**
 * L'ACTIVITÉ D'UN LIEN en temps réel (#19446) : un clic, une arrivée, une entrée
 * ou un filleul fait bouger les chiffres de qui GÈRE le lien, sans recharger.
 *
 * - **Une adresse** : la room `user:<id>` de chaque destinataire, jamais une room
 *   de conversation. Les appelants nomment les destinataires ; ce module ne
 *   décide pas qui gère un lien, il ne fait que porter.
 * - **Des totaux ABSOLUS** : la dernière charge reçue fait foi ; un client qui en
 *   manque une ne compte rien de travers.
 * - **Rien du visiteur** : chaque charge est RECOMPOSÉE champ par champ — ni IP,
 *   ni empreinte, ni compte, ni nom ne peuvent partir à côté.
 * - **Hors du chemin de la requête** : l'émission est différée, et ne fait jamais
 *   échouer le geste qu'elle annonce.
 * - **Regroupée** : au plus une émission par fenêtre et par lien — la première
 *   part, la dernière de la rafale part à la fin de la fenêtre.
 * - **Aucune arrivée perdue** : `share-link:arrival` ACCUMULE les arrivées
 *   nommées de la fenêtre et les porte toutes (`arrivals`, chronologique,
 *   au plus `SHARE_LINK_ARRIVALS_MAX`, les plus récentes) ; au-delà,
 *   `arrivalsTruncated` dit au client de relire la liste. `arrival` reste la
 *   dernière, pour les clients qui ne lisent qu'elle.
 */
import {
  ROOMS,
  SERVER_EVENTS,
  type AffiliateReferralJoinedEventData,
  type CommunityLinkEntryEventData,
  type ShareLinkArrivalEventData,
  type TrackingLinkClickedEventData,
} from '@meeshy/shared/types/socketio-events';
import type { ServerEmitIO } from './serverEmit';
import { logger } from '../utils/logger';
import { guardedTimeout } from '../utils/guarded-timer';

export type LinkActivityScheduler = {
  readonly defer: (run: () => void) => void;
  readonly after: (ms: number, run: () => void) => void;
};

const realScheduler: LinkActivityScheduler = {
  defer: (run) => { setImmediate(run); },
  after: (ms, run) => { guardedTimeout({ name: 'link-activity-window', afterMs: ms, logger, run }).unref?.(); },
};

export const LINK_ACTIVITY_WINDOW_MS = 1000;
/** Les arrivées nommées qu'une charge porte au plus ; au-delà, le client relit. */
export const SHARE_LINK_ARRIVALS_MAX = 20;

type Send = (io: ServerEmitIO, room: string) => void;

/** `compose` est appelé UNE fois, au moment de l'envoi : la charge se fige alors. */
type Emission = {
  readonly recipientIds: readonly string[];
  readonly compose: () => Send;
};

type Arrival = ShareLinkArrivalEventData['arrival'];

export type TrackingLinkClickInput = {
  readonly link: {
    readonly token: string;
    readonly createdBy?: string | null;
    readonly totalClicks: number;
    readonly uniqueClicks: number;
    readonly lastClickedAt?: Date | null;
  };
  readonly click: { readonly country?: string | null; readonly clickedAt?: Date | null };
};

export type ShareLinkArrivalInput = {
  readonly recipientIds: readonly string[];
  readonly linkId: string;
  readonly currentUses: number;
  readonly maxUses: number | null;
  readonly arrival: {
    readonly participantId: string;
    readonly isAnonymous: boolean;
    readonly country: string | null;
    readonly joinedAt: Date;
  };
};

export type CommunityLinkEntryInput = {
  readonly recipientIds: readonly string[];
  readonly communityId: string;
  readonly linkId: string;
  readonly entries: number;
  readonly at: Date;
};

export type AffiliateReferralInput = {
  readonly sponsorId: string;
  readonly tokenId: string;
  readonly referralCount: number;
};

export type LinkActivityRelay = {
  readonly trackingLinkClicked: (input: TrackingLinkClickInput) => void;
  readonly shareLinkArrival: (input: ShareLinkArrivalInput) => void;
  readonly communityLinkEntry: (input: CommunityLinkEntryInput) => void;
  readonly affiliateReferralJoined: (input: AffiliateReferralInput) => void;
};

const distinct = (ids: readonly string[]): readonly string[] => [...new Set(ids.filter((id) => id.length > 0))];

export function createLinkActivityRelay(deps: {
  readonly io: () => ServerEmitIO | undefined;
  readonly scheduler?: LinkActivityScheduler;
  readonly windowMs?: number;
}): LinkActivityRelay {
  const scheduler = deps.scheduler ?? realScheduler;
  const windowMs = deps.windowMs ?? LINK_ACTIVITY_WINDOW_MS;
  const open = new Map<string, Emission | null>();

  const arrivalsByKey = new Map<string, Arrival[]>();

  const deliver = (emission: Emission): void => {
    try {
      const send = emission.compose();
      const io = deps.io();
      if (!io) return;
      distinct(emission.recipientIds).forEach((recipientId) => {
        try {
          send(io, ROOMS.user(recipientId));
        } catch {
          /* un destinataire injoignable n'empêche pas les autres */
        }
      });
    } catch {
      /* le geste annoncé est déjà écrit */
    }
  };

  const closeWindow = (key: string): void => {
    const pending = open.get(key);
    if (!pending) {
      open.delete(key);
      return;
    }
    open.set(key, null);
    deliver(pending);
    scheduler.after(windowMs, () => closeWindow(key));
  };

  const push = (key: string, emission: Emission, accumulate?: () => void): void => {
    if (emission.recipientIds.length === 0) return;
    scheduler.defer(() => {
      accumulate?.();
      if (open.has(key)) {
        open.set(key, emission);
        return;
      }
      open.set(key, null);
      deliver(emission);
      scheduler.after(windowMs, () => closeWindow(key));
    });
  };

  return {
    trackingLinkClicked: ({ link, click }) => {
      if (!link.createdBy) return;
      const payload: TrackingLinkClickedEventData = {
        token: link.token,
        totalClicks: link.totalClicks,
        uniqueClicks: link.uniqueClicks,
        lastClickedAt: (link.lastClickedAt ?? click.clickedAt ?? new Date()).toISOString(),
        country: click.country ?? null,
      };
      push(`tracking:${link.token}`, {
        recipientIds: [link.createdBy],
        compose: () => (io, room) => io.to(room).emit(SERVER_EVENTS.TRACKING_LINK_CLICKED, payload),
      });
    },
    shareLinkArrival: (input) => {
      const key = `share:${input.linkId}`;
      const arrival: Arrival = {
        participantId: input.arrival.participantId,
        isAnonymous: input.arrival.isAnonymous,
        country: input.arrival.country,
        joinedAt: input.arrival.joinedAt.toISOString(),
      };
      push(key, {
        recipientIds: input.recipientIds,
        compose: () => {
          const pending = arrivalsByKey.get(key) ?? [arrival];
          arrivalsByKey.delete(key);
          const payload: ShareLinkArrivalEventData = {
            linkId: input.linkId,
            currentUses: input.currentUses,
            maxUses: input.maxUses,
            arrival: pending[pending.length - 1] ?? arrival,
            arrivals: pending.slice(-SHARE_LINK_ARRIVALS_MAX),
            arrivalsTruncated: pending.length > SHARE_LINK_ARRIVALS_MAX,
          };
          return (io, room) => io.to(room).emit(SERVER_EVENTS.SHARE_LINK_ARRIVAL, payload);
        },
      }, () => {
        const buffer = arrivalsByKey.get(key) ?? [];
        // Borné en mémoire : au-delà de la borne, seules les plus récentes servent.
        arrivalsByKey.set(key, [...buffer, arrival].slice(-(SHARE_LINK_ARRIVALS_MAX + 1)));
      });
    },
    communityLinkEntry: (input) => {
      const payload: CommunityLinkEntryEventData = {
        communityId: input.communityId,
        linkId: input.linkId,
        entries: input.entries,
        at: input.at.toISOString(),
      };
      push(`community:${input.communityId}`, {
        recipientIds: input.recipientIds,
        compose: () => (io, room) => io.to(room).emit(SERVER_EVENTS.COMMUNITY_LINK_ENTRY, payload),
      });
    },
    affiliateReferralJoined: (input) => {
      const payload: AffiliateReferralJoinedEventData = { tokenId: input.tokenId, referralCount: input.referralCount };
      push(`affiliate:${input.tokenId}`, {
        recipientIds: [input.sponsorId],
        compose: () => (io, room) => io.to(room).emit(SERVER_EVENTS.AFFILIATE_REFERRAL_JOINED, payload),
      });
    },
  };
}

export type LinkActivityHost = {
  readonly socketIOHandler?: { getManager?: () => { getIO?: () => ServerEmitIO | undefined } | null | undefined } | null;
};

const relays = new WeakMap<object, LinkActivityRelay>();

/** Le relais d'UNE instance de passerelle, créé à la première émission. */
export function linkActivityRelayOf(host: LinkActivityHost): LinkActivityRelay {
  const known = relays.get(host);
  if (known) return known;
  const relay = createLinkActivityRelay({ io: () => host.socketIOHandler?.getManager?.()?.getIO?.() });
  relays.set(host, relay);
  return relay;
}
