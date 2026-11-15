package me.meeshy.sdk.playback

import android.content.Context
import me.meeshy.sdk.model.playback.MediaResumeMerge
import me.meeshy.sdk.model.playback.MediaResumeMerge.StampedPosition
import me.meeshy.sdk.session.PerAccountCache

/**
 * La mémoire des positions de reprise — port de `AudioPlaybackPositionStore` d'iOS : « reprendre là
 * où on s'était arrêté ». Durable (survit au processus), par appareil, vidée à la déconnexion.
 *
 * Elle ne décide pas de CE qui mérite d'être mémorisé (zone morte : [me.meeshy.sdk.model.playback.PlaybackResumeDeadZone]) :
 * le moteur appelle [save] ou [clear] selon la loi.
 */
public interface PlaybackPositionStore {
    public fun position(attachmentId: String): StampedPosition?
    public fun save(attachmentId: String, positionMs: Long, savedAtEpochMs: Long)
    public fun clear(attachmentId: String)
    public fun clearAll()

    /** Amorce depuis une autre source (autre appareil) : la position la plus RÉCENTE gagne. */
    public fun seed(attachmentId: String, candidate: StampedPosition) {
        val kept = MediaResumeMerge.newest(position(attachmentId), candidate) ?: return
        if (kept == candidate) save(attachmentId, kept.positionMs, kept.savedAtEpochMs)
    }
}

/** Positions en préférences : une ligne `id → "position:instant"`, élaguée au-delà de [MAX_ENTRIES]. */
public class SharedPreferencesPlaybackPositionStore(context: Context) : PlaybackPositionStore, PerAccountCache {
    private val preferences = context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    override fun position(attachmentId: String): StampedPosition? =
        preferences.getString(attachmentId, null)?.let(::decode)

    override fun save(attachmentId: String, positionMs: Long, savedAtEpochMs: Long) {
        val editor = preferences.edit().putString(attachmentId, "$positionMs:$savedAtEpochMs")
        val all = preferences.all
        if (all.size >= MAX_ENTRIES) {
            all.entries
                .mapNotNull { (key, value) -> (value as? String)?.let(::decode)?.let { key to it.savedAtEpochMs } }
                .sortedBy { it.second }
                .take(PRUNE_COUNT)
                .forEach { editor.remove(it.first) }
        }
        editor.apply()
    }

    override fun clear(attachmentId: String) {
        preferences.edit().remove(attachmentId).apply()
    }

    override fun clearAll() {
        preferences.edit().clear().apply()
    }

    override suspend fun clear() = clearAll()

    private fun decode(raw: String): StampedPosition? {
        val parts = raw.split(':')
        if (parts.size != 2) return null
        val position = parts[0].toLongOrNull() ?: return null
        val savedAt = parts[1].toLongOrNull() ?: return null
        return StampedPosition(position, savedAt)
    }

    private companion object {
        const val FILE_NAME = "meeshy_playback_positions"
        const val MAX_ENTRIES = 500
        const val PRUNE_COUNT = 100
    }
}
