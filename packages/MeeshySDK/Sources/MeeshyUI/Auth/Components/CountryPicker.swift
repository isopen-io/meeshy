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
        CountryCode(id: "FR", name: "France", dialCode: "+33", flag: "🇫🇷"),
        CountryCode(id: "US", name: "Etats-Unis", dialCode: "+1", flag: "🇺🇸"),
        CountryCode(id: "GB", name: "Royaume-Uni", dialCode: "+44", flag: "🇬🇧"),
        CountryCode(id: "DE", name: "Allemagne", dialCode: "+49", flag: "🇩🇪"),
        CountryCode(id: "ES", name: "Espagne", dialCode: "+34", flag: "🇪🇸"),
        CountryCode(id: "IT", name: "Italie", dialCode: "+39", flag: "🇮🇹"),
        CountryCode(id: "PT", name: "Portugal", dialCode: "+351", flag: "🇵🇹"),
        CountryCode(id: "BE", name: "Belgique", dialCode: "+32", flag: "🇧🇪"),
        CountryCode(id: "CH", name: "Suisse", dialCode: "+41", flag: "🇨🇭"),
        CountryCode(id: "CA", name: "Canada", dialCode: "+1", flag: "🇨🇦"),
        CountryCode(id: "MA", name: "Maroc", dialCode: "+212", flag: "🇲🇦"),
        CountryCode(id: "DZ", name: "Algerie", dialCode: "+213", flag: "🇩🇿"),
        CountryCode(id: "TN", name: "Tunisie", dialCode: "+216", flag: "🇹🇳"),
        CountryCode(id: "SN", name: "Senegal", dialCode: "+221", flag: "🇸🇳"),
        CountryCode(id: "CI", name: "Cote d'Ivoire", dialCode: "+225", flag: "🇨🇮"),
        CountryCode(id: "CM", name: "Cameroun", dialCode: "+237", flag: "🇨🇲"),
        CountryCode(id: "JP", name: "Japon", dialCode: "+81", flag: "🇯🇵"),
        CountryCode(id: "CN", name: "Chine", dialCode: "+86", flag: "🇨🇳"),
        CountryCode(id: "KR", name: "Coree du Sud", dialCode: "+82", flag: "🇰🇷"),
        CountryCode(id: "IN", name: "Inde", dialCode: "+91", flag: "🇮🇳"),
        CountryCode(id: "BR", name: "Bresil", dialCode: "+55", flag: "🇧🇷"),
        CountryCode(id: "MX", name: "Mexique", dialCode: "+52", flag: "🇲🇽"),
        CountryCode(id: "RU", name: "Russie", dialCode: "+7", flag: "🇷🇺"),
        CountryCode(id: "TR", name: "Turquie", dialCode: "+90", flag: "🇹🇷"),
        CountryCode(id: "AU", name: "Australie", dialCode: "+61", flag: "🇦🇺"),
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
            TextField("Numero de telephone", text: $phoneNumber)
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
                .searchable(text: $searchText, prompt: "Rechercher un pays")
                .navigationTitle("Pays")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Fermer") { showPicker = false }
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
    }
}
