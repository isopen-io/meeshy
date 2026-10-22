package me.meeshy.sdk.model.scene.export

public data class StoryExportSourceWindow(val startMillis: Long, val durationMillis: Long)

/** Fenêtre de source lue par l'export pour la vidéo de fond (miroir de `backgroundSourceWindow`). */
public object StoryExportSourceWindowRule {
    private const val MINIMUM_SECONDS = 0.4

    /** Bornes vieillies (hors fichier, fenêtre < 0,4 s) : le fichier entier plutôt qu'un vide. */
    public fun resolve(startSeconds: Double?, endSeconds: Double?, assetDurationSeconds: Double): StoryExportSourceWindow {
        val total = maxOf(0.0, assetDurationSeconds)
        fun window(from: Double, to: Double) =
            StoryExportSourceWindow(Math.round(from * 1000), Math.round((to - from) * 1000))
        if (total <= 0.0) return window(0.0, total)
        val from = (startSeconds ?: 0.0).coerceIn(0.0, total)
        val to = minOf(total, maxOf(endSeconds ?: total, 0.0))
        return if (to - from >= MINIMUM_SECONDS) window(from, to) else window(0.0, total)
    }

    /** Un fond muet ne porte pas de son, sauf si une automation de volume le relève. */
    public fun carriesSound(isMuted: Boolean, keyframeVolumes: List<Double?>): Boolean =
        !isMuted || keyframeVolumes.any { (it ?: 0.0) > 0.0 }
}
