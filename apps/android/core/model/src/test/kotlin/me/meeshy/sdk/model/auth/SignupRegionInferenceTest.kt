package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [SignupRegionInference], the pure device-locale → signup
 * language/country inference backing the registration wizard defaults.
 *
 * Parity source: iOS `RegistrationViewModel.detectLanguages()` +
 * `detectCountry()` (`packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift`).
 *
 * Every assertion is on observable behaviour through the public API — the resolved
 * system/regional language pair and the detected country ISO — never on internal
 * shape. Expectations are written as literals, independent of how production
 * derives them (not tautological).
 */
class SignupRegionInferenceTest {

    private val supported: Set<String> = setOf(
        "fr", "en", "es", "de", "it", "pt", "ar", "zh", "ja", "ko",
        "ru", "tr", "nl", "pl", "sv", "hi", "th", "vi", "uk", "ro",
    )

    // --- inferLanguages: system language ---

    @Test
    fun inferLanguages_usesSupportedDeviceLanguageAsSystem() {
        val result = SignupRegionInference.inferLanguages("en", null, supported)
        assertThat(result.systemLanguage).isEqualTo("en")
    }

    @Test
    fun inferLanguages_lowercasesDeviceLanguageBeforeMatching() {
        val result = SignupRegionInference.inferLanguages("FR", null, supported)
        assertThat(result.systemLanguage).isEqualTo("fr")
    }

    @Test
    fun inferLanguages_fallsBackToFrenchForUnsupportedDeviceLanguage() {
        val result = SignupRegionInference.inferLanguages("xx", null, supported)
        assertThat(result.systemLanguage).isEqualTo("fr")
    }

    @Test
    fun inferLanguages_fallsBackToFrenchForNullDeviceLanguage() {
        val result = SignupRegionInference.inferLanguages(null, null, supported)
        assertThat(result.systemLanguage).isEqualTo("fr")
    }

    @Test
    fun inferLanguages_fallsBackToFrenchForBlankDeviceLanguage() {
        val result = SignupRegionInference.inferLanguages("", null, supported)
        assertThat(result.systemLanguage).isEqualTo("fr")
    }

    // --- inferLanguages: regional language from region map ---

    @Test
    fun inferLanguages_mapsRegionToRegionalLanguageDistinctFromSystem() {
        val result = SignupRegionInference.inferLanguages("fr", "US", supported)
        assertThat(result).isEqualTo(SignupLanguages("fr", "en"))
    }

    @Test
    fun inferLanguages_uppercasesRegionBeforeMappingIt() {
        val result = SignupRegionInference.inferLanguages("fr", "us", supported)
        assertThat(result.regionalLanguage).isEqualTo("en")
    }

    @Test
    fun inferLanguages_dropsRegionalLanguageEqualToSystem() {
        // French device in France: region FR → fr, equal to system fr, so the
        // regional slot must NOT duplicate it — it takes the en fallback.
        val result = SignupRegionInference.inferLanguages("fr", "FR", supported)
        assertThat(result).isEqualTo(SignupLanguages("fr", "en"))
    }

    @Test
    fun inferLanguages_dropsRegionalLanguageNotInSupportedSet() {
        val withoutArabic = supported - "ar"
        // Saudi Arabia maps to ar, but ar is unavailable → fall back to en.
        val result = SignupRegionInference.inferLanguages("fr", "SA", withoutArabic)
        assertThat(result.regionalLanguage).isEqualTo("en")
    }

    @Test
    fun inferLanguages_fallsBackToEnglishWhenRegionUnknown() {
        val result = SignupRegionInference.inferLanguages("fr", "ZZ", supported)
        assertThat(result.regionalLanguage).isEqualTo("en")
    }

    @Test
    fun inferLanguages_fallsBackToEnglishWhenRegionNull() {
        val result = SignupRegionInference.inferLanguages("fr", null, supported)
        assertThat(result.regionalLanguage).isEqualTo("en")
    }

    // --- inferLanguages: regional fallback avoids duplicating an English system ---

    @Test
    fun inferLanguages_regionalFallsBackToFrenchWhenSystemIsEnglish() {
        // system en with no usable region: the en fallback would duplicate, so fr.
        val result = SignupRegionInference.inferLanguages("en", "ZZ", supported)
        assertThat(result).isEqualTo(SignupLanguages("en", "fr"))
    }

    @Test
    fun inferLanguages_englishSystemWithMappedRegionKeepsRegional() {
        // English device in France: system en, region FR → fr (distinct) → keep.
        val result = SignupRegionInference.inferLanguages("en", "FR", supported)
        assertThat(result).isEqualTo(SignupLanguages("en", "fr"))
    }

    @Test
    fun inferLanguages_regionMappingEqualToEnglishSystemFallsBackToFrench() {
        // English device in GB: region GB → en == system en → drop, then the en
        // fallback also duplicates the system, so it lands on fr.
        val result = SignupRegionInference.inferLanguages("en", "GB", supported)
        assertThat(result).isEqualTo(SignupLanguages("en", "fr"))
    }

    @Test
    fun inferLanguages_regionMappingEqualToNonEnglishSystemFallsBackToEnglish() {
        // Spanish device in Mexico: region MX → es == system es → drop, fallback en.
        val result = SignupRegionInference.inferLanguages("es", "MX", supported)
        assertThat(result).isEqualTo(SignupLanguages("es", "en"))
    }

    @Test
    fun inferLanguages_keepsDistinctNonEnglishRegionalForNonEnglishSystem() {
        // German device in France: system de, region FR → fr, distinct → keep.
        val result = SignupRegionInference.inferLanguages("de", "FR", supported)
        assertThat(result).isEqualTo(SignupLanguages("de", "fr"))
    }

    // --- regionLanguageMap: the verbatim table ---

    @Test
    fun regionLanguageMap_hasExpectedSizeAndKeyBranches() {
        assertThat(SignupRegionInference.regionLanguageMap).hasSize(50)
        assertThat(SignupRegionInference.regionLanguageMap["CA"]).isEqualTo("fr")
        assertThat(SignupRegionInference.regionLanguageMap["SE"]).isEqualTo("sv")
        assertThat(SignupRegionInference.regionLanguageMap["IN"]).isEqualTo("hi")
        assertThat(SignupRegionInference.regionLanguageMap["VN"]).isEqualTo("vi")
        assertThat(SignupRegionInference.regionLanguageMap["UA"]).isEqualTo("uk")
        assertThat(SignupRegionInference.regionLanguageMap["BR"]).isEqualTo("pt")
    }

    // --- inferCountryIso ---

    @Test
    fun inferCountryIso_returnsKnownRegionUppercased() {
        assertThat(SignupRegionInference.inferCountryIso("FR", setOf("FR", "US"))).isEqualTo("FR")
    }

    @Test
    fun inferCountryIso_uppercasesLowercaseRegion() {
        assertThat(SignupRegionInference.inferCountryIso("us", setOf("FR", "US"))).isEqualTo("US")
    }

    @Test
    fun inferCountryIso_returnsNullForUnknownRegion() {
        assertThat(SignupRegionInference.inferCountryIso("ZZ", setOf("FR", "US"))).isNull()
    }

    @Test
    fun inferCountryIso_returnsNullForNullRegion() {
        assertThat(SignupRegionInference.inferCountryIso(null, setOf("FR", "US"))).isNull()
    }

    @Test
    fun inferCountryIso_resolvesAgainstTheCountryCatalogIsoSet() {
        // Real wiring: the app passes CountryCatalog.dialCodes.keys as the known set.
        assertThat(SignupRegionInference.inferCountryIso("cm", CountryCatalog.dialCodes.keys))
            .isEqualTo("CM")
    }
}
