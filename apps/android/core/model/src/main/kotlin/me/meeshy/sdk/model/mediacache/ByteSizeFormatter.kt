package me.meeshy.sdk.model.mediacache

import java.util.Locale

/**
 * Human-readable byte-size formatter for cache-size readouts.
 *
 * Ports the shared iOS media-size convention (`AudioPlayerView.formatBytes` — a binary
 * `ByteCountFormatter`): base **1024**, units **KB / MB / GB** only (no bytes unit, no TB),
 * adaptive one-decimal precision (a trailing `.0` is dropped), with a space before the unit.
 * A value below one kilobyte is still expressed in KB, and negatives are clamped to zero, so
 * the output is never a bare byte count and never negative.
 */
public object ByteSizeFormatter {

    private const val KB = 1024.0
    private const val MB = KB * 1024.0
    private const val GB = MB * 1024.0

    public fun format(bytes: Long): String {
        val safe = if (bytes < 0L) 0.0 else bytes.toDouble()
        val (value, unit) = when {
            safe >= GB -> safe / GB to "GB"
            safe >= MB -> safe / MB to "MB"
            else -> safe / KB to "KB"
        }
        return "${trimDecimal(value)} $unit"
    }

    private fun trimDecimal(value: Double): String {
        val rounded = Math.round(value * 10.0) / 10.0
        return if (rounded == Math.floor(rounded)) {
            rounded.toLong().toString()
        } else {
            String.format(Locale.US, "%.1f", rounded)
        }
    }
}
