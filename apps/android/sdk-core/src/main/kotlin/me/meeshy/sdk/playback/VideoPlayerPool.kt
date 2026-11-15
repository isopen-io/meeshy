package me.meeshy.sdk.playback

import me.meeshy.sdk.model.playback.PlayerPoolEviction
import me.meeshy.sdk.model.playback.VideoMountingLaw

/**
 * **Le pool des lecteurs vidéo préparés** (iOS `StoryMediaLoader`, N±1) : les voisins du réel affiché sont
 * déjà décodés. Sa capacité vient du palier de l'appareil ([capacity]) ; quand il déborde il évince le plus
 * LOIN du réel affiché, puis le plus ancien ([PlayerPoolEviction]). Confiné au fil principal.
 */
public class VideoPlayerPool(
    private val factory: VideoPlayerPortFactory,
    private val capacity: () -> Int,
) {
    private class Entry(val port: VideoPlayerPort) : VideoPlayerPort.Listener {
        var durationMs: Long = 0L
        override fun onPrepared(generation: Int, durationMs: Long) { this.durationMs = durationMs }
        override fun onFirstFrame(generation: Int) = Unit
        override fun onIsPlayingChanged(generation: Int, isPlaying: Boolean) = Unit
        override fun onEnded(generation: Int) = Unit
        override fun onLoopTurn(generation: Int) = Unit
        override fun onError(generation: Int, cause: Throwable) = Unit
    }

    private val entries = LinkedHashMap<String, Entry>()
    private var distances: Map<String, Int> = emptyMap()

    public val size: Int get() = entries.size
    public val keys: List<String> get() = entries.keys.toList()

    /** La distance de chaque lecteur au réel affiché (signée : voisin précédent -1, suivant +1). */
    public fun declareDistances(distances: Map<String, Int>) {
        this.distances = distances
    }

    /** Prépare [key] ; `false` si le pool plein l'évincerait aussitôt (aucun décodeur dépensé pour rien). */
    public fun prepare(key: String, source: VideoSource, speed: Float = 1f, generation: Int = 0): Boolean {
        if (key in entries) return true
        val limit = capacity().coerceAtLeast(1)
        if (!PlayerPoolEviction.admits(key, entries.keys.toList(), distances, limit)) return false
        while (entries.size >= limit) evict()
        val port = factory.create()
        val entry = Entry(port)
        port.setListener(entry)
        port.setMuted(true)
        port.setAudioTracksEnabled(false)
        port.load(source, generation, speed)
        entries[key] = entry
        return true
    }

    /**
     * Retire [key] du pool pour l'adopter. Un lecteur qui ne lit pas le fichier local alors que celui-ci est
     * sur le disque se jette (`null`).
     */
    public fun take(key: String, localFileOnDisk: Boolean): PreparedVideo? {
        val entry = entries.remove(key) ?: return null
        entry.port.setListener(null)
        if (!VideoMountingLaw.mayAdoptPreparedPlayer(entry.port.playsLocalFile, localFileOnDisk)) {
            entry.port.release()
            return null
        }
        return PreparedVideo(entry.port, entry.durationMs)
    }

    /**
     * Le lecteur sortant revient au pool s'il est PRÊT et lit le fichier, sa tête conservée ; sinon il est
     * libéré. Le pool plein évince son plus loin.
     */
    public fun giveBack(key: String, port: VideoPlayerPort, durationMs: Long = 0L): Boolean {
        if (!VideoMountingLaw.mayRecycleOutgoingPlayer(port.isReady, port.playsLocalFile) || key in entries) {
            port.setListener(null)
            port.release()
            return false
        }
        val limit = capacity().coerceAtLeast(1)
        if (!PlayerPoolEviction.admits(key, entries.keys.toList(), distances, limit)) {
            port.setListener(null)
            port.release()
            return false
        }
        while (entries.size >= limit) evict()
        port.dropLoopSuccessors()
        val entry = Entry(port).also { it.durationMs = durationMs }
        port.setListener(entry)
        entries[key] = entry
        return true
    }

    public fun retire(key: String) {
        entries.remove(key)?.let { it.port.setListener(null); it.port.release() }
    }

    public fun releaseAll() {
        entries.keys.toList().forEach(::retire)
    }

    private fun evict() {
        val victim = PlayerPoolEviction.victim(entries.keys.toList(), distances) ?: return
        retire(victim)
    }
}
