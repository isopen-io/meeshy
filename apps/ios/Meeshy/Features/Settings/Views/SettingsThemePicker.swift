import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Les segments de thème des Réglages** — Auto, Clair, Sombre. La vue ne
/// touche pas au `ThemeManager` : elle montre la sélection reçue et rend le
/// choix à l'écran, qui l'applique et le synchronise au compte.
struct SettingsThemePicker: View {
    let selection: ThemePreference
    let onSelect: (ThemePreference) -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            ForEach(ThemePreference.allCases, id: \.self) { pref in
                segment(pref)
            }
        }
    }

    private func segment(_ pref: ThemePreference) -> some View {
        let isSelected = selection == pref
        return Button {
            HapticFeedback.light()
            onSelect(pref)
        } label: {
            VStack(spacing: MeeshySpacing.xs) {
                Image(systemName: pref.icon)
                    .font(MeeshyFont.relative(MeeshyIconSize.sm))
                Text(Self.label(for: pref))
                    .font(MeeshyFont.relative(MeeshyFont.microSize, weight: .medium))
                    // Un segment = une ligne à sa largeur idéale : sans
                    // `fixedSize`, le HStack compressait ces libellés (« Au… »)
                    // alors que c'est le Spacer de la rangée qui doit céder.
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }
            .foregroundStyle(isSelected ? Color(hex: pref.tintColor) : theme.textMuted)
            .padding(.horizontal, MeeshySpacing.sm + 2)
            .padding(.vertical, MeeshySpacing.xs + 2)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                    .fill(isSelected ? Color(hex: pref.tintColor).opacity(MeeshyOpacity.light) : Color.clear)
            )
        }
        .accessibilityLabel("\(String(localized: "settings.theme", bundle: .main)) \(Self.label(for: pref))")
        .accessibilityValue(isSelected ? String(localized: "common.selected", bundle: .main) : "")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    /// `ThemePreference.label` (SDK) rend du français en dur, qui fuyait tel
    /// quel dans les six autres langues de l'interface.
    static func label(for pref: ThemePreference) -> String {
        switch pref {
        case .system: return String(localized: "settings.theme.auto", defaultValue: "Auto", bundle: .main)
        case .light: return String(localized: "settings.theme.light", defaultValue: "Clair", bundle: .main)
        case .dark: return String(localized: "settings.theme.dark", defaultValue: "Sombre", bundle: .main)
        }
    }
}
