package me.meeshy.sdk.model.legal

/**
 * Pure Android port of the iOS `TermsOfServiceView` / `PrivacyPolicyView` section models, unified
 * into one data-driven catalog. Each [LegalDocumentKind] maps to an ordered list of section keys;
 * the app resolves each key to a localized heading + body (values-* → automatic EN/FR/ES/PT,
 * surpassing iOS's manual fr/en picker). [numbered] applies the 1-based, contiguous numbering iOS
 * inlines as `index + 1`. The two documents share no section, and together they list every
 * [LegalSectionKey] exactly once — invariants pinned by the tests so the catalog stays honest.
 */
public object LegalDocumentCatalog {
    private val TERMS: List<LegalSectionKey> = listOf(
        LegalSectionKey.TOS_ACCEPTANCE,
        LegalSectionKey.TOS_LICENSE,
        LegalSectionKey.TOS_USER_CONDUCT,
        LegalSectionKey.TOS_CONTENT,
        LegalSectionKey.TOS_ACCOUNT_TERMINATION,
        LegalSectionKey.TOS_DISCLAIMER,
        LegalSectionKey.TOS_LIABILITY,
        LegalSectionKey.TOS_CHANGES,
        LegalSectionKey.TOS_CONTACT,
    )

    private val PRIVACY: List<LegalSectionKey> = listOf(
        LegalSectionKey.PRIVACY_COLLECTION,
        LegalSectionKey.PRIVACY_USE,
        LegalSectionKey.PRIVACY_SECURITY,
        LegalSectionKey.PRIVACY_RETENTION,
        LegalSectionKey.PRIVACY_RIGHTS,
        LegalSectionKey.PRIVACY_CHANGES,
        LegalSectionKey.PRIVACY_CONTACT,
    )

    public fun sections(kind: LegalDocumentKind): List<LegalSectionKey> = when (kind) {
        LegalDocumentKind.TERMS_OF_SERVICE -> TERMS
        LegalDocumentKind.PRIVACY_POLICY -> PRIVACY
    }

    public fun numbered(kind: LegalDocumentKind): List<LegalNumberedSection> =
        sections(kind).mapIndexed { index, key -> LegalNumberedSection(index + 1, key) }
}
