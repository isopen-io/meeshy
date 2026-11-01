package me.meeshy.sdk.media.scene

import android.graphics.Bitmap

/**
 * Une vidéo posée qui ne se décode pas (fichier sans piste lisible, décodeur qui lève) ne doit pas arrêter l'export depuis
 * le fil GL : l'échec se journalise UNE fois, la vidéo ne pose plus rien, et la preuve de rendu dit qu'elle manque (#13897).
 */
internal class GuardedVideoFrames(private val name: String, private val open: () -> PlacedVideoFrames) : PlacedVideoFrames {

    private var frames: PlacedVideoFrames? = null
    private var failed = false

    override fun frameAt(sourceMillis: Long): Bitmap? {
        if (failed) return null
        return try {
            (frames ?: open().also { frames = it }).frameAt(sourceMillis)
        } catch (unreadable: Exception) {
            failed = true
            SceneExportLog.warn("vidéo posée illisible ($name à $sourceMillis ms)", unreadable)
            release()
            null
        }
    }

    override fun release() {
        val opened = frames
        frames = null
        opened?.let { runCatching { it.release() } }
    }

    companion object {
        /** Le plus grand côté auquel une image de vidéo posée se convertit : la largeur du format, où elle se pose. */
        const val MAX_LONG_SIDE = 1_080

        fun of(video: SceneExportPlacedVideo): PlacedVideoFrames =
            GuardedVideoFrames(video.file.name) { SequentialVideoFrames(CodecVideoFrameDecoder(video.file, MAX_LONG_SIDE)) }
    }
}
