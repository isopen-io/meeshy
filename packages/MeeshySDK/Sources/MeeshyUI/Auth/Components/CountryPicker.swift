import SwiftUI

public struct CountryCode: Identifiable {
    public let id: String // ISO code
    public let name: String
    public let dialCode: String
    public let flag: String

    public init(id: String, name: String, dialCode: String, flag: String) {
        self.id = id; self.name = name; self.dialCode = dialCode; self.flag = flag
    }
}

public struct CountryPicker: View {
    @Binding var selectedCountry: CountryCode
    @Binding var phoneNumber: String
    @State private var showPicker = false
    @State private var searchText = ""

    public init(selectedCountry: Binding<CountryCode>, phoneNumber: Binding<String>) {
        self._selectedCountry = selectedCountry
        self._phoneNumber = phoneNumber
    }

    /// Liste complète de tous les indicatifs pays (ISO 3166-1 alpha-2 -> indicatif).
    /// Le drapeau et le nom localisé sont dérivés automatiquement (cf. `buildCountries`).
    public static let countries: [CountryCode] = buildCountries()

    /// Pays mis en tête de liste (les plus courants pour Meeshy).
    /// `countries[0]` reste la France (défaut historique).
    private static let priority: [String] = [
        "FR", "US", "GB", "DE", "ES", "IT", "PT", "BE", "CH", "CA", "MA", "DZ", "TN",
        "SN", "CI", "CM", "BJ", "BF", "NE", "ML", "GN", "TG", "GA", "CG", "CD", "MG",
        "RU", "CN", "JP", "KR", "IN", "BR", "MX", "AR", "CO", "PE", "CL", "TR", "EG",
        "SA", "AE", "ZA", "NG", "KE", "AU", "NZ",
    ]

    /// Indicatifs téléphoniques (E.164) par code ISO pays.
    private static let dialCodes: [String: String] = [
        "AD": "+376", "AE": "+971", "AF": "+93", "AG": "+1268", "AI": "+1264",
        "AL": "+355", "AM": "+374", "AO": "+244", "AR": "+54", "AS": "+1684",
        "AT": "+43", "AU": "+61", "AW": "+297", "AX": "+358", "AZ": "+994",
        "BA": "+387", "BB": "+1246", "BD": "+880", "BE": "+32", "BF": "+226",
        "BG": "+359", "BH": "+973", "BI": "+257", "BJ": "+229", "BL": "+590",
        "BM": "+1441", "BN": "+673", "BO": "+591", "BQ": "+599", "BR": "+55",
        "BS": "+1242", "BT": "+975", "BW": "+267", "BY": "+375", "BZ": "+501",
        "CA": "+1", "CC": "+61", "CD": "+243", "CF": "+236", "CG": "+242",
        "CH": "+41", "CI": "+225", "CK": "+682", "CL": "+56", "CM": "+237",
        "CN": "+86", "CO": "+57", "CR": "+506", "CU": "+53", "CV": "+238",
        "CW": "+599", "CX": "+61", "CY": "+357", "CZ": "+420", "DE": "+49",
        "DJ": "+253", "DK": "+45", "DM": "+1767", "DO": "+1809", "DZ": "+213",
        "EC": "+593", "EE": "+372", "EG": "+20", "EH": "+212", "ER": "+291",
        "ES": "+34", "ET": "+251", "FI": "+358", "FJ": "+679", "FK": "+500",
        "FM": "+691", "FO": "+298", "FR": "+33", "GA": "+241", "GB": "+44",
        "GD": "+1473", "GE": "+995", "GF": "+594", "GG": "+44", "GH": "+233",
        "GI": "+350", "GL": "+299", "GM": "+220", "GN": "+224", "GP": "+590",
        "GQ": "+240", "GR": "+30", "GT": "+502", "GU": "+1671", "GW": "+245",
        "GY": "+592", "HK": "+852", "HN": "+504", "HR": "+385", "HT": "+509",
        "HU": "+36", "ID": "+62", "IE": "+353", "IL": "+972", "IM": "+44",
        "IN": "+91", "IO": "+246", "IQ": "+964", "IR": "+98", "IS": "+354",
        "IT": "+39", "JE": "+44", "JM": "+1876", "JO": "+962", "JP": "+81",
        "KE": "+254", "KG": "+996", "KH": "+855", "KI": "+686", "KM": "+269",
        "KN": "+1869", "KP": "+850", "KR": "+82", "KW": "+965", "KY": "+1345",
        "KZ": "+7", "LA": "+856", "LB": "+961", "LC": "+1758", "LI": "+423",
        "LK": "+94", "LR": "+231", "LS": "+266", "LT": "+370", "LU": "+352",
        "LV": "+371", "LY": "+218", "MA": "+212", "MC": "+377", "MD": "+373",
        "ME": "+382", "MF": "+590", "MG": "+261", "MH": "+692", "MK": "+389",
        "ML": "+223", "MM": "+95", "MN": "+976", "MO": "+853", "MP": "+1670",
        "MQ": "+596", "MR": "+222", "MS": "+1664", "MT": "+356", "MU": "+230",
        "MV": "+960", "MW": "+265", "MX": "+52", "MY": "+60", "MZ": "+258",
        "NA": "+264", "NC": "+687", "NE": "+227", "NF": "+672", "NG": "+234",
        "NI": "+505", "NL": "+31", "NO": "+47", "NP": "+977", "NR": "+674",
        "NU": "+683", "NZ": "+64", "OM": "+968", "PA": "+507", "PE": "+51",
        "PF": "+689", "PG": "+675", "PH": "+63", "PK": "+92", "PL": "+48",
        "PM": "+508", "PR": "+1787", "PS": "+970", "PT": "+351", "PW": "+680",
        "PY": "+595", "QA": "+974", "RE": "+262", "RO": "+40", "RS": "+381",
        "RU": "+7", "RW": "+250", "SA": "+966", "SB": "+677", "SC": "+248",
        "SD": "+249", "SE": "+46", "SG": "+65", "SH": "+290", "SI": "+386",
        "SJ": "+47", "SK": "+421", "SL": "+232", "SM": "+378", "SN": "+221",
        "SO": "+252", "SR": "+597", "SS": "+211", "ST": "+239", "SV": "+503",
        "SX": "+1721", "SY": "+963", "SZ": "+268", "TC": "+1649", "TD": "+235",
        "TG": "+228", "TH": "+66", "TJ": "+992", "TK": "+690", "TL": "+670",
        "TM": "+993", "TN": "+216", "TO": "+676", "TR": "+90", "TT": "+1868",
        "TV": "+688", "TW": "+886", "TZ": "+255", "UA": "+380", "UG": "+256",
        "US": "+1", "UY": "+598", "UZ": "+998", "VA": "+39", "VC": "+1784",
        "VE": "+58", "VG": "+1284", "VI": "+1340", "VN": "+84", "VU": "+678",
        "WF": "+681", "WS": "+685", "YE": "+967", "YT": "+262", "ZA": "+27",
        "ZM": "+260", "ZW": "+263",
    ]

    /// Emoji globe affiché en repli quand aucun drapeau pays n'est disponible.
    public static let globeFlag = "🌐"

    /// Drapeau emoji dérivé du code ISO (indicateurs régionaux Unicode),
    /// ou le globe 🌐 si le code n'est pas un couple de lettres valide.
    private static func flag(for iso: String) -> String {
        let letters = iso.uppercased()
        guard letters.count == 2, letters.allSatisfy({ $0.isLetter && $0.isASCII }) else {
            return globeFlag
        }
        let base: UInt32 = 127397 // 0x1F1E6 - "A"
        var result = ""
        for scalar in letters.unicodeScalars {
            if let flagScalar = Unicode.Scalar(base + scalar.value) {
                result.unicodeScalars.append(flagScalar)
            }
        }
        return result.isEmpty ? globeFlag : result
    }

    /// Drapeau d'un pays par code ISO, ou le globe 🌐 si inconnu.
    public static func flag(forCountryCode iso: String?) -> String {
        guard let iso, countries.contains(where: { $0.id == iso.uppercased() }) else {
            return globeFlag
        }
        return flag(for: iso)
    }

    /// Déduit le pays d'un numéro international (E.164 ou préfixé `00`) par
    /// correspondance du plus long indicatif. Indispensable pour afficher le
    /// bon drapeau quel que soit le `phoneCountryCode` stocké.
    public static func country(forPhoneNumber number: String?) -> CountryCode? {
        guard let number, !number.isEmpty else { return nil }
        let normalized = number.hasPrefix("00") ? "+" + number.dropFirst(2) : number
        guard normalized.hasPrefix("+") else { return nil }
        // `countries` est trié pays prioritaires d'abord ; on garde le plus long
        // indicatif correspondant, en préférant le pays prioritaire en cas d'égalité
        // (ex. +44 -> GB plutôt que GG/JE/IM ; +1 -> US plutôt que CA).
        let matches = countries.filter { normalized.hasPrefix($0.dialCode) }
        guard let longest = matches.map(\.dialCode.count).max() else { return nil }
        return matches.first { $0.dialCode.count == longest }
    }

    /// Drapeau correspondant à un numéro de téléphone, ou le globe 🌐 en repli.
    public static func flag(forPhoneNumber number: String?) -> String {
        country(forPhoneNumber: number)?.flag ?? globeFlag
    }

    /// Libellé VoiceOver d'un pays, ex. « France, +33 ».
    /// L'emoji drapeau est volontairement omis : VoiceOver le vocalise
    /// « drapeau de la France », ce qui fait doublon avec le nom localisé.
    public static func accessibilityLabel(for country: CountryCode) -> String {
        "\(country.name), \(country.dialCode)"
    }

    private static func buildCountries() -> [CountryCode] {
        let locale = Locale.current
        let rank = Dictionary(uniqueKeysWithValues: priority.enumerated().map { ($1, $0) })

        let items = dialCodes.map { iso, dial -> CountryCode in
            let name = locale.localizedString(forRegionCode: iso) ?? iso
            return CountryCode(id: iso, name: name, dialCode: dial, flag: flag(for: iso))
        }

        return items.sorted { lhs, rhs in
            switch (rank[lhs.id], rank[rhs.id]) {
            case let (l?, r?): return l < r
            case (_?, nil): return true
            case (nil, _?): return false
            default: return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
        }
    }

    private var filteredCountries: [CountryCode] {
        if searchText.isEmpty { return Self.countries }
        let lower = searchText.lowercased()
        return Self.countries.filter {
            $0.name.lowercased().contains(lower) ||
            $0.dialCode.contains(lower) ||
            $0.id.lowercased().contains(lower)
        }
    }

    public var body: some View {
        HStack(spacing: 8) {
            // Country selector button
            Button {
                showPicker = true
            } label: {
                HStack(spacing: 4) {
                    Text(selectedCountry.flag)
                    Text(selectedCountry.dialCode)
                        .font(.subheadline)
                        .foregroundStyle(.white)
                    Image(systemName: "chevron.down")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Color(hex: "2D2D40").opacity(0.6))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .strokeBorder(Color.white.opacity(0.08), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Self.accessibilityLabel(for: selectedCountry))
            .accessibilityHint(String(localized: "auth.countryPicker.selector.hint", defaultValue: "Changer de pays", bundle: .module))

            // Phone number field
            TextField(String(localized: "auth.countryPicker.phoneNumber", defaultValue: "Numero de telephone", bundle: .module), text: $phoneNumber)
                .keyboardType(.phonePad)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Color(hex: "2D2D40").opacity(0.6))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .strokeBorder(Color.white.opacity(0.08), lineWidth: 1)
                )
        }
        .sheet(isPresented: $showPicker) {
            NavigationStack {
                List(filteredCountries) { country in
                    Button {
                        selectedCountry = country
                        showPicker = false
                    } label: {
                        HStack {
                            Text(country.flag)
                            Text(country.name)
                                .foregroundStyle(.primary)
                            Spacer()
                            Text(country.dialCode)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(Self.accessibilityLabel(for: country))
                }
                .searchable(text: $searchText, prompt: String(localized: "auth.countryPicker.searchPrompt", defaultValue: "Rechercher un pays", bundle: .module))
                .navigationTitle(String(localized: "auth.countryPicker.title", defaultValue: "Pays", bundle: .module))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(String(localized: "auth.countryPicker.close", defaultValue: "Fermer", bundle: .module)) { showPicker = false }
                    }
                }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }
}
