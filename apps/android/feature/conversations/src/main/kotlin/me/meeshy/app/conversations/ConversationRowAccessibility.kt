package me.meeshy.app.conversations

/**
 * Le libellé unique que TalkBack lit pour une rangée (parité iOS `conversationAccessibilityLabel`):
 * nom, aperçu, heure, non-lus, sourdine, épingle, synchro en attente, verrou, puis les points
 * d'engagement. Les morceaux arrivent déjà localisés; un morceau absent ou blanc ne laisse aucun trou.
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
        pendingSync: String? = null,
    ): String = listOf(title, preview, time, unread, muted, pinned, pendingSync, locked, points)
        .filter { !it.isNullOrBlank() }
        .joinToString(", ")

    /** Ce que la rangée dit de son aperçu : le brouillon se lit avec son étiquette, comme il se voit. */
    fun spokenPreview(preview: RowPreview): String =
        listOfNotNull(preview.draftLabel, preview.text).joinToString(" ")
}
