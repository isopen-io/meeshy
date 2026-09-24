import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// L'ÉCRAN « PROGRESSION » (#5698) — le tableau de bord des streaks & badges
/// (`docs/product/streaks-badges-modele.md` § 9) : le niveau que porte le
/// score, la série qui court et son record, les badges par famille d'axe avec
/// le palier suivant, les succès débloqués et ceux qu'il reste à débloquer.
///
/// Même anatomie que la v3.1 web (`apps/web/src/routes/progression.tsx`,
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

    /// Le décalage du défilement, que seul l'en-tête lit (#6480).
    @State private var scrollRelay = ScrollOffsetRelay()

    init(viewModel: ProgressionViewModel? = nil) {
        _viewModel = StateObject(wrappedValue: viewModel ?? ProgressionViewModel())
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            content

            // L'EN-TÊTE QUI SE RÉDUIT (#6480) — le composant partagé, posé
            // PAR-DESSUS le défilement, comme Réglages : grand titre au repos,
            // barre compacte en défilant, retour en verre.
            VStack(spacing: 0) {
                header
                Spacer()
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
        // Seul ce reader se re-rend au fil du défilement : la racine écrit
        // `scrollRelay.offset` sans s'y abonner (même dispositif que Réglages).
        ScrollOffsetReader(relay: scrollRelay) { offset in
            CollapsibleHeader(
                title: String(localized: "progression.title", defaultValue: "Progression", bundle: .main),
                scrollOffset: offset,
                onBack: { back() },
                titleColor: theme.textPrimary,
                backArrowColor: accentColor,
                backgroundColor: theme.backgroundPrimary,
                trailing: {
                /*
                 * L'ENTRÉE MEESH remplace le trophée (#5839), et devient
                 * l'ACTION de l'en-tête partagé (#6480).
                 *
                 * `nil` quand la passerelle ne sert pas le bloc — l'écran
                 * n'affiche alors RIEN : un solde de zéro montré à quelqu'un qui
                 * en a deux serait pire qu'une absence.
                 */
                if let meesh = viewModel.progress?.meesh {
                    ProgressionMeeshEntry(
                        meesh: meesh,
                        isMinting: viewModel.isMinting,
                        mintError: viewModel.mintError,
                        onMint: { Task { await viewModel.mint() } }
                    )
                }
                }
            )
        }
    }

    // MARK: - Content

    private var content: some View {
        ScrollView(showsIndicators: false) {
            GeometryReader { geo in
                Color.clear.preference(
                    key: ScrollOffsetPreferenceKey.self,
                    value: geo.frame(in: .named("scroll")).minY
                )
            }
            .frame(height: 0)

            Color.clear.frame(height: CollapsibleHeaderMetrics.expandedHeight)

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
                        case .meesh:
                            // LE SOLDE, SOUS LE NIVEAU (#6497). Le même bloc que
                            // la feuille de l'entrée d'en-tête — pas une jumelle :
                            // deux rendus du solde auraient divergé au premier
                            // changement. L'action passe par le MÊME `viewModel.mint()`,
                            // donc la même clé d'idempotence : deux portes, une
                            // seule frappe.
                            if let meesh = progress.meesh {
                                ProgressionMeeshDetail(
                                    meesh: meesh,
                                    isMinting: viewModel.isMinting,
                                    mintError: viewModel.mintError,
                                    onMint: { Task { await viewModel.mint() } }
                                )
                                .padding(MeeshySpacing.lg)
                                .background(
                                    RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                                        .fill(ThemeManager.shared.backgroundSecondary)
                                )
                            }
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
        .coordinateSpace(name: "scroll")
        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollRelay.offset = $0 }      // iOS 16–17
        .trackScrollContentOffset { scrollRelay.offset = -$0 }                               // iOS 18+
    }
}
