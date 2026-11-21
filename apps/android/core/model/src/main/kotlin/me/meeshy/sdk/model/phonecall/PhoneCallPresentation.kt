package me.meeshy.sdk.model.phonecall

import java.time.ZoneId
import java.util.Locale
import me.meeshy.sdk.model.connection.SyncPillEntry
import me.meeshy.sdk.model.connection.SyncPillReducer
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityPresentation
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.syncpill.SyncPillGlyph

/** « En appel depuis … » : quelques minutes, ou l'heure LOCALE du lecteur au-delà d'une heure. */
public sealed interface PhoneCallSince {
    /** « En appel depuis 12 min » — jamais moins d'une minute. */
    public data class Minutes(val minutes: Int) : PhoneCallSince

    /** « En appel depuis 14:00 » — l'heure seule aujourd'hui, le jour dans la semaine, la date au-delà. */
    public data class Clock(val text: String) : PhoneCallSince
}

/**
 * La présentation PURE d'« en appel » (#18753) : ce que l'en-tête, la fiche, le profil et la SyncPill lisent. Aucune
 * ressource ici — les libellés se résolvent dans la couche écran, sept langues. Jamais d'interlocuteur.
 */
public object PhoneCallPresentation {
    private const val MINUTE_MS = 60_000L
    private const val HOUR_MINUTES = 60L

    public fun since(sinceMillis: Long, nowMillis: Long, zone: ZoneId, locale: Locale): PhoneCallSince {
        val minutes = (nowMillis - sinceMillis) / MINUTE_MS
        if (minutes >= HOUR_MINUTES) return PhoneCallSince.Clock(PhoneReachabilityPresentation.sinceText(sinceMillis, nowMillis, zone, locale))
        return PhoneCallSince.Minutes(minutes.coerceAtLeast(1L).toInt())
    }

    /** Combien de temps [state] reste affichable à [nowMillis] ; `null` s'il ne l'est plus (ou n'existe pas). */
    public fun visibleFor(state: PhoneCallState?, nowMillis: Long): Long? =
        state?.takeIf { it.isLiveAt(nowMillis) }?.let { it.expiresAtMillis - nowMillis }
}

/**
 * Qui voit quoi, côté CLIENT (la loi reste au serveur, ceci ne fait que choisir quoi PROPOSER) : « en appel » se partage
 * aux Sangs (`device.call`, BLOOD — l'équipe y est servie au niveau Sang), accordé par défaut, retirable. Mon propre
 * état ne m'est jamais montré.
 */
public object PhoneCallPersonRules {
    public fun mayShare(level: RelationLevel): Boolean = level.ordinal >= RelationLevel.BLOOD.ordinal

    public fun shows(userId: String?, viewerId: String?): Boolean =
        !userId.isNullOrBlank() && userId != viewerId
}

/** Une annonce prête pour la SyncPill : qui, le libellé composé, et quand elle s'efface. */
public data class PhoneCallPillItem(
    val id: String,
    val userId: String,
    val label: String,
    val expiresAtMs: Long,
)

/**
 * Les annonces « en appel » que la SyncPill fait défiler (#18753), règle du porteur : la pastille défile, DISPARAÎT, et
 * ne revient que sur un NOUVEL événement — elle ne persiste jamais. Chaque annonce vit [VISIBLE_MS], une annonce déjà vue
 * (même id) n'est jamais rejouée, et UNE pastille par personne : « Jacques a raccroché » remplace « Jacques est en appel ».
 */
public data class PhoneCallPillAnnouncements(
    val items: List<PhoneCallPillItem> = emptyList(),
    val seen: Set<String> = emptySet(),
) {
    public fun announce(userId: String, announcement: PhoneCallAnnouncement, label: String, nowMs: Long): PhoneCallPillAnnouncements =
        announce(idOf(userId, announcement), userId, label, nowMs)

    public fun announce(id: String, userId: String, label: String, nowMs: Long): PhoneCallPillAnnouncements {
        if (id in seen || label.isBlank()) return this
        val item = PhoneCallPillItem(id, userId, label, nowMs + VISIBLE_MS)
        return copy(
            items = items.filterNot { it.userId == userId } + item,
            seen = (seen + id).toList().takeLast(SEEN_LIMIT).toSet(),
        )
    }

    public fun expire(nowMs: Long): PhoneCallPillAnnouncements {
        val alive = items.filter { it.expiresAtMs > nowMs }
        return if (alive.size == items.size) this else copy(items = alive)
    }

    public fun nextExpiryMs(): Long? = items.minOfOrNull { it.expiresAtMs }

    public fun entries(): List<SyncPillEntry> =
        items.map { SyncPillEntry.forAnnouncement(it.id, it.label, SyncPillGlyph.PHONE_CALL) }

    public companion object {
        public const val VISIBLE_MS: Long = SyncPillReducer.CLEAR_AFTER_MS

        private const val SEEN_LIMIT = 64

        public fun idOf(userId: String, announcement: PhoneCallAnnouncement): String =
            "phone-call:$userId:${announcement.kind.wire}:${announcement.atMillis}"
    }
}
