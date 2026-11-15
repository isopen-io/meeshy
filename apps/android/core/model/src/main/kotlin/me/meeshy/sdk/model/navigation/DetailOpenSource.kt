package me.meeshy.sdk.model.navigation

import me.meeshy.sdk.model.analytics.ContentEntry

/**
 * Par où un écran détail est arrivé (iOS `DetailOpenSources`, #10483). La porte qui AMÈNE un détail (tap d'un listing,
 * routeur de notification, routeur de liens) MARQUE le contenu de son entrée ; le détail la CONSOMME à sa première
 * apparition. Sans marque, l'entrée est `direct`. La marque vit [MARK_LIFETIME_MILLIS] et ne se lit qu'une fois : une
 * porte qui n'aboutit pas ne déteint pas sur une ouverture ultérieure.
 */
public class DetailOpenSource(private val nowMillis: () -> Long = System::currentTimeMillis) {
    private class Mark(val entry: ContentEntry, val at: Long)

    private val marks = HashMap<String, Mark>()

    /** Chaque nouvelle marque purge celles dont la vie est écoulée (déjà illisibles). */
    public fun mark(postId: String, entry: ContentEntry) {
        if (postId.isEmpty()) return
        val now = nowMillis()
        synchronized(marks) {
            marks.values.removeAll { now - it.at > MARK_LIFETIME_MILLIS }
            marks[postId] = Mark(entry, now)
        }
    }

    public fun markOpenedFromNotification(postId: String): Unit = mark(postId, ContentEntry.notification)

    public val markCount: Int get() = synchronized(marks) { marks.size }

    /** La marque encore valide, consommée ; `null` sans marque ou périmée. */
    public fun consumeMarkedEntry(postId: String): ContentEntry? {
        val now = nowMillis()
        val mark = synchronized(marks) { marks.remove(postId) } ?: return null
        return mark.entry.takeIf { now - mark.at <= MARK_LIFETIME_MILLIS }
    }

    public fun consumeEntry(postId: String): ContentEntry = consumeMarkedEntry(postId) ?: ContentEntry.direct

    /** La source de l'impression d'ouverture du détail (`detail`, `notification`, `shared_link`) ; la marque est consommée. */
    public fun consumeSource(postId: String): String = consumeEntry(postId).detailImpressionSource

    public companion object {
        public const val MARK_LIFETIME_MILLIS: Long = 60_000L
        public const val NOTIFICATION_SOURCE: String = "notification"
        public const val DETAIL_SOURCE: String = "detail"
    }
}
