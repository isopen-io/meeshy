package me.meeshy.sdk.model.phonereachability

import me.meeshy.sdk.model.connection.SyncPillEntry
import me.meeshy.sdk.model.connection.SyncPillReducer
import me.meeshy.sdk.model.syncpill.SyncPillGlyph

/** Une annonce du téléphone injoignable prête pour la SyncPill : qui, le libellé composé, et quand elle s'efface. */
public data class PhoneReachabilityPillItem(
    val id: String,
    val userId: String,
    val label: String,
    val expiresAtMs: Long,
)

/**
 * Les annonces du téléphone injoignable que la SyncPill fait défiler (#18737). La règle du porteur, celle de la
 * batterie : la pastille défile, DISPARAÎT, et ne revient que sur un NOUVEL événement — elle ne persiste jamais. Chaque
 * annonce vit [VISIBLE_MS], une annonce déjà vue (même id) n'est jamais rejouée, et une nouvelle annonce de la même
 * personne (« répond de nouveau » après « injoignable ») remplace la précédente.
 */
public data class PhoneReachabilityPillAnnouncements(
    val items: List<PhoneReachabilityPillItem> = emptyList(),
    val seen: Set<String> = emptySet(),
) {
    public fun announce(
        userId: String,
        announcement: PhoneReachabilityAnnouncement,
        label: String,
        nowMs: Long,
    ): PhoneReachabilityPillAnnouncements = announce(idOf(userId, announcement), userId, label, nowMs)

    /** Une annonce venue d'ailleurs que la socket (un push reçu app ouverte), identifiée par [id]. */
    public fun announce(id: String, userId: String, label: String, nowMs: Long): PhoneReachabilityPillAnnouncements {
        if (id in seen || label.isBlank()) return this
        val item = PhoneReachabilityPillItem(id, userId, label, nowMs + VISIBLE_MS)
        return copy(
            items = items.filterNot { it.userId == userId } + item,
            seen = (seen + id).toList().takeLast(SEEN_LIMIT).toSet(),
        )
    }

    public fun expire(nowMs: Long): PhoneReachabilityPillAnnouncements {
        val alive = items.filter { it.expiresAtMs > nowMs }
        return if (alive.size == items.size) this else copy(items = alive)
    }

    public fun nextExpiryMs(): Long? = items.minOfOrNull { it.expiresAtMs }

    public fun entries(): List<SyncPillEntry> =
        items.map { SyncPillEntry.forAnnouncement(it.id, it.label, SyncPillGlyph.PHONE_UNREACHABLE) }

    public companion object {
        /** Le temps d'affichage de la pastille (`SyncPillReducer.CLEAR_AFTER_MS`) : l'annonce part avec elle. */
        public const val VISIBLE_MS: Long = SyncPillReducer.CLEAR_AFTER_MS

        private const val SEEN_LIMIT = 64

        public fun idOf(userId: String, announcement: PhoneReachabilityAnnouncement): String =
            "phone:$userId:${announcement.kind.wire}:${announcement.atMillis}"
    }
}
