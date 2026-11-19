package me.meeshy.sdk.model.inactivity

import java.time.ZoneId
import java.util.Locale
import me.meeshy.sdk.model.connection.SyncPillEntry
import me.meeshy.sdk.model.connection.SyncPillReducer
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityPresentation
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.syncpill.SyncPillGlyph

/**
 * La présentation PURE de la vérification d'inactivité d'une personne (#18738) : ce que l'en-tête, la fiche, le profil
 * et la SyncPill lisent. Aucune ressource ici — les libellés se résolvent dans la couche écran, sept langues.
 */
public object InactivityPresentation {

    /**
     * « Aucune activité depuis 8:00 » : l'heure LOCALE du LECTEUR, la même loi que le téléphone injoignable (#18737) —
     * l'heure seule aujourd'hui, le jour dans la semaine, la date au-delà.
     */
    public fun sinceText(sinceMillis: Long, nowMillis: Long, zone: ZoneId, locale: Locale): String =
        PhoneReachabilityPresentation.sinceText(sinceMillis, nowMillis, zone, locale)

    /** « 9 % » : le niveau borné à 0…100. */
    public fun batteryPercent(battery: InactivityLastBattery): Int = battery.level.coerceIn(0, MAX_PERCENT)

    /** La carte du système, ouverte sur la dernière position partagée. */
    public fun mapUri(position: InactivityLastPosition): String =
        "geo:${position.latitude},${position.longitude}?q=${position.latitude},${position.longitude}"

    private const val MAX_PERCENT = 100
}

/**
 * Qui voit quoi, côté CLIENT (la loi reste au serveur, ceci ne fait que choisir quoi PROPOSER) : l'alerte d'inactivité
 * se partage aux Sangs (`safety.inactivity`, BLOOD), accordée par défaut, retirable. Mon propre état ne m'est jamais montré.
 */
public object InactivityPersonRules {
    public fun mayShare(level: RelationLevel): Boolean = level.ordinal >= RelationLevel.BLOOD.ordinal

    public fun shows(userId: String?, viewerId: String?): Boolean =
        !userId.isNullOrBlank() && userId != viewerId
}

/** Une annonce prête pour la SyncPill : qui, le libellé composé, et quand elle s'efface. */
public data class InactivityPillItem(
    val id: String,
    val userId: String,
    val label: String,
    val expiresAtMs: Long,
)

/**
 * Les annonces d'inactivité que la SyncPill fait défiler (#18738), règle du porteur : la pastille défile, DISPARAÎT, et
 * ne revient que sur un NOUVEL événement — elle ne persiste jamais. Chaque annonce vit [VISIBLE_MS], une annonce déjà vue
 * (même id) n'est jamais rejouée, et le retour (« Jacques va bien ») remplace l'alerte de la même personne.
 */
public data class InactivityPillAnnouncements(
    val items: List<InactivityPillItem> = emptyList(),
    val seen: Set<String> = emptySet(),
) {
    public fun announce(userId: String, announcement: InactivityAnnouncement, label: String, nowMs: Long): InactivityPillAnnouncements =
        announce(idOf(userId, announcement), userId, label, nowMs)

    /** Une annonce venue d'ailleurs que la socket (un push reçu app ouverte), identifiée par [id]. */
    public fun announce(id: String, userId: String, label: String, nowMs: Long): InactivityPillAnnouncements {
        if (id in seen || label.isBlank()) return this
        val item = InactivityPillItem(id, userId, label, nowMs + VISIBLE_MS)
        return copy(
            items = items.filterNot { it.userId == userId } + item,
            seen = (seen + id).toList().takeLast(SEEN_LIMIT).toSet(),
        )
    }

    public fun expire(nowMs: Long): InactivityPillAnnouncements {
        val alive = items.filter { it.expiresAtMs > nowMs }
        return if (alive.size == items.size) this else copy(items = alive)
    }

    public fun nextExpiryMs(): Long? = items.minOfOrNull { it.expiresAtMs }

    public fun entries(): List<SyncPillEntry> =
        items.map { SyncPillEntry.forAnnouncement(it.id, it.label, SyncPillGlyph.INACTIVITY) }

    public companion object {
        public const val VISIBLE_MS: Long = SyncPillReducer.CLEAR_AFTER_MS

        private const val SEEN_LIMIT = 64

        public fun idOf(userId: String, announcement: InactivityAnnouncement): String =
            "inactivity:$userId:${announcement.kind.wire}:${announcement.atMillis}"
    }
}
