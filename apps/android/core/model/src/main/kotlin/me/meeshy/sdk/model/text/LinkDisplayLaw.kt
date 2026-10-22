package me.meeshy.sdk.model.text

/**
 * A link AS THE AUTHOR WROTE IT — its form decides the rendering.
 *
 * | written                 | shown        | target                                       |
 * |-------------------------|--------------|----------------------------------------------|
 * | `[[https://x]]`         | `https://x`  | `https://x` direct, untracked, for everyone  |
 * | `[label](https://x)`    | `label`      | `/l/<token>` when the map has it, else direct|
 * | `https://x` bare        | `m+<token>`  | `/l/<token>` when the map has it, else direct|
 * | `m+<token>` historical  | `m+<token>`  | `/l/<token>`                                 |
 *
 * [Verbatim] also carries what is shown as is and never tracked (an e-mail).
 * Mirror of iOS `WrittenLink` / `LinkDisplayLaw` and web `resolveLinkDisplay`.
 */
sealed interface WrittenLink {
    data class Verbatim(val text: String, val url: String) : WrittenLink
    data class Labelled(val label: String, val url: String) : WrittenLink
    data class Bare(val text: String, val url: String) : WrittenLink
    data class ShortCode(val token: String) : WrittenLink
}

/**
 * What the reader reads ([text]), where a tap leads ([url]) and the written
 * prose glued to a bare address that is not part of it ([remainder]: a sentence's
 * final dot, handed back to the text when the address becomes `m+<token>`).
 */
data class LinkDisplay(
    val text: String,
    val url: String,
    val isTracked: Boolean,
    val remainder: String = "",
)

object LinkDisplayLaw {

    const val DEFAULT_WEB_ORIGIN: String = "https://meeshy.me"

    private val trackingToken = Regex("""^[A-Za-z0-9_-]{1,49}[A-Za-z0-9]$""")
    private val trailingPunctuation: Set<Char> = setOf('.', ',', ';', ':', '!', '?', ')', ']')

    /** `<web origin>/l/<token>` — the ACTIVE environment's origin, never hard-coded. */
    fun redirectUrl(token: String, webOrigin: String = DEFAULT_WEB_ORIGIN): String =
        "${webOrigin.trimEnd('/')}/l/$token"

    /** A token enters an address only in the shape the gateway emits. */
    fun isTrackingToken(token: String): Boolean = trackingToken.matches(token)

    fun resolve(
        link: WrittenLink,
        trackedLinks: Map<String, String>?,
        webOrigin: String = DEFAULT_WEB_ORIGIN,
    ): LinkDisplay = when (link) {
        is WrittenLink.Verbatim -> LinkDisplay(link.text, link.url, isTracked = false)
        is WrittenLink.ShortCode ->
            LinkDisplay("m+${link.token}", redirectUrl(link.token, webOrigin), isTracked = true)
        is WrittenLink.Labelled -> {
            val target = trackedTarget(link.url, trackedLinks, webOrigin)
            if (target == null) LinkDisplay(link.label, link.url, isTracked = false)
            else LinkDisplay(link.label, target.second, isTracked = true)
        }
        is WrittenLink.Bare -> resolveBare(link, trackedLinks, webOrigin)
    }

    /** What an author WITHOUT an account typed, the notation kept (`[label](url)` keeps its address). */
    fun inertText(link: WrittenLink): String = when (link) {
        is WrittenLink.Labelled -> "[${link.label}](${link.url})"
        else -> sourceText(link)
    }

    /** What the author typed minus the notation — highlight offsets are counted on it. */
    fun sourceText(link: WrittenLink): String = when (link) {
        is WrittenLink.Verbatim -> link.text
        is WrittenLink.Bare -> link.text
        is WrittenLink.Labelled -> link.label
        is WrittenLink.ShortCode -> "m+${link.token}"
    }

    private fun resolveBare(link: WrittenLink.Bare, trackedLinks: Map<String, String>?, webOrigin: String): LinkDisplay {
        for (key in candidateKeys(link.text)) {
            val target = trackedTarget(key, trackedLinks, webOrigin) ?: continue
            return LinkDisplay("m+${target.first}", target.second, isTracked = true, remainder = link.text.drop(key.length))
        }
        return LinkDisplay(link.text, link.url, isTracked = false)
    }

    private fun trackedTarget(key: String, map: Map<String, String>?, webOrigin: String): Pair<String, String>? {
        val token = map?.get(key) ?: return null
        if (!isTrackingToken(token)) return null
        return token to redirectUrl(token, webOrigin)
    }

    private fun candidateKeys(text: String): List<String> {
        val keys = mutableListOf(text)
        var current = text
        while (current.isNotEmpty() && current.last() in trailingPunctuation) {
            current = current.dropLast(1)
            keys += current
        }
        return keys
    }
}
