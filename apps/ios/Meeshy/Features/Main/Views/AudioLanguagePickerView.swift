import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Audio Language Picker

struct AudioLanguagePickerView: View {
    @Binding var selectedLocale: Locale
    /// Le titre de la feuille. Défaut : le contexte d'ORIGINE (la langue d'un
    /// audio). Un hôte qui remonte ce composant dans un AUTRE contexte — le
    /// meuble, dont la feuille nomme la langue du POST — passe le sien, sans
    /// que les trois appelants audio aient à répéter le défaut.
    var title: LocalizedStringResource = "Langue de l'audio"
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""
    @State private var showAllLanguages = false

    private var listedLocales: [(locale: Locale, name: String)] {
        let locales = showAllLanguages
            ? EdgeTranscriptionService.shared.supportedLocales
            : EdgeTranscriptionService.shared.availableLocales
        return locales.compactMap { locale -> (Locale, String)? in
            guard let name = Locale.current.localizedString(forIdentifier: locale.identifier) else {
                return nil
            }
            let cap = name.prefix(1).uppercased() + name.dropFirst()
            return (locale, cap)
        }
        .sorted { $0.1 < $1.1 }
    }

    private var filteredLocales: [(locale: Locale, name: String)] {
        guard !searchText.isEmpty else { return listedLocales }
        let q = searchText.lowercased()
        return listedLocales.filter {
            $0.name.lowercased().contains(q) ||
            $0.locale.identifier.lowercased().contains(q)
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Toggle(isOn: $showAllLanguages) {
                        Text(String(localized: "composer.audio.languages.show-all", defaultValue: "Afficher toutes les langues"))
                            .font(.subheadline)
                            .foregroundColor(theme.textPrimary)
                    }
                    .tint(MeeshyColors.indigo500)
                } footer: {
                    Text(String(
                        localized: "composer.audio.languages.hint", defaultValue: "Par défaut, seules les langues disponibles sur cet appareil sont listées."
                    ))
                    .font(.caption)
                    .foregroundColor(theme.textMuted)
                }

                Section {
                    ForEach(filteredLocales, id: \.locale.identifier) { item in
                        Button {
                            selectedLocale = item.locale
                            HapticFeedback.light()
                            dismiss()
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                                    Text(item.name)
                                        .font(.callout.weight(
                                            selectedLocale.identifier == item.locale.identifier
                                                ? .semibold : .regular
                                        ))
                                        .foregroundColor(theme.textPrimary)
                                    Text(item.locale.identifier)
                                        .font(.caption)
                                        .foregroundColor(theme.textMuted)
                                }
                                Spacer()
                                if selectedLocale.identifier == item.locale.identifier {
                                    Image(systemName: "checkmark")
                                        .font(.subheadline.weight(.bold))
                                        .foregroundColor(MeeshyColors.indigo500)
                                }
                            }
                        }
                    }
                }
            }
            .searchable(text: $searchText,
                        prompt: String(localized: "composer.audio.languages.search", defaultValue: "Rechercher une langue"))
            .navigationTitle(Text(title))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)) {
                        dismiss()
                    }
                    .foregroundColor(MeeshyColors.indigo500)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}
