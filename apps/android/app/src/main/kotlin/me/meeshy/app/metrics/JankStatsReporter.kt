package me.meeshy.app.metrics

import android.app.Activity
import androidx.metrics.performance.JankStats
import java.util.concurrent.atomic.AtomicLong

/**
 * Suit les images de la fenêtre d'une activité (JankStats) et cumule images mesurées / lentes dans des compteurs
 * partagés. [stop] libère l'écouteur : plus aucune image n'est comptée ensuite.
 */
class JankStatsReporter(
    activity: Activity,
    private val totalFrames: AtomicLong,
    private val slowFrames: AtomicLong,
) {
    private val stats: JankStats? = runCatching {
        JankStats.createAndTrack(activity.window) { frame ->
            totalFrames.incrementAndGet()
            if (frame.isJank) slowFrames.incrementAndGet()
        }
    }.getOrNull()

    fun stop() {
        stats?.isTrackingEnabled = false
    }
}
