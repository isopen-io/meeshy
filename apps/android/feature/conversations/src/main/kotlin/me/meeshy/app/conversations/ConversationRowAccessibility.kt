package me.meeshy.app.conversations

/**
 * Le libellé unique que TalkBack lit pour une rangée (parité iOS `conversationAccessibilityLabel`):
 * nom, aperçu, heure, non-lus, sourdine, épingle, verrou, puis les points d'engagement. Les morceaux
 * arrivent déjà localisés; un morceau absent ou blanc ne laisse aucun trou.
 */
internal object ConversationRowAccessibility {

    fun label(
        title: String,
        preview: String?,
        time: String?,
        unread: String?,
        muted: String?,
        pinned: String?,
        locked: String?,
        points: String?,
    ): String = listOf(title, preview, time, unread, muted, pinned, locked, points)
        .filter { !it.isNullOrBlank() }
        .joinToString(", ")
}
