package me.meeshy.sdk.model.contacts.vcard

import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.Charset

/**
 * Lit un fichier vCard (2.1, 3.0, 4.0) et en rend la PREMIÈRE carte (miroir de `VCardParser.swift`).
 * Tolère lignes pliées, QUOTED-PRINTABLE avec coupures douces et CHARSET, types nus, groupes Apple
 * (`item1.TEL` + `item1.X-ABLabel`), URI `tel:`, échappements `\n \, \; \\`. Les propriétés binaires
 * sont ignorées. Une carte illisible ou vide rend `null`.
 */
object VCardParser {

    fun parse(data: ByteArray): VCard? {
        val text = runCatching {
            Charsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(data)).toString()
        }.getOrElse { String(data, Charsets.ISO_8859_1) }
        return parse(text)
    }

    fun parse(text: String): VCard? {
        val lines = logicalLines(text)
        val begin = lines.indexOfFirst { it.uppercase() == "BEGIN:VCARD" }
        if (begin < 0) return null
        val endRel = lines.drop(begin).indexOfFirst { it.uppercase() == "END:VCARD" }
        val end = if (endRel < 0) lines.size else begin + endRel
        val properties = lines.subList(begin + 1, end).mapNotNull { Property.parse(it) }
        val card = build(properties)
        return card.takeUnless { it.isEmpty }
    }

    internal fun logicalLines(text: String): List<String> {
        val raw = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        val result = ArrayList<String>()
        var pendingSoftBreak = false
        for (line in raw) {
            if (pendingSoftBreak && result.isNotEmpty()) {
                val merged = result.removeAt(result.lastIndex).dropLast(1) + line
                result.add(merged)
                pendingSoftBreak = isQuotedPrintable(merged) && merged.endsWith("=")
                continue
            }
            if (line.isNotEmpty() && (line[0] == ' ' || line[0] == '\t') && result.isNotEmpty()) {
                val merged = result.removeAt(result.lastIndex) + line.drop(1)
                result.add(merged)
                pendingSoftBreak = isQuotedPrintable(merged) && merged.endsWith("=")
                continue
            }
            if (line.isEmpty()) continue
            result.add(line)
            pendingSoftBreak = isQuotedPrintable(line) && line.endsWith("=")
        }
        return result
    }

    private fun isQuotedPrintable(line: String): Boolean {
        val colon = unquotedIndexOf(':', line)
        if (colon < 0) return false
        return line.substring(0, colon).uppercase().contains("QUOTED-PRINTABLE")
    }

    internal class Property private constructor(
        val group: String?,
        val name: String,
        val params: Map<String, List<String>>,
        val rawValue: String,
    ) {
        val types: List<String>
            get() {
                val types = (params["TYPE"].orEmpty()).map { it.lowercase() }.toMutableList()
                if (params.containsKey("PREF") && "pref" !in types) types.add("pref")
                return types
            }

        val isBinary: Boolean
            get() {
                val encoding = params["ENCODING"]?.firstOrNull()?.uppercase()
                return encoding == "B" || encoding == "BASE64" || params["VALUE"]?.firstOrNull()?.uppercase() == "BINARY"
            }

        private val decodedValue: String
            get() {
                val isQp = params["ENCODING"].orEmpty().any { it.uppercase() == "QUOTED-PRINTABLE" }
                if (!isQp) return rawValue
                return decodeQuotedPrintable(rawValue, params["CHARSET"]?.firstOrNull())
            }

        val text: String get() = unescape(decodedValue)

        val components: List<String> get() = splitUnescaped(decodedValue, ';').map(::unescape)

        companion object {
            fun parse(line: String): Property? {
                val colon = unquotedIndexOf(':', line)
                if (colon < 0) return null
                val head = line.substring(0, colon)
                val rawValue = line.substring(colon + 1)
                val segments = splitUnquoted(head, ';')
                val nameSegment = segments.firstOrNull()?.takeIf { it.isNotEmpty() } ?: return null
                val dot = nameSegment.indexOf('.')
                val group = if (dot >= 0) nameSegment.substring(0, dot).lowercase() else null
                val name = (if (dot >= 0) nameSegment.substring(dot + 1) else nameSegment).uppercase()
                return Property(group, name, parseParams(segments.drop(1)), rawValue)
            }
        }
    }

    internal fun parseParams(segments: List<String>): Map<String, List<String>> {
        val params = LinkedHashMap<String, MutableList<String>>()
        for (segment in segments) {
            val eq = segment.indexOf('=')
            if (eq > 0 && eq < segment.length - 1) {
                val key = segment.substring(0, eq).uppercase().trim()
                val values = splitUnquoted(segment.substring(eq + 1), ',').map { it.trim('"', ' ') }
                params.getOrPut(key) { ArrayList() }.addAll(values)
                continue
            }
            val bare = segment.trim()
            when (bare.uppercase()) {
                "QUOTED-PRINTABLE", "BASE64", "B", "8BIT", "7BIT" -> params.getOrPut("ENCODING") { ArrayList() }.add(bare)
                "" -> Unit
                else -> params.getOrPut("TYPE") { ArrayList() }.add(bare)
            }
        }
        return params
    }

    private fun build(properties: List<Property>): VCard {
        val labels = HashMap<String, String>()
        properties.forEach { property ->
            val group = property.group ?: return@forEach
            if (property.name == "X-ABLABEL") appleLabel(property.text)?.let { labels[group] = it }
        }
        fun label(property: Property): String? = property.group?.let { labels[it] }

        var card = VCard()
        for (property in properties) {
            if (property.isBinary) continue
            card = when (property.name) {
                "FN" -> card.copy(formattedName = nonEmpty(property.text))
                "N" -> {
                    val parts = property.components + List(5) { "" }
                    val name = VCardName(parts[0], parts[1], parts[2], parts[3], parts[4])
                    card.copy(name = name.takeIf { it.composed.isNotEmpty() })
                }
                "TEL" -> {
                    val value = nonEmpty(property.text.removePrefixIgnoreCase("tel:"))
                    if (value == null || card.phones.any { it.value == value }) card
                    else card.copy(phones = card.phones + VCardEntry(value, property.types, label(property)))
                }
                "EMAIL" -> {
                    val value = nonEmpty(property.text.removePrefixIgnoreCase("mailto:"))
                    if (value == null || card.emails.any { it.value.equals(value, ignoreCase = true) }) card
                    else card.copy(emails = card.emails + VCardEntry(value, property.types.filter { it != "internet" }, label(property)))
                }
                "ADR" -> {
                    val p = property.components + List(7) { "" }
                    val address = VCardAddress(p[0], p[1], p[2], p[3], p[4], p[5], p[6], property.types, label(property))
                    if (address.formatted.isEmpty()) card else card.copy(addresses = card.addresses + address)
                }
                "ORG" -> card.copy(organization = nonEmpty(property.components.filter { it.isNotEmpty() }.joinToString(", ")))
                "TITLE" -> card.copy(title = nonEmpty(property.text))
                "URL" -> nonEmpty(property.text)
                    ?.let { card.copy(urls = card.urls + VCardEntry(it, property.types, label(property))) }
                    ?: card
                "BDAY" -> card.copy(birthday = nonEmpty(property.text))
                "NOTE" -> card.copy(note = nonEmpty(property.text))
                else -> card
            }
        }
        return card
    }

    /** `_$!<Mobile>!$_` (libellé système d'Apple) donne `mobile` ; un libellé libre reste tel quel. */
    private fun appleLabel(raw: String): String? {
        if (!raw.startsWith("_\$!<") || !raw.endsWith(">!\$_")) return nonEmpty(raw)
        val system = raw.drop(4).dropLast(4)
        return VCardEntry.knownLabelForAppleSystemLabel(system) ?: nonEmpty(system)
    }

    private fun nonEmpty(value: String): String? = value.trim().takeIf { it.isNotEmpty() }

    private fun String.removePrefixIgnoreCase(prefix: String): String =
        if (startsWith(prefix, ignoreCase = true)) substring(prefix.length) else this

    internal fun decodeQuotedPrintable(value: String, charset: String?): String {
        val input = value.toByteArray(Charsets.UTF_8)
        val out = java.io.ByteArrayOutputStream()
        var i = 0
        while (i < input.size) {
            val b = input[i]
            if (b != '='.code.toByte()) {
                out.write(b.toInt()); i++; continue
            }
            if (i + 2 > input.lastIndex) break
            val hex = String(input, i + 1, 2, Charsets.US_ASCII).toIntOrNull(16)
            if (hex != null) out.write(hex) else out.write(input, i, 3)
            i += 3
        }
        val bytes = out.toByteArray()
        val cs = charset?.takeIf { it.isNotEmpty() }?.let { runCatching { Charset.forName(it) }.getOrNull() } ?: Charsets.UTF_8
        return runCatching {
            cs.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes)).toString()
        }.getOrElse { String(bytes, Charsets.ISO_8859_1) }
    }

    internal fun unescape(value: String): String {
        val sb = StringBuilder()
        var escaping = false
        for (c in value) {
            when {
                escaping -> { sb.append(if (c == 'n' || c == 'N') '\n' else c); escaping = false }
                c == '\\' -> escaping = true
                else -> sb.append(c)
            }
        }
        if (escaping) sb.append('\\')
        return sb.toString()
    }

    internal fun splitUnescaped(value: String, separator: Char): List<String> {
        val parts = ArrayList<String>()
        val current = StringBuilder()
        var escaping = false
        for (c in value) {
            when {
                escaping -> { current.append(c); escaping = false }
                c == '\\' -> { current.append(c); escaping = true }
                c == separator -> { parts.add(current.toString()); current.clear() }
                else -> current.append(c)
            }
        }
        parts.add(current.toString())
        return parts
    }

    internal fun splitUnquoted(value: String, separator: Char): List<String> {
        val parts = ArrayList<String>()
        val current = StringBuilder()
        var quoted = false
        for (c in value) {
            if (c == '"') quoted = !quoted
            if (c == separator && !quoted) { parts.add(current.toString()); current.clear() } else current.append(c)
        }
        parts.add(current.toString())
        return parts
    }

    internal fun unquotedIndexOf(target: Char, line: String): Int {
        var quoted = false
        for (i in line.indices) {
            val c = line[i]
            if (c == '"') quoted = !quoted
            if (c == target && !quoted) return i
        }
        return -1
    }
}
