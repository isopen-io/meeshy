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

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    /// La PORTE ouverte, s'il y en a une (#5843).
    ///
    /// Une destination et non un booléen par section : trois booléens
    /// autoriseraient deux pages ouvertes en même temps, un état que la
    /// navigation ne sait pas rendre et que rien n'interdirait.
    @State private var destination: ProgressionSection?

    /// LE PALIER À CÉLÉBRER quand on touche le hero du dernier succès.
    ///
    /// `AchievementRevealView` existait déjà (#5809) mais n'était atteignable
    /// que depuis une NOTIFICATION : le succès qu'on avait sous les yeux ne se
    /// rejouait pas. Le porteur veut qu'il se retouche — animation et étoiles
    /// comprises.
    @State private var reveal: EngagementReveal?

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
        .fullScreenCover(item: $reveal) { palier in
            AchievementRevealView(reveal: palier, onContinue: { reveal = nil })
        }
        .sheet(item: $destination) { section in
            ProgressionSectionPage(
                section: section,
                progress: viewModel.progress,
                isDark: isDark,
                onClose: { destination = nil }
            )
        }
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

            /*
             * L'ENTRÉE MEESH remplace le trophée (#5839).
             *
             * Le trophée était `accessibilityHidden(true)`, ne réagissait à
             * rien et n'annonçait rien : un ornement posé à l'endroit où l'œil
             * cherche un contrôle. À sa place, le solde et sa porte.
             *
             * `nil` quand la passerelle ne sert pas le bloc — l'écran n'affiche
             * alors RIEN : un solde de zéro montré à quelqu'un qui en a deux
             * serait pire qu'une absence.
             */
            if let meesh = viewModel.progress?.meesh {
                ProgressionMeeshEntry(
                    meesh: meesh,
                    isMinting: viewModel.isMinting,
                    onMint: { Task { await viewModel.mint() } }
                )
            } else {
                Color.clear.frame(width: 24, height: 24)
            }
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
                    /*
                     * LA VUE PARCOURT la séquence, elle ne la compose plus.
                     *
                     * Avant : Meesh → badges → succès → défis, écrit ici ; et
                     * web-v3 écrivait le sien, différent. `ProgressionLayout`
                     * (miroir de `progression-layout.ts`, gardé par
                     * `progression-layout-mirror-parity`) décide pour les deux.
                     *
                     * Le `switch` est exhaustif sur une énumération à valeur
                     * associée : ajouter un bloc au partagé fait ROUGIR la
                     * compilation ici tant que la vue ne le rend pas. C'est ce
                     * qui rend l'oubli impossible, là où une liste de chaînes
                     * l'aurait laissé passer.
                     */
                    ForEach(Array(ProgressionLayout.blocks(for: progress).enumerated()), id: \.offset) { _, bloc in
                        switch bloc {
                        case .lastAchievement:
                            ProgressionLastAchievementHero(
                                progress: progress,
                                isDark: isDark,
                                onReveal: { reveal = $0 }
                            )
                        case .level:
                            ProgressionLevelHero(progress: progress, isDark: isDark)
                        case .elans:
                            ProgressionElansHero(progress: progress, isDark: isDark)
                        case .flamme:
                            ProgressionFlammeHero(progress: progress, isDark: isDark)
                        case .sectionLink(let section):
                            ProgressionSectionLink(
                                section: section,
                                progress: progress,
                                isDark: isDark,
                                onOpen: { destination = section }
                            )
                        }
                    }
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
