package me.meeshy.sdk.model.battery

/** Un relevé de l'appareil : niveau 0..100, en charge, mode économie. */
public data class BatteryReading(
    val level: Int,
    val charging: Boolean,
    val lowPower: Boolean,
)

/** Pourquoi on relève : un changement observé, un battement, ou une demande (socket, push silencieux, tâche de fond). */
public enum class BatteryReportTrigger { CHANGE, HEARTBEAT, PULL, PERIODIC }

/**
 * LA CADENCE DES RELEVÉS de l'émetteur (#14147, décision porteur du 2026-11-15). Le client ne fait AVANCER aucun
 * épisode : il remonte des relevés, assez souvent pour que le serveur voie chaque palier, jamais en flux.
 *
 * - au-dessus de 30 % : à chaque changement de TRANCHE de 5 % (31→30 en est un : la tranche est fermée à droite) ;
 * - à 30 % ou dessous : à chaque palier — mêmes tranches ;
 * - à 5 % ou dessous : à chaque changement de niveau, plus un battement toutes les 60 s tant que l'app a du temps
 *   d'exécution et que l'appareil n'est pas branché ;
 * - toujours : au premier relevé, au branchement / débranchement, au changement du mode économie, et sur demande
 *   (`battery:pull-requested`, push silencieux de relevé, tâche WorkManager de 15 min).
 */
public object BatteryReportCadence {
    public const val HEARTBEAT_MS: Long = 60_000L

    /** La tranche de 5 % qui CONTIENT le niveau, fermée à droite : 26..30 → 6, 21..25 → 5, 0 → 0. */
    public fun band(level: Int): Int = (level.coerceIn(0, 100) + BatteryContract.BAND_WIDTH - 1) / BatteryContract.BAND_WIDTH

    public fun isCritical(reading: BatteryReading): Boolean = reading.level <= BatteryContract.CRITICAL_THRESHOLD

    /**
     * Faut-il envoyer [current] ? [last] est le dernier relevé ACCEPTÉ par le serveur (`null` : jamais), [lastSentAtMs]
     * son instant.
     */
    public fun shouldReport(
        last: BatteryReading?,
        lastSentAtMs: Long?,
        current: BatteryReading,
        trigger: BatteryReportTrigger,
        nowMs: Long,
    ): Boolean {
        if (trigger == BatteryReportTrigger.PULL || trigger == BatteryReportTrigger.PERIODIC) return true
        if (last == null || lastSentAtMs == null) return true
        if (last.charging != current.charging || last.lowPower != current.lowPower) return true
        if (isCritical(current)) {
            if (current.level != last.level) return true
            return !current.charging && nowMs - lastSentAtMs >= HEARTBEAT_MS
        }
        return band(current.level) != band(last.level)
    }

    /** Le délai jusqu'au prochain battement, ou `null` : seulement en critique, débranché. */
    public fun heartbeatDelayMs(current: BatteryReading?, lastSentAtMs: Long?, nowMs: Long): Long? {
        if (current == null || !isCritical(current) || current.charging) return null
        val since = lastSentAtMs?.let { nowMs - it } ?: HEARTBEAT_MS
        return (HEARTBEAT_MS - since).coerceAtLeast(0L)
    }
}
