package me.meeshy.sdk.model.battery

import java.time.Instant
import kotlinx.serialization.Serializable

/**
 * Le dernier roster servi, rangé sur l'appareil (#14147) — ce qui rend la batterie CACHE-FIRST au démarrage à froid,
 * hors ligne ou sur un réseau lent, comme iOS (`BatteryStateStore`). Il est rangé PAR COMPTE ([viewerId]) et ne se
 * relit que pour ce compte ; un état plus vieux que le TTL du contrat ne se repeint pas. Le rattrapage
 * (`GET /relations/battery`) le remplace ensuite en entier : rien de restauré n'est « touché ».
 */
@Serializable
public data class BatteryRosterSnapshot(
    val viewerId: String,
    val items: List<BatteryReaderStateWire> = emptyList(),
) {
    public fun restore(viewerId: String?, nowMillis: Long, ttlMillis: Long = TTL_MILLIS): BatteryRoster {
        if (viewerId == null || viewerId != this.viewerId) return BatteryRoster()
        val fresh = items.mapNotNull { it.served() }.filter { nowMillis - it.measuredAtMillis < ttlMillis }
        return BatteryRoster(byUser = fresh.associateBy { it.userId })
    }

    public companion object {
        /** `BATTERY_CONFIG.ttlHours` (24 h) : la passerelle n'en garde pas plus, le cache non plus. */
        public const val TTL_MILLIS: Long = 24L * 60 * 60 * 1000

        public fun of(viewerId: String, roster: BatteryRoster): BatteryRosterSnapshot =
            BatteryRosterSnapshot(viewerId, roster.byUser.values.map { it.wire() })
    }
}

/** La forme de fil d'un état servi : ce que [BatteryReaderStateWire.served] relit à l'identique. */
public fun BatteryState.wire(): BatteryReaderStateWire = BatteryReaderStateWire(
    userId = userId,
    phase = phase.wire,
    level = level,
    charging = charging,
    lowPower = lowPower,
    estimatedMinutes = estimatedMinutes,
    measuredAt = Instant.ofEpochMilli(measuredAtMillis).toString(),
    deviceLabel = deviceLabel,
)
