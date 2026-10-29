package me.meeshy.ui.component.video

import androidx.compose.runtime.Stable
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.common.Tracks

/**
 * La prise que [ReelVideoSurface] tend à son hôte sur son lecteur vivant : de quoi dessiner une
 * barre de lecture et chercher dans le média, sans exposer le lecteur (ni media3) aux modules
 * fonctionnalité. Toutes les lectures se font sur le fil principal, celui du lecteur.
 */
@Stable
public class ReelPlayerHandle internal constructor(private val player: Player) {

    public val isPlaying: Boolean get() = player.isPlaying

    public fun positionMs(): Long = player.currentPosition

    /** `0` tant que la durée est inconnue (flux en cours de préparation). */
    public fun durationMs(): Long = player.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: 0L

    public fun seekTo(positionMs: Long) {
        player.seekTo(positionMs)
    }

    /** Appelle [onChange] à chaque bascule lecture/pause ; la valeur retournée se désabonne. */
    public fun observePlaying(onChange: (Boolean) -> Unit): () -> Unit {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) = onChange(isPlaying)
        }
        player.addListener(listener)
        return { player.removeListener(listener) }
    }

    /**
     * Dit si le média porte une PISTE AUDIO, dès que le lecteur a lu ses pistes (immédiatement s'il les connaît
     * déjà) ; rien n'est annoncé avant : un fichier non sondé n'est ni sonore ni muet. La valeur retournée se
     * désabonne.
     */
    public fun observeAudioTrack(onChange: (Boolean) -> Unit): () -> Unit {
        fun report(tracks: Tracks) {
            if (tracks.groups.isNotEmpty()) onChange(tracks.groups.any { it.type == C.TRACK_TYPE_AUDIO })
        }
        val listener = object : Player.Listener {
            override fun onTracksChanged(tracks: Tracks) = report(tracks)
        }
        player.addListener(listener)
        report(player.currentTracks)
        return { player.removeListener(listener) }
    }
}
