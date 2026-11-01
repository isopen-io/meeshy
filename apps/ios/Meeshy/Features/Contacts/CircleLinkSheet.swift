import SwiftUI
import MeeshySDK
import MeeshyUI

/// La fiche d'un lien (#13938) : la personne, son niveau, ce qui manque pour monter, et les réglages PAR PERSONNE
/// — écoute, talkie, Bring, position — qui n'existent côté serveur qu'au jalon 2. Tant qu'il n'est pas livré
/// (`MeeshyFeatureFlags.areCirclePersonSettingsEnabled`), ils sont MONTRÉS désactivés et l'interface le DIT : ni
/// cachés (on chercherait où ils sont), ni simulés (un interrupteur sans effet est un mensonge).
struct CircleLinkSheet: View {
    @ObservedObject var viewModel: CirclesViewModel
    let row: CirclesViewModel.Row
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }

    private let settingsEnabled = MeeshyFeatureFlags.areCirclePersonSettingsEnabled

    private var name: String { viewModel.name(of: row.id, fallback: row.person?.name) }
    private var level: RelationLevel { row.link.effectiveLevel }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                    header
                    if let line = CircleProgressSummary.make(row.link).text(levelTitle: { viewModel.title(of: $0) }) {
                        Text(line).font(.subheadline).foregroundStyle(theme.textSecondary)
                    }
                    settingsSection
                }
                .padding(MeeshySpacing.xl)
            }
            .background(theme.backgroundPrimary.ignoresSafeArea())
            .navigationTitle(name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "circles.sheet.close", defaultValue: "Fermer", bundle: .main)) { dismiss() }
                }
            }
        }
    }

    private var header: some View {
        HStack(spacing: MeeshySpacing.mdPlus) {
            MeeshyAvatar(
                name: name,
                context: .userListItem,
                accentColor: DynamicColorGenerator.colorForName(name),
                avatarURL: row.person?.avatarURL
            )
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(name).font(.headline).foregroundStyle(theme.textPrimary)
                Text("\(viewModel.icon(of: level)) \(viewModel.title(of: level))")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(CircleLevelColor.color(for: level))
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var settingsSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(String(localized: "circles.sheet.settings.title", defaultValue: "Réglages pour cette personne", bundle: .main))
                .font(.subheadline.weight(.bold))
                .foregroundStyle(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            if !settingsEnabled {
                Text(String(localized: "circles.sheet.settings.unavailable", defaultValue: "Ces réglages arrivent avec la prochaine étape de Meeshy. Ils sont désactivés pour l'instant.", bundle: .main))
                    .font(.footnote)
                    .foregroundStyle(theme.textMuted)
            }
            settingToggle(String(localized: "circles.settings.listening", defaultValue: "Ce que j'écoute", bundle: .main))
            settingToggle(String(localized: "circles.settings.talkie", defaultValue: "Talkie", bundle: .main))
            settingToggle(String(localized: "circles.settings.bring", defaultValue: "Bring", bundle: .main))
            settingToggle(String(localized: "circles.settings.location", defaultValue: "Position en direct", bundle: .main))
        }
    }

    private func settingToggle(_ title: String) -> some View {
        Toggle(title, isOn: .constant(false))
            .disabled(!settingsEnabled)
            .frame(minHeight: MeeshyControlSize.tapTarget)
    }
}
