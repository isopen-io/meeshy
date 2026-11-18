package me.meeshy.sdk.model.call

/**
 * Charges typées des événements sociaux d'un appel (`call:participant-invited`,
 * `call:invite-declined`, `call:invite-expired`, `call:muted-by-moderator`,
 * `call:reaction-received`, `call:transcription-active`). Miroir de
 * `packages/shared/types/call-controls.ts` et `video-call.ts` ; le décodage
 * tolérant est UNE fonction, [CallSocialEventParser].
 */

/** Les huit réactions d'un appel — liste FERMÉE, dans l'ordre de la passerelle. */
enum class CallReactionEmoji(val glyph: String) {
    THUMBS_UP("👍"),
    HEART("❤️"),
    LAUGH("😂"),
    WOW("😮"),
    SAD("😢"),
    CLAP("👏"),
    PARTY("🎉"),
    FIRE("🔥"),
    ;

    companion object {
        fun fromGlyph(glyph: String?): CallReactionEmoji? = entries.firstOrNull { it.glyph == glyph }
    }
}

data class CallInvitedUser(
    val userId: String,
    val username: String,
    val displayName: String? = null,
    val avatar: String? = null,
)

/** `call:participant-invited` — une personne vient d'être invitée et sonne. */
data class CallParticipantInvited(
    val callId: String,
    val invitedBy: String,
    val invitee: CallInvitedUser,
    val participantCount: Int,
)

enum class CallInviteOutcome { DECLINED, EXPIRED }

/** `call:invite-declined` / `call:invite-expired` — l'invitation de [userId] s'est résolue sans décroché. */
data class CallInviteSettled(
    val callId: String,
    val userId: String,
    val outcome: CallInviteOutcome,
)

/** `call:muted-by-moderator` — à la personne visée seulement : son micro est à couper. */
data class CallMutedByModerator(
    val callId: String,
    val byUserId: String,
)

/** `call:reaction-received` — la réaction d'un autre participant. */
data class CallReactionReceived(
    val callId: String,
    val userId: String,
    val emoji: CallReactionEmoji,
)

/** `call:transcription-active` (serveur vers la room) — un participant ouvre ou ferme son panneau. */
data class CallTranscriptionActive(
    val callId: String,
    val speakerId: String,
    val active: Boolean,
)

/** `call:preview-requested` — à l'appelant : [userId] voit l'appel sonner et demande l'aperçu. */
data class CallPreviewRequested(
    val callId: String,
    val userId: String,
)

/**
 * `call:conversation-changed` (#19650) — un tête-à-tête qui invite un tiers est rattaché au groupe qui réunit
 * exactement les présents (trouvé ou créé). Le média ne coupe pas : la signalisation est par `callId`. Le direct
 * d'origine ([previousConversationId]) reste intact.
 */
data class CallConversationChanged(
    val callId: String,
    val conversationId: String,
    val previousConversationId: String,
    val conversationType: String,
    /** Titre du groupe ; `null` pour un groupe sans titre, que le client compose depuis ses membres. */
    val conversationTitle: String?,
    val memberUserIds: List<String>,
    /** `true` quand la passerelle vient de créer le groupe. */
    val created: Boolean,
)
