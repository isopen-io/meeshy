package me.meeshy.app.conversations

import me.meeshy.sdk.model.displayedAvatar
import me.meeshy.sdk.search.MessageSearchHit
import me.meeshy.sdk.theme.displayTitle

/** Le nom et la photo de la ligne d'un message trouvé. */
internal data class MessageHitIdentity(val title: String, val avatarUrl: String?)

/**
 * Ceux de SA conversation, élus contre le lecteur [readerId] (#12569) : un direct se nomme et se
 * montre par son interlocuteur, jamais par un titre stocké vide ou legacy — le nom et la photo sont
 * vrais ensemble ou faux ensemble, comme sur la ligne de conversation. Sans conversation connue, la
 * ligne garde le titre servi avec le message, sans photo.
 */
internal fun MessageSearchHit.identity(readerId: String?): MessageHitIdentity {
    val known = conversation ?: return MessageHitIdentity(title = conversationTitle, avatarUrl = null)
    return MessageHitIdentity(title = known.displayTitle(readerId), avatarUrl = known.displayedAvatar(readerId))
}
