package me.meeshy.sdk.model.auth

/**
 * The system + regional language pair inferred for the registration wizard.
 *
 * [systemLanguage] is the primary content language (Prisme priority 1) and
 * [regionalLanguage] the secondary one (priority 2). Both are guaranteed
 * distinct — the wizard never pre-selects the same language twice.
 */
data class SignupLanguages(
    val systemLanguage: String,
    val regionalLanguage: String,
)

/**
 * Pure device-locale → signup defaults inference.
 *
 * Faithful port of iOS `RegistrationViewModel.detectLanguages()` +
 * `detectCountry()`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift`):
 *  - [inferLanguages]: pick the system language from the device language when it
 *    is a supported code (else [DEFAULT_LANGUAGE]); pick the regional language
 *    from the [regionLanguageMap] entry for the device region, but only when it
 *    is supported AND distinct from the system language, otherwise fall back to
 *    [SECONDARY_LANGUAGE] — unless that would duplicate an English system, in
 *    which case it falls back to [DEFAULT_LANGUAGE];
 *  - [inferCountryIso]: return the device region ISO when it is a known country.
 *
 * The framework-owned inputs — the device language, the device region and the
 * supported-code set — are **injected** by the caller (Android supplies
 * `Locale.getDefault().language` / `.country` and `LanguageData` codes /
 * `CountryCatalog.dialCodes.keys`), keeping this a pure, `Locale`-free SSOT that
 * is fully JVM-testable. Any change to [regionLanguageMap] MUST touch the iOS
 * mirror to preserve parity.
 */
object SignupRegionInference {

    /** Primary fallback language (Prisme final fallback). */
    const val DEFAULT_LANGUAGE: String = "fr"

    /** Secondary fallback language, used for the regional slot. */
    const val SECONDARY_LANGUAGE: String = "en"

    /**
     * Region (ISO 3166-1 alpha-2) → default regional language code.
     * Verbatim mirror of `RegistrationViewModel.regionLanguageMap`.
     */
    val regionLanguageMap: Map<String, String> = mapOf(
        "CM" to "fr", "FR" to "fr", "BE" to "fr", "CH" to "fr", "CA" to "fr",
        "SN" to "fr", "CI" to "fr", "CD" to "fr", "MG" to "fr",
        "US" to "en", "GB" to "en", "AU" to "en", "NZ" to "en", "IE" to "en",
        "ZA" to "en", "NG" to "en", "GH" to "en", "KE" to "en",
        "ES" to "es", "MX" to "es", "AR" to "es", "CO" to "es", "CL" to "es",
        "PE" to "es",
        "DE" to "de", "AT" to "de",
        "IT" to "it",
        "PT" to "pt", "BR" to "pt",
        "SA" to "ar", "AE" to "ar", "EG" to "ar", "MA" to "ar", "DZ" to "ar",
        "TN" to "ar",
        "CN" to "zh", "TW" to "zh", "HK" to "zh",
        "JP" to "ja",
        "KR" to "ko",
        "RU" to "ru",
        "TR" to "tr",
        "NL" to "nl",
        "PL" to "pl",
        "SE" to "sv",
        "IN" to "hi",
        "TH" to "th",
        "VN" to "vi",
        "UA" to "uk",
        "RO" to "ro",
    )

    /**
     * Infer the [SignupLanguages] pair from the device locale.
     *
     * @param deviceLanguage raw device language code (case-insensitive, may be null).
     * @param deviceRegion raw device region code (case-insensitive, may be null).
     * @param supportedLanguageCodes the lowercase set of shippable language codes.
     */
    fun inferLanguages(
        deviceLanguage: String?,
        deviceRegion: String?,
        supportedLanguageCodes: Set<String>,
    ): SignupLanguages {
        val system = deviceLanguage
            ?.lowercase()
            ?.takeIf { it in supportedLanguageCodes }
            ?: DEFAULT_LANGUAGE

        val regionLanguage = deviceRegion
            ?.uppercase()
            ?.let { regionLanguageMap[it] }
            ?.takeIf { it in supportedLanguageCodes && it != system }

        val regional = regionLanguage
            ?: if (system != SECONDARY_LANGUAGE) SECONDARY_LANGUAGE else DEFAULT_LANGUAGE

        return SignupLanguages(systemLanguage = system, regionalLanguage = regional)
    }

    /**
     * Infer the pre-selected country ISO from the device region, gated on
     * membership in the known-country set (e.g. `CountryCatalog.dialCodes.keys`).
     */
    fun inferCountryIso(
        deviceRegion: String?,
        knownCountryCodes: Set<String>,
    ): String? =
        deviceRegion
            ?.uppercase()
            ?.takeIf { it in knownCountryCodes }
}
