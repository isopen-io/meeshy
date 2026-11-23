package me.meeshy.sdk.model.location

import java.time.Instant
import java.time.ZoneId

/**
 * L'heure de la DERNIÈRE position connue d'une fiche (#20242, iso `ProfileWhereStamp.swift`) : « à l'instant » sous la
 * minute, « il y a N min » sous l'heure, puis « à HH:mm » (avec la date si c'est un autre jour). Une horloge en avance se
 * lit « à l'instant » ; un instant inconnu (une position servie sans heure) ne se dit pas.
 */
public sealed interface ProfileWhereStamp {
    public data object JustNow : ProfileWhereStamp

    public data class MinutesAgo(val minutes: Int) : ProfileWhereStamp

    public data class At(val epochMillis: Long, val sameDay: Boolean) : ProfileWhereStamp

    public companion object {
        private const val MINUTE_MS = 60_000L
        private const val HOUR_MS = 60 * MINUTE_MS

        public fun of(instantMillis: Long, nowMillis: Long, zone: ZoneId = ZoneId.systemDefault()): ProfileWhereStamp? {
            if (instantMillis <= 0L) return null
            val elapsed = nowMillis - instantMillis
            return when {
                elapsed < MINUTE_MS -> JustNow
                elapsed < HOUR_MS -> MinutesAgo((elapsed / MINUTE_MS).toInt())
                else -> At(instantMillis, sameDay = day(instantMillis, zone) == day(nowMillis, zone))
            }
        }

        private fun day(epochMillis: Long, zone: ZoneId) = Instant.ofEpochMilli(epochMillis).atZone(zone).toLocalDate()
    }
}

/**
 * Ce que « Ma position » montre de moi sur ma fiche (#20199, #20242, iso `ProfileOwnPositionPreview.swift`) : la carte de
 * ma DERNIÈRE position connue, quel que soit son âge, avec son heure, seulement quand ma position PART, que je ne suis pas
 * fantôme et que l'appareil en connaît une — jamais une carte vide.
 */
public sealed interface ProfileOwnPositionPreview {
    public data class Map(val fix: GeoPoint, val atMillis: Long?) : ProfileOwnPositionPreview

    public data object Note : ProfileOwnPositionPreview

    public companion object {
        /** Au-delà, un relevé silencieux rafraîchit la position gardée. */
        public const val REFRESH_AFTER_MS: Long = 10L * 60L * 1000L

        public fun resolve(recipients: Int, isGhost: Boolean, fix: GeoPoint?, atMillis: Long?): ProfileOwnPositionPreview =
            if (recipients > 0 && !isGhost && fix != null) Map(fix, atMillis) else Note

        /**
         * Un relevé SILENCIEUX n'a lieu que si ma position part et que la permission est DÉJÀ accordée — jamais une demande
         * — et seulement si le cache manque ou date de plus de [REFRESH_AFTER_MS].
         */
        public fun needsSilentFix(sharing: Boolean, authorized: Boolean, knownAtMillis: Long?, nowMillis: Long): Boolean =
            sharing && authorized && (knownAtMillis == null || nowMillis - knownAtMillis >= REFRESH_AFTER_MS)
    }
}
