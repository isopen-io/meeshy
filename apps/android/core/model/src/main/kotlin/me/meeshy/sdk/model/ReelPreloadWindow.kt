package me.meeshy.sdk.model

import me.meeshy.sdk.model.call.ThermalState
import me.meeshy.sdk.model.media.DeviceMediaTier
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * La fenêtre de préchargement des réels (#9702) — pure, jumelle de
 * `ReelPreloadWindow.swift` et de `apps/web/src/lib/reels/preload-window.ts`.
 *
 * Plancher N-2…N+2 toujours ; devant, la médiane des dernières visites élargit
 * (<= 1 s => 10, >= 10 s => 2, pente entre les deux) ; derrière, un tiers de
 * retours en arrière élargit. Les contraintes (données économisées, 2G, 3G,
 * économie d'énergie, chaleur, RAM faible) plafonnent, puis le tier de
 * l'appareil plafonne en dernier sans jamais relever une contrainte.
 */
public object ReelPreloadWindow {
    public const val MIN_RADIUS: Int = 2
    public const val MAX_RADIUS: Int = 10

    internal const val HISTORY_LENGTH: Int = 12
    internal const val TRAVERSAL_MS: Int = 150
    internal const val CONSTRAINED_RADIUS: Int = 4
    internal const val MID_TIER_RADIUS: Int = 6
    internal const val LOW_MEMORY_GB: Double = 2.0

    internal const val MOUNT_PRIME_BYTES: Int = 1_536 * 1_024
    internal const val NEAR_PRIME_BYTES: Int = 768 * 1_024
    internal const val FAR_PRIME_BYTES: Int = 256 * 1_024

    public enum class VisitDirection { FORWARD, BACKWARD }

    public data class Visit(val dwellMs: Int, val direction: VisitDirection)

    public enum class ConnectionType { SLOW_2G, TWO_G, THREE_G, FOUR_G }

    public data class Network(
        val effectiveType: ConnectionType? = null,
        val saveData: Boolean = false,
    ) {
        public companion object {
            /** Réseau facturé (cellulaire, point d'accès) => plafond du 3G ; données réduites => saveData. */
            public fun fromPath(isExpensive: Boolean, isConstrained: Boolean): Network =
                Network(
                    effectiveType = if (isExpensive) ConnectionType.THREE_G else null,
                    saveData = isConstrained,
                )
        }
    }

    public data class Context(
        val visits: List<Visit>,
        val network: Network,
        val deviceMemoryGb: Double? = null,
        val lowPower: Boolean = false,
        val thermalState: ThermalState = ThermalState.NOMINAL,
        /** `null` = non classé, aucun plafond. Requis : l'oublier doit se voir. */
        val tier: DeviceMediaTier?,
    )

    public data class Window(val ahead: Int, val behind: Int)

    public enum class Tier { PLAY, DECODE, MOUNT, PRIME, IDLE }

    public data class PrimeTarget(val url: String, val bytes: Int)

    /** Un réel à préparer : sa place dans le fil et son palier. */
    public data class Step(val index: Int, val offset: Int, val tier: Tier)

    public fun window(context: Context): Window {
        val cap = constraintCap(context)
        val ahead = clampRadius(cadenceRadius(context.visits), cap)
        val backward = context.visits.count { it.direction == VisitDirection.BACKWARD }
        val returning = context.visits.isNotEmpty() && backward * 3 >= context.visits.size
        return Window(ahead = ahead, behind = if (returning) ahead else MIN_RADIUS)
    }

    /** `offset` = index du réel - index du réel regardé (négatif : derrière). */
    public fun tier(offset: Int, window: Window): Tier {
        val distance = abs(offset)
        if (distance == 0) return Tier.PLAY
        if (distance > (if (offset > 0) window.ahead else window.behind)) return Tier.IDLE
        if (distance == 1) return Tier.DECODE
        return if (distance == 2) Tier.MOUNT else Tier.PRIME
    }

    /** Les octets de tête à amorcer ; divisés par 4 sous contrainte réseau. */
    public fun primeBytes(tier: Tier, distance: Int, network: Network): Int {
        if (tier != Tier.MOUNT && tier != Tier.PRIME) return 0
        val base = when {
            tier == Tier.MOUNT -> MOUNT_PRIME_BYTES
            distance <= 3 -> NEAR_PRIME_BYTES
            else -> FAR_PRIME_BYTES
        }
        val constrained = network.saveData ||
            network.effectiveType == ConnectionType.SLOW_2G ||
            network.effectiveType == ConnectionType.TWO_G
        return if (constrained) base / 4 else base
    }

    /** L'historique borné, la traversée (< 150 ms) ignorée. */
    public fun recording(visit: Visit, history: List<Visit>): List<Visit> {
        if (visit.dwellMs < TRAVERSAL_MS) return history
        return (history + visit).takeLast(HISTORY_LENGTH)
    }

    /** Le plus proche d'abord, DEVANT avant derrière à distance égale, une source répétée une seule fois. */
    public fun primeTargets(urls: List<String?>, activeIndex: Int, window: Window, network: Network): List<PrimeTarget> =
        orderedOffsets(window)
            .mapNotNull { offset ->
                val url = urls.getOrNull(activeIndex + offset) ?: return@mapNotNull null
                val bytes = primeBytes(tier(offset, window), abs(offset), network)
                if (bytes == 0) null else PrimeTarget(url, bytes)
            }
            .distinctBy { it.url }

    /** Les réels à préparer, palier « décode » compris, le réel joué et les « idle » exclus. */
    public fun plan(count: Int, activeIndex: Int, window: Window): List<Step> =
        orderedOffsets(window).mapNotNull { offset ->
            val index = activeIndex + offset
            if (index < 0 || index >= count) return@mapNotNull null
            val stepTier = tier(offset, window)
            if (stepTier == Tier.IDLE) null else Step(index, offset, stepTier)
        }

    public fun gigabytes(physicalMemoryBytes: Long): Double = physicalMemoryBytes / 1_073_741_824.0

    private fun orderedOffsets(window: Window): List<Int> {
        val reach = maxOf(window.ahead, window.behind)
        if (reach <= 0) return emptyList()
        return (1..reach).flatMap { listOf(it, -it) }
    }

    private fun clampRadius(radius: Int, cap: Int): Int = maxOf(MIN_RADIUS, minOf(cap, MAX_RADIUS, radius))

    private fun median(values: List<Int>): Double {
        if (values.isEmpty()) return 0.0
        val sorted = values.sorted()
        val middle = sorted.size / 2
        return if (sorted.size % 2 == 1) sorted[middle].toDouble() else (sorted[middle - 1] + sorted[middle]) / 2.0
    }

    private fun cadenceRadius(visits: List<Visit>): Int {
        if (visits.isEmpty()) return MIN_RADIUS
        val dwell = median(visits.map { it.dwellMs })
        if (dwell <= 1_000) return MAX_RADIUS
        if (dwell >= 10_000) return MIN_RADIUS
        val slope = (10_000 - dwell) / 9_000 * (MAX_RADIUS - MIN_RADIUS)
        return (MIN_RADIUS + slope).roundToInt()
    }

    private fun constraintCap(context: Context): Int {
        val network = context.network
        if (context.lowPower || network.saveData) return MIN_RADIUS
        if (context.thermalState == ThermalState.SERIOUS || context.thermalState == ThermalState.CRITICAL) return MIN_RADIUS
        if (network.effectiveType == ConnectionType.SLOW_2G || network.effectiveType == ConnectionType.TWO_G) return MIN_RADIUS
        if (network.effectiveType == ConnectionType.THREE_G) return CONSTRAINED_RADIUS
        val memory = context.deviceMemoryGb
        if (memory != null && memory <= LOW_MEMORY_GB) return CONSTRAINED_RADIUS
        return radius(context.tier)
    }

    private fun radius(tier: DeviceMediaTier?): Int = when (tier) {
        DeviceMediaTier.LOW -> CONSTRAINED_RADIUS
        DeviceMediaTier.MID -> MID_TIER_RADIUS
        DeviceMediaTier.HIGH, DeviceMediaTier.PRO, null -> MAX_RADIUS
    }
}
