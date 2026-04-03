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

    public static let countries: [CountryCode] = [
        CountryCode(id: "FR", name: String(localized: "auth.country.FR", defaultValue: "France", bundle: .module), dialCode: "+33", flag: "🇫🇷"),
        CountryCode(id: "US", name: String(localized: "auth.country.US", defaultValue: "Etats-Unis", bundle: .module), dialCode: "+1", flag: "🇺🇸"),
        CountryCode(id: "GB", name: String(localized: "auth.country.GB", defaultValue: "Royaume-Uni", bundle: .module), dialCode: "+44", flag: "🇬🇧"),
        CountryCode(id: "DE", name: String(localized: "auth.country.DE", defaultValue: "Allemagne", bundle: .module), dialCode: "+49", flag: "🇩🇪"),
        CountryCode(id: "ES", name: String(localized: "auth.country.ES", defaultValue: "Espagne", bundle: .module), dialCode: "+34", flag: "🇪🇸"),
        CountryCode(id: "IT", name: String(localized: "auth.country.IT", defaultValue: "Italie", bundle: .module), dialCode: "+39", flag: "🇮🇹"),
        CountryCode(id: "PT", name: String(localized: "auth.country.PT", defaultValue: "Portugal", bundle: .module), dialCode: "+351", flag: "🇵🇹"),
        CountryCode(id: "BE", name: String(localized: "auth.country.BE", defaultValue: "Belgique", bundle: .module), dialCode: "+32", flag: "🇧🇪"),
        CountryCode(id: "CH", name: String(localized: "auth.country.CH", defaultValue: "Suisse", bundle: .module), dialCode: "+41", flag: "🇨🇭"),
        CountryCode(id: "CA", name: String(localized: "auth.country.CA", defaultValue: "Canada", bundle: .module), dialCode: "+1", flag: "🇨🇦"),
        CountryCode(id: "MA", name: String(localized: "auth.country.MA", defaultValue: "Maroc", bundle: .module), dialCode: "+212", flag: "🇲🇦"),
        CountryCode(id: "DZ", name: String(localized: "auth.country.DZ", defaultValue: "Algerie", bundle: .module), dialCode: "+213", flag: "🇩🇿"),
        CountryCode(id: "TN", name: String(localized: "auth.country.TN", defaultValue: "Tunisie", bundle: .module), dialCode: "+216", flag: "🇹🇳"),
        CountryCode(id: "SN", name: String(localized: "auth.country.SN", defaultValue: "Senegal", bundle: .module), dialCode: "+221", flag: "🇸🇳"),
        CountryCode(id: "CI", name: String(localized: "auth.country.CI", defaultValue: "Cote d'Ivoire", bundle: .module), dialCode: "+225", flag: "🇨🇮"),
        CountryCode(id: "CM", name: String(localized: "auth.country.CM", defaultValue: "Cameroun", bundle: .module), dialCode: "+237", flag: "🇨🇲"),
        CountryCode(id: "JP", name: String(localized: "auth.country.JP", defaultValue: "Japon", bundle: .module), dialCode: "+81", flag: "🇯🇵"),
        CountryCode(id: "CN", name: String(localized: "auth.country.CN", defaultValue: "Chine", bundle: .module), dialCode: "+86", flag: "🇨🇳"),
        CountryCode(id: "KR", name: String(localized: "auth.country.KR", defaultValue: "Coree du Sud", bundle: .module), dialCode: "+82", flag: "🇰🇷"),
        CountryCode(id: "IN", name: String(localized: "auth.country.IN", defaultValue: "Inde", bundle: .module), dialCode: "+91", flag: "🇮🇳"),
        CountryCode(id: "BR", name: String(localized: "auth.country.BR", defaultValue: "Bresil", bundle: .module), dialCode: "+55", flag: "🇧🇷"),
        CountryCode(id: "MX", name: String(localized: "auth.country.MX", defaultValue: "Mexique", bundle: .module), dialCode: "+52", flag: "🇲🇽"),
        CountryCode(id: "RU", name: String(localized: "auth.country.RU", defaultValue: "Russie", bundle: .module), dialCode: "+7", flag: "🇷🇺"),
        CountryCode(id: "TR", name: String(localized: "auth.country.TR", defaultValue: "Turquie", bundle: .module), dialCode: "+90", flag: "🇹🇷"),
        CountryCode(id: "AU", name: String(localized: "auth.country.AU", defaultValue: "Australie", bundle: .module), dialCode: "+61", flag: "🇦🇺"),
    ]

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
        }
    }
}
