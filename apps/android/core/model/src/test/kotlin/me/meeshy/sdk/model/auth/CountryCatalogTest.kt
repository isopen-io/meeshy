package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [CountryCatalog], the pure country / dial-code catalogue
 * backing the registration phone-entry step.
 *
 * Parity source: iOS `CountryPicker`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/CountryPicker.swift`).
 *
 * Every assertion is on observable behaviour through the public API — the resolved
 * flag / ISO / list order — never on internal shape. Flag expectations are written
 * as hardcoded emoji literals, independent of how the production code builds them.
 */
class CountryCatalogTest {

    // --- flag(iso) ---

    @Test
    fun flag_derivesRegionalIndicatorEmojiForValidIso() {
        assertThat(CountryCatalog.flag("FR")).isEqualTo("🇫🇷") // 🇫🇷
        assertThat(CountryCatalog.flag("US")).isEqualTo("🇺🇸") // 🇺🇸
    }

    @Test
    fun flag_uppercasesLowercaseIso() {
        assertThat(CountryCatalog.flag("fr")).isEqualTo("🇫🇷") // 🇫🇷
    }

    @Test
    fun flag_returnsGlobeForWrongLength() {
        assertThat(CountryCatalog.flag("F")).isEqualTo(CountryCatalog.GLOBE_FLAG)
        assertThat(CountryCatalog.flag("FRA")).isEqualTo(CountryCatalog.GLOBE_FLAG)
        assertThat(CountryCatalog.flag("")).isEqualTo(CountryCatalog.GLOBE_FLAG)
    }

    @Test
    fun flag_returnsGlobeForNonLetters() {
        assertThat(CountryCatalog.flag("F1")).isEqualTo(CountryCatalog.GLOBE_FLAG)
        assertThat(CountryCatalog.flag("12")).isEqualTo(CountryCatalog.GLOBE_FLAG)
        assertThat(CountryCatalog.flag("é8")).isEqualTo(CountryCatalog.GLOBE_FLAG)
    }

    // --- flagForCountryCode(iso) ---

    @Test
    fun flagForCountryCode_returnsFlagForKnownCode() {
        assertThat(CountryCatalog.flagForCountryCode("FR")).isEqualTo("🇫🇷") // 🇫🇷
        assertThat(CountryCatalog.flagForCountryCode("fr")).isEqualTo("🇫🇷") // 🇫🇷
    }

    @Test
    fun flagForCountryCode_returnsGlobeForNullOrUnknown() {
        assertThat(CountryCatalog.flagForCountryCode(null)).isEqualTo(CountryCatalog.GLOBE_FLAG)
        assertThat(CountryCatalog.flagForCountryCode("ZZ")).isEqualTo(CountryCatalog.GLOBE_FLAG)
    }

    // --- dialCode(iso) ---

    @Test
    fun dialCode_resolvesKnownCodeCaseInsensitively() {
        assertThat(CountryCatalog.dialCode("FR")).isEqualTo("+33")
        assertThat(CountryCatalog.dialCode("us")).isEqualTo("+1")
    }

    @Test
    fun dialCode_returnsNullForNullOrUnknown() {
        assertThat(CountryCatalog.dialCode(null)).isNull()
        assertThat(CountryCatalog.dialCode("ZZ")).isNull()
    }

    // --- isoForPhoneNumber(number) ---

    @Test
    fun isoForPhoneNumber_resolvesPlainE164() {
        assertThat(CountryCatalog.isoForPhoneNumber("+33612345678")).isEqualTo("FR")
    }

    @Test
    fun isoForPhoneNumber_normalisesDoubleZeroPrefix() {
        assertThat(CountryCatalog.isoForPhoneNumber("0033612345678")).isEqualTo("FR")
    }

    @Test
    fun isoForPhoneNumber_prefersPriorityCountryOnSharedDialCode() {
        // +1 is shared by US and CA; the priority order (US before CA) wins.
        assertThat(CountryCatalog.isoForPhoneNumber("+15145551234")).isEqualTo("US")
        // +7 is shared by RU and KZ; RU is prioritised.
        assertThat(CountryCatalog.isoForPhoneNumber("+79001234567")).isEqualTo("RU")
        // +44 is shared by GB / GG / JE / IM; GB is prioritised.
        assertThat(CountryCatalog.isoForPhoneNumber("+447700900123")).isEqualTo("GB")
    }

    @Test
    fun isoForPhoneNumber_prefersLongestMatchingDialCode() {
        // +1268 (Antigua) must beat the shorter +1 shared prefix.
        assertThat(CountryCatalog.isoForPhoneNumber("+12685551234")).isEqualTo("AG")
    }

    @Test
    fun isoForPhoneNumber_breaksNonPriorityTieDeterministicallyByIso() {
        // +590 is shared by BL / GP / MF, none prioritised → alphabetically-first ISO.
        assertThat(CountryCatalog.isoForPhoneNumber("+590690001122")).isEqualTo("BL")
    }

    @Test
    fun isoForPhoneNumber_returnsNullForNullEmptyOrNonInternational() {
        assertThat(CountryCatalog.isoForPhoneNumber(null)).isNull()
        assertThat(CountryCatalog.isoForPhoneNumber("")).isNull()
        assertThat(CountryCatalog.isoForPhoneNumber("0612345678")).isNull() // no + and not 00
        assertThat(CountryCatalog.isoForPhoneNumber("33612345678")).isNull() // no leading +
    }

    @Test
    fun isoForPhoneNumber_returnsNullWhenNoDialCodeMatches() {
        assertThat(CountryCatalog.isoForPhoneNumber("+9995551234")).isNull()
        assertThat(CountryCatalog.isoForPhoneNumber("+")).isNull()
    }

    // --- flagForPhoneNumber(number) ---

    @Test
    fun flagForPhoneNumber_returnsFlagForResolvedNumber() {
        assertThat(CountryCatalog.flagForPhoneNumber("+33612345678")).isEqualTo("🇫🇷") // 🇫🇷
    }

    @Test
    fun flagForPhoneNumber_returnsGlobeForUnresolvedNumber() {
        assertThat(CountryCatalog.flagForPhoneNumber("not-a-number")).isEqualTo(CountryCatalog.GLOBE_FLAG)
        assertThat(CountryCatalog.flagForPhoneNumber(null)).isEqualTo(CountryCatalog.GLOBE_FLAG)
    }

    // --- build(displayName) ---

    private val names: Map<String, String> = mapOf(
        "FR" to "France", "US" to "United States", "AD" to "Andorra", "AF" to "Afghanistan",
    )

    private fun name(iso: String): String = names[iso] ?: iso

    @Test
    fun build_containsEveryCatalogueEntry() {
        val list = CountryCatalog.build(::name)
        assertThat(list).hasSize(CountryCatalog.dialCodes.size)
        assertThat(list.map { it.iso }.toSet()).isEqualTo(CountryCatalog.dialCodes.keys)
    }

    @Test
    fun build_placesPriorityCountriesFirstInPriorityOrder() {
        val list = CountryCatalog.build(::name)
        assertThat(list.take(CountryCatalog.priority.size).map { it.iso })
            .isEqualTo(CountryCatalog.priority)
    }

    @Test
    fun build_sortsNonPriorityTailByNameCaseInsensitive() {
        // Give a high-ISO country a low name and a low-ISO country a high name:
        // the tail must order by name, not by ISO, ignoring case.
        val resolver: (String) -> String = { iso ->
            when (iso) {
                "ZW" -> "aaa-first"
                "AD" -> "ZZZ-last"
                else -> iso
            }
        }
        val tail = CountryCatalog.build(resolver).drop(CountryCatalog.priority.size)
        assertThat(tail.indexOfFirst { it.iso == "ZW" })
            .isLessThan(tail.indexOfFirst { it.iso == "AD" })
    }

    @Test
    fun build_attachesResolvedNameFlagAndDialCode() {
        val fr = CountryCatalog.build(::name).first { it.iso == "FR" }
        assertThat(fr.name).isEqualTo("France")
        assertThat(fr.dialCode).isEqualTo("+33")
        assertThat(fr.flag).isEqualTo("🇫🇷") // 🇫🇷
    }

    // --- country(forPhoneNumber, displayName) ---

    @Test
    fun country_forPhoneNumber_resolvesFullEntry() {
        val country = CountryCatalog.country("+33612345678", ::name)
        assertThat(country).isEqualTo(
            Country(iso = "FR", name = "France", dialCode = "+33", flag = "🇫🇷"),
        )
    }

    @Test
    fun country_forPhoneNumber_returnsNullWhenUnresolved() {
        assertThat(CountryCatalog.country("not-a-number", ::name)).isNull()
    }

    // --- search(query, countries) ---

    private val sample: List<Country> = listOf(
        Country("FR", "France", "+33", "🇫🇷"),
        Country("US", "United States", "+1", "🇺🇸"),
        Country("DE", "Germany", "+49", "🇩🇪"),
    )

    @Test
    fun search_emptyQueryReturnsAllUnchanged() {
        assertThat(CountryCatalog.search("", sample)).isEqualTo(sample)
    }

    @Test
    fun search_matchesByNameCaseInsensitively() {
        assertThat(CountryCatalog.search("fra", sample).map { it.iso }).containsExactly("FR")
        assertThat(CountryCatalog.search("GERMANY", sample).map { it.iso }).containsExactly("DE")
    }

    @Test
    fun search_matchesByDialCode() {
        assertThat(CountryCatalog.search("+49", sample).map { it.iso }).containsExactly("DE")
    }

    @Test
    fun search_matchesByIsoCaseInsensitively() {
        assertThat(CountryCatalog.search("fr", sample).map { it.iso }).containsExactly("FR")
    }

    @Test
    fun search_returnsEmptyWhenNothingMatches() {
        assertThat(CountryCatalog.search("zzzz", sample)).isEmpty()
    }

    // --- accessibilityLabel(country) ---

    @Test
    fun accessibilityLabel_formatsNameAndDialCode() {
        val label = CountryCatalog.accessibilityLabel(
            Country("FR", "France", "+33", "🇫🇷"),
        )
        assertThat(label).isEqualTo("France, +33")
    }
}
