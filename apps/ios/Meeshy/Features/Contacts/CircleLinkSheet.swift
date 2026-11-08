import SwiftUI
import MeeshySDK
import MeeshyUI

/// La fiche d'un lien (#13938) : la personne, son niveau, ce qui manque pour monter, et les réglages PAR PERSONNE
/// — écoute, talkie, Bring, position. « Bloquer ses Bring » (#13936) et « Couper son talkie » (#16673) sont ACTIFS depuis
/// leur lot ; les autres n'existent côté
/// serveur qu'avec leur lot du jalon 2. Tant qu'il n'est pas livré
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
            LivePresence { MeeshyAvatar(
                name: name,
                context: .userListItem,
                accentColor: DynamicColorGenerator.colorForName(name),
                avatarURL: row.person?.avatarURL,
                presenceState: PresenceManager.shared.knownPresenceState(for: row.id),
                ring: row.person?.ring
            ) }
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
            if settings.isEmpty {
                Text(String(localized: "circles.sheet.settings.none", defaultValue: "Rien à régler à ce niveau.", bundle: .main))
                    .font(.footnote)
                    .foregroundStyle(theme.textMuted)
            } else {
                if !settingsEnabled && settings.contains(where: { $0.personSwitch == nil }) {
                    Text(String(localized: "circles.sheet.settings.unavailable", defaultValue: "Ces réglages arrivent avec la prochaine étape de Meeshy. Ils sont désactivés pour l'instant.", bundle: .main))
                        .font(.footnote)
                        .foregroundStyle(theme.textMuted)
                }
                ForEach(settings) { setting in
                    if let personSwitch = setting.personSwitch {
                        CircleReceptionBlockToggle(
                            userId: row.id,
                            personSwitch: personSwitch,
                            title: setting.title,
                            detail: setting.detail,
                            identifier: "circles.settings.\(setting.rawValue)"
                        )
                    } else {
                        Toggle(setting.title, isOn: .constant(false))
                            .disabled(!settingsEnabled)
                            .frame(minHeight: MeeshyControlSize.tapTarget)
                    }
                }
            }
        }
    }

    /// Ce que le cercle ouvre pour cette personne. Les interrupteurs restent désactivés derrière le drapeau tant que le
    /// serveur ne sert pas l'état de chaque réglage (jalon 2, #14229).
    private var settings: [CirclePersonSetting] { CirclePersonSetting.offered(at: level) }
}
