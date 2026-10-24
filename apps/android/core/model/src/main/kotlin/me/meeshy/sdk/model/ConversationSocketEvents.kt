package me.meeshy.sdk.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * La famille d'événements du FIL d'une conversation, en UN seul type scellé (miroir des sujets
 * `MessageSocketManager` d'iOS que `ConversationSocketHandler` et son extension `+MediaEvents`
 * consomment). Un seul flux porte toute la famille, dans l'ordre d'arrivée : c'est ce qui permet à
 * la file ordonnée par conversation d'appliquer un enrichissement APRÈS le `message:new` qu'il
 * enrichit, jamais devant.
 *
 * Les charges sont celles du contrat TypeScript (`packages/shared/types/socketio-events/`) ; tout
 * champ que la passerelle peut omettre est nullable ou a un défaut (rétrocompatibilité).
 */
sealed interface ConversationSocketEvent {
    /** Vrai quand l'événement touche le fil [conversationId]. */
    fun concerns(conversationId: String): Boolean
}

/** Un événement adressé à UNE conversation. */
sealed interface SingleConversationSocketEvent : ConversationSocketEvent {
    val conversationId: String
    override fun concerns(conversationId: String): Boolean = this.conversationId == conversationId
}

// ── Jumeaux légers des événements déjà routés : ils ne servent qu'à ORDONNER le fil ──

/** `message:new` réduit à son adresse : la file attend que la ligne soit en Room avant la suite. */
data class MessageArrived(
    val messageId: String,
    override val conversationId: String,
    val clientMessageId: String? = null,
) : SingleConversationSocketEvent

/** `message:deleted` (suppression pour tous) ou `message:expired` (éphémère brûlé par le serveur). */
data class MessageRemoved(
    val messageId: String,
    override val conversationId: String,
    val deletedAt: String? = null,
    val expired: Boolean = false,
) : SingleConversationSocketEvent

/** `message:pinned` / `message:unpinned`. */
data class MessagePinChanged(
    val messageId: String,
    override val conversationId: String,
    val pinned: Boolean,
    val pinnedAt: String? = null,
    val pinnedBy: String? = null,
) : SingleConversationSocketEvent

// ── Les 21 événements que le client Android ignorait ──

/** `message:countdown-started` : l'échéance SERVIE d'un éphémère (contrat du fil #7451, point 5). */
@Serializable
data class MessageCountdownStartedEvent(
    val messageId: String,
    override val conversationId: String,
    val expiresAt: String,
) : SingleConversationSocketEvent

/** Un message nommé par un événement de visibilité PERSONNELLE, avec sa conversation. */
@Serializable
data class PersonalMessageVisibilityRef(
    val messageId: String,
    val conversationId: String,
)

/** `message:hidden-for-me` : CE lecteur a retiré des messages de SA vue (autre appareil). */
@Serializable
data class MessageHiddenForMeEvent(
    val userId: String? = null,
    val messages: List<PersonalMessageVisibilityRef> = emptyList(),
    val hiddenAt: String? = null,
) : ConversationSocketEvent {
    override fun concerns(conversationId: String): Boolean = messages.any { it.conversationId == conversationId }

    /** Les messages masqués de [conversationId]. */
    fun messageIdsIn(conversationId: String): List<String> =
        messages.filter { it.conversationId == conversationId }.map { it.messageId }
}

/** `message:restored-for-me` : l'inverse — aucune charge de message, seul un rechargement est honnête. */
@Serializable
data class MessageRestoredForMeEvent(
    val userId: String? = null,
    val messages: List<PersonalMessageVisibilityRef> = emptyList(),
    val restoredAt: String? = null,
) : ConversationSocketEvent {
    override fun concerns(conversationId: String): Boolean = messages.any { it.conversationId == conversationId }
}

/** `message:consumed` : quelqu'un vient d'ouvrir une vue unique (#7578). */
@Serializable
data class MessageConsumedEvent(
    val messageId: String,
    override val conversationId: String,
    val userId: String? = null,
    val participantId: String? = null,
    val byAuthor: Boolean = false,
    val viewOnceCount: Int = 0,
    val maxViewOnceCount: Int = 0,
    val isFullyConsumed: Boolean = false,
) : SingleConversationSocketEvent

/** `message:view-once-purged` : le CONTENU d'une vue unique est purgé, la bulle reste. */
@Serializable
data class MessageViewOncePurgedEvent(
    val messageId: String,
    override val conversationId: String,
) : SingleConversationSocketEvent

/** `message:cited-post-withdrawn` : le post cité par des messages du fil a été retiré (#7969). */
@Serializable
data class MessageCitedPostWithdrawnEvent(
    override val conversationId: String,
    val postId: String,
    val deletedAt: String? = null,
) : SingleConversationSocketEvent

/** `message:pending-delivered` : la file hors ligne de l'utilisateur vient d'être rejouée. */
@Serializable
data class PendingMessagesDeliveredEvent(
    val count: Int = 0,
    val conversationIds: List<String> = emptyList(),
) : ConversationSocketEvent {
    override fun concerns(conversationId: String): Boolean = conversationId in conversationIds
}

/** `attachment:reaction-added` / `attachment:reaction-removed` : `reactionSummary` est AUTORITAIRE. */
@Serializable
data class AttachmentReactionUpdateEvent(
    val attachmentId: String,
    val messageId: String,
    override val conversationId: String,
    val participantId: String? = null,
    val emoji: String = "",
    val action: String? = null,
    val reactionSummary: Map<String, Int>? = null,
    val timestamp: String? = null,
) : SingleConversationSocketEvent

/** `attachment-status:updated` : une écoute, un visionnage, un téléchargement d'une pièce. */
@Serializable
data class AttachmentStatusUpdatedEvent(
    val attachmentId: String,
    val messageId: String,
    override val conversationId: String,
    val userId: String? = null,
    val action: String? = null,
    val updatedAt: String? = null,
    val playPositionMs: Long? = null,
    val durationMs: Long? = null,
    val percentage: Double? = null,
    val complete: Boolean? = null,
) : SingleConversationSocketEvent

/** `attachment:ready` : un rendu différé (vignette, variantes) est fini — adressé à l'auteur. */
@Serializable
data class AttachmentReadyEvent(
    val attachmentId: String,
    val target: String? = null,
    val messageId: String? = null,
    val conversationId: String? = null,
    val processingState: String? = null,
    val attachment: JsonElement? = null,
) : ConversationSocketEvent {
    override fun concerns(conversationId: String): Boolean = this.conversationId == conversationId
}

/** `audio:translations-progressive` (une piste parmi plusieurs) et `audio:translations-completed` (la dernière). */
data class AudioTranslationStage(
    val event: AudioTranslationEvent,
    val completed: Boolean,
) : SingleConversationSocketEvent {
    override val conversationId: String get() = event.conversationId
}

/** `translation:failed` : une traduction de texte a définitivement échoué — le « traduction… » s'éteint. */
@Serializable
data class TranslationFailedEvent(
    val messageId: String,
    override val conversationId: String,
    val error: String? = null,
    val taskId: String? = null,
) : SingleConversationSocketEvent

/** `audio:translation-failed`. */
@Serializable
data class AudioTranslationFailedEvent(
    val messageId: String,
    val attachmentId: String? = null,
    override val conversationId: String,
    val error: String? = null,
    val errorCode: String? = null,
    val taskId: String? = null,
) : SingleConversationSocketEvent

/** `audio:transcription-failed`. */
@Serializable
data class TranscriptionFailedEvent(
    val messageId: String,
    val attachmentId: String? = null,
    override val conversationId: String,
    val error: String? = null,
    val errorCode: String? = null,
    val taskId: String? = null,
) : SingleConversationSocketEvent

/** Charge commune de `conversation:joined` / `conversation:left` (accusés de ROOM, sans effectif). */
@Serializable
data class ConversationParticipationPayload(
    val conversationId: String,
    val userId: String? = null,
)

/** `conversation:joined` ([joined] vrai) ou `conversation:left`. */
data class ConversationRoomAck(
    override val conversationId: String,
    val userId: String?,
    val joined: Boolean,
) : SingleConversationSocketEvent

/**
 * `conversation:join-error` : la passerelle refuse la jonction. Le MOTIF décide — seuls trois
 * motifs établissent la non-appartenance ([isMembershipDenied]) ; les autres sont transitoires et
 * ne doivent rien détruire.
 */
@Serializable
data class ConversationJoinErrorEvent(
    override val conversationId: String,
    val reason: String? = null,
    val message: String? = null,
) : SingleConversationSocketEvent {
    val isMembershipDenied: Boolean get() = ConversationJoinErrorRule.isMembershipDenied(reason)
}

/** `conversation:stats` : les statistiques servies sont gardées brutes (aucun écran ne les lit encore). */
@Serializable
data class ConversationStatsEvent(
    override val conversationId: String,
    val stats: JsonObject? = null,
) : SingleConversationSocketEvent

/** Les droits RÉSOLUS d'un participant ; `canViewHistory` absent = la room n'a pas à le savoir. */
@Serializable
data class ServedParticipantRights(
    val canSendMessages: Boolean? = null,
    val canSendFiles: Boolean? = null,
    val canSendImages: Boolean? = null,
    val canSendVideos: Boolean? = null,
    val canSendAudios: Boolean? = null,
    val canSendLocations: Boolean? = null,
    val canSendLinks: Boolean? = null,
    val canViewHistory: Boolean? = null,
)

/** `participant:rights-updated` : un hôte a modifié les droits d'un visiteur sans compte. */
@Serializable
data class ParticipantRightsUpdatedEvent(
    override val conversationId: String,
    val participantId: String,
    val updatedBy: String? = null,
    val rights: ServedParticipantRights = ServedParticipantRights(),
    val historyVisibleFrom: String? = null,
) : SingleConversationSocketEvent

/**
 * La règle partagée du refus de jonction — miroir de `isMembershipDeniedJoinError()`
 * (`packages/shared/utils/conversation-join-error.ts`) et de `ConversationJoinErrorEvent
 * .isMembershipDenied` (iOS). Un motif inconnu ou absent n'établit RIEN.
 */
object ConversationJoinErrorRule {
    private val membershipDenied = setOf("not_a_member", "banned", "no_longer_member")

    fun isMembershipDenied(reason: String?): Boolean = reason != null && reason in membershipDenied
}
