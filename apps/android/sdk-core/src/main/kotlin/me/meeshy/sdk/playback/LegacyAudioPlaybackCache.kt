package me.meeshy.sdk.playback

import androidx.media3.common.util.UnstableApi
import androidx.media3.database.DatabaseProvider
import androidx.media3.datasource.cache.SimpleCache
import java.io.File

/**
 * L'ancien cache disque du moteur partagé (`cacheDir/audio-playback`, 64 Mo, sans clôture de compte) :
 * le moteur lit désormais par le cache AUDIO du compte, et ce dossier est purgé une fois.
 */
@UnstableApi
public object LegacyAudioPlaybackCache {
    internal const val DIRECTORY = "audio-playback"

    /** Supprime le dossier et son index ; absent, il n'y a rien à faire (idempotent). */
    public fun purge(cacheDir: File, databaseProvider: DatabaseProvider) {
        val directory = File(cacheDir, DIRECTORY)
        if (!directory.exists()) return
        SimpleCache.delete(directory, databaseProvider)
        directory.deleteRecursively()
    }
}
