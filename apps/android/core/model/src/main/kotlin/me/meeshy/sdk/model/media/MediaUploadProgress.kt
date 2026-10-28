package me.meeshy.sdk.model.media

/**
 * Where one media of a composition stands on its way to the gateway — the state the `4c` view of
 * the composer paints (iOS `ComposerPreUploadState`, #13429). Pure: no session, no file.
 *
 * A failed pre-upload is a state, not a message: the publication resumes the send, so the author
 * is never told about a failure he can neither understand nor correct (see [PublicationRupture]
 * for the break that IS worth saying).
 */
public sealed interface MediaUploadProgress {

    /** Nothing started — just picked, or not eligible. */
    public data object Idle : MediaUploadProgress

    /** In flight. Both numbers are shown (« 4,8 / 14,2 Mo »): a percentage alone says neither ten seconds nor ten minutes. */
    public data class Uploading(val sent: Long, val total: Long) : MediaUploadProgress

    /** On the gateway: the publication only references [mediaId]. */
    public data class Ready(val mediaId: String) : MediaUploadProgress

    /** The attempt broke; the durable queue takes over. */
    public data object Failed : MediaUploadProgress

    /** The bar's fraction in `[0, 1]`, or `null` when there is nothing to show — a bar frozen at zero is worse than none. */
    public val fraction: Double?
        get() = (this as? Uploading)?.takeIf { it.total > 0 }?.let { (it.sent.toDouble() / it.total).coerceIn(0.0, 1.0) }

    public val showsProgress: Boolean get() = this is Uploading

    public val isReady: Boolean get() = this is Ready
}

public enum class UploadByteUnit { KILOBYTES, MEGABYTES, GIGABYTES }

/**
 * « 4,8 / 14,2 Mo »: both numbers on ONE scale, chosen on the total — on the first bytes of a 14 MB
 * file a scale chosen on what was sent would mix kilobytes and megabytes. Thresholds are decimal
 * (the file manager's convention). The screen formats the numbers with the user's locale.
 */
public data class UploadByteReading(
    val sentScaled: Double,
    val totalScaled: Double,
    val unit: UploadByteUnit,
    val percent: Int,
) {
    public companion object {
        public fun of(sent: Long, total: Long): UploadByteReading {
            val safeTotal = total.coerceAtLeast(0L)
            val safeSent = sent.coerceIn(0L, safeTotal)
            val (unit, divisor) = when {
                safeTotal >= GIGA -> UploadByteUnit.GIGABYTES to GIGA.toDouble()
                safeTotal >= MEGA -> UploadByteUnit.MEGABYTES to MEGA.toDouble()
                else -> UploadByteUnit.KILOBYTES to KILO.toDouble()
            }
            val percent = if (safeTotal == 0L) 0 else Math.round(safeSent.toDouble() / safeTotal * PERCENT).toInt()
            return UploadByteReading(safeSent / divisor, safeTotal / divisor, unit, percent)
        }

        private const val KILO = 1_000L
        private const val MEGA = 1_000_000L
        private const val GIGA = 1_000_000_000L
        private const val PERCENT = 100
    }
}
