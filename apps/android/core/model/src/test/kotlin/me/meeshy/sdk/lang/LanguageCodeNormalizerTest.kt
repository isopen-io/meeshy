package me.meeshy.sdk.lang

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [LanguageCodeNormalizer] — the Meeshy-code normaliser that
 * mirrors packages/shared/utils/language-normalize.ts (TS SSOT) and
 * MeeshyUser.normalizeLanguageCode (iOS). Exercises every branch: supported
 * verbatim (2- and 3-letter), BCP-47 region/script stripping, the EXPLICIT
 * ISO 639-2/639-3 reduction table (never blind truncation), reduction targets
 * re-validated against the catalogue, and the invalid-input rejections.
 */
class LanguageCodeNormalizerTest {

    @Test
    fun normalize_supportedTwoLetterCode_returnedVerbatim() {
        assertThat(LanguageCodeNormalizer.normalize("fr")).isEqualTo("fr")
        assertThat(LanguageCodeNormalizer.normalize("es")).isEqualTo("es")
    }

    @Test
    fun normalize_lowercasesCasing() {
        assertThat(LanguageCodeNormalizer.normalize("FR")).isEqualTo("fr")
        assertThat(LanguageCodeNormalizer.normalize("En")).isEqualTo("en")
    }

    @Test
    fun normalize_stripsBcp47RegionAndScript() {
        assertThat(LanguageCodeNormalizer.normalize("fr-FR")).isEqualTo("fr")
        assertThat(LanguageCodeNormalizer.normalize("fr_FR")).isEqualTo("fr")
        assertThat(LanguageCodeNormalizer.normalize("en-US")).isEqualTo("en")
        assertThat(LanguageCodeNormalizer.normalize("pt-BR")).isEqualTo("pt")
        assertThat(LanguageCodeNormalizer.normalize("zh-Hant-HK")).isEqualTo("zh")
    }

    @Test
    fun normalize_trimsSurroundingWhitespace() {
        assertThat(LanguageCodeNormalizer.normalize("  fr-FR  ")).isEqualTo("fr")
    }

    @Test
    fun normalize_supportedThreeLetterCode_preservedNeverTruncated() {
        // ISO 639-3 codes with no 639-1 equivalent must survive intact:
        // "bas" -> "ba" (Bashkir) would silently mistranslate.
        assertThat(LanguageCodeNormalizer.normalize("bas")).isEqualTo("bas")
        assertThat(LanguageCodeNormalizer.normalize("ewo")).isEqualTo("ewo")
        assertThat(LanguageCodeNormalizer.normalize("dua")).isEqualTo("dua")
        assertThat(LanguageCodeNormalizer.normalize("bas-CM")).isEqualTo("bas")
    }

    @Test
    fun normalize_reducesIso6392TCodesViaExplicitTable() {
        assertThat(LanguageCodeNormalizer.normalize("eng")).isEqualTo("en")
        assertThat(LanguageCodeNormalizer.normalize("fra")).isEqualTo("fr")
        assertThat(LanguageCodeNormalizer.normalize("spa")).isEqualTo("es")
        assertThat(LanguageCodeNormalizer.normalize("deu")).isEqualTo("de")
        assertThat(LanguageCodeNormalizer.normalize("zho")).isEqualTo("zh")
    }

    @Test
    fun normalize_reducesIso6392BibliographicVariants() {
        // 639-2/B differs from 639-2/T for some languages — both must map.
        assertThat(LanguageCodeNormalizer.normalize("ger")).isEqualTo("de")
        assertThat(LanguageCodeNormalizer.normalize("fre")).isEqualTo("fr")
        assertThat(LanguageCodeNormalizer.normalize("chi")).isEqualTo("zh")
    }

    @Test
    fun normalize_reducesByTableNotByPrefixCollision() {
        // The whole point of the explicit table: "swe" (Swedish) must become "sv",
        // NEVER "sw" (Swahili, a supported code whose 2-letter prefix collides).
        assertThat(LanguageCodeNormalizer.normalize("swe")).isEqualTo("sv")
        assertThat(LanguageCodeNormalizer.normalize("swe")).isNotEqualTo("sw")
    }

    @Test
    fun normalize_rejectsThreeLetterCodeAbsentFromReductionTable() {
        // "fil" (Filipino) has no 639-1 equivalent and is NOT in the table — it
        // must be rejected, never truncated to "fi" (Finnish).
        assertThat(LanguageCodeNormalizer.normalize("fil")).isNull()
        assertThat(LanguageCodeNormalizer.normalize("tgl")).isNull()
        assertThat(LanguageCodeNormalizer.normalize("xyz")).isNull()
    }

    @Test
    fun normalize_rejectsReductionWhoseTargetIsNotSupported() {
        // "orm"/"nya" ARE in the reduction table (-> "om"/"ny") but those targets
        // are absent from the Android catalogue, so the re-validation drops them.
        assertThat(LanguageCodeNormalizer.normalize("orm")).isNull()
        assertThat(LanguageCodeNormalizer.normalize("nya")).isNull()
    }

    @Test
    fun normalize_preservesUnknownTwoLetterCode() {
        // Historical behaviour: an unknown 2-letter code is kept as-is (it simply
        // won't match any translation, and the caller applies its own fallback).
        assertThat(LanguageCodeNormalizer.normalize("xx")).isEqualTo("xx")
    }

    @Test
    fun normalize_rejectsNullBlankAndTooShort() {
        assertThat(LanguageCodeNormalizer.normalize(null)).isNull()
        assertThat(LanguageCodeNormalizer.normalize("")).isNull()
        assertThat(LanguageCodeNormalizer.normalize("   ")).isNull()
        assertThat(LanguageCodeNormalizer.normalize("f")).isNull()
    }

    @Test
    fun normalize_rejectsNonAlphabeticPrimary() {
        assertThat(LanguageCodeNormalizer.normalize("fr2")).isNull()
        assertThat(LanguageCodeNormalizer.normalize("f2")).isNull()
        assertThat(LanguageCodeNormalizer.normalize("123")).isNull()
        assertThat(LanguageCodeNormalizer.normalize("@@@")).isNull()
    }

    @Test
    fun normalize_rejectsSeparatorOnlyOrLeadingSeparator() {
        assertThat(LanguageCodeNormalizer.normalize("--")).isNull()
        assertThat(LanguageCodeNormalizer.normalize("-fr")).isNull()
        assertThat(LanguageCodeNormalizer.normalize("_")).isNull()
    }
}
