package me.meeshy.sdk.model.fall

import java.time.ZoneId
import java.util.Locale
import me.meeshy.sdk.model.connection.SyncPillEntry
import me.meeshy.sdk.model.connection.SyncPillReducer
import me.meeshy.sdk.model.inactivity.InactivityLastBattery
import me.meeshy.sdk.model.inactivity.InactivityLastPosition
import me.meeshy.sdk.model.inactivity.InactivityPresentation
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.syncpill.SyncPillGlyph

/**
 * La présentation PURE de la chute détectée d'une personne (#18748) : ce que l'en-tête, la fiche, le profil et la
 * SyncPill lisent. Aucune ressource ici — les libellés se résolvent dans la couche écran, sept langues.
 */
public object FallPresentation {
    /** « 16:42 » : l'heure LOCALE du LECTEUR, la même loi que l'inactivité (#18738). */
    public fun detectedAtText(detectedAtMillis: Long, nowMillis: Long, zone: ZoneId, locale: Locale): String =
        InactivityPresentation.sinceText(detectedAtMillis, nowMillis, zone, locale)

    public fun batteryPercent(battery: InactivityLastBattery): Int = InactivityPresentation.batteryPercent(battery)

    public fun mapUri(position: InactivityLastPosition): String = InactivityPresentation.mapUri(position)
}

/**
 * Qui voit quoi, côté CLIENT (la loi reste au serveur) : la chute se partage aux Sangs (`health.fall`, BLOOD), accordée
 * par défaut une fois l'accord donné sur l'iPhone, retirable. Ma propre chute ne m'est jamais montrée ici.
 */
public object FallPersonRules {
    public fun mayShare(level: RelationLevel): Boolean = level.ordinal >= RelationLevel.BLOOD.ordinal

    public fun shows(userId: String?, viewerId: String?): Boolean = !userId.isNullOrBlank() && userId != viewerId
}

public data class FallPillItem(val id: String, val userId: String, val label: String, val expiresAtMs: Long)

/**
 * Les annonces de chute que la SyncPill fait défiler (#18748) : la pastille défile, DISPARAÎT, et ne revient que sur un
 * NOUVEL événement — elle ne persiste jamais. Une annonce déjà vue n'est jamais rejouée ; le retour (« Awa va bien »)
 * remplace la chute de la même personne.
 */
public data class FallPillAnnouncements(
    val items: List<FallPillItem> = emptyList(),
    val seen: Set<String> = emptySet(),
) {
    public fun announce(id: String, userId: String, label: String, nowMs: Long): FallPillAnnouncements {
        if (id in seen || label.isBlank()) return this
        return copy(
            items = items.filterNot { it.userId == userId } + FallPillItem(id, userId, label, nowMs + VISIBLE_MS),
            seen = (seen + id).toList().takeLast(SEEN_LIMIT).toSet(),
        )
    }

    public fun expire(nowMs: Long): FallPillAnnouncements {
        val alive = items.filter { it.expiresAtMs > nowMs }
        return if (alive.size == items.size) this else copy(items = alive)
    }

    public fun nextExpiryMs(): Long? = items.minOfOrNull { it.expiresAtMs }

    public fun entries(): List<SyncPillEntry> = items.map { SyncPillEntry.forAnnouncement(it.id, it.label, SyncPillGlyph.FALL) }

    public companion object {
        public const val VISIBLE_MS: Long = SyncPillReducer.CLEAR_AFTER_MS

        private const val SEEN_LIMIT = 64

        public fun detectedId(userId: String, atMillis: Long): String = "fall:$userId:detected:$atMillis"

        public fun respondedId(userId: String, nowMillis: Long): String = "fall:$userId:responded:$nowMillis"
    }
}
