import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// L'ÉCRAN « PROGRESSION » (#5698) — le tableau de bord des streaks & badges
/// (`docs/product/streaks-badges-modele.md` § 9) : le niveau que porte le
/// score, la série qui court et son record, les badges par famille d'axe avec
/// le palier suivant, les succès débloqués et ceux qu'il reste à débloquer.
///
/// Même anatomie que la v3.1 web (`apps/web-v2/src/routes/progression.tsx`,
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

    /// **La PORTE est POUSSÉE, plus présentée** (#5843, directive porteur
    /// 2026-09-09).
    ///
    /// Les trois sections s'ouvraient en `.sheet` : une feuille INTERROMPT —
    /// elle se ferme vers le bas, n'entre pas dans l'historique, et le
    /// glissement depuis le bord gauche n'y fait rien. Poussée dans la pile,
    /// la page reçoit les trois gratuitement, et c'est le modèle que servent
    /// déjà l'Android et le web. L'état local disparaît avec la feuille : la
    /// pile EST l'état, et deux pages ne peuvent pas s'y ouvrir en même temps.
    @EnvironmentObject private var router: Router

    /// LE PALIER À CÉLÉBRER quand on touche le hero du dernier succès.
    ///
    /// `AchievementRevealView` existait déjà (#5809) mais n'était atteignable
    /// que depuis une NOTIFICATION : le succès qu'on avait sous les yeux ne se
    /// rejouait pas. Le porteur veut qu'il se retouche — animation et étoiles
    /// comprises.
    @State private var reveal: ProgressionRevealRequest?

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
            // `.consultation` et NON `.celebration` (#5831) : on arrive ici
            // DEPUIS le tableau de bord, où la célébration voudrait « mener »
            // — elle y renverrait à l'écran qu'on n'a pas quitté. Le hero ne
            // montre que de l'OBTENU, d'où `unlocked: true`.
            AchievementRevealView(
                reveal: palier.reveal,
                occasion: .consultation(unlocked: palier.unlocked, reachedAt: palier.reachedAt)
            ) { reveal = nil }
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
                    // L'ÉTAT VIDE, repris de #5831 : sans lui, quelqu'un qui
                    // n'a encore rien fait lit une séquence de heros muets et
                    // trois portes qui n'ouvrent sur rien.
                    if progress.isEmpty {
                        ProgressionNotice(kind: .empty)
                    }
                    /*
                     * LA VUE PARCOURT la séquence, elle ne la compose plus.
                     *
                     * Avant : Meesh → badges → succès → défis, écrit ici ; et
                     * web-v2 écrivait le sien, différent. `ProgressionLayout`
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
                                onOpen: { router.push(.progressionSection(section)) }
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
}
