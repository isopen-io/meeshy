package me.meeshy.app.chat

import me.meeshy.sdk.model.reading.mode.ConversationReadingMode

/**
 * Le mode de lecture du FIL côté liste (iOS `MessageListViewController.readingMode`). Il ne
 * contient que [Bubbles] aujourd'hui : les scènes Focal, Script, Rivière et Résumé appartiennent
 * à leur propre domaine et se branchent sur ce crochet sans toucher à la liste.
 */
internal enum class ChatReadingMode {
    Bubbles;

    companion object {
        val Default: ChatReadingMode = Bubbles

        /** Tout mode servi se lit, côté liste, en bulles tant qu'aucune scène n'est branchée. */
        @Suppress("UNUSED_PARAMETER")
        fun of(conversationMode: ConversationReadingMode?): ChatReadingMode = Bubbles
    }
}
