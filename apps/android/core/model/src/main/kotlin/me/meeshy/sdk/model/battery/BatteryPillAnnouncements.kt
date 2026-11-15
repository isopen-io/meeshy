package me.meeshy.sdk.model.battery

import me.meeshy.sdk.model.connection.SyncPillEntry
import me.meeshy.sdk.model.connection.SyncPillReducer
import me.meeshy.sdk.model.syncpill.SyncPillGlyph

/** Une annonce de batterie prête pour la SyncPill : qui, quoi, le libellé déjà composé, et quand elle s'efface. */
public data class BatteryPillItem(
    val id: String,
    val userId: String,
    val label: String,
    val expiresAtMs: Long,
)

/**
 * Les annonces de batterie que la SyncPill fait défiler (#14147). La règle du porteur : la pastille défile ses annonces,
 * DISPARAÎT, et ne revient que sur un NOUVEL événement — elle ne persiste jamais. Donc chaque annonce vit
 * [VISIBLE_MS] puis quitte la liste (sinon une entrée neuve sans rapport la ferait réapparaître), une annonce déjà vue
 * (même id) n'est jamais rejouée, et une nouvelle annonce de la même personne remplace la précédente.
 */
public data class BatteryPillAnnouncements(
    val items: List<BatteryPillItem> = emptyList(),
    val seen: Set<String> = emptySet(),
) {
    public fun announce(userId: String, announcement: BatteryAnnouncement, label: String, nowMs: Long): BatteryPillAnnouncements =
        announce(idOf(userId, announcement), userId, label, nowMs)

    /** Une annonce venue d'ailleurs que la socket (un push reçu app ouverte), identifiée par [id]. */
    public fun announce(id: String, userId: String, label: String, nowMs: Long): BatteryPillAnnouncements {
        if (id in seen || label.isBlank()) return this
        val item = BatteryPillItem(id, userId, label, nowMs + VISIBLE_MS)
        return copy(
            items = items.filterNot { it.userId == userId } + item,
            seen = (seen + id).toList().takeLast(SEEN_LIMIT).toSet(),
        )
    }

    public fun expire(nowMs: Long): BatteryPillAnnouncements {
        val alive = items.filter { it.expiresAtMs > nowMs }
        return if (alive.size == items.size) this else copy(items = alive)
    }

    public fun nextExpiryMs(): Long? = items.minOfOrNull { it.expiresAtMs }

    public fun entries(): List<SyncPillEntry> =
        items.map { SyncPillEntry.forAnnouncement(it.id, it.label, SyncPillGlyph.BATTERY) }

    public companion object {
        /** Le temps d'affichage de la pastille (`SyncPillReducer.CLEAR_AFTER_MS`) : l'annonce part avec elle. */
        public const val VISIBLE_MS: Long = SyncPillReducer.CLEAR_AFTER_MS

        private const val SEEN_LIMIT = 64

        public fun idOf(userId: String, announcement: BatteryAnnouncement): String =
            "battery:$userId:${announcement.kind.wire}:${announcement.atMillis}"
    }
}
