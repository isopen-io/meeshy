/**
 * Le pont ✦ côté serveur — G-122.
 *
 * Ce service ne réinvente AUCUNE forme. La loi partagée
 * `packages/shared/utils/conversation-bridge.ts` (`buildBridgeData`, LWS-1)
 * est l'unique autorité sur ce qu'est un pont ; ce fichier se contente de
 * produire, pour N conversations à la fois, EXACTEMENT ce que cette loi
 * attend en entrée — une fenêtre de messages non lus (`BridgeMessage`), le
 * lecteur, et le compteur autoritatif — puis de l'appeler.
 *
 * Trois contraintes dures gouvernent tout le fichier.
 *
 * ── 1. JAMAIS N+1 ───────────────────────────────────────────────────────────
 * Le pont de N conversations coûte un nombre CONSTANT de requêtes :
 *   1. `participant.findMany`                — les participants du lecteur, sur les ids
 *   2. `conversationReadCursor.findMany`     — les curseurs, sur ces participants
 *   3. + 4. le masquage personnel batché     — `loadPersonalHistoryHidingByConversation`
 *                                              (SAUTÉES si la passe les a déjà)
 *   5. `message.findMany`                    — UNE fenêtre agrégée, `OR` sur les ids
 * Soit 5 requêtes pour 1 conversation comme pour 200. La fenêtre agrégée est
 * la seule pièce délicate : Prisma ne sait pas limiter par groupe, donc le
 * plafond est GLOBAL (`windowLimit`) et la troncature se DÉCLARE
 * (`isComplete: false`) au lieu de se taire.
 *
 * ── 2. Droits de lecture ────────────────────────────────────────────────────
 * Les clauses de filtre ne sont pas réécrites ici : ce sont celles de
 * `MessageReadStatusService.getUnreadCountsForUser` — `deletedAt: null`,
 * `senderId: { not: participant.id }`, plancher CHRONOLOGIQUE
 * (`lastReadMessageCreatedAt ?? lastReadAt ?? joinedAt`), puis
 * `applyPersonalHistoryHiding` pour `clearHistoryBefore` et les messages
 * effacés pour ce lecteur seul. Le pont et le badge lisent donc le MÊME
 * ensemble de messages, par construction : un pont qui nommerait un auteur
 * que la conversation refuse d'afficher serait une fuite, et un pont calculé
 * sur d'autres bornes que le compteur ferait diverger les deux.
 *
 * Le cas `deletedForUserAt` (conversation supprimée pour ce lecteur) n'est
 * PAS traité ici : il est traité en amont, par le `whereClause` de la liste
 * qui n'émet même pas ces conversations — ce service ne voit que les ids que
 * la passe lui donne. Il n'a donc rien à re-filtrer, et surtout rien à
 * ré-autoriser.
 *
 * ── 3. Absence ──────────────────────────────────────────────────────────────
 * `unreadCount === 0` ⇒ la conversation est ABSENTE de la map rendue. Pas
 * `null`, pas un pont à `0` : absente. Idem quand la loi partagée rend `null`
 * (rien à annoncer), quand le participant ne se résout pas, ou quand la
 * lecture échoue. Une absence ne se convertit jamais en affirmation
 * (arbitrage REV-4 : masquer, jamais affirmer).
 *
 * ── Ce que ce service NE fait PAS ───────────────────────────────────────────
 * Il ne s'attache à aucune route (c'est G-123) et n'émet aucun événement. Son
 * API reçoit ce que la passe `unreadCountMap` de `GET /conversations`
 * (`routes/conversations/core.ts`) possède DÉJÀ — ids, compteurs, et
 * éventuellement le masquage personnel — pour que l'attache n'ajoute que la
 * fenêtre agrégée et rien d'autre.
 *
 * Une injection a été volontairement REFUSÉE : celle du `Participant` du
 * lecteur, que la passe de liste tient pourtant déjà en mémoire. Elle aurait
 * économisé une requête sur cinq au prix de la seule vérification
 * d'autorisation que ce service fasse LUI-MÊME (`isActive`, et le participant
 * appartient bien au lecteur). Un service qui nomme les auteurs de messages
 * non lus ne délègue pas à son appelant le droit de les lire.
 *
 * @see packages/shared/utils/conversation-bridge.ts (la loi — LWS-1)
 * @see packages/shared/types/conversation-bridge.ts (le contrat gelé §3.2)
 * @see tasks/lentille-workshop-execution.md G-122
 *
 * ── 4. L'étage agent, en TOP-UP optionnel (G-127) ───────────────────────────
 * `buildBridgeData` rend TOUJOURS le plancher déterministe ci-dessus (C1).
 * Si l'appelant fournit `params.agent`, chaque pont qui a une fenêtre non
 * lue REÇOIT une tentative d'enrichissement — mais seule une couverture
 * EXACTE (mêmes bornes de messages, même compte) fait basculer `kind` de
 * `'fallback'` à `'agent'` (C2 : une couverture incertaine ne se déclare
 * jamais complète). Tout le reste — agent muet (`data: null`), bornes
 * différentes, compte différent, service down, timeout — laisse le pont
 * fallback strictement INTACT. Voir `enrichWithAgentSummaries`.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  buildBridgeData as buildSharedBridgeData,
  type BridgeAttachment,
  type BridgeAttachmentKind,
  type BridgeMessage,
} from '@meeshy/shared/utils/conversation-bridge';
import {
  ORCHESTRATOR_UNREAD_CAP,
  resolveOrchestratorDecision,
  toBridgeSuggestedMode,
  type OrchestratorDecisionInput,
} from '@meeshy/shared/utils/reading-modes';
import { resolveParticipantDisplayName } from '@meeshy/shared/utils/participant-helpers';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';
import {
  NO_PERSONAL_HIDING,
  applyPersonalHistoryHiding,
  loadPersonalHistoryHidingByConversation,
  type PersonalHistoryHiding,
} from './personalHistoryFilter';
import { resolveAttachmentType } from './ConversationMessageStatsService';
import { logger } from '../utils/logger';

/**
 * Plafond GLOBAL, en messages, de la fenêtre agrégée d'une passe.
 *
 * Ce n'est pas une constante de loi (aucune règle produit ne s'y adosse) mais
 * un budget de requête : il borne ce qu'UNE passe de liste accepte de
 * remonter, tous non-lus confondus. En deçà, tout est exact ; au-delà, les
 * ponts touchés se déclarent partiels (`isComplete: false`) plutôt que de
 * servir un décompte tronqué comme un total.
 */
export const DEFAULT_BRIDGE_WINDOW_LIMIT = 500;

/** Une conversation candidate au pont, telle que la passe la connaît déjà. */
export interface BridgeCandidate {
  readonly conversationId: string;
  /** Compteur AUTORITATIF, celui de `unreadCountMap`. Jamais recalculé ici. */
  readonly unreadCount: number;
}

/**
 * Entrée d'orchestrateur d'une conversation, moins `unreadCount` que ce
 * service possède déjà. Fournie par la passe (choix collant de G-121,
 * capacités de `resolveCapabilities`), elle fait passer `suggestedMode` de la
 * branche par défaut à la VRAIE décision de la loi.
 */
export type BridgeOrchestratorInput = Omit<OrchestratorDecisionInput, 'unreadCount'>;

/**
 * Ce que le pont ajoute à une ligne de liste. Le pont lui-même respecte le
 * contrat gelé `ConversationBridge` — aucun champ n'y est ajouté.
 * `lastReadAt` voyage À CÔTÉ (le contrat §3.2 ne le porte pas), et reste
 * ABSENT quand aucun curseur de lecture n'existe.
 */
export interface ConversationBridgeEntry {
  readonly bridge: ConversationBridge;
  /** Horloge de lecture du curseur. ABSENT = inconnue, jamais fabriquée. */
  readonly lastReadAt?: Date;
}

/**
 * Ce que la gateway demande au débouché de lecture de l'agent (G-126,
 * `GET /api/agent/conversations/:id/range-summary`) pour UNE plage. Interface
 * STRUCTURELLE — comme `UnreadBridgeBuilder` d'`emitUnreadCountsToRecipients`
 * — plutôt qu'un import direct d'`AgentHttpClient` : ce service reste
 * testable sans monter un vrai client réseau, et l'implémentation réelle
 * (`AgentHttpClient.getRangeSummary`, timeout 1500 ms) comme un double de
 * test satisfont toutes deux ce contrat minimal.
 *
 * `null` — jamais une erreur — est la réponse attendue quand l'agent est
 * muet, en panne, ou hors budget : c'est exactement ce que rend la route
 * G-126 pour `data: null`, et exactement ce que ce service traite comme un
 * repli silencieux (C1/C2).
 */
export interface BridgeAgentRangeSummaryClient {
  getRangeSummary(params: {
    conversationId: string;
    fromMessageId: string;
    toMessageId: string;
  }): Promise<{
    conversationId: string;
    summary: string;
    fromMessageId: string;
    toMessageId: string;
    messageCount: number;
  } | null>;
}

export interface BuildBridgeDataParams {
  /**
   * `User.id` du lecteur — ou `Participant.id` pour un anonyme, exactement le
   * même contrat que `MessageReadStatusService.getUnreadCountsForUser`.
   */
  readonly viewerId: string;
  /** Ids + compteurs, tels que la passe les possède déjà. */
  readonly candidates: readonly BridgeCandidate[];
  /**
   * Masquage personnel DÉJÀ chargé par la passe. Fourni ⇒ les deux requêtes
   * de `loadPersonalHistoryHidingByConversation` ne sont pas rejouées. Une
   * conversation absente de la map ne masque rien (`NO_PERSONAL_HIDING`),
   * même convention que le chargeur batché.
   */
  readonly hidingByConversation?: ReadonlyMap<string, PersonalHistoryHiding>;
  /** Entrées d'orchestrateur par conversation (facultatif, cf. ci-dessus). */
  readonly orchestratorInputs?: ReadonlyMap<string, BridgeOrchestratorInput>;
  /** Plafond global de la fenêtre agrégée. Défaut : `DEFAULT_BRIDGE_WINDOW_LIMIT`. */
  readonly windowLimit?: number;
  /**
   * G-127 — ABSENT (défaut) : cette passe ne consulte jamais l'agent, elle
   * rend exactement le plancher déterministe de G-122, sans requête réseau
   * de plus. Fourni : chaque pont produit reçoit une tentative
   * d'enrichissement borné — cf. `enrichWithAgentSummaries`.
   *
   * Volontairement absent de l'interface `UnreadBridgeBuilder`
   * (`socketio/emitUnreadCountsToRecipients.ts`) : le chemin socket chaud
   * n'a jamais accès à ce paramètre et ne peut donc jamais payer l'appel
   * agent — seul `GET /conversations` (REST, `routes/conversations/core.ts`)
   * le fournit.
   */
  readonly agent?: BridgeAgentRangeSummaryClient;
}

type WindowMessageRow = {
  id: string;
  conversationId: string;
  senderId: string;
  messageType?: string | null;
  sender?: {
    displayName?: string | null;
    nickname?: string | null;
    user?: { displayName?: string | null } | null;
  } | null;
  attachments?: ReadonlyArray<{ mimeType?: string | null }> | null;
};

const isNonBlank = (value?: string | null): value is string =>
  typeof value === 'string' && value.trim() !== '';

/**
 * Nom d'affichage de l'auteur, dans l'ordre canonique de la gateway :
 * surnom local de conversation → `resolveParticipantDisplayName` (source
 * unique partagée : `displayName` local → `displayName` du compte).
 *
 * `null` = ce lecteur ne peut PAS être nommé honnêtement. Le message est
 * alors écarté de la fenêtre plutôt que nommé « Unknown » : le pont annonce
 * « X a écrit », et un X fabriqué est exactement l'affirmation que
 * l'arbitrage REV-4 interdit. L'écart se déclare ensuite en
 * `isComplete: false`, puisque la fenêtre retenue devient plus petite que le
 * compteur autoritatif.
 */
const resolveAuthorName = (sender: WindowMessageRow['sender']): string | null => {
  if (isNonBlank(sender?.nickname)) return sender!.nickname as string;
  return resolveParticipantDisplayName(sender ?? null);
};

/**
 * Discriminants du pont à partir de ce que la base porte réellement.
 *
 * `MessageAttachment` n'a pas de colonne `type` : la table MIME → catégorie
 * est celle de `ConversationMessageStatsService.resolveAttachmentType`, « la
 * table MIME → compteur, et la SEULE » — la dupliquer ici ferait diverger le
 * pont des statistiques de conversation sur le même fichier.
 *
 * `location` n'est PAS une pièce jointe mais un `messageType` (même règle que
 * les statistiques) : un lieu partagé ajoute donc un discriminant `location`,
 * que la loi partagée range dans le seau `files`.
 */
const bridgeAttachmentsOf = (row: WindowMessageRow): BridgeAttachment[] => {
  const attachments: BridgeAttachment[] = (row.attachments ?? []).map((attachment) => ({
    type: resolveAttachmentType(attachment?.mimeType ?? '') as BridgeAttachmentKind,
  }));
  if (row.messageType === 'location') attachments.push({ type: 'location' });
  return attachments;
};

export class ConversationBridgeService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Construit le pont ✦ de PLUSIEURS conversations en un nombre constant de
   * requêtes.
   *
   * Les conversations sans rien à annoncer sont ABSENTES de la map rendue —
   * jamais présentes avec un pont vide, `null` ou à zéro.
   */
  async buildBridgeData(
    params: BuildBridgeDataParams
  ): Promise<Map<string, ConversationBridgeEntry>> {
    const result = new Map<string, ConversationBridgeEntry>();

    // Contrainte 3, premier étage : un candidat à zéro non-lu n'entre même pas
    // dans la passe — il ne coûte donc AUCUNE requête, et n'a aucune chance de
    // ressortir avec un pont.
    const unread = params.candidates.filter((candidate) => candidate.unreadCount > 0);
    if (unread.length === 0) return result;

    const conversationIds = [...new Set(unread.map((candidate) => candidate.conversationId))];
    const unreadCountById = new Map(
      unread.map((candidate) => [candidate.conversationId, candidate.unreadCount])
    );

    try {
      // ── Requête 1 : les participants du lecteur, sur TOUS les ids ─────────
      // Même résolution que `getUnreadCountsForUser` : l'appelant peut passer
      // un `User.id` (inscrit) ou un `Participant.id` (anonyme).
      const participants = await this.prisma.participant.findMany({
        where: {
          conversationId: { in: conversationIds },
          isActive: true,
          OR: [{ id: params.viewerId }, { userId: params.viewerId }],
        },
        select: { id: true, userId: true, conversationId: true, joinedAt: true },
      });

      if (participants.length === 0) return result;

      const participantIds = participants.map((p: any) => p.id);
      const resolvedUserId = participants.find((p: any) => p.userId)?.userId ?? null;

      // ── Requêtes 2 (+3, 4) : curseurs et masquage personnel, batchés ──────
      // Le masquage n'est rechargé QUE si la passe ne l'a pas déjà : l'attache
      // G-123 doit pouvoir le lui passer et ne payer que la fenêtre.
      const [cursors, hidingByConversation] = await Promise.all([
        this.prisma.conversationReadCursor.findMany({
          where: { participantId: { in: participantIds } },
          select: { participantId: true, lastReadAt: true, lastReadMessageCreatedAt: true },
        }),
        params.hidingByConversation
          ? Promise.resolve(params.hidingByConversation)
          : loadPersonalHistoryHidingByConversation(this.prisma, {
              userId: resolvedUserId,
              conversationIds: participants.map((p: any) => p.conversationId),
            }),
      ]);

      // Position CHRONOLOGIQUE du curseur, jamais l'horloge murale — en mode
      // lecture exacte `lastReadAt` vaut `now` et déclarerait lus les messages
      // sautés. Clause identique à `MessageReadStatusService`.
      const cursorFloorById = new Map<string, Date | null>(
        cursors.map((c: any) => [c.participantId, c.lastReadMessageCreatedAt ?? c.lastReadAt ?? null])
      );
      const lastReadAtById = new Map<string, Date | null>(
        cursors.map((c: any) => [c.participantId, c.lastReadAt ?? null])
      );

      // ── Requête 5 : UNE fenêtre agrégée pour toutes les conversations ─────
      // Une branche `OR` par conversation, chacune portant EXACTEMENT les
      // clauses du compteur de non-lus, masquage personnel compris.
      const participantByConversation = new Map<string, any>(
        participants.map((p: any) => [p.conversationId, p])
      );
      const clauses = conversationIds
        .map((conversationId) => {
          const participant = participantByConversation.get(conversationId);
          if (!participant) return null;
          const floor = cursorFloorById.get(participant.id) ?? participant.joinedAt ?? null;
          return applyPersonalHistoryHiding(
            {
              conversationId,
              deletedAt: null,
              senderId: { not: participant.id },
              ...(floor ? { createdAt: { gt: floor } } : {}),
            },
            hidingByConversation.get(conversationId) ?? NO_PERSONAL_HIDING
          );
        })
        .filter((clause) => clause !== null) as Record<string, unknown>[];

      if (clauses.length === 0) return result;

      const totalUnread = [...participantByConversation.keys()].reduce(
        (sum, conversationId) => sum + (unreadCountById.get(conversationId) ?? 0),
        0
      );
      const take = Math.min(totalUnread, params.windowLimit ?? DEFAULT_BRIDGE_WINDOW_LIMIT);
      if (take <= 0) return result;

      // Ordre chronologique ASCENDANT : le premier non-lu de chaque
      // conversation entre en premier. Si le plafond global tronque, ce sont
      // les messages les plus RÉCENTS qui manquent — la fenêtre reste ancrée
      // sur le premier non-lu, et sa partialité se déclare.
      const rows: WindowMessageRow[] = await this.prisma.message.findMany({
        where: { OR: clauses },
        orderBy: { createdAt: 'asc' },
        take,
        select: {
          id: true,
          conversationId: true,
          senderId: true,
          messageType: true,
          sender: {
            select: {
              displayName: true,
              nickname: true,
              user: { select: { displayName: true } },
            },
          },
          attachments: { select: { mimeType: true } },
        },
      });

      // ── Regroupement puis appel de la LOI, une fois par conversation ──────
      const windowByConversation = new Map<string, BridgeMessage[]>();
      // Bornes RÉELLES (id du premier/dernier message NOMMÉ retenu), dans le
      // même ordre ascendant que `rows` — c'est la « fenêtre non lue du
      // pont » que G-127 intersecte avec la plage résumée par l'agent.
      const windowBoundsByConversation = new Map<
        string,
        { firstMessageId: string; lastMessageId: string }
      >();
      for (const row of rows) {
        const senderName = resolveAuthorName(row.sender);
        if (senderName === null) continue; // innommable ⇒ écarté, jamais inventé
        const bucket = windowByConversation.get(row.conversationId);
        const bridgeMessage: BridgeMessage = {
          senderId: row.senderId,
          senderName,
          attachments: bridgeAttachmentsOf(row),
        };
        if (bucket) {
          bucket.push(bridgeMessage);
          const bounds = windowBoundsByConversation.get(row.conversationId)!;
          windowBoundsByConversation.set(row.conversationId, {
            firstMessageId: bounds.firstMessageId,
            lastMessageId: row.id,
          });
        } else {
          windowByConversation.set(row.conversationId, [bridgeMessage]);
          windowBoundsByConversation.set(row.conversationId, {
            firstMessageId: row.id,
            lastMessageId: row.id,
          });
        }
      }

      for (const [conversationId, participant] of participantByConversation) {
        const unreadCount = unreadCountById.get(conversationId) ?? 0;
        const messages = windowByConversation.get(conversationId) ?? [];

        // La loi partagée est l'unique autorité sur la forme du pont — et sur
        // le fait qu'il n'y ait rien à annoncer (`null`).
        const data = buildSharedBridgeData({
          messages,
          viewerId: participant.id,
          unreadCount,
        });
        if (data === null) continue; // ABSENT, jamais un pont vide

        const lastReadAt = lastReadAtById.get(participant.id) ?? null;
        const bridge: ConversationBridge = {
          kind: 'fallback',
          unreadCount,
          suggestedMode: this.resolveSuggestedMode(
            unreadCount,
            params.orchestratorInputs?.get(conversationId)
          ),
          data,
          // ABSENT = complet (contrat gelé). `false` uniquement quand la
          // fenêtre retenue couvre moins que le compteur autoritatif.
          ...(messages.length < unreadCount ? { isComplete: false } : {}),
        };

        result.set(conversationId, {
          bridge,
          ...(lastReadAt ? { lastReadAt } : {}),
        });
      }

      // ── G-127 : top-up agent optionnel, jamais sur le chemin socket ──────
      if (params.agent && result.size > 0) {
        await this.enrichWithAgentSummaries(
          result,
          windowBoundsByConversation,
          windowByConversation,
          params.agent
        );
      }

      return result;
    } catch (error) {
      // Posture d'échec : le pont est un confort, la liste est le produit. On
      // rend une map VIDE — chaque ligne perd son pont, aucune n'affiche un
      // pont faux.
      logger.warn('[ConversationBridgeService] bridge pass failed, serving no bridge', {
        error: error instanceof Error ? error.message : String(error),
      });
      return new Map();
    }
  }

  /**
   * `suggestedMode` — projeté par la loi, jamais réinventé.
   *
   * Avec une entrée d'orchestrateur (choix collant + capacités, fournis par la
   * passe), c'est `resolveOrchestratorDecision` puis `toBridgeSuggestedMode`,
   * la projection TOTALE prévue pour que personne ne réécrive la
   * correspondance. Sans elle, la branche PAR DÉFAUT de la même loi (seuil
   * `ORCHESTRATOR_UNREAD_CAP`, IMPORTÉ et non redupliqué) — exactement ce que
   * fait déjà `LocalBridgeProvider` côté client, et pour la même raison :
   * fabriquer des capacités ou un choix collant absents serait une donnée
   * inventée.
   */
  private resolveSuggestedMode(
    unreadCount: number,
    orchestrator?: BridgeOrchestratorInput
  ): 'focal' | 'resume' {
    if (orchestrator) {
      return toBridgeSuggestedMode(resolveOrchestratorDecision({ ...orchestrator, unreadCount }));
    }
    return unreadCount > ORCHESTRATOR_UNREAD_CAP ? 'resume' : 'focal';
  }

  /**
   * G-127 — top-up agent, EN PLACE sur `result` déjà rempli du plancher
   * déterministe. Une conversation à la fois, en parallèle (`Promise.all`) :
   * l'agent lit une plage par appel (G-126), il n'y a rien à agréger ici.
   *
   * ── L'intersection exacte (C2) ─────────────────────────────────────────
   * La « fenêtre non lue du pont » est `windowBoundsByConversation` — les
   * bornes RÉELLES (id du premier/dernier message nommé) que ce service a
   * déjà retenues pour construire le plancher. Le résumé agent ne COUVRE
   * cette fenêtre que si les TROIS coïncident :
   *   1. `summary.fromMessageId === bounds.firstMessageId`
   *   2. `summary.toMessageId   === bounds.lastMessageId`
   *   3. `summary.messageCount  === ` le compte RÉEL de cette fenêtre
   * (1) et (2) sont en réalité un écho — `summarizeMessageRange` (G-125)
   * rend `null` dès que les bornes demandées ne se retrouvent pas TELLES
   * QUELLES dans la mémoire de l'agent, donc un succès les échoue déjà
   * identiques. (3) est la vérification qui manquerait sans elle : deux
   * mémoires peuvent partager les mêmes bornes tout en désaccordant sur ce
   * qu'il y a ENTRE ELLES (droits de lecture, masquage personnel — l'agent
   * n'en connaît rien). Une des trois manque ⇒ repli : le pont fallback
   * déjà dans `result` reste EXACTEMENT tel quel, `isComplete` compris.
   *
   * ── E7 : la paire `translations`+`originalLanguage` ────────────────────
   * `resolveLastMessagePreview` (packages/shared/utils/conversation-helpers)
   * ne fait RIEN de spécial quand `translations` est absent : elle rend le
   * texte tel quel, dans toutes les langues. C'est exactement la posture
   * honnête ici. Le débouché G-126 ne déclare AUCUNE langue par construction
   * (son commentaire le dit : ce serait affirmer la sortie du modèle), et ce
   * service ne fait tourner aucun pipeline de traduction sur la phrase de
   * l'observer — en fabriquer une (p. ex. `originalLanguage: 'fr'`, parce
   * que le prompt système DEMANDE du français) affirmerait une propriété du
   * texte produit que personne ici n'a vérifiée. La paire E7 reste donc
   * ABSENTE : le texte agent traverse `resolveLastMessagePreview` comme un
   * texte non retraduit, identique pour tous les lecteurs — un repli
   * honnête, pas un défaut d'implémentation. Reformater cette phrase par
   * langue est un chantier ultérieur (une vraie traduction serveur), hors
   * périmètre de G-127.
   *
   * Ne lève JAMAIS : chaque tentative est isolée par son propre `try/catch`,
   * pour qu'un agent en panne sur une conversation ne prive pas les autres
   * de leur tentative, et surtout ne fasse jamais échouer le `try` englobant
   * de `buildBridgeData` (qui, lui, viderait TOUTE la map — sort réservé aux
   * pannes du plancher déterministe, jamais à celles d'un confort).
   */
  private async enrichWithAgentSummaries(
    result: Map<string, ConversationBridgeEntry>,
    windowBoundsByConversation: ReadonlyMap<string, { firstMessageId: string; lastMessageId: string }>,
    windowByConversation: ReadonlyMap<string, BridgeMessage[]>,
    agent: BridgeAgentRangeSummaryClient
  ): Promise<void> {
    await Promise.all(
      [...result.entries()].map(async ([conversationId, entry]) => {
        const bounds = windowBoundsByConversation.get(conversationId);
        if (!bounds) return; // aucun message nommé retenu ⇒ rien à intersecter

        try {
          const summary = await agent.getRangeSummary({
            conversationId,
            fromMessageId: bounds.firstMessageId,
            toMessageId: bounds.lastMessageId,
          });

          const expectedCount = windowByConversation.get(conversationId)?.length ?? 0;
          const coversExactly =
            summary !== null &&
            summary.fromMessageId === bounds.firstMessageId &&
            summary.toMessageId === bounds.lastMessageId &&
            summary.messageCount === expectedCount;

          if (!coversExactly) return; // C2 : repli — le pont fallback reste intact

          const agentBridge: ConversationBridge = {
            kind: 'agent',
            unreadCount: entry.bridge.unreadCount,
            suggestedMode: entry.bridge.suggestedMode,
            text: summary.summary,
            // La partialité voyage à travers le changement d'étage : un
            // plancher déjà déclaré partiel (fenêtre tronquée par
            // `windowLimit`) le reste, phrase ou pas.
            ...(entry.bridge.isComplete === false ? { isComplete: false } : {}),
            // E7 : `translations`/`originalLanguage` ABSENTS — cf. doc-comment.
          };

          result.set(conversationId, { ...entry, bridge: agentBridge });
        } catch (error) {
          logger.warn('[ConversationBridgeService] agent enrichment failed, serving fallback bridge', {
            conversationId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );
  }
}
