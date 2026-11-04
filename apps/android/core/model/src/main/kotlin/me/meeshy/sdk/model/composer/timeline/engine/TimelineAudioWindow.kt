package me.meeshy.sdk.model.composer.timeline.engine

import me.meeshy.sdk.model.StorySourceWindowMs

/** Frames d'un fichier à rendre : à partir de [startingFrame], pendant [frameCount] frames. */
data class AudioSegment(val startingFrame: Long, val frameCount: Long)

/**
 * La fenêtre de lecture d'un clip audio (miroir de `TimelineAudioWindow`, #6580) : quelles frames du fichier rendre,
 * sachant que le clip est rogné à [StorySourceWindowMs] et que la timeline est déjà entrée de `elapsedInClip` secondes.
 * `null` : sans rognage et sans décalage, rien à fenêtrer (la source entière part) ; avec un décalage, l'ouverture est
 * APRÈS la fin du clip — on ne planifie RIEN, rejouer depuis zéro serait pire que le silence.
 */
object TimelineAudioWindow {

    fun segment(bounds: StorySourceWindowMs?, elapsedInClip: Double, sampleRate: Double, fileLength: Long): AudioSegment? {
        if (!sampleRate.isFinite() || sampleRate <= 0.0 || fileLength <= 0 || !elapsedInClip.isFinite()) return null
        if (bounds == null && elapsedInClip <= 0.0) return null
        val startSeconds = (bounds?.startMs ?: 0L) / MS
        if (bounds?.endMs != null && bounds.endMs <= bounds.startMs) return null
        val origin = startSeconds + maxOf(0.0, elapsedInClip)
        val endSeconds = bounds?.endMs?.let { it / MS } ?: (fileLength / sampleRate)
        val startingFrame = (origin * sampleRate).toLong()
        if (startingFrame < 0 || startingFrame >= fileLength) return null
        val endFrame = minOf(fileLength, (endSeconds * sampleRate).toLong())
        if (endFrame <= startingFrame) return null
        return AudioSegment(startingFrame, endFrame - startingFrame)
    }

    private const val MS = 1000.0
}
