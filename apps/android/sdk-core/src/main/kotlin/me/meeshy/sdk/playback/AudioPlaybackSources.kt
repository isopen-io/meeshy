package me.meeshy.sdk.playback

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MediaSource

/** La source Media3 d'un vocal, et le bail qui garde ses octets au cache disque tant qu'elle est chargée. */
@UnstableApi
public class AudioPlaybackSource(public val source: MediaSource, public val release: () -> Unit = {})

/**
 * D'où le moteur partagé lit un vocal réseau : le cache AUDIO du compte dans l'app (`MeeshyMediaCache`,
 * lié par `:app` — `:sdk-core` ne dépend pas de `:sdk-ui`), une lecture directe sans disque par défaut.
 *
 * [isProtected] (éphémère, vue unique, flouté, chiffré) : la source rendue ne DOIT jamais écrire sur le
 * disque, ni bail ni cache.
 */
@UnstableApi
public fun interface AudioPlaybackSources {
    public fun open(url: String, isProtected: Boolean): AudioPlaybackSource

    public companion object {
        /** Aucun disque : le repli quand l'app ne lie rien (tests, aperçus). */
        public fun uncached(context: Context): AudioPlaybackSources {
            val factory = DefaultMediaSourceFactory(context.applicationContext)
            return AudioPlaybackSources { url, _ -> AudioPlaybackSource(factory.createMediaSource(MediaItem.fromUri(url))) }
        }
    }
}
