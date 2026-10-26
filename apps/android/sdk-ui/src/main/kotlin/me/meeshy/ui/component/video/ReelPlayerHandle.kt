package me.meeshy.ui.component.video

import androidx.compose.runtime.Stable
import androidx.media3.common.C
import androidx.media3.common.Player

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
}
