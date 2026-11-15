package me.meeshy.sdk.model.link

/**
 * **Ce que devient un lien Meeshy TOUCHÉ dans l'app** (message, post, commentaire) — le miroir Kotlin de
 * `InAppLinks.swift` (#7808, #8075, #10874). Deux familles de liens n'entrent JAMAIS dans l'app par un toucher :
 *
 *  - un **lien à jeton d'e-mail** ([isEmailLink]) : celui qui l'a posté a pu le demander pour SON compte, et le
 *    lecteur y serait connecté. Il s'ouvre dans le navigateur, d'où il ne peut pas revenir à l'app comme App Link ;
 *    l'app n'ouvre que celui que le système lui remet, par la forme exacte ([EmailLinkSecret.exactForm]) ;
 *  - une **invitation de parrainage** ([isReferralLink]) : touchée dans l'app, elle l'est par un compte connecté, qui
 *    n'a rien à y ouvrir. Elle part au navigateur, comme avant (#8075).
 *
 * Une invitation de CONVERSATION (`/join/<id>`, `/chat/<id>`) n'est pas un parrainage : elle reste dans l'app.
 */
object InAppLinks {

    /** Les hôtes de la production. L'hôte web de l'environnement de recette n'est pas connu du client Android. */
    private val meeshyHosts = setOf("meeshy.me", "www.meeshy.me", "app.meeshy.me")

    private val webSchemes = setOf("http", "https")

    /** Les clés d'adresse qui portent un code d'invitation, dans l'ordre du web (`REFERRAL_SEARCH_KEYS`). */
    private val referralQueryKeys = listOf("ref", "parrain", "affiliate")

    private const val REFERRAL_CODE_MAX_LENGTH = 128
    private const val SIGNUP = "signup"
    private const val AFFILIATE = "affiliate"

    /** L'adresse porte-t-elle un chemin de lien à jeton d'e-mail, ou SOUS lui ? Lecture large, fermée. */
    fun isEmailLink(url: String): Boolean = EmailLinkSecret.carriesSecret(url)

    /**
     * `/signup/affiliate/<code>` (le lien que la passerelle grave) ou `/signup?ref=<code>` sur un hôte Meeshy : un
     * CODE à mémoriser jusqu'à l'inscription, pas un lieu de l'app. Le code n'est pas validé — seule la passerelle
     * sait s'il est actif —, il doit seulement avoir la forme d'un identifiant opaque.
     */
    fun isReferralLink(url: String): Boolean {
        val parsed = RawUrl.parse(url.trim()) ?: return false
        if (parsed.scheme.lowercase() !in webSchemes || parsed.host !in meeshyHosts) return false
        val segments = parsed.path.split('/').map(::percentDecodeOnce).filter { it.isNotEmpty() }
        return when {
            segments.size == 3 && segments[0] == SIGNUP && segments[1] == AFFILIATE -> referralCode(segments[2]) != null
            segments.size == 1 && segments[0] == SIGNUP ->
                referralQueryKeys.firstNotNullOfOrNull { queryValue(it, parsed.query) }?.let(::referralCode) != null
            else -> false
        }
    }

    private fun queryValue(name: String, query: String?): String? =
        query?.split('&')
            ?.firstOrNull { it.substringBefore('=') == name }
            ?.substringAfter('=', missingDelimiterValue = "")
            ?.let(::percentDecodeOnce)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }

    private fun referralCode(raw: String): String? =
        raw.trim().takeIf { it.isNotEmpty() && it.length <= REFERRAL_CODE_MAX_LENGTH && it.none(Char::isWhitespace) }
}
