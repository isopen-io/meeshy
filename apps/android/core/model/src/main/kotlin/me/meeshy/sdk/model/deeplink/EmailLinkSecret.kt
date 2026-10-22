package me.meeshy.sdk.model.deeplink

/**
 * An e-mail token link only enters through the e-mail that carries it. Kotlin
 * mirror of `packages/shared/utils/email-link-secret.ts` and iOS `EmailLinkSecret`.
 *
 * Two readings, neither replaces the other:
 *  - [carriesSecret]: BROAD. Is the path, once normalized as the shared rule reads
 *    it (case, doubled slashes, `\`, multiple encodings, invisibles, `;`, spaces,
 *    `.` and `..`), that of a token link, or under it? Such a link never opens an
 *    ordinary screen.
 *  - [exactForm]: NARROW. The only form e-mails write, byte for byte, in https,
 *    without credentials or port. Anything else is refused (fail-closed).
 */
internal object EmailLinkSecret {

    sealed interface Form {
        /** [pathToken]: the historical token written in the path; null when it travels in the fragment or query. */
        data class MagicLink(val pathToken: String?) : Form
        data object VerifyEmail : Form
        data object ResetPassword : Form
    }

    private val aliases: Map<String, String> = mapOf(
        "/auth/email-link/magic-link" to "/auth/magic-link",
        "/auth/email-link/verify-email" to "/auth/verify-email",
        "/auth/email-link/reset-password" to "/reset-password",
    )

    private val paths: Set<String> = setOf(
        "/auth/verify-email",
        "/auth/magic-link",
        "/auth/magic-link/validate",
        "/auth/revoke-sessions",
        "/reset-password",
        "/account/deletion",
        "/settings/verify-email-change",
    )

    private val secretPrefixes: List<String> = paths.toList() + "/auth/email-link" + "/auth/reset-password"

    private val exactForms: Map<String, Form> = mapOf(
        "/auth/magic-link" to Form.MagicLink(null),
        "/auth/email-link/magic-link" to Form.MagicLink(null),
        "/auth/verify-email" to Form.VerifyEmail,
        "/auth/email-link/verify-email" to Form.VerifyEmail,
        "/reset-password" to Form.ResetPassword,
        "/auth/reset-password" to Form.ResetPassword,
        "/auth/email-link/reset-password" to Form.ResetPassword,
    )

    private const val PATH_TOKEN_PREFIX = "/auth/magic-link/"
    private const val MAX_DECODE_ROUNDS = 4
    private val pathTokenPattern = Regex("^[A-Za-z0-9_-]+$")

    fun carriesSecret(url: DeepLinkUrl): Boolean = rawPaths(url).any { carriesSecret(it) }

    fun carriesSecret(path: String): Boolean {
        val normalized = normalize(path)
        val canonical = aliases[normalized] ?: normalized
        return secretPrefixes.any { canonical == it || canonical.startsWith("$it/") }
    }

    fun exactForm(url: DeepLinkUrl): Form? {
        if (url.scheme != "https" || url.userInfo != null) return null
        if (url.port != null && url.port != 443) return null
        exactForms[url.rawPath]?.let { return it }
        if (!url.rawPath.startsWith(PATH_TOKEN_PREFIX)) return null
        val token = url.rawPath.removePrefix(PATH_TOKEN_PREFIX)
        if (token.isEmpty() || token == "validate" || !pathTokenPattern.matches(token)) return null
        return Form.MagicLink(token)
    }

    private fun rawPaths(url: DeepLinkUrl): List<String> =
        if (url.scheme == "meeshy") listOf("/" + url.host + url.rawPath, url.rawPath) else listOf(url.rawPath)

    private fun normalize(path: String): String {
        val decoded = decode(path).lowercase().replace('\\', '/')
        val kept = decoded.split('/')
            .map(::normalizeSegment)
            .filter { it.isNotEmpty() && it != "." }
            .fold(emptyList<String>()) { acc, segment ->
                if (segment == "..") acc.dropLast(1) else acc + segment
            }
        return "/" + kept.joinToString("/")
    }

    private fun decode(path: String): String {
        var current = path
        repeat(MAX_DECODE_ROUNDS + 1) {
            val next = DeepLinkUrl.percentDecode(current)
            if (next == current) return next
            current = next
        }
        return current
    }

    private fun normalizeSegment(segment: String): String {
        val visible = segment.filterNot { isDefaultIgnorable(it.code) }
        val head = visible.split(';', '?', '#').first()
        return head.trim { it.isWhitespace() || Character.isSpaceChar(it) || it == '\u0085' }
    }

    private fun isDefaultIgnorable(code: Int): Boolean = when (code) {
        0x00AD, 0x034F, 0x061C, 0x115F, 0x1160, 0x17B4, 0x17B5, 0x3164, 0xFEFF, 0xFFA0 -> true
        in 0x180B..0x180F, in 0x200B..0x200F, in 0x202A..0x202E, in 0x2060..0x206F, in 0xFE00..0xFE0F -> true
        else -> false
    }
}
