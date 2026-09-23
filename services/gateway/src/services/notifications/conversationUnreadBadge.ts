import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * G3 (#7218, Refs #7001) — `aps.badge` compte les CONVERSATIONS non lues
 * du destinataire, jamais les notifications ni la somme de leurs messages.
 *
 * **D-L1** (`docs/superpowers/specs/2026-09-21-lecture-et-accuses-design.md`
 * § 3) : « le badge d'icône compte les CONVERSATIONS non lues (hors
 * muettes), comme l'app iOS et comme WhatsApp ». Une conversation à douze
 * messages non lus pèse UN, exactement comme `countUnreadConversations`
 * côté web-v2 (`apps/web-v2/src/lib/view/use-app-badge.ts:36-45`, W4/#7221).
 *
 * **Le non-lu se DEMANDE à `getUnreadCountsForUser`, jamais au champ
 * dénormalisé `ConversationReadCursor.unreadCount`.** Ce champ n'est écrit
 * qu'à `0` par l'avance de curseur (`MessageReadStatusService:638,657`) et à
 * `1` par le geste « marquer non lu » (`routes/conversations/messages-read-status.ts:289`)
 * — il n'est JAMAIS incrémenté à l'arrivée d'un message. Le lire ferait un
 * badge qui ne compte que les conversations marquées non lues À LA MAIN :
 * zéro pour l'immense majorité des destinataires, c'est-à-dire l'inverse du
 * critère. `getUnreadCount` le dit depuis son propre doc-comment
 * (`MessageReadStatusService:170-176`, « intentionally ignored »), et c'est
 * la MÊME fonction qui alimente `unreadCountMap` de `GET /conversations`
 * (`routes/conversations/core-list.ts:487-490`) — donc la même valeur que la
 * liste, que web-v2 projette ensuite en badge. Une seule loi du non-lu, un
 * seul nombre : deux chemins produiraient un badge qui change de valeur
 * selon celui qui a parlé en dernier.
 *
 * Le masquage personnel (historique effacé, messages retirés de sa propre
 * vue) voyage avec ce calcul : un badge qui compte ce que la liste refuse
 * d'afficher est un badge que le défilement ne peut pas éteindre.
 *
 * Les conversations muettes sortent AVANT le comptage : elles ne doivent pas
 * gonfler l'agrégat qu'on les a mises en sourdine pour faire taire (même
 * borne que `ConversationReadLedger.total(excludingOpen:excludingMuted:)`),
 * et les écarter d'abord épargne au passage une requête de comptage par
 * conversation muette.
 *
 * **Écart avec iOS, consigné et non bloquant** : `ConversationReadLedger`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationReadLedger.swift:272-281`)
 * SOMME aujourd'hui `unreadCount` (un compte de MESSAGES). #7236
 * (décision-produit, ouverte) demande l'arbitrage porteur ; ce lot tranche à
 * la lettre de D-L1.
 *
 * COÛT, dit à voix haute : 2 requêtes + une par conversation NON MUETTE du
 * destinataire (`getUnreadCountsForUser` compte conversation par
 * conversation). C'est le prix de la parité avec la liste ; le mutualiser
 * entre les destinataires d'un même éventail est le lot G2 (« un seul calcul
 * du non-lu alimente la liste et le push »), pas celui-ci.
 *
 * Lève quand le non-lu est indisponible — voir `assertComplete` plus bas :
 * l'appelant omet alors le badge (le push part sans `aps.badge`) plutôt que
 * d'en servir un à `0`, qui EFFACERAIT l'icône du destinataire.
 */
export async function computeConversationUnreadBadge(
  prisma: PrismaClient,
  userId: string
): Promise<number> {
  const [participants, mutedRows] = await Promise.all([
    prisma.participant.findMany({
      where: { userId, isActive: true },
      select: { conversationId: true },
    }),
    prisma.userConversationPreferences.findMany({
      where: { userId, isMuted: true },
      select: { conversationId: true },
    }),
  ]);

  if (participants.length === 0) return 0;

  const mutedConversationIds = new Set(mutedRows.map((row) => row.conversationId));
  const conversationIds = [
    ...new Set(
      participants
        .map((participant) => participant.conversationId)
        .filter((conversationId) => !mutedConversationIds.has(conversationId))
    ),
  ];
  if (conversationIds.length === 0) return 0;

  // Import PARESSEUX, comme `GET /conversations` le fait du même service
  // (`routes/conversations/core-list.ts:487`) : `MessageReadStatusService`
  // tire un graphe de modules entier (consommation média, journalisation
  // enrichie) qu'un producteur de notification n'a aucune raison de charger
  // avant d'en avoir besoin.
  const { MessageReadStatusService } = await import('../MessageReadStatusService.js');
  const unreadByConversation = await new MessageReadStatusService(prisma).getUnreadCountsForUser(
    userId,
    conversationIds
  );

  // `getUnreadCountsForUser` AVALE ses erreurs et rend une Map VIDE — un
  // succès légitime rend toujours une entrée par conversation demandée (la
  // carte est pré-remplie à 0 avant toute requête). Une carte incomplète est
  // donc une PANNE, et une panne ne doit pas se lire « plus rien de non lu » :
  // on lève, l'appelant omet le badge, l'icône du destinataire garde la
  // valeur que le client tient déjà.
  if (unreadByConversation.size < conversationIds.length) {
    throw new Error('conversation unread counts unavailable');
  }

  return [...unreadByConversation.values()].filter((unread) => unread > 0).length;
}
