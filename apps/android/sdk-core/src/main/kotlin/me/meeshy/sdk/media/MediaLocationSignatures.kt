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
 *
 * Le balayage se fait EN FLUX (#13551, [MediaSignatureScan]) : par fenêtres, chaque candidat se confirmant sur le MÉDIA et non
 * sur la fenêtre — une signature à cheval sur deux fenêtres, ou une coordonnée de quarante décimales, se trouve comme une autre.
 */
internal object MediaLocationSignatures : MediaSignature {
    private val SIGNATURES = listOf("com.apple.quicktime.location", "ISO6709", "xmpmeta", "GPSLatitude", "GPSLongitude", "GPSCoordinates")
        .map { it.toByteArray(Charsets.ISO_8859_1) }
    private const val PLUS = '+'.code
    private const val MINUS = '-'.code
    private const val DOT = '.'.code
    private const val SLASH = '/'.code
    override val firstBytes: BooleanArray = BooleanArray(256).also { table ->
        SIGNATURES.forEach { table[it[0].toInt() and 0xFF] = true }
        table[PLUS] = true
        table[MINUS] = true
    }

    fun foundIn(bytes: ByteArray): Boolean = foundIn(ArrayMediaBytes(bytes))

    fun foundIn(media: MediaBytes): Boolean = MediaSignatureScan.foundIn(media, this)

    override fun matchesAt(media: MediaBytes, at: Long): Boolean = SIGNATURES.any { media.startsWithAt(at, it) } || iso6709At(media, at)

    private fun iso6709At(media: MediaBytes, at: Long): Boolean {
        val latitude = coordinate(media, at, 2) ?: return false
        val longitude = coordinate(media, latitude.end, 3) ?: return false
        return (latitude.fractional && longitude.fractional) || media.byteAt(longitude.end) == SLASH
    }

    private class Coordinate(val end: Long, val fractional: Boolean)

    private fun coordinate(media: MediaBytes, at: Long, degreeDigits: Int): Coordinate? {
        val sign = media.byteAt(at)
        if (sign != PLUS && sign != MINUS) return null
        val degreesEnd = at + 1 + degreeDigits
        if ((at + 1 until degreesEnd).any { !isDigit(media.byteAt(it)) }) return null
        if (media.byteAt(degreesEnd) != DOT) return Coordinate(degreesEnd, fractional = false)
        var end = degreesEnd + 1
        while (isDigit(media.byteAt(end))) end++
        return if (end > degreesEnd + 1) Coordinate(end, fractional = true) else null
    }

    private fun isDigit(value: Int): Boolean = value in '0'.code..'9'.code
}
