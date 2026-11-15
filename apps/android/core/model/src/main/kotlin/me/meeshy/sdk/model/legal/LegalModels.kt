package me.meeshy.sdk.model.legal

/**
 * Which legal document is being displayed. The [arg] is the stable `settings/legal/{doc}` route
 * token; the localized title + "last updated" label are resolved app-side (Android string
 * resources), keeping this core UI-free and fully unit-testable.
 */
public enum class LegalDocumentKind(public val arg: String) {
    TERMS_OF_SERVICE("terms"),
    PRIVACY_POLICY("privacy");

    public companion object {
        /**
         * Pure parser for the nav route argument: case-folded and trimmed, returning `null` for a
         * blank / absent / unrecognised token so an unknown deep link never silently resolves to the
         * wrong document.
         */
        public fun fromArg(raw: String?): LegalDocumentKind? {
            val token = raw?.trim()?.lowercase() ?: return null
            if (token.isEmpty()) return null
            return entries.firstOrNull { it.arg == token }
        }
    }
}

/**
 * A single legal-document section. [key] classifies the section; the localized heading + body
 * strings are resolved app-side (values-* → automatic EN/FR/ES/PT), so the core stays free of
 * Android string resources.
 */
public enum class LegalSectionKey {
    // Terms of Service (iOS TermsOfServiceView, in order)
    TOS_ACCEPTANCE,
    TOS_LICENSE,
    TOS_USER_CONDUCT,
    TOS_CONTENT,
    TOS_ACCOUNT_TERMINATION,
    TOS_DISCLAIMER,
    TOS_LIABILITY,
    TOS_CHANGES,
    TOS_CONTACT,

    // Privacy Policy (iOS PrivacyPolicyView, in order)
    PRIVACY_COLLECTION,
    PRIVACY_USE,
    PRIVACY_SECURITY,
    PRIVACY_RETENTION,
    PRIVACY_RIGHTS,
    PRIVACY_CHANGES,
    PRIVACY_CONTACT,
}

/** A section paired with its 1-based position in the document (mirrors iOS's `number: index + 1`). */
public data class LegalNumberedSection(
    val number: Int,
    val key: LegalSectionKey,
)

/**
 * A language the legal documents are written in. Mirrors the iOS segmented picker (`fr` / `en`)
 * and keeps the two extra languages Android already ships (`es`, `pt`). The declaration order is
 * the segment order. Documents are never machine-translated: a language that is not listed here
 * is not offered, and the Prisme descent skips it ([LegalDocumentCatalog.initialLanguage]).
 */
public enum class LegalDocumentLanguage(public val code: String) {
    FRENCH("fr"),
    ENGLISH("en"),
    SPANISH("es"),
    PORTUGUESE("pt");

    public companion object {
        /** Maps `fr`, `fr-CA`, `FR_ca` ... to a delivered language, `null` when not delivered. */
        public fun fromCode(raw: String?): LegalDocumentLanguage? {
            val primary = raw?.trim()?.take(2)?.lowercase() ?: return null
            return entries.firstOrNull { it.code == primary }
        }
    }
}

/** A calendar date without time zone, used for the "last updated" mention of the documents. */
public data class LegalDate(val year: Int, val month: Int, val day: Int)

/** One legal document in one language: its numbered sections and its "last updated" date. */
public data class LegalDocument(
    val kind: LegalDocumentKind,
    val language: LegalDocumentLanguage,
    val sections: List<LegalNumberedSection>,
    val lastUpdated: LegalDate,
)
