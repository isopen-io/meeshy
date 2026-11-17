package me.meeshy.sdk.model.phonereachability

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.temporal.ChronoUnit
import java.util.Locale
import me.meeshy.sdk.model.relation.RelationLevel

/**
 * La présentation PURE du téléphone injoignable d'une personne (#18737) : ce que l'en-tête, l'avatar, la fiche, le
 * profil et la SyncPill lisent. Aucune ressource ici — les libellés se résolvent dans la couche écran, sept langues.
 */
public object PhoneReachabilityPresentation {

    /**
     * « depuis 14:10 » : l'heure LOCALE du LECTEUR, formatée sur l'appareil depuis `unreachableSince`. Aujourd'hui,
     * l'heure seule ; dans les six jours, le jour de la semaine et l'heure ; au-delà, la date et l'heure. Une date à
     * venir (horloges décalées) se lit « aujourd'hui ».
     */
    public fun sinceText(sinceMillis: Long, nowMillis: Long, zone: ZoneId, locale: Locale): String {
        val since = Instant.ofEpochMilli(sinceMillis).atZone(zone)
        val today = Instant.ofEpochMilli(nowMillis).atZone(zone).toLocalDate()
        val days = ChronoUnit.DAYS.between(since.toLocalDate(), today)
        val time = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).format(since)
        return when {
            days <= 0L -> time
            days < WEEK_DAYS -> "${DateTimeFormatter.ofPattern("EEEE", locale).format(since)} $time"
            else -> "${DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale).format(since)} $time"
        }
    }

    /** La clé de la ligne de cause ; une cause inconnue de ce client ne dit rien (`null`). */
    public fun causeKey(cause: PhoneUnreachableCause): String? = when (cause) {
        PhoneUnreachableCause.BATTERY -> "phone.cause.battery"
        PhoneUnreachableCause.NETWORK -> "phone.cause.network"
        PhoneUnreachableCause.UNKNOWN -> null
    }

    /** La clé du libellé d'une annonce dans la SyncPill (`phone.pill.<genre>`). */
    public fun pillKey(kind: PhoneReachabilityAnnouncementKind): String = "phone.pill.${kind.wire}"

    private const val WEEK_DAYS = 7L
}

/**
 * Qui voit quoi, côté CLIENT (la loi reste au serveur, ceci ne fait que choisir quoi PROPOSER) : l'injoignabilité se
 * partage dès Proche (`device.unreachable`, CLOSE) ; un Sang la reçoit par défaut, un Proche attend un accord donné UNE
 * fois. Mon propre état ne m'est jamais montré.
 */
public object PhoneReachabilityPersonRules {
    public fun mayShare(level: RelationLevel): Boolean = level.ordinal >= RelationLevel.CLOSE.ordinal

    /** Le consentement d'un Proche, case non cochée : entre Proches seulement, rien partagé, jamais proposé, pas tout coupé. */
    public fun offersConsent(level: RelationLevel, shared: Boolean, alreadyOffered: Boolean, sharingEnabled: Boolean): Boolean =
        level == RelationLevel.CLOSE && !shared && !alreadyOffered && sharingEnabled

    /** L'état d'une personne ne se montre jamais à elle-même. */
    public fun shows(userId: String?, viewerId: String?): Boolean =
        !userId.isNullOrBlank() && userId != viewerId
}
