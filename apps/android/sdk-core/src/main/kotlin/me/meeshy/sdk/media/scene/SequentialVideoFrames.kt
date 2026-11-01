package me.meeshy.sdk.media.scene

import android.graphics.Bitmap

/** Une image sortie du décodeur : rendue en bitmap seulement si on la montre, rendue au décodeur dans tous les cas. */
internal interface DecodedVideoFrame {
    val presentationMillis: Long
    fun render(): Bitmap?
    fun release()
}

/** Un décodeur qui lit une source dans l'ordre ; [next] rend `null` à la fin du fichier ou quand il ne rend plus rien à temps. */
internal interface VideoFrameDecoder {
    fun seekTo(sourceMillis: Long)
    fun next(): DecodedVideoFrame?
    fun release()
}

/**
 * **LES IMAGES D'UNE VIDÉO POSÉE, LUES DANS L'ORDRE** (#13897, recette S8) : l'export demande la source à des instants
 * croissants ; chaque image sort du décodeur une seule fois, seule la plus récente avant l'instant demandé se convertit, et le
 * décodeur ne se repositionne qu'au retour de la boucle (ou à un saut de plus de [MAX_FORWARD_MILLIS]). Un décodeur qui ne
 * rend plus rien laisse la dernière image montrée, et n'est plus sollicité avant la boucle suivante : le fil GL ne doit jamais
 * tenir le muxer au-delà de son chien de garde (dix secondes sans échantillon arrêtent l'export).
 */
internal class SequentialVideoFrames(private val decoder: VideoFrameDecoder) : PlacedVideoFrames {

    private var pending: DecodedVideoFrame? = null
    private var shownMillis: Long? = null
    private var shown: Bitmap? = null
    private var exhausted = false

    override fun frameAt(sourceMillis: Long): Bitmap? {
        if (mustSeek(sourceMillis)) seek(sourceMillis)
        if (exhausted) return shown
        var best: DecodedVideoFrame? = null
        while (true) {
            val candidate = pending ?: decoder.next()
            pending = null
            if (candidate == null) {
                exhausted = true
                break
            }
            if (candidate.presentationMillis > sourceMillis && (best != null || shownMillis != null)) {
                pending = candidate
                break
            }
            best?.release()
            best = candidate
        }
        best?.let(::show)
        return shown
    }

    override fun release() {
        pending?.release()
        pending = null
        shown?.recycle()
        shown = null
        decoder.release()
    }

    private fun mustSeek(sourceMillis: Long): Boolean {
        val at = shownMillis ?: return sourceMillis > MAX_FORWARD_MILLIS
        return sourceMillis < at || (!exhausted && sourceMillis > at + MAX_FORWARD_MILLIS)
    }

    private fun seek(sourceMillis: Long) {
        pending?.release()
        pending = null
        shownMillis = null
        exhausted = false
        decoder.seekTo(sourceMillis)
    }

    private fun show(frame: DecodedVideoFrame) {
        val bitmap = try {
            frame.render()
        } finally {
            frame.release()
        }
        shownMillis = frame.presentationMillis
        if (bitmap == null) return
        if (shown !== bitmap) shown?.recycle()
        shown = bitmap
    }

    private companion object {
        const val MAX_FORWARD_MILLIS = 1_000L
    }
}
