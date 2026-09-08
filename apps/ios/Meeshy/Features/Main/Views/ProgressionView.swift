import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// L'ÉCRAN « PROGRESSION » (#5698) — le tableau de bord des streaks & badges
/// (`docs/product/streaks-badges-modele.md` § 9) : le niveau que porte le
/// score, la série qui court et son record, les badges par famille d'axe avec
/// le palier suivant, les succès débloqués et ceux qu'il reste à débloquer.
///
/// Même anatomie que la v3.1 web (`apps/web-v3/src/routes/progression.tsx`,
/// #5547), dessinés ensemble : en-tête flottant sans barre de navigation
/// système, deux cartes de résumé, des sections en cartes teintées — la
/// hiérarchie de `UserStatsView` / `SettingsView`. Ce que l'écran REFUSE :
///  - lire l'historique des notifications — il restitue l'ÉTAT courant ;
///  - cacher un axe à zéro — l'état vide est le catalogue ENTIER, verrouillé,
///    avec la première action qui débloque ;
///  - peindre un spinner — squelette à froid, instantané sinon, et hors ligne
///    l'instantané reste affiché avec son avis, jamais un voile.
struct ProgressionView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.isPresented) private var isPresented
    @Environment(\.meeshyPanelDismiss) private var panelDismiss
    /// Retour opérant dans les trois contextes de présentation : pile iPhone,
    /// panneau droit iPad, sheet — même dispositif que `UserStatsView`.
    private var back: PanelBackAction {
        PanelBackAction(isPresented: isPresented, dismiss: dismiss, panelDismiss: panelDismiss)
    }
    private var theme: ThemeManager { ThemeManager.shared }
    @StateObject private var viewModel: ProgressionViewModel

    private let accentColor = MeeshyColors.brandPrimary

    init(viewModel: ProgressionViewModel? = nil) {
        _viewModel = StateObject(wrappedValue: viewModel ?? ProgressionViewModel())
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                content
            }
        }
        .task { await viewModel.load() }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                back()
            } label: {
                Image(systemName: "chevron.backward")
                    .font(MeeshyFont.relative(16, weight: .semibold))
                    .foregroundColor(accentColor)
            }
            .accessibilityLabel(String(localized: "a11y.back", bundle: .main))

            Spacer()

            Text(String(localized: "progression.title", defaultValue: "Progression", bundle: .main))
                .font(MeeshyFont.relative(17, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Spacer()

            Image(systemName: "trophy.fill")
                .font(MeeshyFont.relative(16, weight: .semibold))
                .foregroundColor(MeeshyColors.warning)
                .frame(width: 24, height: 24)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Content

    private var content: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: MeeshySpacing.xl) {
                if viewModel.isOffline {
                    ProgressionNotice(kind: .offline(hasSnapshot: viewModel.progress != nil))
                }
                if let errorMessage = viewModel.errorMessage {
                    ProgressionNotice(kind: .error(errorMessage)) {
                        Task { await viewModel.load(forceNetwork: true) }
                    }
                }

                if viewModel.showsSkeleton {
                    ProgressionSkeleton()
                } else if let progress = viewModel.progress {
                    // Le héros n'est monté que si la passerelle sert le bloc :
                    // un serveur antérieur ⇒ aucune section, jamais un solde à zéro
                    // affiché à quelqu'un qui en a deux (#5743).
                    if let meesh = progress.meesh {
                        ProgressionMeeshHero(
                            meesh: meesh,
                            isMinting: viewModel.isMinting,
                            onMint: { Task { await viewModel.mint() } }
                        )
                    }

                    if progress.isEmpty {
                        ProgressionNotice(kind: .empty)
                    }

                    HStack(alignment: .top, spacing: MeeshySpacing.md) {
                        ProgressionLevelCard(level: progress.level)
                        ProgressionStreakCard(streak: progress.streak)
                    }

                    badgesSection(progress)
                    achievementsSection(progress)
                }

                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
        .refreshable { await viewModel.load(forceNetwork: true) }
    }

    // MARK: - Sections

    private func badgesSection(_ progress: EngagementProgress) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            sectionHeader(
                icon: "medal.fill",
                title: String(localized: "progression.section.badges", defaultValue: "Badges", bundle: .main),
                trailing: "\(progress.badgesEarned) / \(progress.badgesTotal)",
                color: accentColor
            )

            ForEach(progress.axesByFamily) { group in
                VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                    Text(ProgressionCopy.title(for: group.family))
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .padding(.leading, 4)
                        .accessibilityAddTraits(.isHeader)

                    ProgressionCard(tint: accentColor) {
                        VStack(spacing: 0) {
                            ForEach(Array(group.axes.enumerated()), id: \.element.id) { index, axis in
                                if index > 0 {
                                    Divider().overlay(theme.textMuted.opacity(0.2))
                                }
                                ProgressionAxisRow(axis: axis)
                            }
                        }
                    }
                }
            }
        }
    }

    private func achievementsSection(_ progress: EngagementProgress) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            sectionHeader(
                icon: "trophy.fill",
                title: String(localized: "progression.section.achievements", defaultValue: "Succès", bundle: .main),
                trailing: "\(progress.unlockedAchievementCount) / \(progress.achievements.count)",
                color: MeeshyColors.success
            )

            ProgressionCard(tint: MeeshyColors.success) {
                VStack(spacing: 0) {
                    ForEach(Array(progress.achievements.enumerated()), id: \.element.id) { index, achievement in
                        if index > 0 {
                            Divider().overlay(theme.textMuted.opacity(0.2))
                        }
                        ProgressionAchievementRow(achievement: achievement)
                    }
                }
            }
        }
    }

    private func sectionHeader(icon: String, title: String, trailing: String, color: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(12, weight: .semibold))
                .foregroundColor(color)
                .accessibilityHidden(true)
            Text(title.uppercased())
                .font(MeeshyFont.relative(11, weight: .bold, design: .rounded))
                .foregroundColor(color)
                .tracking(1.2)
            Spacer()
            Text(trailing)
                .font(MeeshyFont.relative(11, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textMuted)
                .monospacedDigit()
        }
        .padding(.horizontal, 4)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}
