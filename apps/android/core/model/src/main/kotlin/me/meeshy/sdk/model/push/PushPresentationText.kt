package me.meeshy.sdk.model.push

import me.meeshy.sdk.model.UserNotificationPreferences

/** Les libellés que la présentation substitue ; fournis par l'app (ressources localisées). */
public data class PushPresentationLabels(
    val newMessage: String,
    val someone: String,
    val voiceMessage: String,
    /** Gabarit « %1$s dans %2$s » (expéditeur, groupe). */
    val senderInGroup: String,
)

/** Le titre et le corps qui seront affichés ; `null` = rien à substituer, garder le texte servi. */
public data class PresentedText(val title: String?, val body: String?)

/**
 * Ce que la bannière d'un message DIT, selon les réglages « Aperçu » et « Nom de l'expéditeur » et le type de la
 * conversation. Le corps servi est déjà dans la langue du lecteur (Prisme résolu par la passerelle) : il n'est
 * jamais retraduit ni remplacé, sauf pour être MASQUÉ par le libellé générique quand l'aperçu est coupé.
 */
public object PushPresentationText {

    private val CONVERSATION_TYPES = setOf(
        "new_message", "message_reply", "reply", "user_mentioned", "mention", "message_forwarded",
        "message_reaction", "reaction",
    )

    public fun concerns(payload: PushPayload): Boolean = payload.type?.lowercase() in CONVERSATION_TYPES

    /** Repère du type de conversation (miroir de `conversationTypeIcon`) ; direct ou inconnu : rien. */
    public fun groupMarker(conversationType: String?): String = when (conversationType?.trim()?.lowercase()) {
        "group" -> "👥"
        "public" -> "🌐"
        "global", "broadcast" -> "📢"
        else -> ""
    }

    public fun present(
        payload: PushPayload,
        servedTitle: String?,
        servedBody: String?,
        preferences: UserNotificationPreferences,
        labels: PushPresentationLabels,
    ): PresentedText {
        if (!concerns(payload)) return PresentedText(servedTitle, servedBody)
        return PresentedText(
            title = title(payload, servedTitle, preferences, labels),
            body = body(payload, servedBody, preferences, labels),
        )
    }

    private fun title(
        payload: PushPayload,
        served: String?,
        preferences: UserNotificationPreferences,
        labels: PushPresentationLabels,
    ): String? {
        val sender = PushNotificationActions.senderName(payload) ?: return served
        val group = payload.conversationTitle?.takeIf { !payload.isDirectConversation && it.isNotBlank() }
        val marker = groupMarker(payload.conversationType)
        val groupName = group?.let { if (marker.isEmpty()) it else "$marker $it" }
        return when {
            groupName == null -> if (preferences.showSenderName) sender else labels.someone
            preferences.showSenderName -> labels.senderInGroup.format(sender, groupName)
            else -> groupName
        }
    }

    private fun body(
        payload: PushPayload,
        served: String?,
        preferences: UserNotificationPreferences,
        labels: PushPresentationLabels,
    ): String? {
        if (!payload.mediaMayTravel) return served
        if (!preferences.showPreview) return labels.newMessage
        return PushVoiceBodyRepair.repair(served, payload.attachmentMimeType, payload.attachmentDurationMs, labels.voiceMessage)
    }
}
