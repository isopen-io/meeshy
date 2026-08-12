package me.meeshy.sdk.model.call

/**
 * The single source of truth for formatting a call length as a clock label.
 *
 * Used both for the **journal** row ([CallRecord.durationLabel]) and the **live
 * in-call timer** the connected screen ticks up — so a completed call and its
 * history entry always read identically.
 *
 * Deterministic and locale-independent: `"M:SS"`, widening to `"H:MM:SS"` once
 * past an hour. Zero (or a negative clamped to zero) formats as `"0:00"` — a
 * running timer starts there; callers that must hide a zero-length call (the
 * journal) guard the zero themselves before calling.
 */
object CallDuration {

    fun clock(seconds: Long): String {
        val total = if (seconds < 0) 0 else seconds
        val h = total / 3600
        val m = (total % 3600) / 60
        val s = total % 60
        return if (h > 0) "$h:${pad2(m)}:${pad2(s)}" else "$m:${pad2(s)}"
    }

    private fun pad2(value: Long): String = value.toString().padStart(2, '0')
}
