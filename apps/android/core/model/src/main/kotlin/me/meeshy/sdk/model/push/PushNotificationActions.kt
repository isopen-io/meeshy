package me.meeshy.sdk.model.push

import java.time.Instant

/** Les actions que la bannière d'un message offre : « Répondre » (saisie en ligne) et « Marquer comme lu ». */
public data class PushActionOffer(val reply: Boolean, val markRead: Boolean) {
    val any: Boolean get() = reply || markRead

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

    public fun offer(payload: PushPayload): PushActionOffer =
        if (isMessage(payload) && payload.mediaMayTravel) PushActionOffer(reply = true, markRead = true) else PushActionOffer.NONE

    /** Le nom de celui qui écrit : nom d'affichage, puis pseudo, puis le titre servi. */
    public fun senderName(payload: PushPayload): String? =
        payload.senderDisplayName ?: payload.senderUsername ?: payload.title

    /** L'heure serveur du message ; à défaut l'instant de réception, pour que la bulle se range au bon endroit. */
    public fun timestampMillis(payload: PushPayload, nowMillis: Long): Long =
        payload.createdAt?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: nowMillis
}
