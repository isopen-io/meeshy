package me.meeshy.sdk.model.push

import java.time.Instant

/**
 * Les actions d'une bannière : « Répondre » (saisie en ligne) et « Marquer comme lu » sur un message,
 * « Commenter » (saisie en ligne) sur une notification sociale commentable.
 */
public data class PushActionOffer(val reply: Boolean, val markRead: Boolean, val comment: Boolean = false) {
    val any: Boolean get() = reply || markRead || comment

    public companion object {
        public val NONE: PushActionOffer = PushActionOffer(reply = false, markRead = false)
    }
}

/**
 * Ce qu'une bannière de message peut offrir et montrer de son expéditeur. Reprend les règles de
 * la coque Capacitor (`NotificationBannerRules.java` : types de message répondables, identifiant
 * de conversation sans chemin) et celles d'iOS (catégories message/mention de `AppDelegate`).
 *
 * Un message PROTÉGÉ (éphémère, vue unique, flouté, chiffré : [PushPayload.mediaMayTravel] faux)
 * n'offre aucune action — répondre ou marquer lu depuis l'écran verrouillé sortirait le message du
 * cadre que sa protection lui a posé. Le texte de la bannière n'est JAMAIS recalculé ici : la
 * passerelle l'a servi dans la langue du lecteur.
 */
public object PushNotificationActions {

    /** JUMEAU de `REPLYABLE_TYPES` (`sw-push.js`, `NotificationBannerRules.TYPES`), plus la mention courte. */
    private val MESSAGE_TYPES = setOf("new_message", "message_reply", "reply", "user_mentioned", "mention", "message_forwarded")

    /** JUMEAU de `SHARE_LINK_KEY` (`NotificationBannerRules.KEY`) : un identifiant, jamais un chemin. */
    private val KEY = Regex("^[A-Za-z0-9_-]{1,100}$")

    public fun isMessage(payload: PushPayload): Boolean =
        payload.type?.lowercase() in MESSAGE_TYPES && payload.conversationId?.let(KEY::matches) == true

    /**
     * JUMEAU de `commentableSocialTypes` (`NotificationPayloadHelpers.swift`) : les commentaires, fils de réponses et
     * publications d'un ami. Réactions, j'aime, humeurs et nouvelles stories n'offrent pas de bouton « Commenter ».
     */
    private val COMMENTABLE_TYPES = setOf(
        "post_comment",
        "comment_reply",
        "story_new_comment",
        "story_thread_reply",
        "friend_story_comment",
        "friend_new_post",
    )

    /** JUMEAU de `threadReplyTypes` (`NotificationActionHandler.threadedParentCommentId`) : `friend_new_post` commente à la racine. */
    private val THREAD_TYPES = COMMENTABLE_TYPES - "friend_new_post"

    public fun isCommentable(payload: PushPayload): Boolean =
        payload.type?.lowercase() in COMMENTABLE_TYPES && payload.postId?.let(KEY::matches) == true

    /** Le commentaire est une réponse à CELUI de la notification (fil), sinon un commentaire racine ; un `commentId` absent dégrade en racine. */
    public fun threadedParentCommentId(type: String?, notifiedCommentId: String?): String? =
        notifiedCommentId?.takeIf { type?.lowercase() in THREAD_TYPES && it.isNotBlank() && KEY.matches(it) }

    /**
     * [conversationLocked] : une conversation verrouillée par code n'offre AUCUNE action rapide (iOS
     * `LockedConversationNotificationCategory`) — « Répondre » écrirait dans le coffre et « Marquer comme lu » le lirait,
     * depuis l'écran verrouillé, sans le code. Toucher la bannière ouvre la conversation, que la porte du routeur garde.
     */
    public fun offer(payload: PushPayload, conversationLocked: Boolean = false): PushActionOffer = when {
        isMessage(payload) && payload.mediaMayTravel && !conversationLocked -> PushActionOffer(reply = true, markRead = true)
        isCommentable(payload) -> PushActionOffer(reply = false, markRead = false, comment = true)
        else -> PushActionOffer.NONE
    }

    /** Le nom de celui qui écrit : nom d'affichage, puis pseudo, puis le titre servi. */
    public fun senderName(payload: PushPayload): String? =
        payload.senderDisplayName ?: payload.senderUsername ?: payload.title

    /** L'heure serveur du message ; à défaut l'instant de réception, pour que la bulle se range au bon endroit. */
    public fun timestampMillis(payload: PushPayload, nowMillis: Long): Long =
        payload.createdAt?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: nowMillis
}
