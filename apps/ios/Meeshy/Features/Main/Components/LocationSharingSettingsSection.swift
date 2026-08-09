import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Libellés

/// Les libellés vivent côté APP, pas dans l'enum du SDK : une chaîne dans le
/// SDK obligerait à alimenter le catalogue `.module` et rendrait du français
/// en dur quelle que soit la langue de l'interface — le défaut que traîne
/// `LiveLocationDuration.displayText`.
/// `nonisolated` sur le TYPE : la cible app compile sous
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, le bundle de tests sous
/// `nonisolated`. Sans cette annotation, ces fonctions pures deviennent
/// isolées au main actor et les tests ne peuvent plus les appeler. Même
/// motif que les helpers de la Share extension (`ShareSession`,
/// `ShareConversationStore`).
nonisolated enum LocationSharingLabels {

    static func precisionTitle(_ precision: LocationPrecision) -> String {
        switch precision {
        case .exact:
            return String(localized: "location.precision.exact", defaultValue: "Exacte", bundle: .main)
        case .around:
            return String(localized: "location.precision.around", defaultValue: "Autour (~100 m)", bundle: .main)
        case .neighborhood:
            return String(localized: "location.precision.neighborhood", defaultValue: "Quartier (~1 km)", bundle: .main)
        case .city:
            return String(localized: "location.precision.city", defaultValue: "Ville (~10 km)", bundle: .main)
        }
    }

    /// Libellé court, pour le suffixe collé aux coordonnées de la carte du bas.
    static func precisionBadge(_ precision: LocationPrecision) -> String {
        switch precision {
        case .exact:
            return String(localized: "location.precision.badge.exact", defaultValue: "Exacte", bundle: .main)
        case .around:
            return String(localized: "location.precision.badge.around", defaultValue: "~100 m", bundle: .main)
        case .neighborhood:
            return String(localized: "location.precision.badge.neighborhood", defaultValue: "~1 km", bundle: .main)
        case .city:
            return String(localized: "location.precision.badge.city", defaultValue: "~10 km", bundle: .main)
        }
    }

    static func precisionIcon(_ precision: LocationPrecision) -> String {
        switch precision {
        case .exact:        return "scope"
        case .around:       return "circle.dashed"
        case .neighborhood: return "house"
        case .city:         return "building.2"
        }
    }

    static func mapStyleTitle(_ style: SharedMapStyle) -> String {
        switch style {
        case .standard:
            return String(localized: "location.map-style.standard", defaultValue: "Plan", bundle: .main)
        case .hybrid:
            return String(localized: "location.map-style.hybrid", defaultValue: "Hybride", bundle: .main)
        case .imagery:
            return String(localized: "location.map-style.imagery", defaultValue: "Satellite", bundle: .main)
        }
    }

    static func mapStyleIcon(_ style: SharedMapStyle) -> String {
        switch style {
        case .standard: return "map"
        case .hybrid:   return "globe.europe.africa"
        case .imagery:  return "photo"
        }
    }

    /// Titre du lieu affiché : nom et adresse, sans redite.
    ///
    /// `LocationPickerModel.reverseGeocode` construit l'adresse en partant de
    /// `placemark.name` — elle CONTIENT donc déjà le nom quand le lieu vient
    /// d'un résultat de recherche. Les concaténer sans le voir affiche
    /// « Tour Eiffel · Tour Eiffel, Champ de Mars, Paris » sur le chemin le
    /// plus courant du picker.
    ///
    /// Le test de contenance est fait sur l'adresse, pas une simple égalité :
    /// c'est une SOUS-chaîne, jamais une répétition à l'identique.
    static func placeTitle(name: String?, address: String?) -> String? {
        let cleanName = name?.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanAddress = address?.trimmingCharacters(in: .whitespacesAndNewlines)

        guard let cleanName, !cleanName.isEmpty else {
            return (cleanAddress?.isEmpty == false) ? cleanAddress : nil
        }
        guard let cleanAddress, !cleanAddress.isEmpty else { return cleanName }

        return cleanAddress.localizedCaseInsensitiveContains(cleanName)
            ? cleanAddress
            : "\(cleanName) · \(cleanAddress)"
    }
}

// MARK: - Section partagée

/// Les deux réglages de partage de position, rendus à l'identique dans la
/// feuille `(i)` du sélecteur de lieu et dans Réglages > Confidentialité.
///
/// Bâtie sur `SettingsCard` / `SettingsRow` / `SettingsSeparator` — pas sur le
/// style local de `MediaDownloadSettingsView`. Une vue partagée entre deux
/// surfaces doit adopter le style de la plus contrainte, sinon elle jure dans
/// Confidentialité.
struct LocationSharingSettingsSection: View {
    let accentColor: String

    @ObservedObject private var store = LocationSharingPreferencesStore.shared
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxl) {
            precisionSection
            if Platform.isIOS17OrLater {
                mapStyleSection
            }
        }
    }

    // MARK: - Précision

    private var precisionSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            SettingsSectionHeader(
                title: String(localized: "location.precision.section", defaultValue: "Précision du partage", bundle: .main),
                icon: "scope",
                color: accentColor
            )

            SettingsCard(tint: accentColor) {
                ForEach(Array(LocationPrecision.allCases.enumerated()), id: \.element) { index, precision in
                    if index > 0 { SettingsSeparator(tint: accentColor) }
                    radioRow(
                        icon: LocationSharingLabels.precisionIcon(precision),
                        title: LocationSharingLabels.precisionTitle(precision),
                        isSelected: store.preferences.precision == precision
                    ) {
                        store.preferences.precision = precision
                    }
                }
            }

            Text(String(
                localized: "location.precision.footnote",
                defaultValue: "Aux niveaux Quartier et Ville, seule la zone est transmise — pas l'adresse exacte.",
                bundle: .main
            ))
            .font(MeeshyFont.relative(12))
            .foregroundColor(theme.textMuted)
            .padding(.horizontal, MeeshySpacing.xs)
        }
    }

    // MARK: - Type de carte

    private var mapStyleSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            SettingsSectionHeader(
                title: String(localized: "location.map-style.section", defaultValue: "Type de carte", bundle: .main),
                icon: "map",
                color: accentColor
            )

            SettingsCard(tint: accentColor) {
                ForEach(Array(SharedMapStyle.allCases.enumerated()), id: \.element) { index, style in
                    if index > 0 { SettingsSeparator(tint: accentColor) }
                    radioRow(
                        icon: LocationSharingLabels.mapStyleIcon(style),
                        title: LocationSharingLabels.mapStyleTitle(style),
                        isSelected: store.preferences.mapStyle == style
                    ) {
                        store.preferences.mapStyle = style
                    }
                }
            }
        }
    }

    // MARK: - Ligne radio

    /// Le `Button` enveloppe la ligne entière. On n'utilise donc jamais le
    /// paramètre `info:` de `SettingsRow` ici : le bouton englobant avalerait
    /// le tap du `(i)`.
    private func radioRow(
        icon: String,
        title: String,
        isSelected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            SettingsRow(icon: icon, title: title, color: accentColor) {
                Image(systemName: "checkmark")
                    .font(MeeshyFont.relative(14, weight: .bold))
                    .foregroundColor(Color(hex: accentColor))
                    .opacity(isSelected ? 1 : 0)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }
}

// MARK: - Feuille

/// Enveloppe présentable de la section — c'est ce qu'ouvre le `(i)` du
/// sélecteur de lieu.
struct LocationSharingSettingsSheet: View {
    let accentColor: String

    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()

                ScrollView(showsIndicators: false) {
                    LocationSharingSettingsSection(accentColor: accentColor)
                        .padding(.horizontal, MeeshySpacing.xl)
                        .padding(.top, MeeshySpacing.lg)
                        .padding(.bottom, MeeshySpacing.xxxl)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text(String(localized: "location.settings.title", defaultValue: "Partage de position", bundle: .main))
                        .font(MeeshyFont.relative(16, weight: .bold))
                        .accessibilityAddTraits(.isHeader)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done", defaultValue: "Terminé", bundle: .main)) { dismiss() }
                        .foregroundColor(Color(hex: accentColor))
                }
            }
        }
    }
}
