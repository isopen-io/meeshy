import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Sélecteur de pays

/// La feuille de choix du pays.
///
/// `CountryPicker` (SDK) est un COUPLE bouton + champ : il porte sa propre
/// saisie de numéro, que l'inscription a déjà. Seule sa LISTE est réutilisable,
/// et c'est elle — `CountryPicker.countries`, 242 indicatifs, priorité incluse —
/// que la feuille présente. Extraite de `SignupView.swift` par le réagencement
/// en phases (#8288), sans rien changer.
struct SignupCountrySheet: View {
    @Binding var selection: CountryCode
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    private var filtered: [CountryCode] {
        guard !searchText.isEmpty else { return CountryPicker.countries }
        let needle = searchText.lowercased()
        return CountryPicker.countries.filter {
            $0.name.lowercased().contains(needle)
                || $0.dialCode.contains(needle)
                || $0.id.lowercased().contains(needle)
        }
    }

    var body: some View {
        NavigationStack {
            List(filtered) { country in
                Button {
                    selection = country
                    dismiss()
                } label: {
                    HStack {
                        Text(country.flag)
                        Text(country.name)
                            .foregroundStyle(.primary)
                        Spacer()
                        Text(country.dialCode)
                            .foregroundStyle(.secondary)
                    }
                    .frame(minHeight: 44)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(CountryPicker.accessibilityLabel(for: country))
                .accessibilityAddTraits(country.id == selection.id ? [.isSelected] : [])
            }
            .searchable(
                text: $searchText,
                prompt: String(localized: "auth.signup.phone.country.search", defaultValue: "Rechercher un pays", bundle: .main)
            )
            .navigationTitle(String(localized: "auth.signup.phone.country.title", defaultValue: "Pays", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)) { dismiss() }
                }
            }
        }
    }
}
