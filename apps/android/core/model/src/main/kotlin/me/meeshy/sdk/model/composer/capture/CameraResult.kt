package me.meeshy.sdk.model.composer.capture

/**
 * Ce que le viseur remet à son hôte (miroir de `CameraResult` iOS).
 *
 * La photo voyage avec ses octets D'ORIGINE : le JPEG tel que la caméra l'a produit,
 * EXIF compris (marque, modèle, date, pose, orientation, position si permise). Un
 * `Bitmap` n'en garde rien ; ré-encoder est donc interdit, [Photo.originalJpeg] est
 * la seule charge écrite en galerie ou envoyée.
 */
sealed interface CameraResult {
    /** Le jeton de la prise qui a produit ce résultat. */
    val token: String

    class Photo(
        override val token: String,
        val uri: String,
        val originalJpeg: ByteArray?,
    ) : CameraResult {
        override fun equals(other: Any?): Boolean =
            other is Photo && token == other.token && uri == other.uri &&
                (originalJpeg contentEquals other.originalJpeg)

        override fun hashCode(): Int =
            31 * (31 * token.hashCode() + uri.hashCode()) + (originalJpeg?.contentHashCode() ?: 0)
    }

    data class Video(override val token: String, val uri: String) : CameraResult
}
