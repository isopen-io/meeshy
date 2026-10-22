package me.meeshy.sdk.model.deeplink

import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction

/**
 * A URL split into its raw parts without any platform class: total (null on a
 * string that is not a URL), never throws. The deep-link parser, the
 * conversation-card law and the e-mail-link guard all read links through it.
 */
internal data class DeepLinkUrl(
    val scheme: String,
    val userInfo: String?,
    val host: String,
    val port: Int?,
    val rawPath: String,
    val rawQuery: String?,
    val rawFragment: String?,
) {
    /** Decoded path segments without empty or `.` ones: `//join/X` reads as `/join/X`. */
    val segments: List<String>
        get() = rawPath.split('/').map(DeepLinkUrl::percentDecode).filter { it.isNotEmpty() && it != "." }

    /** A trimmed query value, or null when absent or blank. */
    fun queryValue(name: String): String? =
        rawQuery?.let { formValue(it, name) }?.trim()?.takeIf { it.isNotEmpty() }

    /** The query value as written (not trimmed), null when absent. */
    fun rawQueryValue(name: String): String? = rawQuery?.let { formValue(it, name) }

    /** A secret carried in the fragment first (never sent to a server), then in the query. */
    fun linkSecret(name: String): String? =
        rawFragment?.let { formValue(it, name) }?.trim()?.takeIf { it.isNotEmpty() } ?: queryValue(name)

    companion object {
        fun parse(raw: String): DeepLinkUrl? {
            if (raw.isEmpty() || raw.any { it.isWhitespace() || it.isISOControl() }) return null
            val schemeEnd = raw.indexOf(':')
            if (schemeEnd <= 0) return null
            val scheme = raw.substring(0, schemeEnd)
            if (!scheme[0].isAsciiLetter() || !scheme.all { it.isAsciiLetter() || it in '0'..'9' || it in "+-." }) return null
            var rest = raw.substring(schemeEnd + 1)
            val fragment = rest.indexOf('#').takeIf { it >= 0 }?.let { rest.substring(it + 1) }
            if (fragment != null) rest = rest.substring(0, rest.indexOf('#'))
            val query = rest.indexOf('?').takeIf { it >= 0 }?.let { rest.substring(it + 1) }
            if (query != null) rest = rest.substring(0, rest.indexOf('?'))
            if (!rest.startsWith("//")) {
                return DeepLinkUrl(scheme.lowercase(), null, "", null, rest, query, fragment)
            }
            val afterSlashes = rest.substring(2)
            val pathStart = afterSlashes.indexOf('/').let { if (it < 0) afterSlashes.length else it }
            val authority = afterSlashes.substring(0, pathStart)
            val path = afterSlashes.substring(pathStart)
            val at = authority.lastIndexOf('@')
            val userInfo = if (at >= 0) authority.substring(0, at) else null
            val hostPort = if (at >= 0) authority.substring(at + 1) else authority
            val (host, port) = splitHostPort(hostPort) ?: return null
            return DeepLinkUrl(scheme.lowercase(), userInfo, host.lowercase(), port, path, query, fragment)
        }

        private fun splitHostPort(hostPort: String): Pair<String, Int?>? {
            val colon = hostPort.lastIndexOf(':')
            val isIpv6Tail = hostPort.startsWith("[") && colon < hostPort.lastIndexOf(']')
            if (colon < 0 || isIpv6Tail) return hostPort to null
            val portText = hostPort.substring(colon + 1)
            if (portText.isEmpty()) return hostPort.substring(0, colon) to null
            if (!portText.all { it in '0'..'9' } || portText.length > 5) return null
            return hostPort.substring(0, colon) to portText.toInt()
        }

        private fun Char.isAsciiLetter(): Boolean = this in 'a'..'z' || this in 'A'..'Z'

        private fun formValue(form: String, name: String): String? =
            form.split('&').firstNotNullOfOrNull { item ->
                val eq = item.indexOf('=')
                val key = percentDecode(if (eq < 0) item else item.substring(0, eq))
                if (key != name) null else if (eq < 0) NO_VALUE else percentDecode(item.substring(eq + 1))
            }?.takeIf { it !== NO_VALUE }

        private val NO_VALUE = String()

        /** Decodes `%xx` runs as UTF-8; an invalid run stays as written. */
        fun percentDecode(text: String): String {
            if ('%' !in text) return text
            val out = StringBuilder()
            var i = 0
            while (i < text.length) {
                val run = hexRunEnd(text, i)
                if (run == i) {
                    out.append(text[i])
                    i++
                    continue
                }
                out.append(decodeRun(text.substring(i, run)))
                i = run
            }
            return out.toString()
        }

        private fun hexRunEnd(text: String, start: Int): Int {
            var i = start
            while (i + 3 <= text.length && text[i] == '%' && isHex(text[i + 1]) && isHex(text[i + 2])) i += 3
            return i
        }

        private fun isHex(c: Char): Boolean = c in '0'..'9' || c in 'a'..'f' || c in 'A'..'F'

        private fun decodeRun(run: String): String {
            val bytes = ByteArray(run.length / 3) { run.substring(it * 3 + 1, it * 3 + 3).toInt(16).toByte() }
            return runCatching {
                Charsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes)).toString()
            }.getOrDefault(run)
        }
    }
}
