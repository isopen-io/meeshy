package me.meeshy.ui.component.audio

import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import me.meeshy.sdk.model.media.PlaybackStretch
import me.meeshy.sdk.model.media.PlaybackStretchTracker

/**
 * Traduit les frontières du lecteur Media3 en plages d'écoute continues (jumelle Android de
 * l'instrumentation iOS de `PlaybackStretchTracker`) : lecture, pause, déplacement du curseur,
 * son coupé (volume 0), fin du média (y compris le bouclage), remplacement de la source,
 * écran quitté ([dismiss]). Aucun échantillonnage périodique.
 *
 * [onStretches] reçoit les plages terminées avec la position et la durée courantes, à chaque
 * frontière terminale (pause, son coupé, fin, remplacement, écran quitté) ; un déplacement du
 * curseur accumule sans émettre. À appeler sur le fil principal, comme tout `Player.Listener`.
 */
public class PlaybackStretchListener(
    private val player: Player,
    private val onStretches: (stretches: List<PlaybackStretch>, positionMs: Int, durationMs: Int) -> Unit,
) : Player.Listener {

    private var tracker = PlaybackStretchTracker()

    override fun onIsPlayingChanged(isPlaying: Boolean) {
        if (isPlaying) {
            if (player.volume > 0f) tracker = tracker.begin(position())
            return
        }
        if (player.playbackState == Player.STATE_ENDED) end() else close { it.pause(position()) }
    }

    override fun onPlaybackStateChanged(playbackState: Int) {
        if (playbackState == Player.STATE_ENDED) end()
    }

    override fun onPositionDiscontinuity(
        oldPosition: Player.PositionInfo,
        newPosition: Player.PositionInfo,
        reason: Int,
    ) {
        val from = oldPosition.positionMs.toInt()
        val to = newPosition.positionMs.toInt()
        when (reason) {
            Player.DISCONTINUITY_REASON_SEEK,
            Player.DISCONTINUITY_REASON_SEEK_ADJUSTMENT,
            -> tracker = tracker.seek(from, to)
            Player.DISCONTINUITY_REASON_AUTO_TRANSITION -> if (tracker.hasOpenStretch) {
                emit(tracker.completed(from))
                tracker = tracker.begin(to)
            }
            else -> Unit
        }
    }

    override fun onVolumeChanged(volume: Float) {
        if (volume <= 0f) {
            close { it.muted(position()) }
        } else if (player.isPlaying && !tracker.hasOpenStretch) {
            tracker = tracker.begin(position())
        }
    }

    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
        if (reason != Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT) close { it.superseded(position()) }
    }

    /** Écran quitté ou application en arrière-plan : clôt la plage ouverte et envoie tout. */
    public fun dismiss() {
        close { it.dismissed(position()) }
    }

    private fun end() {
        close { it.completed(position()) }
    }

    private fun close(transition: (PlaybackStretchTracker) -> PlaybackStretchTracker) {
        emit(transition(tracker))
    }

    private fun emit(closed: PlaybackStretchTracker) {
        val (stretches, remaining) = closed.drain()
        tracker = remaining
        if (stretches.isNotEmpty()) onStretches(stretches, position(), duration())
    }

    private fun position(): Int = player.currentPosition.coerceAtLeast(0L).toInt()

    private fun duration(): Int = player.duration.takeIf { it != C.TIME_UNSET }?.toInt() ?: 0
}
