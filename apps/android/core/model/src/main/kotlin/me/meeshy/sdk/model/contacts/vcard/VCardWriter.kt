package me.meeshy.sdk.model.contacts.vcard

/**
 * Écrit une [VCard] en vCard 3.0 (RFC 2426), sans photo : CRLF, échappements `\n \, \; \\`, lignes
 * pliées à 75 octets sans couper un caractère UTF-8 (miroir de `VCardWriter.swift`). Une fiche
 * vide est refusée (`null`).
 */
object VCardWriter {

    fun write(card: VCard): String? {
        if (card.isEmpty) return null
        val lines = ArrayList<String>()
        lines += "BEGIN:VCARD"
        lines += "VERSION:3.0"
        val name = card.name ?: VCardName(given = card.displayName)
        lines += "N:" + listOf(name.family, name.given, name.additional, name.prefix, name.suffix).joinToString(";") { escape(it) }
        lines += "FN:" + escape(card.displayName)
        card.organization?.let { lines += "ORG:" + escape(it) }
        card.title?.let { lines += "TITLE:" + escape(it) }
        card.phones.mapTo(lines) { "TEL" + typeParam(it.types) + ":" + escape(it.value) }
        card.emails.mapTo(lines) { "EMAIL" + typeParam(listOf("internet") + it.types) + ":" + escape(it.value) }
        card.addresses.mapTo(lines) { a ->
            "ADR" + typeParam(a.types) + ":" +
                listOf(a.poBox, a.extended, a.street, a.locality, a.region, a.postalCode, a.country).joinToString(";") { escape(it) }
        }
        card.urls.mapTo(lines) { "URL" + typeParam(it.types) + ":" + escape(it.value) }
        card.birthday?.let { lines += "BDAY:$it" }
        card.note?.let { lines += "NOTE:" + escape(it) }
        lines += "END:VCARD"
        return lines.joinToString("\r\n") { fold(it) } + "\r\n"
    }

    private fun typeParam(types: List<String>): String {
        val unique = types.distinct()
        return if (unique.isEmpty()) "" else ";TYPE=" + unique.joinToString(",") { it.uppercase() }
    }

    internal fun escape(value: String): String = value
        .replace("\\", "\\\\")
        .replace("\r\n", "\n")
        .replace("\n", "\\n")
        .replace(",", "\\,")
        .replace(";", "\\;")

    /** Plie à 75 octets : chaque suite commence par un espace. */
    internal fun fold(line: String): String {
        val segments = ArrayList<String>()
        val current = StringBuilder()
        var currentBytes = 0
        var i = 0
        while (i < line.length) {
            val cp = line.codePointAt(i)
            val size = String(Character.toChars(cp)).toByteArray(Charsets.UTF_8).size
            val limit = if (segments.isEmpty()) 75 else 74
            if (currentBytes + size > limit) {
                segments += current.toString()
                current.clear()
                currentBytes = 0
            }
            current.appendCodePoint(cp)
            currentBytes += size
            i += Character.charCount(cp)
        }
        segments += current.toString()
        return segments.joinToString("\r\n ")
    }
}
