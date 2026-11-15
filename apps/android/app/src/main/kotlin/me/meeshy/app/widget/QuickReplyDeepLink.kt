package me.meeshy.app.widget

/** Le lien d'une puce de réponse rapide : `meeshy://conversation/{id}?draft={text}` (voir [WidgetDeepLink]). */
internal object QuickReplyDeepLink {
    fun uri(conversationId: String, draftText: String): String = WidgetDeepLink.reply(conversationId, draftText)
}
