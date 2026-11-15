package me.meeshy.sdk.model

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale

/** La capsule de rôle d'une ligne de membre : Admin (rouge), Modo (orange) — rien pour un simple membre. */
enum class MemberRoleBadge { ADMIN, MODERATOR }

/**
 * Présentation pure d'une ligne de la feuille des membres — miroir de `ConversationInfoMemberRow`
 * et `MembersCountLabel` (iOS) : date « Depuis », compteur plafonné, capsule de rôle.
 */
object MemberRowFormat {
    /** Au-delà, le serveur ne sert plus l'effectif exact à ce lecteur (`MEMBER_COUNT_DISPLAY_CAP`, packages/shared). */
    const val COUNT_DISPLAY_CAP: Int = 199

    fun isCapped(count: Int): Boolean = count >= COUNT_DISPLAY_CAP

    /** Le nombre rendu tel quel, ou « 199+ » quand il est plafonné. */
    fun countText(count: Int, capped: Boolean): String = if (capped) "$count+" else "$count"

    fun badge(role: MemberRole): MemberRoleBadge? = when (role) {
        MemberRole.CREATOR, MemberRole.ADMIN -> MemberRoleBadge.ADMIN
        MemberRole.MODERATOR -> MemberRoleBadge.MODERATOR
        MemberRole.MEMBER -> null
    }

    /** Jour + mois abrégé ; l'année sur deux chiffres hors année courante. `null` si la date manque ou est illisible. */
    fun sinceDate(joinedAt: String?, now: Instant, zone: ZoneId, locale: Locale): String? {
        val joined = joinedAt?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return null
        val sameYear = joined.atZone(zone).year == now.atZone(zone).year
        val pattern = if (sameYear) "d MMM" else "d MMM yy"
        return try {
            DateTimeFormatter.ofPattern(pattern, locale).withZone(zone).format(joined)
        } catch (e: DateTimeParseException) {
            null
        }
    }
}
