package me.meeshy.sdk.model.deeplink

/** The conversation a link card opens: a share/invitation link or a direct conversation id. */
sealed interface ConversationCardTarget {
    data class ShareLink(val identifier: String) : ConversationCardTarget
    data class Direct(val conversationId: String) : ConversationCardTarget
}

/**
 * Which conversation does a URL found in a message designate? Mirror of iOS
 * `ConversationLinkTarget`. It TRANSLATES, it does not parse: the reading is
 * [DeepLinkParser]'s, the single table of link shapes.
 *
 * Recognized: `/join/<id>` and `/chat/<id>` (share/invitation link) and
 * `/c/<id>`, `/conversation/<id>` (direct link), over https, http or `meeshy://`.
 * Never `/l/<token>` (a tracked link may aim at a post, a reel or an external
 * site) nor the device shortcuts `meeshy://contact`, `quickreply`, `send`.
 */
object ConversationLinkTarget {

    fun target(urlString: String, environmentWebOrigin: String): ConversationCardTarget? {
        val url = DeepLinkUrl.parse(urlString.trim()) ?: return null
        if (url.scheme != "https" && url.scheme != "http" && url.scheme != "meeshy") return null
        return when (val destination = DeepLinkParser.parse(url, environmentWebOrigin)) {
            is DeepLinkDestination.JoinLink -> ConversationCardTarget.ShareLink(destination.identifier)
            is DeepLinkDestination.ChatLink -> ConversationCardTarget.ShareLink(destination.identifier)
            is DeepLinkDestination.Conversation ->
                if (destination.draftText == null && isConversationPath(url)) {
                    ConversationCardTarget.Direct(destination.id)
                } else null
            else -> null
        }
    }

    private fun isConversationPath(url: DeepLinkUrl): Boolean {
        val head = if (url.scheme == "meeshy") url.host else url.segments.firstOrNull()?.lowercase()
        return head == "c" || head == "conversation"
    }
}
