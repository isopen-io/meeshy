package me.meeshy.ui.story.canvas

import android.graphics.Bitmap
import androidx.compose.runtime.Immutable

/**
 * Ce que l'hôte fournit aux médias de premier plan : le bitmap EN MÉMOIRE d'une image retouchée du composeur (il prime
 * sur l'adresse), l'affiche d'une vidéo déjà connue, le mute global et son verrou. [isReader] : chez le lecteur, un
 * `file://` absent de cet appareil retombe sur l'adresse du serveur. [playsVideo] faux : une vidéo ne montre que son affiche.
 */
@Immutable
public data class SceneMediaEnvironment(
    val bitmapOf: (String) -> Bitmap? = { null },
    val posterOf: (String) -> Bitmap? = { null },
    val globalMuted: Boolean = false,
    val muteLocked: Boolean = false,
    val isReader: Boolean = true,
    val playsVideo: Boolean = true,
    /** Le cookie de version d'une image retouchée ([SceneEditedBitmapBridge.versionOf]) : 0 tant qu'elle ne l'est pas. */
    val versionOf: (String) -> Long = { 0L },
) {
    public companion object {
        public val Default: SceneMediaEnvironment = SceneMediaEnvironment()
    }
}
