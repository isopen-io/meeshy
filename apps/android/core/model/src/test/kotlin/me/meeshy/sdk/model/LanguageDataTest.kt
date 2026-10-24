package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.text.Normalizer

/**
 * Behavioural spec for [LanguageData] — the single source of truth for per-language
 * flag / native-name / colour metadata (feature-parity §D). Covers the robust lookup
 * ([info]: trim + case-insensitive + alias-aware), the derived interface view, the
 * common-first ordering, and the completeness/uniqueness invariants of the base table.
 */
class LanguageDataTest {

    // ---- base table integrity -------------------------------------------

    @Test
    fun everyLanguageCodeIsUniqueAndLowercase() {
        val codes = LanguageData.allLanguages.map { it.code }
        assertThat(codes).containsNoDuplicates()
        assertThat(codes.all { it == it.lowercase() && it.isNotBlank() }).isTrue()
    }

    @Test
    fun everyLanguageCarriesNonBlankMetadata() {
        assertThat(
            LanguageData.allLanguages.all {
                it.name.isNotBlank() && it.nativeName.isNotBlank() &&
                    it.flag.isNotBlank() && it.colorHex.isNotBlank()
            },
        ).isTrue()
    }

    @Test
    fun catalanIsPresentWithItsMetadata() {
        val catalan = LanguageData.info("ca")
        assertThat(catalan).isNotNull()
        assertThat(catalan!!.name).isEqualTo("Catalan")
        assertThat(catalan.colorHex).isEqualTo("EAB308")
        assertThat(catalan.flag).isNotEmpty()
    }

    // ---- catalogue parity with iOS LanguageData.allLanguages -----------------

    @Test
    fun `the catalogue holds the same 83 codes as iOS in the same canonical order`() {
        assertThat(LanguageData.allLanguages.map { it.code })
            .containsExactlyElementsIn(iosCatalogueCodes)
            .inOrder()
        assertThat(LanguageData.allLanguages).hasSize(83)
    }

    @Test
    fun `the five languages iOS added are present with their flag and family colour`() {
        val expected = listOf(
            listOf("om", "Oromo", "Afaan Oromoo", "🇪🇹", "DC2626"),
            listOf("ti", "Tigrinya", "ትግርኛ", "🇪🇷", "3B82F6"),
            listOf("ny", "Chichewa", "Chinyanja", "🇲🇼", "DC2626"),
            listOf("ksf", "Bafia", "Rikpa", "🇨🇲", "16A34A"),
            listOf("nnh", "Ngiemboon", "Ngiemboon", "🇨🇲", "16A34A"),
        )
        expected.forEach { (code, name, nativeName, flag, colorHex) ->
            val info = LanguageData.info(code)
            assertThat(info).isNotNull()
            assertThat(listOf(info!!.code, info.name, info.nativeName, info.flag, info.colorHex))
                .containsExactly(code, name, nativeName, flag, colorHex)
                .inOrder()
        }
    }

    @Test
    fun `native names keep their diacritics instead of an ASCII transliteration`() {
        val expected = mapOf(
            "fr" to "Français",
            "es" to "Español",
            "pt" to "Português",
            "ro" to "Română",
            "ca" to "Català",
            "cs" to "Čeština",
            "sk" to "Slovenčina",
            "sl" to "Slovenščina",
            "lt" to "Lietuvių",
            "lv" to "Latviešu",
            "tr" to "Türkçe",
            "az" to "Azərbaycan",
            "vi" to "Tiếng Việt",
            "yo" to "Yorùbá",
            "ee" to "Eʋegbe",
            "ln" to "Lingála",
            "bas" to "Ɓàsàa",
            "byv" to "Mədùmbà",
            "dua" to "Duálá",
        )
        expected.forEach { (code, nativeName) ->
            assertThat(LanguageData.info(code)?.nativeName).isEqualTo(nativeName)
        }
    }

    @Test
    fun `native names are written in their own script`() {
        val expected = mapOf(
            "ko" to "한국어",
            "ja" to "日本語",
            "zh" to "中文",
            "ar" to "العربية",
            "he" to "עברית",
            "fa" to "فارسی",
            "ru" to "Русский",
            "uk" to "Українська",
            "bg" to "Български",
            "sr" to "Српски",
            "el" to "Ελληνικά",
            "hi" to "हिन्दी",
            "bn" to "বাংলা",
            "ta" to "தமிழ்",
            "th" to "ไทย",
            "ka" to "ქართული",
            "hy" to "Հայերեն",
            "am" to "አማርኛ",
            "my" to "မြန်မာဘာသာ",
            "km" to "ភាសាខ្មែរ",
            "lo" to "ລາວ",
        )
        expected.forEach { (code, nativeName) ->
            assertThat(LanguageData.info(code)?.nativeName).isEqualTo(nativeName)
        }
    }

    @Test
    fun `every native name is NFC so the same word is always the same string`() {
        LanguageData.allLanguages.forEach {
            assertThat(Normalizer.normalize(it.nativeName, Normalizer.Form.NFC))
                .isEqualTo(it.nativeName)
        }
    }

    @Test
    fun `every colour is a six digit upper case hex and every flag is non blank`() {
        val hex = Regex("^[0-9A-F]{6}$")
        LanguageData.allLanguages.forEach {
            assertThat(it.colorHex).matches(hex.toPattern())
            assertThat(it.flag).isNotEmpty()
        }
    }

    @Test
    fun `the new languages are reachable by the common-first view and the supported set`() {
        listOf("om", "ti", "ny", "ksf", "nnh").forEach { code ->
            assertThat(LanguageData.supportedCodeSet).contains(code)
            assertThat(LanguageData.allLanguagesCommonFirst.map { it.code }).contains(code)
            assertThat(LanguageData.interfaceLanguageCodes).doesNotContain(code)
        }
    }

    // ---- info(): robust lookup ------------------------------------------

    @Test
    fun infoResolvesAnExactCode() {
        assertThat(LanguageData.info("fr")?.name).isEqualTo("French")
    }

    @Test
    fun infoIsCaseInsensitive() {
        assertThat(LanguageData.info("FR")?.code).isEqualTo("fr")
        assertThat(LanguageData.info("Es")?.code).isEqualTo("es")
    }

    @Test
    fun infoTrimsSurroundingWhitespace() {
        assertThat(LanguageData.info("  de  ")?.code).isEqualTo("de")
    }

    @Test
    fun infoResolvesLegacyBcp47AliasFilToFilipino() {
        assertThat(LanguageData.info("fil")?.code).isEqualTo("tl")
        // alias resolution is also case-insensitive
        assertThat(LanguageData.info("FIL")?.code).isEqualTo("tl")
    }

    @Test
    fun infoReturnsNullForAnUnknownCode() {
        assertThat(LanguageData.info("zz")).isNull()
    }

    @Test
    fun infoReturnsNullForBlankOrAbsentInput() {
        assertThat(LanguageData.info(null)).isNull()
        assertThat(LanguageData.info("")).isNull()
        assertThat(LanguageData.info("   ")).isNull()
    }

    // ---- interface (UI-chrome) view -------------------------------------

    @Test
    fun interfaceLanguagesAreTheShippedUiCodesInOrder() {
        assertThat(LanguageData.interfaceLanguages.map { it.code })
            .containsExactly("fr", "en", "es", "de", "it", "ar")
            .inOrder()
    }

    @Test
    fun interfaceLanguagesAreDerivedFromTheBaseTableWithoutDrift() {
        // Each interface entry is the exact same metadata object as in allLanguages —
        // no hand-copied flag/colour that could silently diverge.
        LanguageData.interfaceLanguages.forEach { entry ->
            assertThat(entry).isEqualTo(LanguageData.info(entry.code))
        }
    }

    // ---- common-first ordering ------------------------------------------

    @Test
    fun commonFirstIsAPermutationOfTheFullTableNothingDroppedOrDuplicated() {
        val commonFirstCodes = LanguageData.allLanguagesCommonFirst.map { it.code }
        assertThat(commonFirstCodes).containsNoDuplicates()
        assertThat(commonFirstCodes)
            .containsExactlyElementsIn(LanguageData.allLanguages.map { it.code })
    }

    @Test
    fun commonFirstSurfacesTheCommonCodesFirstInTheirDeclaredOrder() {
        val leading = LanguageData.allLanguagesCommonFirst
            .map { it.code }
            .take(LanguageData.commonLanguageCodes.size)
        assertThat(leading).isEqualTo(LanguageData.commonLanguageCodes)
    }

    @Test
    fun everyCommonCodeExistsInTheBaseTable() {
        LanguageData.commonLanguageCodes.forEach { code ->
            assertThat(LanguageData.info(code)).isNotNull()
        }
    }

    private val iosCatalogueCodes = listOf(
        "fr", "es", "it", "pt", "ro", "ca", "en", "de", "nl", "sv",
        "da", "no", "af", "ru", "uk", "pl", "cs", "sk", "bg", "hr",
        "sr", "sl", "lt", "lv", "fi", "hu", "et", "el", "tr", "az",
        "kk", "uz", "ar", "he", "am", "hi", "bn", "ur", "ne", "ta",
        "fa", "ka", "hy", "zh", "ja", "ko", "th", "vi", "id", "ms",
        "tl", "my", "km", "lo", "yo", "ig", "ha", "wo", "bm", "ff",
        "tw", "ee", "ak", "ln", "bas", "byv", "dua", "ewo", "fan", "sw",
        "zu", "xh", "sn", "rw", "rn", "lg", "so", "mg", "om", "ti",
        "ny", "ksf", "nnh",
    )
}
