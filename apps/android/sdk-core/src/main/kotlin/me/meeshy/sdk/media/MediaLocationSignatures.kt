package me.meeshy.sdk.media

/**
 * **La revérification d'une vidéo ou d'un son nettoyé** (#13543) : aucune signature TEXTUELLE de lieu ne survit, nulle part
 * dans le fichier — échantillons compris, où une piste minutée oubliée la laisserait. Seules des signatures de sept octets
 * ou plus : sur des octets compressés, leur apparition fortuite est négligeable, alors qu'un `©xyz` de quatre octets y
 * surgirait par hasard (les atomes courts se vérifient par la stabilité de la réécriture, pas ici).
 */
internal object MediaLocationSignatures {
    private val SIGNATURES = listOf("com.apple.quicktime.location", "ISO6709", "xmpmeta", "GPSLatitude", "GPSLongitude", "GPSCoordinates")
        .map { it.toByteArray(Charsets.ISO_8859_1) }
    private val FIRST_BYTES = BooleanArray(256).also { table -> SIGNATURES.forEach { table[it[0].toInt() and 0xFF] = true } }

    fun foundIn(bytes: ByteArray): Boolean {
        for (at in bytes.indices) {
            if (FIRST_BYTES[bytes[at].toInt() and 0xFF] && SIGNATURES.any { matches(bytes, at, it) }) return true
        }
        return false
    }

    private fun matches(bytes: ByteArray, at: Int, signature: ByteArray): Boolean {
        if (at + signature.size > bytes.size) return false
        for (i in signature.indices) if (bytes[at + i] != signature[i]) return false
        return true
    }
}
