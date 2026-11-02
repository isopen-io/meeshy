package me.meeshy.sdk.model

/**
 * Deux textes d'une même rangée « se répètent » quand, dépouillés de leurs guillemets, de leur
 * casse, de leurs espaces et d'une troncature « … », l'un est l'autre, le début ou la fin de
 * l'autre. Miroir de `NotificationRowText` (iOS, MeeshySDK) : le serveur tronque ses citations,
 * l'égalité stricte ne les reconnaîtrait jamais.
 */
public object NotificationRowText {

    public fun repeats(candidate: String, other: String): Boolean {
        val a = normalized(candidate)
        val b = normalized(other)
        if (a.isEmpty() || b.isEmpty()) return false
        return a == b || a.startsWith(b) || b.startsWith(a) || a.endsWith(b) || b.endsWith(a)
    }

    /** Garde, dans l'ordre, chaque texte qui ne répète aucun des précédents ; les autres deviennent `null`. */
    public fun distinct(texts: List<String?>): List<String?> {
        val kept = ArrayList<String>(texts.size)
        return texts.map { text ->
            if (text == null || normalized(text).isEmpty() || kept.any { repeats(text, it) }) {
                null
            } else {
                kept += text
                text
            }
        }
    }

    internal fun normalized(text: String): String =
        text.replace("…", " ").replace("...", " ")
            .filterNot { it in QUOTES }
            .split(WHITESPACE)
            .filter { it.isNotEmpty() }
            .joinToString(" ")
            .lowercase()

    private const val QUOTES = "«»“”„\"'’"
    private val WHITESPACE = Regex("\\s+")
}

/** Un geste de rangée : exécuté par l'hôte, jamais par le modèle. */
public sealed interface NotificationQuickAction {
    public data class Connect(val userId: String) : NotificationQuickAction
    public data class Write(val userId: String) : NotificationQuickAction
}

/**
 * Les gestes qu'une rangée propose — miroir de `APINotification.quickActions(isFriend:)` : un
 * contact qui vient de rejoindre Meeshy se salue ou se rejoint ; le badge « Invités venus » nomme
 * la personne venue par votre lien (déjà amis ⇒ « Écrire » seul).
 */
public fun ApiNotification.quickActions(isFriend: Boolean): List<NotificationQuickAction> {
    val userId = actor?.id?.takeIf { it.isNotBlank() } ?: return emptyList()
    return when {
        notificationType == MeeshyNotificationType.CONTACT_JOINED ->
            listOf(NotificationQuickAction.Connect(userId), NotificationQuickAction.Write(userId))
        notificationType == MeeshyNotificationType.BADGE_EARNED && metadata?.axisKey == INVITE_JOINED_AXIS ->
            if (isFriend) listOf(NotificationQuickAction.Write(userId))
            else listOf(NotificationQuickAction.Write(userId), NotificationQuickAction.Connect(userId))
        else -> emptyList()
    }
}

private const val INVITE_JOINED_AXIS = "inviteJoined"

/** Nature du contenu visé par le pied de rangée — l'icône que la couche UI pose. */
public enum class RowContentKind { STORY, REEL, MOOD, POST }

/** Le pied de rangée : OÙ ça s'est passé. */
public sealed interface NotificationRowFooter {
    public data class Conversation(val title: String) : NotificationRowFooter

    /** [excerpt] `null` : la couche UI retombe sur le libellé de [kind]. */
    public data class Content(val kind: RowContentKind, val excerpt: String?) : NotificationRowFooter
}

/** Les pièces de rangée que la bannière ne porte pas : la citation et le pied, dédoublonnés. */
public data class NotificationRowDetail(
    val body: String?,
    val quote: String?,
    val footer: NotificationRowFooter?,
) {
    public companion object {

        public fun of(notification: ApiNotification, headline: String, body: String?): NotificationRowDetail {
            val quote = if (notification.notificationType == MeeshyNotificationType.COMMENT_REPLY) {
                notification.metadata?.parentCommentPreview?.takeIf { it.isNotBlank() }
            } else {
                null
            }
            val (keptBody, keptQuote) = NotificationRowText.distinct(listOf(headline, body, quote)).let { it[1] to it[2] }
            val shown = listOfNotNull(headline, keptBody, keptQuote)
            return NotificationRowDetail(
                body = keptBody,
                quote = keptQuote,
                footer = footer(notification)?.let { dedupe(it, shown) },
            )
        }

        private fun footer(notification: ApiNotification): NotificationRowFooter? {
            val kind = contentKind(notification)
            if (kind != null) {
                return NotificationRowFooter.Content(kind, notification.metadata?.postPreview?.takeIf { it.isNotBlank() })
            }
            val context = notification.context ?: return null
            val group = context.conversationTitle?.takeIf { it.isNotBlank() } ?: return null
            if (context.conversationType.equals("direct", ignoreCase = true)) return null
            return NotificationRowFooter.Conversation(group)
        }

        private fun dedupe(footer: NotificationRowFooter, shown: List<String>): NotificationRowFooter? = when (footer) {
            is NotificationRowFooter.Conversation ->
                if (shown.any { NotificationRowText.repeats(footer.title, it) }) null else footer
            is NotificationRowFooter.Content ->
                footer.copy(excerpt = footer.excerpt?.takeUnless { e -> shown.any { NotificationRowText.repeats(e, it) } })
        }

        private fun contentKind(notification: ApiNotification): RowContentKind? {
            if (notification.notificationType !in CONTENT_TYPES) return null
            val declared = (notification.metadata?.postType ?: notification.metadata?.contentType)?.uppercase()
            return when (declared) {
                "STORY" -> RowContentKind.STORY
                "REEL" -> RowContentKind.REEL
                "MOOD", "STATUS" -> RowContentKind.MOOD
                "POST" -> RowContentKind.POST
                else -> when (notification.notificationType) {
                    MeeshyNotificationType.STORY_REACTION, MeeshyNotificationType.STORY_NEW_COMMENT,
                    MeeshyNotificationType.FRIEND_STORY_COMMENT, MeeshyNotificationType.STORY_THREAD_REPLY,
                    MeeshyNotificationType.FRIEND_NEW_STORY -> RowContentKind.STORY
                    MeeshyNotificationType.STATUS_REACTION, MeeshyNotificationType.FRIEND_NEW_MOOD -> RowContentKind.MOOD
                    else -> RowContentKind.POST
                }
            }
        }

        private val CONTENT_TYPES = setOf(
            MeeshyNotificationType.POST_COMMENT, MeeshyNotificationType.STORY_NEW_COMMENT,
            MeeshyNotificationType.FRIEND_STORY_COMMENT, MeeshyNotificationType.STORY_THREAD_REPLY,
            MeeshyNotificationType.COMMENT_REPLY, MeeshyNotificationType.COMMENT_LIKE,
            MeeshyNotificationType.COMMENT_REACTION, MeeshyNotificationType.POST_LIKE,
            MeeshyNotificationType.STORY_REACTION, MeeshyNotificationType.STATUS_REACTION,
            MeeshyNotificationType.POST_REPOST, MeeshyNotificationType.FRIEND_NEW_STORY,
            MeeshyNotificationType.FRIEND_NEW_POST, MeeshyNotificationType.FRIEND_NEW_MOOD,
            MeeshyNotificationType.LEGACY_POST_COMMENT, MeeshyNotificationType.LEGACY_POST_LIKE,
            MeeshyNotificationType.LEGACY_STORY_REPLY,
        )
    }
}
