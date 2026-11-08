package me.meeshy.sdk.model.call

/**
 * La taille du fichier vidéo d'un appel enregistré. Elle se déduit des IMAGES réellement captées (la fenêtre de
 * l'appel : tablette, paysage, multi-fenêtre), jamais de l'écran physique — iOS lit la taille du premier tampon
 * vidéo (`CallScreenSampleWriter`), pas de `UIScreen`. Le côté long est borné et les deux côtés restent pairs
 * (un encodeur H.264 refuse une dimension impaire).
 */
data class CallRecordingVideoSize(val width: Int, val height: Int) {
    companion object {
        const val MAX_LONG_EDGE = 1280

        fun fit(frameWidth: Int, frameHeight: Int, maxLongEdge: Int = MAX_LONG_EDGE): CallRecordingVideoSize? {
            if (frameWidth <= 0 || frameHeight <= 0 || maxLongEdge < 2) return null
            val longEdge = maxOf(frameWidth, frameHeight)
            val scale = if (longEdge > maxLongEdge) maxLongEdge.toDouble() / longEdge else 1.0
            val width = even(frameWidth * scale)
            val height = even(frameHeight * scale)
            return CallRecordingVideoSize(width, height)
        }

        private fun even(value: Double): Int = maxOf(2, (value.toInt() / 2) * 2)
    }
}
