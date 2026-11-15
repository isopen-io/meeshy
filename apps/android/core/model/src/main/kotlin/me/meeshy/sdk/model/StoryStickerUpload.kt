package me.meeshy.sdk.model

/**
 * Ce qu'un sticker IMAGE doit à la publication, entre l'espace d'ids du composeur et celui du serveur — miroir de
 * `StoryStickerUpload` (iOS). Son image est INTÉGRÉE à l'entité publiée : elle part par le chemin commun (TUS puis
 * `PostMedia`) et le sticker reçoit son `postMediaId` à ce moment-là.
 */
object StoryStickerUpload {

    /**
     * Les ids des stickers dont l'image reste à téléverser, dans l'ordre de la slide. Un `postMediaId` déjà rempli vient d'un
     * envoi précédent : le renvoyer créerait un second `PostMedia` et laisserait le premier orphelin. Un sticker sans bitmap
     * est un sticker emoji, il n'a rien à envoyer.
     */
    fun pendingUploadIds(stickers: List<StorySticker>, availableBitmapIds: Set<String>): List<String> =
        stickers.filter { it.postMediaId.isEmpty() && it.id in availableBitmapIds }.map { it.id }

    /**
     * Reporte sur les stickers les `postMediaId` attribués, par id de sticker. Un sticker absent de [uploads] est rendu
     * INCHANGÉ : son envoi a pu échouer, il reste affichable par son emoji de repli. Un id vide vaut absence.
     */
    fun applying(uploads: Map<String, String>, stickers: List<StorySticker>): List<StorySticker> =
        stickers.map { sticker ->
            val assigned = uploads[sticker.id]?.takeIf { it.isNotEmpty() } ?: return@map sticker
            sticker.copy(postMediaId = assigned)
        }

    /** Les `PostMedia` que la composition référence encore par ses stickers : le PUT d'édition ne doit pas les supprimer. */
    fun attachedPostMediaIds(stickers: List<StorySticker>): List<String> =
        stickers.map { it.postMediaId }.filter { it.isNotEmpty() }
}

/**
 * Le conteneur d'une image animée (GIF, APNG, WebP animé). Le CONTENEUR décide du mime et de l'extension : réencoder en
 * PNG aplatirait l'animation, la téléverser sous `image/png` la ferait arriver mal étiquetée.
 */
class AnimatedStickerContainer private constructor(val mimeType: String, val fileExtension: String) {

    companion object {
        private val PNG_SIGNATURE = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)

        /** Le conteneur animé de [bytes], `null` pour une image fixe ou illisible. */
        fun of(bytes: ByteArray): AnimatedStickerContainer? = when {
            bytes.startsWithAscii("GIF87a") || bytes.startsWithAscii("GIF89a") -> AnimatedStickerContainer("image/gif", "gif")
            bytes.size > PNG_SIGNATURE.size && bytes.copyOfRange(0, PNG_SIGNATURE.size).contentEquals(PNG_SIGNATURE) &&
                pngIsAnimated(bytes) -> AnimatedStickerContainer("image/apng", "png")
            bytes.startsWithAscii("RIFF") && bytes.indexOfAscii("WEBP", 8) == 8 && bytes.indexOfAscii("ANIM", 12) >= 0 ->
                AnimatedStickerContainer("image/webp", "webp")
            else -> null
        }

        private fun pngIsAnimated(bytes: ByteArray): Boolean {
            val control = bytes.indexOfAscii("acTL", PNG_SIGNATURE.size)
            if (control < 0) return false
            val data = bytes.indexOfAscii("IDAT", PNG_SIGNATURE.size)
            return data < 0 || control < data
        }

        private fun ByteArray.startsWithAscii(text: String): Boolean = indexOfAscii(text, 0) == 0

        private fun ByteArray.indexOfAscii(text: String, from: Int): Int {
            val needle = text.toByteArray(Charsets.US_ASCII)
            for (start in from..size - needle.size) {
                if (needle.indices.all { this[start + it] == needle[it] }) return start
            }
            return -1
        }
    }
}
