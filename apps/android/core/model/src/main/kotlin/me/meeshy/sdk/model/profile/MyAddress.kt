package me.meeshy.sdk.model.profile

import kotlinx.serialization.Serializable

/** Les huit glyphes qu'une adresse peut choisir (`ADDRESS_GLYPHS`, `packages/shared/utils/profile-addresses.ts`). */
enum class MyAddressGlyph(val wire: String) {
    SITE("site"),
    MUSIC("music"),
    PHOTOS("photos"),
    VIDEOS("videos"),
    SHOP("shop"),
    CONTACT("contact"),
    AGENDA("agenda"),
    FAVORITE("favorite"),
    ;

    companion object {
        /** Un glyphe absent ou inconnu (serveur plus récent) retombe sur le site. */
        fun fromWire(value: String?): MyAddressGlyph = entries.firstOrNull { it.wire == value } ?: SITE
    }
}

/** Une ligne de `GET /users/me/addresses`. Les champs ajoutés plus tard par la passerelle sont ignorés par le décodeur. */
@Serializable
data class MyAddressWire(
    val id: String = "",
    val title: String = "",
    val url: String = "",
    val glyph: String? = null,
    val position: Int = 0,
    val isShown: Boolean? = null,
    val clicks: Int? = null,
)

@Serializable
data class MyAddressesPayload(val addresses: List<MyAddressWire> = emptyList())

/** Une adresse que le propriétaire déclare sur sa fiche : un titre, un site public, un glyphe, et ce que les autres en ont ouvert. */
data class MyAddress(
    val id: String,
    val title: String,
    val url: String,
    val glyph: MyAddressGlyph,
    val position: Int,
    val isShown: Boolean,
    val clicks: Int,
)

/**
 * Le décodage de « Mes adresses » : l'URL servie repasse par la règle d'écriture avant de devenir un lien — seul un site
 * `http(s)` public se dessine en lien, jamais `javascript:`, `data:`, des identifiants, une adresse IP ni un nom interne
 * (`normalizeAddressUrl`, `packages/shared/utils/profile-addresses.ts`). Une ligne illisible est écartée, pas fatale.
 */
object MyAddresses {

    fun decode(rows: List<MyAddressWire>): List<MyAddress> = rows
        .mapNotNull(::decodeOne)
        .sortedBy { it.position }

    /** L'hôte montré sous le titre : ni schéma, ni `www.`, ni chemin. */
    fun host(url: String): String = url
        .substringAfter("://")
        .substringBefore('/').substringBefore('?').substringBefore('#')
        .removePrefix("www.")

    internal fun normalizeUrl(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.isEmpty() || trimmed.length > URL_MAX_LENGTH || trimmed.any { it.isWhitespace() || it.code < 0x20 || it.code == 0x7f }) return null
        val explicit = EXPLICIT_HTTP.containsMatchIn(trimmed)
        val hasScheme = ANY_SCHEME.containsMatchIn(trimmed) && !HOST_WITH_PORT.containsMatchIn(trimmed)
        if (hasScheme && !explicit) return null
        val candidate = if (explicit) trimmed else "https://$trimmed"
        val authority = candidate.substringAfter("://").substringBefore('/').substringBefore('?').substringBefore('#')
        if (authority.contains('@')) return null
        val hostname = authority.substringBefore(':').lowercase().trimEnd('.')
        return candidate.takeIf { isPublicDomain(hostname) }
    }

    private fun isPublicDomain(host: String): Boolean {
        if (host.isEmpty() || host.startsWith('[') || NUMERIC_HOST.matches(host)) return false
        val labels = host.split('.')
        if (labels.size < 2 || labels.any { it.isEmpty() }) return false
        if (!TLD.matches(labels.last())) return false
        if (labels.any { !LABEL.matches(it) }) return false
        return INTERNAL_SUFFIXES.none { host.endsWith(it) }
    }

    private fun decodeOne(row: MyAddressWire): MyAddress? {
        val id = row.id.trim()
        val title = row.title.trim()
        if (id.isEmpty() || title.isEmpty()) return null
        val url = normalizeUrl(row.url) ?: return null
        return MyAddress(
            id = id,
            title = title,
            url = url,
            glyph = MyAddressGlyph.fromWire(row.glyph),
            position = row.position.coerceAtLeast(0),
            isShown = row.isShown != false,
            clicks = (row.clicks ?: 0).coerceAtLeast(0),
        )
    }

    private const val URL_MAX_LENGTH = 2048
    private val EXPLICIT_HTTP = Regex("^https?://", RegexOption.IGNORE_CASE)
    private val ANY_SCHEME = Regex("^[a-z][a-z0-9+.-]*:", RegexOption.IGNORE_CASE)
    private val HOST_WITH_PORT = Regex("^[^/?#:]+:\\d+(?:[/?#]|$)")
    private val NUMERIC_HOST = Regex("^\\d+(?:\\.\\d+){0,3}$")
    private val TLD = Regex("^[a-z][a-z0-9-]*$")
    private val LABEL = Regex("^[a-z0-9-]+$")
    private val INTERNAL_SUFFIXES = listOf(
        ".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".intranet", ".private", ".localdomain", ".home.arpa",
    )
}
