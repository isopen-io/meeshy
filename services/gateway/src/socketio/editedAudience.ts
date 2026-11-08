import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

import { enhancedLogger } from '../utils/logger-enhanced.js';
import { translationReaders, type TranslationReaders } from './translationReaders';
import { safeBroadcast } from './serverEmit';
import type { ServerEmitIO, ServerEmitTarget } from './serverEmit';
import type { ServerEventPayload } from './serverEmit';

const logger = enhancedLogger.child({ module: 'EditedAudience' });

const EMPTY_KEYS: ReadonlySet<string> = new Set();

export type EditAudiencePrisma = Pick<PrismaClient, 'participant' | 'conversationShareLink' | 'message'>;

/**
 * **QUI a le droit de LIRE ce message** — la loi `translationReaders` (#9709),
 * appliquée au texte d'une ÉDITION, et le SITE UNIQUE qui la porte.
 *
 * Elle existait déjà et gouvernait trois autres sorties : `message:translation`
 * (« un invité entré par un lien sans historique recevait donc le TEXTE traduit
 * des messages écrits avant lui »), l'APERÇU de la ligne de liste
 * (`emitConversationPreviewUpdate`, `latestBelowFloor`) et l'extrait de
 * réaction. Elle ne gouvernait pas `message:edited`, dont la charge porte
 * pourtant « le texte APRÈS édition » pour un message que `GET …/messages`,
 * `/sync` et `conversation:updated` refusent tous à ce lecteur.
 *
 * ─── Pourquoi un module, et pas une fonction locale ──────────────────────────
 *
 * Parce que l'édition a DEUX transports, et qu'un audit adversarial a mesuré
 * que la première version de cette garde n'en couvrait qu'un. `message:edited`
 * part aussi de `MessageHandler.handleMessageEdit` (le transport socket, que
 * deux doc-comments du dépôt nomment « primaire »), qui n'appelle pas
 * `broadcastMessageMutation` — la garde y était donc contournable par toute
 * socket authentifiée, l'événement client étant enregistré, validé et
 * rate-limité.
 *
 * **Une règle qui doit être retapée à chaque site est une règle qu'un site
 * finira par ne pas avoir** : ce module est l'endroit où elle n'est écrite
 * qu'une fois.
 *
 * ─── DEUX lectures, et une seule a une valeur de repli ───────────────────────
 *
 * Même discipline qu'en #16965, et pour la même raison : les enfermer dans un
 * seul `try` ferait perdre toute la remise sur la panne de l'une.
 *
 * - **la DATE du message** est récupérable : `null` est une valeur que la loi
 *   traite, et bien — « une date de message inconnue fait lire le plancher de
 *   tous, et exclut quiconque en a un ». Une lecture tombée vaut donc `null`,
 *   et l'audience reste juste, seulement plus étroite ;
 * - **la LOI elle-même** n'en a aucune : si ses lectures de participants
 *   tombent, on ne sait NI qui est bloqué, NI qui est autorisé. Diffuser à la
 *   room servirait le texte à un lecteur peut-être sans droit ; exclure « tout
 *   le monde » n'est pas exprimable par un ensemble de clés. D'où le troisième
 *   état `'unknown'`, où l'appelant se tait sur les DEUX canaux — direct et
 *   file.
 *
 * **Ce que `'unknown'` rend perdable, et c'est écrit parce que ça se décide** :
 * une édition, pour tout lecteur HORS LIGNE, jusqu'à un rechargement complet
 * (le fil web tourne sous `staleTime: Infinity`). Avant cette garde, l'enfilage
 * survivait à une panne de lecture de participants. L'arbitrage est qu'un
 * contenu persisté 48 h chez qui n'y a pas droit coûte plus qu'une remise
 * perdue dont la base garde la vérité — mais le coût est réel, et l'appelant
 * reçoit l'erreur (`onError`) pour que la panne soit NOMMÉE là où il journalise.
 */
export type EditReadership = TranslationReaders | { readonly kind: 'unknown' };

/**
 * Les clés de file que le plancher écarte — vide dès que la room entière peut
 * lire.
 *
 * **L'ensemble est plus LARGE que le plancher, et par héritage de la loi, pas
 * par choix de ce site.** `translationReaders` le compose comme « actifs moins
 * admis » : un participant actif mais BANNI, ou un invité dont le lien a
 * expiré, en fait donc partie — ce qui est plus strict, jamais plus permissif.
 * Mais il ne le fait QUE lorsqu'un TIERS se trouve sous plancher, puisque sinon
 * la loi rend `{ kind: 'room' }` et toute la room est servie : l'audience d'une
 * édition dépend alors du `joinedAt` de quelqu'un d'autre. Ce n'est pas une
 * fuite ; c'est un couplage qui rendrait la prochaine régression illisible, et
 * il est écrit ici pour qu'on ne le redécouvre pas comme un défaut.
 */
export const blockedEditKeys = (readership: EditReadership): ReadonlySet<string> =>
  readership.kind === 'readers' ? readership.excludedQueueKeys : EMPTY_KEYS;

export async function editReadership(
  prisma: EditAudiencePrisma,
  conversationId: string,
  messageId: string,
  onError?: (error: unknown) => void,
): Promise<EditReadership> {
  // DEUX gardes par lecture, et aucune ne subsume l'autre (§ Critical Gotchas) :
  // le `try/catch` garde l'APPEL — un double de prisma sans la méthode, un
  // `throw` synchrone — et c'est le cas qui est tombé pendant le lot ; `await`
  // dans le même bloc garde la PROMESSE. Un `.then().catch()` ne voyait que la
  // seconde.
  let createdAt: Date | null = null;
  try {
    const row = await prisma.message.findUnique({ where: { id: messageId }, select: { createdAt: true } });
    createdAt = row?.createdAt ?? null;
  } catch (error) {
    logger.warn('edit readership: message date unreadable — every floored reader excluded', { conversationId, messageId, error });
  }
  try {
    return await translationReaders(prisma, conversationId, createdAt);
  } catch (error) {
    logger.warn('edit readership unresolvable — no live emission, no queue entry', { conversationId, messageId, error });
    // L'appelant NOMME la panne chez lui : sans cela, une édition
    // définitivement perdue pour les absents ne laissait qu'un `warn` d'un
    // module que la route ne regarde pas.
    onError?.(error);
    return { kind: 'unknown' };
  }
}

type ExceptingTarget = ServerEmitTarget & { except(rooms: string[]): ServerEmitTarget };

const canExcept = (target: ServerEmitTarget): target is ExceptingTarget =>
  typeof (target as { except?: unknown }).except === 'function';

/** Le plan de remise par lecteur, réduit à ce que cette unité en consomme. */
export type EditedReaderPlan = {
  readonly targets: ReadonlyArray<{ readonly room: string; readonly key: string; readonly participantId: string }>;
  readonly signFor: <P extends object>(payload: P, participantId: string) => P;
};

/**
 * Les TROIS sorties de `message:edited`, gardées ENSEMBLE — et c'est le point :
 * une garde posée sur le chemin le plus fréquenté se lit comme posée sur le
 * SUJET, et ne l'est que sur son CHEMIN (cycle 127).
 *
 * 1. **le plan signé par lecteur** saute les lecteurs bloqués. Il s'autorise sur
 *    l'admission de lecture de FICHIER (actif, non banni, lien non échu), qui ne
 *    regarde NI `joinedAt` NI `historyVisibleFrom` : elle ne dispense pas du
 *    plancher ;
 * 2. **la citation scellée** exclut leurs rooms de la diffusion et ne leur sert
 *    AUCUNE variante — sceller une citation n'autorise pas à lire le message
 *    porteur ;
 * 3. **la diffusion de room** passe par la même exclusion, et quand la cible ne
 *    sait pas exclure, rien ne part : la porte échoue en montrant moins.
 */
/**
 * La charge est bornée par ce que le CONTRAT déclare pour cet événement, et non
 * par `object` : un générique libre forçait un `as never` à chaque émission, ce
 * qui aurait rouvert la porte de typage que le dépôt a fermée (l'effacement vit
 * dans `emitServerEvent`, une fois, et nulle part ailleurs).
 */
export function emitEditedToReaders<P extends ServerEventPayload<typeof SERVER_EVENTS.MESSAGE_EDITED>>(params: {
  readonly io: ServerEmitIO | null | undefined;
  readonly conversationId: string;
  readonly payload: P;
  /**
   * Un plan ⇒ remise par lecteur ; `null` ⇒ les trois sorties ordinaires ;
   * `'unavailable'` ⇒ la lecture du plan est tombée, donc RIEN en direct
   * (#17026). La troisième valeur ne se confond pas avec `null` : retomber sur
   * la room servirait l'adresse nue d'une pièce peut-être protégée. Et elle ne
   * se confond pas non plus avec un `throw` chez l'appelant, dont le `catch` de
   * fin de méthode emporterait l'enfilage durable qui SUIT cette émission.
   */
  readonly plan: EditedReaderPlan | null | 'unavailable';
  readonly sealed: ReadonlyMap<string, Date>;
  readonly blocked: ReadonlySet<string>;
  /** La variante d'un lecteur dont la citation est échue (#8562). */
  readonly sealedVariant: (payload: P, key: string) => P;
  /** La variante servie quand la cible ne sait pas exclure : scellée pour TOUS. */
  readonly sealedForAll: (payload: P) => P;
}): void {
  const { io, conversationId, payload, plan, sealed, blocked } = params;
  if (!io) return;
  if (plan === 'unavailable') return;

  if (plan) {
    for (const target of plan.targets) {
      if (blocked.has(target.key)) continue;
      // Par CIBLE, jamais autour de la boucle : une cible qui lève priverait
      // toutes les suivantes, que la file hors ligne ne compense pas (elle
      // saute les connectés) — audit adversarial de #17026.
      safeBroadcast(
        'message:edited (per reader)',
        () => io.to(target.room).emit(SERVER_EVENTS.MESSAGE_EDITED, plan.signFor(params.sealedVariant(payload, target.key), target.participantId)),
      );
    }
    return;
  }

  if (sealed.size === 0 && blocked.size === 0) {
    io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.MESSAGE_EDITED, payload);
    return;
  }

  const room = io.to(ROOMS.conversation(conversationId));
  if (!canExcept(room)) {
    if (blocked.size > 0) return;
    room.emit(SERVER_EVENTS.MESSAGE_EDITED, params.sealedForAll(payload));
    return;
  }
  room
    .except([...sealed.keys(), ...blocked].map((key) => ROOMS.user(key)))
    .emit(SERVER_EVENTS.MESSAGE_EDITED, payload);
  for (const key of sealed.keys()) {
    if (blocked.has(key)) continue;
    io.to(ROOMS.user(key)).emit(SERVER_EVENTS.MESSAGE_EDITED, params.sealedVariant(payload, key));
  }
}
