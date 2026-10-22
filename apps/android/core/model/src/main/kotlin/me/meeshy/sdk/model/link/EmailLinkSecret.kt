package me.meeshy.sdk.model.link

/**
 * **UN LIEN À JETON D'E-MAIL N'ENTRE QUE PAR L'E-MAIL QUI LE PORTE** — le miroir Kotlin UNIQUE de
 * `packages/shared/utils/email-link-secret.ts` (TypeScript, qui fait foi) et de `EmailLinkSecret.swift`
 * (MeeshySDK iOS), #10870, #10871, #10874, #10875.
 *
 * Connexion par lien magique, vérification d'adresse, réinitialisation, révocation des sessions, suppression de
 * compte, changement d'adresse : ces liens portent le jeton d'UN compte. Présentés au bout d'un lien qu'un autre
 * utilisateur a posté (message, post, commentaire) ou par `meeshy://`, ils connecteraient le lecteur au compte de
 * celui qui l'a demandé (fixation de session).
 *
 * Deux questions, deux lectures, et aucune ne remplace l'autre :
 *  - [carriesSecret] / [pathCarriesSecret] — LARGE : le chemin, une fois normalisé comme le lit la règle partagée
 *    (casse, barres doublées, `\`, encodages multiples, invisibles, `;`, espaces, `.` et `..`), est-il celui d'un
 *    lien à jeton, ou SOUS lui ? Un tel lien touché dans l'app part au navigateur, jamais à l'app.
 *  - [exactForm] — ÉTROITE : la seule forme qu'écrivent les e-mails, octet pour octet, en https, sans identifiants
 *    ni port. Rien d'autre ne connecte, ne vérifie ni ne réinitialise : une variante part au navigateur (fail-closed).
 *
 * Ce que cette lecture ne fait PAS : lire les paramètres (`?next=…`, `?returnUrl=…`) qui renverraient vers une
 * adresse à jeton. Cette lecture-là est celle de la passerelle (`email-link-url.ts`, à la création d'un lien suivi) ;
 * l'app, elle, n'obéit à aucun paramètre de ce genre.
 */
object EmailLinkSecret {

    /** La forme exacte d'un lien d'e-mail que l'app sait reconnaître. */
    sealed interface Form {
        /** `pathToken` : le jeton historique écrit dans le chemin (`/auth/magic-link/<jeton>`) ; `null` ⇒ il voyage dans le fragment ou la requête. */
        data class MagicLink(val pathToken: String?) : Form

        data object VerifyEmail : Form

        data object ResetPassword : Form
    }

    /** Les alias que la passerelle écrit dans les e-mails, vers leur adresse canonique. */
    val aliases: Map<String, String> = mapOf(
        "/auth/email-link/magic-link" to "/auth/magic-link",
        "/auth/email-link/verify-email" to "/auth/verify-email",
        "/auth/email-link/reset-password" to "/reset-password",
    )

    /** Les adresses canoniques des liens à jeton d'e-mail. */
    val paths: Set<String> = setOf(
        "/auth/verify-email",
        "/auth/magic-link",
        "/auth/magic-link/validate",
        "/auth/revoke-sessions",
        "/reset-password",
        "/account/deletion",
        "/settings/verify-email-change",
    )

    private val secretPrefixes: List<String> = paths.toList() + listOf("/auth/email-link", "/auth/reset-password")

    private val exactForms: Map<String, Form> = mapOf(
        "/auth/magic-link" to Form.MagicLink(pathToken = null),
        "/auth/email-link/magic-link" to Form.MagicLink(pathToken = null),
        "/auth/verify-email" to Form.VerifyEmail,
        "/auth/email-link/verify-email" to Form.VerifyEmail,
        "/reset-password" to Form.ResetPassword,
        "/auth/reset-password" to Form.ResetPassword,
        "/auth/email-link/reset-password" to Form.ResetPassword,
    )

    private const val PATH_TOKEN_PREFIX = "/auth/magic-link/"
    private const val RESERVED_PATH_SEGMENT = "validate"
    private const val DEFAULT_HTTPS_PORT = "443"
    private const val MAX_DECODE_ROUNDS = 4

    private val webSchemes = setOf("http", "https")
    private val authorityShape = Regex("""[A-Za-z0-9.\-]+(?::[0-9]+)?""")

    // ----------------------------------------------------------------------------------- lecture LARGE

    /**
     * L'adresse porte-t-elle un chemin de lien à jeton ? Lue comme chaque analyseur la lit — RFC 3986 (`Uri`
     * Android, Foundation), WHATWG pour le web (navigateurs : `\` vaut `/`, tabulations retirées, barres après le
     * schéma ignorées), et sous `meeshy://` le premier segment est l'hôte (`meeshy://auth/magic-link`). Il suffit
     * qu'UNE lecture y voie un secret. Le fragment-route (`/#/reset-password`) est lu comme un chemin.
     *
     * FERMÉE : une adresse sans schéma est illisible, et une adresse illisible répond OUI.
     */
    fun carriesSecret(url: String): Boolean {
        val raw = url.trim()
        val parsed = RawUrl.parse(raw) ?: return true
        return (rfcReadings(parsed) + whatwgReadings(parsed, raw) + customSchemeReadings(parsed))
            .any(::pathCarriesSecret)
    }

    /** Le chemin, une fois normalisé, est-il celui d'un lien à jeton, ou SOUS lui ? */
    fun pathCarriesSecret(path: String): Boolean {
        val normalized = normalize(path)
        val canonical = aliases[normalized] ?: normalized
        return secretPrefixes.any { canonical == it || canonical.startsWith("$it/") }
    }

    private fun rfcReadings(url: RawUrl): List<String> = listOfNotNull(url.path, routeOf(url.fragment))

    private fun whatwgReadings(url: RawUrl, raw: String): List<String> {
        if (url.scheme.lowercase() !in webSchemes) return emptyList()
        val afterScheme = raw.filterNot { it == '\t' || it == '\n' || it == '\r' }
            .substringAfter(':')
            .trimStart('/', '\\')
        val afterAuthority = afterScheme.dropWhile { it != '/' && it != '\\' && it != '?' && it != '#' }
        val path = afterAuthority.takeWhile { it != '?' && it != '#' }
        val fragment = afterAuthority.takeIf { '#' in it }?.substringAfter('#')
        return listOfNotNull(path, routeOf(fragment))
    }

    private fun customSchemeReadings(url: RawUrl): List<String> {
        if (!url.scheme.equals("meeshy", ignoreCase = true)) return emptyList()
        val authority = url.authority.orEmpty()
        return listOf("/${url.host.orEmpty()}${url.path}", "/$authority${url.path}")
    }

    private fun routeOf(fragment: String?): String? =
        fragment?.substringBefore('?')?.takeIf { it.startsWith("/") }

    // ----------------------------------------------------------------------------------- lecture ÉTROITE

    /**
     * La forme exacte, ou `null`. Le chemin se compare BRUT (encodé) : un `%20`, un `;`, une barre doublée, une
     * majuscule ou un segment de plus n'y ressemblent à rien. L'HÔTE n'est pas jugé ici — l'appelant le fixe
     * (`LaunchRouter` n'accepte que `meeshy.me`) — mais l'autorité doit être un nom nu : ni identifiants, ni port
     * autre que 443, ni `\`, ni encodage.
     */
    fun exactForm(url: String): Form? {
        if (url.any { it.isISOControl() || it.isWhitespace() }) return null
        val parsed = RawUrl.parse(url) ?: return null
        if (!parsed.scheme.equals("https", ignoreCase = true)) return null
        val authority = parsed.authority?.takeIf { authorityShape.matches(it) } ?: return null
        if (authority.contains(':') && authority.substringAfter(':') != DEFAULT_HTTPS_PORT) return null
        return exactForms[parsed.path] ?: pathTokenForm(parsed.path)
    }

    private fun pathTokenForm(path: String): Form.MagicLink? {
        if (!path.startsWith(PATH_TOKEN_PREFIX)) return null
        val token = path.removePrefix(PATH_TOKEN_PREFIX)
        return token
            .takeIf { it.isNotEmpty() && it != RESERVED_PATH_SEGMENT && it.all(::isPathTokenChar) }
            ?.let { Form.MagicLink(pathToken = it) }
    }

    private fun isPathTokenChar(char: Char): Boolean =
        char in 'a'..'z' || char in 'A'..'Z' || char in '0'..'9' || char == '-' || char == '_'

    // ----------------------------------------------------------------------------------- normalisation

    private fun normalize(path: String): String {
        val decoded = decode(path).lowercase().replace('\\', '/')
        val kept = decoded.split('/')
            .map(::normalizeSegment)
            .filter { it.isNotEmpty() && it != "." }
            .fold(emptyList<String>()) { acc, segment -> if (segment == "..") acc.dropLast(1) else acc + segment }
        return "/" + kept.joinToString("/")
    }

    private tailrec fun decode(path: String, round: Int = 0): String {
        val decoded = percentDecodeOnce(path)
        return if (decoded == path || round >= MAX_DECODE_ROUNDS) decoded else decode(decoded, round + 1)
    }

    private fun normalizeSegment(segment: String): String =
        segment.filterNot(::isDefaultIgnorable)
            .substringBefore(';').substringBefore('?').substringBefore('#')
            .trim(::isTrimmable)

    private fun isDefaultIgnorable(char: Char): Boolean = when (char.code) {
        0x00AD, 0x034F, 0x061C, 0x115F, 0x1160, 0x17B4, 0x17B5, 0x3164, 0xFEFF, 0xFFA0 -> true
        in 0x180B..0x180F, in 0x200B..0x200F, in 0x202A..0x202E, in 0x2060..0x206F, in 0xFE00..0xFE0F -> true
        else -> false
    }

    private fun isTrimmable(char: Char): Boolean = when (char.code) {
        0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0x85, 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF -> true
        in 0x2000..0x200A -> true
        else -> false
    }
}
