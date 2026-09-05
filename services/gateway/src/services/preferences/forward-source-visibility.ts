/**
 * Le résolveur d'entrées/sorties de la réciprocité des sources de transfert.
 *
 * La RÈGLE elle-même est pure et vit dans `@meeshy/shared/utils/forward-source-visibility`
 * (`resolveForwardSourceVisibility`) — une donnée, un résolveur. Ce module ne
 * fait que lui apporter les deux volontés à confronter, en une lecture groupée
 * et mémoïsée.
 *
 * ## Ce qu'il coûte
 *
 * Presque rien. Il passe par `loadPrivacyPreferencesCached`, LE cache module de
 * la gateway (TTL 5 min, borné à 5000, purgé par toute écriture de la
 * catégorie). Sur la liste REST, les auteurs de transferts sont un
 * sous-ensemble des expéditeurs de la page, dont les préférences sont déjà
 * chaudes : le seul identifiant neuf est celui du lecteur.
 *
 * ## Ce qu'il ne fait PAS : dénormaliser
 *
 * La préférence ne voyage jamais avec le message. La figer à l'envoi rendrait
 * l'historique insensible au réglage — couper le réglage ne masquerait que les
 * transferts À VENIR, ce que personne ne comprend en cochant une case. Lue au
 * moment de servir, elle prend effet immédiatement sur tout l'historique.
 *
 * ## Anonymes et incidents : on ÉCHOUE OUVERT, c'est-à-dire au DÉFAUT
 *
 * Un anonyme n'a pas de `User`, donc pas de préférence : il est servi par le
 * défaut, qui vaut `true`. Idem sur incident de base — `loadStoredPrivacyPreferences`
 * ne rattrape rien, et mémoriser un échec le figerait pour cinq minutes.
 * « Ouvert » ici veut dire « comme si personne n'avait rien réglé », ce qui est
 * l'état de tout le parc : un incident de base ne doit pas masquer les sources
 * de tout le monde, pas plus qu'il ne doit en révéler une que quelqu'un a
 * explicitement tue — et il ne le peut pas, un opt-out n'étant jamais deviné.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  allowsForwardSource,
  carriesForwardSource,
  resolveForwardSourceVisibility,
  withoutForwardSource,
} from '@meeshy/shared/utils/forward-source-visibility';
import { loadPrivacyPreferencesCached } from './privacy-cache.js';
import { redactForwardedAttachmentUrlsIn } from './forwarded-attachment-urls.js';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'forward-source-visibility' });

/**
 * Le retrait COMPLET d'une source de transfert : le nom ET le chemin.
 *
 * `withoutForwardSource` (shared, pur) retire `forwardedFrom` et
 * `forwardedFromConversation`. Il ne peut pas faire plus : la seconde fuite ne
 * vit pas dans ces champs mais dans `attachments[].fileUrl`, où le chemin de
 * stockage de la copie porte le `User.id` de l'auteur d'origine — un transfert
 * réutilise le fichier plutôt que de le recopier.
 *
 * Les émissions qui masquent une source passent par ici, et non par le seul
 * `withoutForwardSource` : masquer sur un canal en laissant l'autre ouvert ne
 * masque rien. La porte REST ferme la même fuite avec le même helper.
 */
export const withoutForwardSourceOrItsPath = <T extends object>(payload: T): T => {
  const stripped = withoutForwardSource(payload) as T & { attachments?: unknown };
  if (!Array.isArray(stripped.attachments)) return stripped;

  return {
    ...stripped,
    attachments: redactForwardedAttachmentUrlsIn(stripped.attachments as never[]),
  } as T;
};

/** Répond « ce lecteur-ci a-t-il droit à la source transférée par celui-là ? ». */
export type ForwardSourceGate = (forwarderUserId: string | null | undefined) => boolean;

const ALWAYS_VISIBLE: ForwardSourceGate = () => true;

const uniqueIds = (ids: ReadonlyArray<string | null | undefined>): string[] => [
  ...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0)),
];

/**
 * UN lecteur, PLUSIEURS auteurs de transferts — la forme du chemin REST.
 *
 * Le lecteur est joint aux auteurs dans la MÊME lecture groupée : un seul
 * aller-retour, et son entrée reste chaude pour les pages suivantes.
 */
export async function resolveForwardSourceGateForReader(
  prisma: PrismaClient,
  readerUserId: string | null | undefined,
  forwarderUserIds: ReadonlyArray<string | null | undefined>,
): Promise<ForwardSourceGate> {
  const forwarders = uniqueIds(forwarderUserIds);
  const reader = typeof readerUserId === 'string' && readerUserId.length > 0 ? readerUserId : null;

  // Le raccourci ne vaut que s'il n'y a RIEN à décider. Sortir dès que les
  // auteurs sont inconnus (transferts d'anonymes) sauterait la moitié
  // « lecteur » de la règle : un lecteur qui s'est retiré verrait quand même
  // les sources, du seul fait que l'auteur n'a pas de compte.
  if (forwarders.length === 0 && reader === null) return ALWAYS_VISIBLE;

  try {
    const stored = await loadPrivacyPreferencesCached(
      prisma,
      reader ? [reader, ...forwarders] : forwarders,
    );
    // Un lecteur anonyme n'a pas de préférence : il est servi par le défaut.
    const readerAllows = reader ? allowsForwardSource(stored.get(reader)) : true;

    return (forwarderUserId) =>
      resolveForwardSourceVisibility({
        isSelf: reader !== null && forwarderUserId === reader,
        forwarderAllows: forwarderUserId
          ? allowsForwardSource(stored.get(forwarderUserId))
          : true,
        readerAllows,
      });
  } catch (error) {
    logger.error('forward source preferences fetch failed — serving the default', { error });
    return ALWAYS_VISIBLE;
  }
}

/** Le verdict d'une diffusion : un auteur fixe, un salon de lecteurs. */
export type ForwardSourceBroadcastVerdict = {
  /** `false` ⇒ la source est retirée pour TOUT LE MONDE sauf l'auteur lui-même. */
  readonly forwarderAllows: boolean;
  /** Les `User.id` des lecteurs qui ont refusé — vide dans le cas nominal. */
  readonly refusingReaderIds: ReadonlySet<string>;
};

const EVERYONE_ALLOWS: ForwardSourceBroadcastVerdict = {
  forwarderAllows: true,
  refusingReaderIds: new Set(),
};

/**
 * UN auteur, PLUSIEURS lecteurs — la forme du chemin socket et de la file.
 *
 * L'auteur étant fixe par message, son refus tranche pour tout le salon d'un
 * coup et dispense de lire quoi que ce soit des lecteurs. Son accord, lui, ne
 * laisse que la moitié « lecteur » à décider : elle partage les destinataires
 * en exactement DEUX groupes, jamais plus. C'est ce qui rend la règle
 * finançable sur une diffusion.
 */
export async function resolveForwardSourceForBroadcast(
  prisma: PrismaClient,
  forwarderUserId: string | null | undefined,
  readerUserIds: ReadonlyArray<string | null | undefined>,
): Promise<ForwardSourceBroadcastVerdict> {
  const forwarder =
    typeof forwarderUserId === 'string' && forwarderUserId.length > 0 ? forwarderUserId : null;
  const readers = uniqueIds(readerUserIds).filter((id) => id !== forwarder);

  try {
    const stored = await loadPrivacyPreferencesCached(
      prisma,
      forwarder ? [forwarder, ...readers] : readers,
    );

    // Un auteur anonyme n'a pas de préférence : il est servi par le défaut.
    if (forwarder && !allowsForwardSource(stored.get(forwarder))) {
      return { forwarderAllows: false, refusingReaderIds: new Set() };
    }

    return {
      forwarderAllows: true,
      refusingReaderIds: new Set(
        readers.filter((readerId) => !allowsForwardSource(stored.get(readerId))),
      ),
    };
  } catch (error) {
    logger.error('forward source preferences fetch failed — serving the default', { error });
    return EVERYONE_ALLOWS;
  }
}

/** Le triplet dont une diffusion `message:new` porteuse d'une source a besoin. */
export type ForwardSourceBroadcastPayload<T> = {
  readonly peerPayload: T;
  readonly forwardSourceHiddenRooms: string[];
  readonly forwardSourceHiddenUserIds: ReadonlySet<string>;
};

const NOTHING_HIDDEN = { forwardSourceHiddenRooms: [] as string[], forwardSourceHiddenUserIds: new Set<string>() };

/**
 * Résout le payload à diffuser aux PAIRS d'un message qui porte une source de
 * transfert, avec les salons/lecteurs à en priver. Un seul appelant
 * (`MessageHandler.broadcastNewMessage`) ; extrait pour garder ce fichier
 * seul propriétaire de la réciprocité des sources de transfert.
 *
 * `sharedParticipants === undefined` ⇒ la requête participants qui charge les
 * lecteurs est TOMBÉE — pas « aucun lecteur ». La confondre avec `[]` revient
 * à affirmer qu'il n'y a personne à masquer, donc à servir la provenance à
 * TOUT LE MONDE au moindre incident de base (fail-open d'une règle de
 * confidentialité). On échoue FERMÉ à la place : la source est retirée pour
 * tout le salon, comme si l'auteur du transfert s'était lui-même retiré.
 */
export async function resolveForwardSourceBroadcastPayload<T extends object>(
  prisma: PrismaClient,
  params: {
    readonly senderUserId: string | null;
    readonly sharedParticipants: ReadonlyArray<{ userId: string | null }> | undefined;
    readonly broadcastPayload: T;
    readonly userRoom: (userId: string) => string;
  }
): Promise<ForwardSourceBroadcastPayload<T>> {
  const { senderUserId, sharedParticipants, broadcastPayload, userRoom } = params;

  if (!carriesForwardSource(broadcastPayload)) {
    return { peerPayload: broadcastPayload, ...NOTHING_HIDDEN };
  }

  if (sharedParticipants === undefined) {
    logger.warn('forward source: participant list unavailable — stripping for all peers (fail-closed)');
    return { peerPayload: withoutForwardSourceOrItsPath(broadcastPayload), ...NOTHING_HIDDEN };
  }

  const verdict = await resolveForwardSourceForBroadcast(
    prisma,
    senderUserId,
    sharedParticipants.map((participant) => participant.userId)
  );

  if (!verdict.forwarderAllows) {
    // L'auteur s'est retiré : plus personne n'apprend la provenance — sauf
    // lui-même, servi par `senderPayload` (se cacher des autres n'est pas
    // s'aveugler).
    return { peerPayload: withoutForwardSourceOrItsPath(broadcastPayload), ...NOTHING_HIDDEN };
  }

  return {
    peerPayload: broadcastPayload,
    forwardSourceHiddenRooms: [...verdict.refusingReaderIds].map(userRoom),
    forwardSourceHiddenUserIds: verdict.refusingReaderIds,
  };
}
