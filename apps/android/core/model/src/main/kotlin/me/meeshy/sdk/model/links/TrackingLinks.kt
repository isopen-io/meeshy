package me.meeshy.sdk.model.links

import me.meeshy.sdk.model.CreateTrackingLinkRequest
import me.meeshy.sdk.model.TrackingLink
import me.meeshy.sdk.model.TrackingLinkClick

/** Le nom affiché d'un lien de suivi : son nom interne, sinon son jeton (iOS `displayName`). */
val TrackingLink.displayName: String
    get() = name?.takeIf { it.isNotBlank() } ?: token

/** Le formulaire « Nouveau lien de tracking » (iOS `CreateTrackingLinkView`). */
data class CreateTrackingLinkForm(
    val name: String = "",
    val destinationUrl: String = "",
    val campaign: String = "",
    val source: String = "",
    val medium: String = "",
    val customToken: String = "",
) {
    /** L'URL saisie, sans blancs de bord ; sans schéma elle est posée en `https://`. */
    val normalizedUrl: String
        get() {
            val trimmed = destinationUrl.trim()
            return if (trimmed.isEmpty() || SCHEME.containsMatchIn(trimmed)) trimmed else "https://$trimmed"
        }

    val isValid: Boolean
        get() = normalizedUrl.let { url ->
            url.isNotEmpty() && url.none(Char::isWhitespace) && HOST.containsMatchIn(url)
        }

    fun request(): CreateTrackingLinkRequest? {
        if (!isValid) return null
        return CreateTrackingLinkRequest(
            name = name.trim().ifEmpty { null },
            originalUrl = normalizedUrl,
            campaign = campaign.trim().ifEmpty { null },
            source = source.trim().ifEmpty { null },
            medium = medium.trim().ifEmpty { null },
            token = customToken.trim().ifEmpty { null },
        )
    }

    private companion object {
        val SCHEME = Regex("^[A-Za-z][A-Za-z0-9+.-]*://")
        val HOST = Regex("^[A-Za-z][A-Za-z0-9+.-]*://[^/?#.]+(\\.[^/?#.]+)*")
    }
}

/** La liste des liens de suivi : suppression et insertion optimistes. */
data class TrackingLinksState(
    val links: List<TrackingLink> = emptyList(),
) {
    fun prepended(link: TrackingLink): TrackingLinksState =
        copy(links = listOf(link) + links.filterNot { it.id == link.id })

    fun removed(token: String): TrackingLinksState = copy(links = links.filterNot { it.token == token })
}

/** Une ligne d'une répartition (pays, appareil, navigateur) : [fraction] est sa part des clics TOTAUX du lien. */
data class BreakdownRow(val label: String, val count: Int, val fraction: Float)

/** Le genre d'appareil d'un clic, pour son icône et sa teinte (iOS `deviceIcon` / `deviceColor`). */
enum class ClickDeviceKind { MOBILE, TABLET, DESKTOP, OTHER;

    companion object {
        fun of(device: String?): ClickDeviceKind = when (device?.lowercase()) {
            "mobile", "phone" -> MOBILE
            "tablet" -> TABLET
            "desktop" -> DESKTOP
            else -> OTHER
        }
    }
}

/** Les répartitions de la fiche d'un lien de suivi, calculées une fois sur les clics chargés. */
data class ClicksBreakdown(
    val countries: List<BreakdownRow>,
    val devices: List<BreakdownRow>,
    val browsers: List<BreakdownRow>,
) {
    companion object {
        const val TOP = 5

        fun of(clicks: List<TrackingLinkClick>, totalClicks: Int): ClicksBreakdown = ClicksBreakdown(
            countries = rows(clicks.mapNotNull { it.country }, totalClicks),
            devices = rows(clicks.mapNotNull { it.device }, totalClicks),
            browsers = rows(clicks.mapNotNull { it.browser }, totalClicks),
        )

        private fun rows(values: List<String>, total: Int): List<BreakdownRow> =
            values.groupingBy { it }.eachCount().entries
                .sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key })
                .take(TOP)
                .map { (label, count) ->
                    BreakdownRow(label, count, if (total > 0) (count.toFloat() / total).coerceIn(0f, 1f) else 0f)
                }
    }
}

/** Le drapeau d'un code pays ISO-3166 alpha-2 (indicateurs régionaux) ; `""` pour toute autre valeur. */
fun countryFlag(countryCode: String): String {
    val code = countryCode.trim().uppercase()
    if (code.length != 2 || code.any { it !in 'A'..'Z' }) return ""
    return code.map { String(Character.toChars(REGIONAL_INDICATOR_BASE + (it - 'A'))) }.joinToString("")
}

private const val REGIONAL_INDICATOR_BASE = 0x1F1E6

/** Un clic dont la redirection a abouti (point vert) ou échoué (point rouge). */
val TrackingLinkClick.redirectConfirmed: Boolean get() = redirectStatus == "confirmed"

/** Les vingt derniers clics seulement sont listés (iOS `clicks.prefix(20)`). */
const val RECENT_CLICKS_SHOWN = 20
