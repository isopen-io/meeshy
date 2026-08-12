package me.meeshy.sdk.model.auth

/**
 * A country entry for the phone-entry / registration country picker.
 *
 * Mirror of iOS `CountryCode` (`packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/CountryPicker.swift`).
 * [name] is locale-dependent presentation resolved through the caller-supplied
 * display-name resolver (see [CountryCatalog.build]); the identity-bearing fields
 * ([iso], [dialCode], [flag]) are locale-independent and deterministic.
 */
data class Country(
    val iso: String,
    val name: String,
    val dialCode: String,
    val flag: String,
)

/**
 * The country / dial-code catalogue backing the registration phone-entry step.
 *
 * Faithful port of the pure logic in iOS
 * `CountryPicker` (`packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/CountryPicker.swift`):
 *  - the E.164 [dialCodes] table (ISO 3166-1 alpha-2 → dial code) and the [priority]
 *    ordering (the countries surfaced at the top of the list);
 *  - [flag]: the emoji flag derived from a 2-letter ISO code via Unicode regional
 *    indicators, falling back to [GLOBE_FLAG] for anything that is not a valid pair
 *    of ASCII letters;
 *  - [isoForPhoneNumber]: deduce the country from an international number by the
 *    **longest** matching dial code, preferring the priority country on a tie
 *    (`+44` → `GB` not `GG`/`JE`/`IM`; `+1` → `US` not `CA`; `+7` → `RU` not `KZ`);
 *  - [build]: the full list sorted priority-first then by localized name;
 *  - [search]: the case-insensitive filter over name / dial code / ISO code.
 *
 * The name-independent primitives ([flag], [flagForCountryCode], [dialCode],
 * [isoForPhoneNumber], [flagForPhoneNumber]) work straight off the tables and are
 * fully deterministic — no `Locale` dependency — so the whole resolution is
 * JVM-testable. Name resolution is injected by the caller (Android supplies
 * `java.util.Locale("", iso).getDisplayCountry(...)`), keeping this a pure SSOT.
 *
 * Any change to the tables MUST touch the iOS mirror to preserve parity.
 */
object CountryCatalog {

    /** Emoji globe shown when no country flag can be derived. */
    const val GLOBE_FLAG: String = "🌐"

    /**
     * E.164 dial codes by ISO 3166-1 alpha-2 country code.
     * Verbatim mirror of `CountryPicker.dialCodes`.
     */
    val dialCodes: Map<String, String> = mapOf(
        "AD" to "+376", "AE" to "+971", "AF" to "+93", "AG" to "+1268", "AI" to "+1264",
        "AL" to "+355", "AM" to "+374", "AO" to "+244", "AR" to "+54", "AS" to "+1684",
        "AT" to "+43", "AU" to "+61", "AW" to "+297", "AX" to "+358", "AZ" to "+994",
        "BA" to "+387", "BB" to "+1246", "BD" to "+880", "BE" to "+32", "BF" to "+226",
        "BG" to "+359", "BH" to "+973", "BI" to "+257", "BJ" to "+229", "BL" to "+590",
        "BM" to "+1441", "BN" to "+673", "BO" to "+591", "BQ" to "+599", "BR" to "+55",
        "BS" to "+1242", "BT" to "+975", "BW" to "+267", "BY" to "+375", "BZ" to "+501",
        "CA" to "+1", "CC" to "+61", "CD" to "+243", "CF" to "+236", "CG" to "+242",
        "CH" to "+41", "CI" to "+225", "CK" to "+682", "CL" to "+56", "CM" to "+237",
        "CN" to "+86", "CO" to "+57", "CR" to "+506", "CU" to "+53", "CV" to "+238",
        "CW" to "+599", "CX" to "+61", "CY" to "+357", "CZ" to "+420", "DE" to "+49",
        "DJ" to "+253", "DK" to "+45", "DM" to "+1767", "DO" to "+1809", "DZ" to "+213",
        "EC" to "+593", "EE" to "+372", "EG" to "+20", "EH" to "+212", "ER" to "+291",
        "ES" to "+34", "ET" to "+251", "FI" to "+358", "FJ" to "+679", "FK" to "+500",
        "FM" to "+691", "FO" to "+298", "FR" to "+33", "GA" to "+241", "GB" to "+44",
        "GD" to "+1473", "GE" to "+995", "GF" to "+594", "GG" to "+44", "GH" to "+233",
        "GI" to "+350", "GL" to "+299", "GM" to "+220", "GN" to "+224", "GP" to "+590",
        "GQ" to "+240", "GR" to "+30", "GT" to "+502", "GU" to "+1671", "GW" to "+245",
        "GY" to "+592", "HK" to "+852", "HN" to "+504", "HR" to "+385", "HT" to "+509",
        "HU" to "+36", "ID" to "+62", "IE" to "+353", "IL" to "+972", "IM" to "+44",
        "IN" to "+91", "IO" to "+246", "IQ" to "+964", "IR" to "+98", "IS" to "+354",
        "IT" to "+39", "JE" to "+44", "JM" to "+1876", "JO" to "+962", "JP" to "+81",
        "KE" to "+254", "KG" to "+996", "KH" to "+855", "KI" to "+686", "KM" to "+269",
        "KN" to "+1869", "KP" to "+850", "KR" to "+82", "KW" to "+965", "KY" to "+1345",
        "KZ" to "+7", "LA" to "+856", "LB" to "+961", "LC" to "+1758", "LI" to "+423",
        "LK" to "+94", "LR" to "+231", "LS" to "+266", "LT" to "+370", "LU" to "+352",
        "LV" to "+371", "LY" to "+218", "MA" to "+212", "MC" to "+377", "MD" to "+373",
        "ME" to "+382", "MF" to "+590", "MG" to "+261", "MH" to "+692", "MK" to "+389",
        "ML" to "+223", "MM" to "+95", "MN" to "+976", "MO" to "+853", "MP" to "+1670",
        "MQ" to "+596", "MR" to "+222", "MS" to "+1664", "MT" to "+356", "MU" to "+230",
        "MV" to "+960", "MW" to "+265", "MX" to "+52", "MY" to "+60", "MZ" to "+258",
        "NA" to "+264", "NC" to "+687", "NE" to "+227", "NF" to "+672", "NG" to "+234",
        "NI" to "+505", "NL" to "+31", "NO" to "+47", "NP" to "+977", "NR" to "+674",
        "NU" to "+683", "NZ" to "+64", "OM" to "+968", "PA" to "+507", "PE" to "+51",
        "PF" to "+689", "PG" to "+675", "PH" to "+63", "PK" to "+92", "PL" to "+48",
        "PM" to "+508", "PR" to "+1787", "PS" to "+970", "PT" to "+351", "PW" to "+680",
        "PY" to "+595", "QA" to "+974", "RE" to "+262", "RO" to "+40", "RS" to "+381",
        "RU" to "+7", "RW" to "+250", "SA" to "+966", "SB" to "+677", "SC" to "+248",
        "SD" to "+249", "SE" to "+46", "SG" to "+65", "SH" to "+290", "SI" to "+386",
        "SJ" to "+47", "SK" to "+421", "SL" to "+232", "SM" to "+378", "SN" to "+221",
        "SO" to "+252", "SR" to "+597", "SS" to "+211", "ST" to "+239", "SV" to "+503",
        "SX" to "+1721", "SY" to "+963", "SZ" to "+268", "TC" to "+1649", "TD" to "+235",
        "TG" to "+228", "TH" to "+66", "TJ" to "+992", "TK" to "+690", "TL" to "+670",
        "TM" to "+993", "TN" to "+216", "TO" to "+676", "TR" to "+90", "TT" to "+1868",
        "TV" to "+688", "TW" to "+886", "TZ" to "+255", "UA" to "+380", "UG" to "+256",
        "US" to "+1", "UY" to "+598", "UZ" to "+998", "VA" to "+39", "VC" to "+1784",
        "VE" to "+58", "VG" to "+1284", "VI" to "+1340", "VN" to "+84", "VU" to "+678",
        "WF" to "+681", "WS" to "+685", "YE" to "+967", "YT" to "+262", "ZA" to "+27",
        "ZM" to "+260", "ZW" to "+263",
    )

    /**
     * Countries surfaced at the top of the picker (most common for Meeshy).
     * Verbatim mirror of `CountryPicker.priority`; `priority[0]` (`FR`) is the
     * historical default. Also the tie-break order for [isoForPhoneNumber].
     */
    val priority: List<String> = listOf(
        "FR", "US", "GB", "DE", "ES", "IT", "PT", "BE", "CH", "CA", "MA", "DZ", "TN",
        "SN", "CI", "CM", "BJ", "BF", "NE", "ML", "GN", "TG", "GA", "CG", "CD", "MG",
        "RU", "CN", "JP", "KR", "IN", "BR", "MX", "AR", "CO", "PE", "CL", "TR", "EG",
        "SA", "AE", "ZA", "NG", "KE", "AU", "NZ",
    )

    private val rank: Map<String, Int> =
        priority.withIndex().associate { (index, iso) -> iso to index }

    /**
     * The emoji flag for an ISO 3166-1 alpha-2 code, derived from Unicode regional
     * indicator symbols. Returns [GLOBE_FLAG] when [iso] is not exactly two ASCII
     * letters. Mirror of `CountryPicker.flag(for:)`.
     */
    fun flag(iso: String): String {
        val letters = iso.uppercase()
        if (letters.length != 2 || !letters.all { it in 'A'..'Z' }) return GLOBE_FLAG
        val base = 0x1F1E6 - 'A'.code
        val builder = StringBuilder()
        for (ch in letters) builder.appendCodePoint(base + ch.code)
        return builder.toString()
    }

    /**
     * The flag for a country code, or [GLOBE_FLAG] when the code is null or absent
     * from the catalogue. Mirror of `CountryPicker.flag(forCountryCode:)`.
     */
    fun flagForCountryCode(iso: String?): String {
        val code = iso?.uppercase() ?: return GLOBE_FLAG
        if (code !in dialCodes) return GLOBE_FLAG
        return flag(code)
    }

    /** The E.164 dial code for a country, or `null` when unknown. */
    fun dialCode(iso: String?): String? {
        val code = iso?.uppercase() ?: return null
        return dialCodes[code]
    }

    /**
     * Deduce the ISO country code from an international phone number (E.164, or a
     * `00`-prefixed international form) by the **longest** matching dial code,
     * preferring the priority country on a tie then the alphabetically-first ISO
     * code (deterministic — iOS falls back to a locale-dependent name sort here).
     * Returns `null` for a null/blank number, a number with no leading `+`
     * (after `00` normalisation), or one matching no dial code.
     * Mirror of the resolution in `CountryPicker.country(forPhoneNumber:)`.
     */
    fun isoForPhoneNumber(number: String?): String? {
        if (number.isNullOrEmpty()) return null
        val normalized = if (number.startsWith("00")) "+" + number.substring(2) else number
        if (!normalized.startsWith("+")) return null
        val matches = dialCodes.filter { normalized.startsWith(it.value) }
        if (matches.isEmpty()) return null
        val longest = matches.values.maxOf { it.length }
        return matches.filterValues { it.length == longest }.keys
            .minWith(compareBy({ rank[it] ?: Int.MAX_VALUE }, { it }))
    }

    /** The flag for an international phone number, or [GLOBE_FLAG]. */
    fun flagForPhoneNumber(number: String?): String =
        isoForPhoneNumber(number)?.let { flag(it) } ?: GLOBE_FLAG

    /**
     * The full catalogue as [Country] rows, sorted priority-countries first (in
     * [priority] order) then by localized [displayName] (case-insensitive). The
     * resolver maps an ISO code to its display name; a resolver that returns the
     * ISO code itself yields an ISO-ordered tail. Mirror of `CountryPicker.buildCountries()`.
     */
    fun build(displayName: (String) -> String): List<Country> =
        dialCodes.map { (iso, dial) -> Country(iso, displayName(iso), dial, flag(iso)) }
            .sortedWith(
                compareBy({ rank[it.iso] ?: Int.MAX_VALUE }, { it.name.lowercase() }),
            )

    /**
     * Deduce the [Country] from a phone number (see [isoForPhoneNumber]), with its
     * name resolved via [displayName]. Returns `null` when no country matches.
     */
    fun country(forPhoneNumber: String?, displayName: (String) -> String): Country? {
        val iso = isoForPhoneNumber(forPhoneNumber) ?: return null
        return Country(iso, displayName(iso), dialCodes.getValue(iso), flag(iso))
    }

    /**
     * Filter the catalogue by a query matched case-insensitively against a
     * country's name, dial code, or ISO code. An empty query returns [countries]
     * unchanged. Mirror of `CountryPicker.filteredCountries`.
     */
    fun search(query: String, countries: List<Country>): List<Country> {
        if (query.isEmpty()) return countries
        val lower = query.lowercase()
        return countries.filter {
            it.name.lowercase().contains(lower) ||
                it.dialCode.contains(lower) ||
                it.iso.lowercase().contains(lower)
        }
    }

    /**
     * The VoiceOver / TalkBack label for a country, e.g. `"France, +33"`. The flag
     * emoji is deliberately omitted (the screen reader already vocalises it).
     * Mirror of `CountryPicker.accessibilityLabel(for:)`.
     */
    fun accessibilityLabel(country: Country): String = "${country.name}, ${country.dialCode}"
}
