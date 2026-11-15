package me.meeshy.sdk.conversation

/** La couture « cette conversation est-elle à l'écran ? » : un message qu'on est en train de lire ne monte pas le non-lu. */
fun interface OpenConversationLookup {
    fun isOpen(conversationId: String): Boolean

    companion object {
        val None = OpenConversationLookup { false }
    }
}
