package me.meeshy.sdk.model

import kotlin.math.abs

/**
 * The discrete slow-mode intervals the admin settings picker offers, in seconds —
 * feature-parity §Chat (conversation moderation). `0` means off. Parity with the
 * iOS admin picker, and the SSOT the enforcement math
 * ([me.meeshy.sdk.composer.SlowModePolicy]) is fed from.
 *
 * The gateway may store an arbitrary interval (a value migrated from another
 * client, or a future option), so [nearest] snaps any raw server value onto the
 * closest offered choice — the picker never has to render an off-menu value, and
 * the composer countdown still uses the server's real interval unchanged.
 */
object SlowModeOptions {

    /** Offered intervals, ascending. `0` = slow mode off. */
    val SECONDS: List<Int> = listOf(0, 10, 30, 60, 300)

    /** Whether [seconds] is exactly one of the offered choices. */
    fun isValid(seconds: Int): Boolean = seconds in SECONDS

    /**
     * Snap a raw interval to the closest offered choice. `null` or any
     * non-positive value → `0` (off); a value above the largest option → the
     * largest option. On an exact tie between two neighbours the smaller (less
     * throttling) wins, because [SECONDS] is ascending and the first minimum is
     * returned.
     */
    fun nearest(seconds: Int?): Int {
        val value = seconds ?: 0
        if (value <= 0) return 0
        return SECONDS.minByOrNull { abs(it - value) } ?: 0
    }
}
