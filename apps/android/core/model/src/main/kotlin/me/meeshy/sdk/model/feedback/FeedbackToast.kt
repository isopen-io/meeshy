package me.meeshy.sdk.model.feedback

/** Nature d'un toast de retour : miroir de `FeedbackToastType` (iOS). */
enum class FeedbackToastKind { SUCCESS, ERROR, INFO }

/** Un toast de retour affiché : miroir de `FeedbackToast` (iOS), identifié pour que sa fermeture ne vise jamais son successeur. */
data class FeedbackToast(
    val id: Long,
    val message: String,
    val kind: FeedbackToastKind,
    val isTappable: Boolean,
    val shownAtMillis: Long,
) {
    /** Même message, même nature, dans la fenêtre de [FeedbackToastTiming.DEDUP_WINDOW_MILLIS] : à ne pas ré-afficher. */
    fun isDuplicateOf(message: String, kind: FeedbackToastKind, nowMillis: Long): Boolean =
        this.message == message && this.kind == kind &&
            nowMillis - shownAtMillis in 0 until FeedbackToastTiming.DEDUP_WINDOW_MILLIS
}

/** Durées d'un toast : 3 s, 6 s s'il est cliquable, au moins 6 s sous lecteur d'écran, allongées par le délai système. */
object FeedbackToastTiming {
    const val DEDUP_WINDOW_MILLIS: Long = 2_000L
    const val SHORT_MILLIS: Long = 3_000L
    const val ERROR_MILLIS: Long = 4_000L
    const val LONG_MILLIS: Long = 6_000L

    fun dismissDelayMillis(
        kind: FeedbackToastKind,
        isTappable: Boolean,
        screenReaderActive: Boolean,
        systemRecommendedMillis: Long? = null,
    ): Long {
        val base = when {
            isTappable -> LONG_MILLIS
            kind == FeedbackToastKind.ERROR -> ERROR_MILLIS
            else -> SHORT_MILLIS
        }
        val withReader = if (screenReaderActive) maxOf(base, LONG_MILLIS) else base
        return maxOf(withReader, systemRecommendedMillis ?: 0L)
    }
}
