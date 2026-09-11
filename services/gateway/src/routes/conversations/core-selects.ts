/**
 * Sélections et includes Prisma partagés par les routes de
 * `conversations/core.ts` (liste, détail) — extrait de `core.ts` lors du
 * découpage #4284. Aucune logique de route ici : uniquement les constantes
 * `select`/`include` et leurs doc-comments d'origine, déplacés verbatim.
 */
import { conversationActiveMemberCountSelect } from './utils/active-member-count';

/**
 * Participant fields fetched + serialized per participant in the GET
 * /conversations LIST response (up to 5 participants × N conversations per
 * page, so per-field over-fetch multiplies).
 *
 * T17 — `permissions` (a ~20-boolean ParticipantPermissions object) is
 * intentionally NOT selected here: no client (iOS SDK/app or web) reads
 * participant permissions in the list view, and the conversation DETAIL
 * endpoint (`GET /conversations/:id`) still fetches it via an unfiltered
 * include. `language` IS kept — the web frontend reads `participant.language`
 * for conversation-title language resolution (`apps/web/utils/user.ts`).
 */
export const conversationListParticipantSelect = {
  id: true,
  conversationId: true,
  type: true,
  userId: true,
  displayName: true,
  avatar: true,
  role: true,
  language: true,
  nickname: true,
  joinedAt: true,
  isActive: true,
  isOnline: true,
  lastActiveAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      firstName: true,
      lastName: true,
      avatar: true,
      banner: true,
      isOnline: true,
      lastActiveAt: true
    }
  }
} as const;

/**
 * Sélection des préférences utilisateur jointes à une conversation (liste ET
 * détail). `customName` DOIT y figurer : c'est lui qui pilote le nom affiché
 * d'un DM côté client (`displayName = customName ?? title ?? …`). Son absence
 * historique créait un flip-flop de titre — la liste froide montrait le nom
 * du participant, puis le premier pin/mute rapportait `customName` via la
 * réponse du PATCH préférences et le titre basculait (vu « sandra raveloson »
 * → « Sany » 2026-07-04). Le champ doit AUSSI être déclaré dans le schema
 * wire (`userPreferences` de la conversation, api-schemas.ts), sinon
 * fast-json-stringify le strippe silencieusement — même piège que `reaction`,
 * sélectionné ici mais absent du wire jusqu'à ce même fix.
 */
export const conversationUserPreferencesSelect = {
  isPinned: true,
  isMuted: true,
  isArchived: true,
  // Lu SERVEUR-side pour masquer l'aperçu d'un historique effacé (cf.
  // `resolveVisibleLastMessages`). Non déclaré dans le schema wire, donc
  // strippé de la réponse.
  clearHistoryBefore: true,
  tags: true,
  categoryId: true,
  reaction: true,
  customName: true,
  // Choix collant du mode de lecture (G-121). Lu SERVEUR-side pour l'entrée
  // d'orchestrateur du pont ✦ (G-123, workshop A6) — pas déclaré dans le
  // schema wire, donc strippé de la réponse comme `clearHistoryBefore` :
  // aucun client ne lit `readingMode` via CETTE route, `GET
  // /user-preferences/conversations/:id` reste l'unique surface qui l'expose.
  readingMode: true
} as const;

/**
 * Le message d'aperçu de la ligne de liste. Extrait en constante parce qu'il
 * est désormais lu par DEUX requêtes : la sélection imbriquée `take: 1` de la
 * liste, et la reprise ciblée qui cherche le dernier message ENCORE VISIBLE
 * quand celui-là est masqué pour ce lecteur (`clear-history` /
 * `delete-for-me`). Deux copies auraient dérivé, et l'aperçu de repli aurait
 * rendu une bulle amputée de la moitié de ses champs.
 */
export const conversationLastMessagePreviewSelect = {
  id: true,
  content: true,
  createdAt: true,
  senderId: true,
  messageType: true,
  isBlurred: true,
  isViewOnce: true,
  effectFlags: true,
  expiresAt: true,
  // Prisme Linguistique de l'aperçu. Les deux champs vivent dans le
  // MÊME document Mongo que le message (`translations` est une
  // colonne JSON, pas une relation) : les sélectionner ne coûte ni
  // jointure ni requête. Sans eux, la ligne de liste restait dans la
  // langue de l'expéditeur pour tout le monde — cf.
  // `utils/last-message-preview.ts`.
  translations: true,
  originalLanguage: true,
  // Lot 3 : aperçu de conversation — sans `metadata`, un dernier
  // message géolocalisé n'affiche jamais sa position dans la
  // liste des conversations.
  metadata: true,
  sender: {
    select: {
      id: true,
      userId: true,
      displayName: true,
      avatar: true,
      type: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true
        }
      }
    }
  },
  attachments: {
    take: 1, // Optimized: only first attachment for preview
    select: {
      id: true,
      mimeType: true,
      thumbnailUrl: true,
      originalName: true,
      fileSize: true,
      // Media metadata for proper display
      duration: true,    // Audio/Video duration in ms
      width: true,       // Image/Video width
      height: true,      // Image/Video height
      bitrate: true,     // Audio/Video bitrate
      sampleRate: true,  // Audio sample rate
      metadata: true     // Additional metadata (effects, etc.)
    }
  },
  _count: {
    select: { attachments: true }
  }
} as const;

/**
 * Iter 33 (F1) — GET /conversations/:id DETAIL include. Participants are
 * capped: a 500-member group used to ship ~500 KB of hydrated participants on
 * every conversation open. Clients tolerate a partial list (web renders the
 * first 3, iOS resolves DM titles from the first 2) and load the full roster
 * through the dedicated paginated GET /conversations/:id/participants
 * endpoint. The filtered `_count` carries the exact active-member total,
 * surfaced as `memberCount` in the response (declared in
 * `conversationSchema`, so it survives fast-json-stringify).
 *
 * Iter 35 (F8) — strict `select` instead of `include`: the wire schema
 * (`conversationParticipantSchema`) declares no nested `user` and only the
 * scalars below, so fast-json-stringify already stripped the rest — the DB was
 * hydrating dead fields (including the sensitive `sessionTokenHash` and the
 * embedded `anonymousSession` document) for up to 100 participants per open.
 * The nested user is server-side only: `generateDefaultConversationTitle`
 * reads displayName/username/firstName/lastName.
 */
export const CONVERSATION_DETAIL_PARTICIPANTS_CAP = 100;

export const conversationDetailInclude = {
  participants: {
    where: { isActive: true },
    orderBy: { joinedAt: 'asc' },
    take: CONVERSATION_DETAIL_PARTICIPANTS_CAP,
    select: {
      id: true,
      userId: true,
      type: true,
      displayName: true,
      avatar: true,
      role: true,
      permissions: true,
      isActive: true,
      isOnline: true,
      lastActiveAt: true,
      joinedAt: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          firstName: true,
          lastName: true
        }
      }
    }
  },
  _count: {
    select: conversationActiveMemberCountSelect
  }
} as const;

/**
 * **CE QUE LA LIGNE DE LISTE CHARGE — et le schéma wire dit ce qu'elle doit
 * charger** (audit de cohérence iOS ↔ passerelle, 2026-09-11).
 *
 * Extraite de `core-list.ts` pour une raison qui n'est pas cosmétique : tant
 * qu'elle était un littéral anonyme au milieu d'un `findMany`, aucun témoin ne
 * pouvait la lire, et le seul témoin qui prétendait mesurer la ligne de liste
 * (`conversation-wire-fields.test.ts`) mesurait un objet FABRIQUÉ dans le test.
 * Il était donc vert sur quatre champs que la base ne chargeait pas.
 *
 * `description`, `defaultWriteRole`, `slowModeSeconds` et `autoTranslateEnabled`
 * étaient DÉCLARÉS par `conversationMinimalSchema` et absents d'ici : servis
 * `undefined` à chaque ligne, pour toujours. Côté iOS, l'écran de réglages d'un
 * groupe compose ses valeurs « originales » depuis la conversation de la LISTE
 * (`ConversationSettingsView`, ouvert depuis `ConversationListView`) — il
 * affichait donc une description VIDE sur un groupe qui en a une, « tout le
 * monde peut écrire » sur un salon restreint, et le mode lent DÉSACTIVÉ sur une
 * conversation qui l'impose. Quatre colonnes du même document : les charger ne
 * coûte ni jointure ni requête.
 *
 * La loi est gardée par `conversation-list-select-parity.test.ts` : tout champ
 * que le schéma wire déclare ET que `Conversation` porte en colonne doit être
 * ici. `memberCount` en est la SEULE exception, et pour une raison écrite —
 * voir `_count` ci-dessous.
 */
export const conversationListSelect = (viewerId: string) => ({
  id: true,
  title: true,
  description: true,
  type: true,
  identifier: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  lastMessageAt: true,
  banner: true,
  avatar: true,
  communityId: true,
  // Effectif compté par la base, PAS la colonne dénormalisée du même
  // nom : voir `conversationActiveMemberCountSelect`. La ligne de liste
  // en dépend visiblement (badge de groupe iOS `memberCount > 1`,
  // saturation de la couleur d'accent `min(memberCount/100, 1) × 0.2`),
  // et la colonne rendait `0` pour toute conversation créée depuis la
  // migration héritée : badge absent, et couleur d'accent différente
  // entre la liste et le fil ouvert, qui lui compte.
  _count: { select: conversationActiveMemberCountSelect },
  // Les quatre réglages de conteneur voyagent ENSEMBLE parce que l'écran qui
  // les lit les lit ensemble : un seul manquant et sa valeur par défaut passe
  // pour la valeur réelle, sans rien pour le signaler.
  defaultWriteRole: true,
  isAnnouncementChannel: true,
  slowModeSeconds: true,
  autoTranslateEnabled: true,
  participants: {
    take: 5,
    where: {
      isActive: true
    },
    select: conversationListParticipantSelect
  },
  // User preferences (pin/mute/archive/tags/catégorie/customName/reaction)
  userPreferences: {
    where: { userId: viewerId },
    take: 1,
    select: conversationUserPreferencesSelect
  },
  messages: {
    where: {
      deletedAt: null
    },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: conversationLastMessagePreviewSelect
  }
}) as const;
