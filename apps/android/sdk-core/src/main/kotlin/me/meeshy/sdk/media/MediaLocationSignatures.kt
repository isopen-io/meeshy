package me.meeshy.sdk.media

/**
 * **La revérification d'une vidéo ou d'un son nettoyé** (#13543) : aucune signature TEXTUELLE de lieu ne survit, nulle part
 * dans le fichier — échantillons compris, où une piste minutée oubliée la laisserait. Deux familles :
 * - des mots de sept octets ou plus (`ISO6709`, `GPSLatitude`…) : sur des octets compressés, leur apparition fortuite est
 *   négligeable, alors qu'un `©xyz` de quatre octets y surgirait par hasard (les atomes courts se vérifient par la
 *   stabilité de la réécriture, pas ici) ;
 * - une coordonnée ISO 6709 elle-même, la VALEUR que portent `©xyz`, `loci` et les échantillons `mebx` sans aucun mot-clé :
 *   `±DD.d…±DDD.d…` (décimales des deux côtés) ou `±DD±DDD/` (degrés entiers, barre finale). Sur des octets uniformes, la
 *   première forme surgit avec une probabilité de l'ordre de 1e-19 par octet, la seconde de 2e-14 : moins d'un faux refus
 *   par million de vidéos de 50 Mo.
 */
internal object MediaLocationSignatures {
    private val SIGNATURES = listOf("com.apple.quicktime.location", "ISO6709", "xmpmeta", "GPSLatitude", "GPSLongitude", "GPSCoordinates")
        .map { it.toByteArray(Charsets.ISO_8859_1) }
    private const val PLUS = '+'.code
    private const val MINUS = '-'.code
    private const val DOT = '.'.code
    private const val SLASH = '/'.code
    private val FIRST_BYTES = BooleanArray(256).also { table ->
        SIGNATURES.forEach { table[it[0].toInt() and 0xFF] = true }
        table[PLUS] = true
        table[MINUS] = true
    }

    fun foundIn(bytes: ByteArray): Boolean {
        for (at in bytes.indices) {
            if (FIRST_BYTES[bytes[at].toInt() and 0xFF] && (SIGNATURES.any { matches(bytes, at, it) } || iso6709At(bytes, at))) return true
        }
        return false
    }

    private fun matches(bytes: ByteArray, at: Int, signature: ByteArray): Boolean {
        if (at + signature.size > bytes.size) return false
        for (i in signature.indices) if (bytes[at + i] != signature[i]) return false
        return true
    }

    private fun iso6709At(bytes: ByteArray, at: Int): Boolean {
        val latitude = coordinate(bytes, at, 2) ?: return false
        val longitude = coordinate(bytes, latitude.end, 3) ?: return false
        return (latitude.fractional && longitude.fractional) || byteAt(bytes, longitude.end) == SLASH
    }

    private class Coordinate(val end: Int, val fractional: Boolean)

    private fun coordinate(bytes: ByteArray, at: Int, degreeDigits: Int): Coordinate? {
        val sign = byteAt(bytes, at)
        if (sign != PLUS && sign != MINUS) return null
        val degreesEnd = at + 1 + degreeDigits
        if ((at + 1 until degreesEnd).any { !isDigit(byteAt(bytes, it)) }) return null
        if (byteAt(bytes, degreesEnd) != DOT) return Coordinate(degreesEnd, fractional = false)
        var end = degreesEnd + 1
        while (isDigit(byteAt(bytes, end))) end++
        return if (end > degreesEnd + 1) Coordinate(end, fractional = true) else null
    }

    private fun byteAt(bytes: ByteArray, at: Int): Int = if (at < bytes.size) bytes[at].toInt() and 0xFF else -1

    private fun isDigit(value: Int): Boolean = value in '0'.code..'9'.code
}
