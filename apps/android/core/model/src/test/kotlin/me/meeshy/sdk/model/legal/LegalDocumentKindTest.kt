package me.meeshy.sdk.model.legal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [LegalDocumentKind.fromArg] is the pure route-argument parser the nav glue uses to turn the
 * `settings/legal/{doc}` path segment back into a typed document kind. These tests pin the
 * case-folding, trimming, and the null-on-unknown/blank contract so an unrecognised deep link never
 * silently resolves to the wrong document.
 */
class LegalDocumentKindTest {

    @Test
    fun fromArg_termsToken_resolvesToTermsOfService() {
        assertThat(LegalDocumentKind.fromArg("terms")).isEqualTo(LegalDocumentKind.TERMS_OF_SERVICE)
    }

    @Test
    fun fromArg_privacyToken_resolvesToPrivacyPolicy() {
        assertThat(LegalDocumentKind.fromArg("privacy")).isEqualTo(LegalDocumentKind.PRIVACY_POLICY)
    }

    @Test
    fun fromArg_isCaseInsensitive() {
        assertThat(LegalDocumentKind.fromArg("TERMS")).isEqualTo(LegalDocumentKind.TERMS_OF_SERVICE)
        assertThat(LegalDocumentKind.fromArg("Privacy")).isEqualTo(LegalDocumentKind.PRIVACY_POLICY)
    }

    @Test
    fun fromArg_trimsSurroundingWhitespace() {
        assertThat(LegalDocumentKind.fromArg("  privacy  "))
            .isEqualTo(LegalDocumentKind.PRIVACY_POLICY)
    }

    @Test
    fun fromArg_unknownToken_isNull() {
        assertThat(LegalDocumentKind.fromArg("licenses")).isNull()
    }

    @Test
    fun fromArg_blankOrNull_isNull() {
        assertThat(LegalDocumentKind.fromArg("   ")).isNull()
        assertThat(LegalDocumentKind.fromArg(null)).isNull()
    }

    @Test
    fun arg_roundTripsThroughFromArg() {
        LegalDocumentKind.entries.forEach { kind ->
            assertThat(LegalDocumentKind.fromArg(kind.arg)).isEqualTo(kind)
        }
    }
}
