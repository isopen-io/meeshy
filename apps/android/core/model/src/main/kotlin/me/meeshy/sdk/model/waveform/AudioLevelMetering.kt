package me.meeshy.sdk.model.waveform

/**
 * Normalises a raw microphone power reading (decibels, as reported by the platform
 * recorder's average-power meter) into the `0f..1f` amplitude a waveform bar renders at.
 *
 * Ports iOS `AudioRecorderManager.normalizeLevel`: floor the reading at [FLOOR_DB],
 * then map `[FLOOR_DB, 0] → [0, 1]` linearly. **Surpasses iOS** by also clamping the
 * upper end to `1f` and treating `NaN` as silence: `averagePower` is always `≤ 0 dB`
 * on real hardware, so the result is byte-identical on every real reading — but a bogus
 * positive or `NaN` frame can no longer produce an out-of-range bar height.
 *
 * Kept pure in `:core:model`: the actual `MediaRecorder` / `AudioRecord` metering is an
 * Android-runtime concern that lives app-side and feeds each reading through here.
 */
object AudioLevelNormalizer {
    /** Readings at or below this many dB render as silence (a flat, zero-height bar). */
    const val FLOOR_DB: Float = -50f

    fun normalize(powerDb: Float): Float {
        if (powerDb.isNaN()) return 0f
        val clamped = powerDb.coerceAtLeast(FLOOR_DB)
        val normalized = (clamped - FLOOR_DB) / (0f - FLOOR_DB)
        return normalized.coerceIn(0f, 1f)
    }
}

/**
 * An immutable, fixed-capacity ring of the most-recent normalised audio levels, oldest
 * first. Ports the `levelHistory` rolling window in iOS `AudioRecorderManager` (append
 * each reading, drop from the front once it exceeds the cap) plus the initial published
 * `Array(repeating: 0, count: 15)` via [filled].
 *
 * Immutable by construction: [push] returns a new window and the invariant
 * `levels.size <= capacity` always holds. A non-positive requested capacity collapses to
 * a permanently empty window (every [push] is inert), so the model never over-allocates.
 */
class WaveformLevelWindow private constructor(
    val levels: List<Float>,
    val capacity: Int,
) {
    fun push(level: Float): WaveformLevelWindow {
        if (capacity == 0) return this
        val appended = levels + level
        val trimmed =
            if (appended.size > capacity) {
                appended.subList(appended.size - capacity, appended.size).toList()
            } else {
                appended
            }
        return WaveformLevelWindow(trimmed, capacity)
    }

    override fun equals(other: Any?): Boolean =
        other is WaveformLevelWindow && other.levels == levels && other.capacity == capacity

    override fun hashCode(): Int = 31 * levels.hashCode() + capacity

    override fun toString(): String = "WaveformLevelWindow(capacity=$capacity, levels=$levels)"

    companion object {
        /** iOS `levelHistory` window size. */
        const val DEFAULT_CAPACITY: Int = 15

        /** An empty window — no readings yet. */
        fun empty(capacity: Int = DEFAULT_CAPACITY): WaveformLevelWindow =
            WaveformLevelWindow(emptyList(), capacity.coerceAtLeast(0))

        /**
         * A window pre-seeded with [capacity] zero levels, mirroring iOS's initial
         * `audioLevels = Array(repeating: 0, count: 15)` so the strip renders flat before
         * the first real reading arrives.
         */
        fun filled(capacity: Int = DEFAULT_CAPACITY): WaveformLevelWindow {
            val cap = capacity.coerceAtLeast(0)
            return WaveformLevelWindow(List(cap) { 0f }, cap)
        }
    }
}
