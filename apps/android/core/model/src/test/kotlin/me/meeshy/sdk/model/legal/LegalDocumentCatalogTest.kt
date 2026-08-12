package me.meeshy.sdk.model.legal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [LegalDocumentCatalog] is the pure Android port of the iOS `TermsOfServiceView` /
 * `PrivacyPolicyView` section models, unified into one data-driven catalog. These tests pin the
 * observable behaviour: each document's ordered section list, contiguous 1-based numbering (iOS's
 * `index + 1`), and the structural invariants that keep the catalog honest as it evolves — no
 * duplicate section inside a document, the two documents share no section, and every declared
 * [LegalSectionKey] belongs to exactly one document (no orphan, no double-listing).
 */
class LegalDocumentCatalogTest {

    @Test
    fun termsOfService_hasTheNineIosSectionsInOrder() {
        assertThat(LegalDocumentCatalog.sections(LegalDocumentKind.TERMS_OF_SERVICE))
            .containsExactly(
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
            .inOrder()
    }

    @Test
    fun privacyPolicy_hasTheSevenIosSectionsInOrder() {
        assertThat(LegalDocumentCatalog.sections(LegalDocumentKind.PRIVACY_POLICY))
            .containsExactly(
                LegalSectionKey.PRIVACY_COLLECTION,
                LegalSectionKey.PRIVACY_USE,
                LegalSectionKey.PRIVACY_SECURITY,
                LegalSectionKey.PRIVACY_RETENTION,
                LegalSectionKey.PRIVACY_RIGHTS,
                LegalSectionKey.PRIVACY_CHANGES,
                LegalSectionKey.PRIVACY_CONTACT,
            )
            .inOrder()
    }

    @Test
    fun numbered_assignsContiguousOneBasedNumbers() {
        LegalDocumentKind.entries.forEach { kind ->
            val numbered = LegalDocumentCatalog.numbered(kind)
            assertThat(numbered.map { it.number })
                .isEqualTo((1..LegalDocumentCatalog.sections(kind).size).toList())
        }
    }

    @Test
    fun numbered_preservesTheSectionOrderOfTheDocument() {
        LegalDocumentKind.entries.forEach { kind ->
            assertThat(LegalDocumentCatalog.numbered(kind).map { it.key })
                .isEqualTo(LegalDocumentCatalog.sections(kind))
        }
    }

    @Test
    fun eachDocument_hasNoDuplicateSection() {
        LegalDocumentKind.entries.forEach { kind ->
            val sections = LegalDocumentCatalog.sections(kind)
            assertThat(sections).containsNoDuplicates()
        }
    }

    @Test
    fun theTwoDocuments_shareNoSection() {
        val terms = LegalDocumentCatalog.sections(LegalDocumentKind.TERMS_OF_SERVICE).toSet()
        val privacy = LegalDocumentCatalog.sections(LegalDocumentKind.PRIVACY_POLICY).toSet()
        assertThat(terms.intersect(privacy)).isEmpty()
    }

    @Test
    fun everySectionKey_belongsToExactlyOneDocument() {
        val listed = LegalDocumentKind.entries.flatMap { LegalDocumentCatalog.sections(it) }
        assertThat(listed).containsExactlyElementsIn(LegalSectionKey.entries)
        assertThat(listed).containsNoDuplicates()
    }
}
