package me.meeshy.sdk.model.contacts.vcard

import java.util.Locale

/**
 * Reconnaître une carte de visite et la nommer par son CONTACT (miroir de `ContactCardFile.swift`
 * et de `ContactCardExporter.fileName`, iOS ; `isContactCardAttachment`, `packages/shared`).
 */
object ContactCardFile {
    const val MIME_TYPE: String = "text/vcard"
    const val FILE_EXTENSION: String = "vcf"

    /** Nom de repli d'une carte sans nom (clé iOS `contact-card.shared`, « Contact partagé »). */
    const val SHARED_FALLBACK_NAME: String = "Contact partagé"

    private const val EXPORT_FALLBACK = "contact"
    private const val MAX_NAME_LENGTH = 60

    private val aliases = setOf("text/vcard", "text/x-vcard", "text/directory")
    private val extensions = setOf("vcf", "vcard")
    private val forbiddenChars = "/\\:?%*|\"<>\n\r\t".toSet()
    private val temporaryPrefix =
        Regex("^contact_[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}_")

    /** « Nom du contact.vcf » : caractères interdits retirés, 60 caractères au plus, repli « contact ». */
    fun fileName(forDisplayName: String): String {
        val cleaned = forDisplayName.map { if (it in forbiddenChars) ' ' else it }.joinToString("").trim()
        val base = if (cleaned.isEmpty()) EXPORT_FALLBACK else cleaned.take(MAX_NAME_LENGTH)
        return "$base.$FILE_EXTENSION"
    }

    /** Un alias vCard, ou un type générique (`octet-stream`, texte, vide) sur un nom `.vcf` / `.vcard`. */
    fun isContactCard(mimeType: String, fileName: String): Boolean {
        val bare = mimeType.substringBefore(';').trim().lowercase(Locale.ROOT)
        if (bare in aliases) return true
        if (!(bare.isEmpty() || bare == "application/octet-stream" || bare.startsWith("text/"))) return false
        return fileName.substringAfterLast('.', "").lowercase(Locale.ROOT) in extensions
    }

    /** Le nom tel que l'auteur l'a nommé : sans extension ni préfixe `contact_<UUID>_`. */
    fun displayName(fromFileName: String): String? {
        val trimmed = fromFileName.trim()
        val lowered = trimmed.lowercase(Locale.ROOT)
        val suffix = listOf(".vcf", ".vcard").firstOrNull { lowered.endsWith(it) }
        val base = suffix?.let { trimmed.dropLast(it.length) } ?: trimmed
        return temporaryPrefix.replaceFirst(base, "").trim().takeIf { it.isNotEmpty() }
    }

    /** Ce que dit une surface qui nomme un média d'une carte : « 👤 Zoé » ; `null` hors carte. */
    fun mediaLabel(mimeType: String, fileName: String, fallbackName: String = SHARED_FALLBACK_NAME): String? {
        if (!isContactCard(mimeType, fileName)) return null
        return "👤 ${displayName(fileName) ?: fallbackName}"
    }
}
