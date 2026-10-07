import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// L'ÉCRAN « PROGRESSION » (#5698, refondu par #9564) — la PREMIÈRE PAGE du jeu.
///
/// Elle empilait tout (carte du guide, héros, jauges, missions, coffre, ligue, frappe, Flamme, portes) : on n'y
/// lisait plus rien d'un coup d'œil. Elle ne porte désormais que des CARTES, une par concept, dans l'ordre que
/// `ProgressionConcepts` déclare pour le web et pour iOS :
///
///  - au-dessus : la ligne courte de Mee (le guide du moment) et l'entrée « Tableau de bord » ;
///  - la liste : une carte par concept servi — tête (emblème, nom, valeur, chevron), deux ou trois données
///    importantes, le pourquoi et le comment. La carte entière ouvre la FICHE du concept ;
///  - en dessous : Carnet, Comment ça marche, Réglages, en lignes de la même forme.
///
/// **Aucun geste du jeu ne vit ici** : frapper, ouvrir le coffre, changer une mission, protéger ou rallumer la
/// Flamme se font dans la fiche du concept (`ProgressionConceptPage`). Ce que l'écran REFUSE toujours :
///  - lire l'historique des notifications — il restitue l'ÉTAT courant ;
///  - peindre un spinner — squelette à froid, instantané sinon, et hors ligne l'instantané reste affiché avec
///    son avis, jamais un voile.
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

    /// **Une fiche est POUSSÉE, jamais présentée** (#5843, directive porteur 2026-09-09) : poussée dans la pile,
    /// la page reçoit le retour, l'historique et le glissement depuis le bord. Le routeur n'est lu qu'AU TOUCHER
    /// (ou au ramassage d'une ancre), jamais dans le corps : la vue se monte sans lui dans les témoins de rendu.
    @EnvironmentObject private var router: Router

    /// Le décalage du défilement, que seul l'en-tête lit (#6480).
    @State private var scrollRelay = ScrollOffsetRelay()

    /// L'ancre qu'une notification de mission demande (#9539) et la façon de la ramasser UNE fois. Passées PAR l'hôte
    /// (qui tient le routeur) plutôt que lues dans le corps : la vue se monte sans routeur dans les témoins de rendu.
    private let pendingAnchor: GameAnchor?
    private let consumeAnchor: () -> Void

    init(viewModel: ProgressionViewModel? = nil, pendingAnchor: GameAnchor? = nil, consumeAnchor: @escaping () -> Void = {}) {
        _viewModel = StateObject(wrappedValue: viewModel ?? ProgressionViewModel())
        self.pendingAnchor = pendingAnchor
        self.consumeAnchor = consumeAnchor
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
        // Les shaders se compilent à l'OUVERTURE de l'écran, jamais au moment de la
        // célébration (#9381) : la frappe qui joue sa première onde ne doit pas
        // attendre la compilation. Sans effet avant iOS 18, où ils tournent à vide.
        .task { await GameShaders.precompile() }
        // Les réglages du jeu sont ceux du SERVEUR (#9481) : « Jeu masqué » posé depuis un autre appareil se lit ici.
        .task { await GameSettingsSync().refresh() }
        // `.task` rejoue au retour d'une fiche : un geste fait là-bas (frappe, coffre, gel) se relit ici, cache d'abord.
        .task {
            await viewModel.load()
            #if DEBUG
            if viewModel.progress != nil { VitrineRendu.shared.signaler(.progression) }
            #endif
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
                backgroundColor: theme.backgroundPrimary
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

            VStack(spacing: MeeshySpacing.md) {
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
                    // L'ÉTAT VIDE, repris de #5831 : sans lui, quelqu'un qui n'a encore rien fait lit une liste muette.
                    if progress.isEmpty {
                        ProgressionNotice(kind: .empty)
                    }
                    /*
                     * LA VUE PARCOURT la liste des concepts, elle ne la compose pas : `ProgressionConcepts`
                     * (miroir de `progressionConcepts()`) décide de l'ordre et de la présence pour les deux clients.
                     */
                    ProgressionFrontList(
                        viewModel: viewModel,
                        guide: viewModel.guide,
                        photos: viewModel.photos,
                        progress: progress,
                        onOpenConcept: { router.push(.progressionConcept($0)) },
                        onOpenDashboard: { router.push(.progressionDashboard) },
                        onOpenConversations: { router.popToRoot() },
                        onOpenRules: { router.push(.progressionRules(rule: $0)) },
                        onOpenNotebook: { router.push(.progressionNotebook) },
                        onOpenPage: { router.push(.gamePage($0)) }
                    )
                }

                Spacer().frame(height: 40)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.sm)
        }
        .refreshable { await viewModel.load(forceNetwork: true) }
        .coordinateSpace(name: "scroll")
        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollRelay.offset = $0 }      // iOS 16–17
        .trackScrollContentOffset { scrollRelay.offset = -$0 }                               // iOS 18+
        // Le toucher d'une notification de mission (#9539) pose une ANCRE avant l'ouverture : elle se ramasse UNE fois,
        // quand le jeu est à l'écran, et ouvre la FICHE de son concept (#9564) — `initial: true` couvre le démarrage
        // à froid, où l'ancre précède l'écran. Sous « Jeu masqué », elle est ramassée sans rien ouvrir.
        .adaptiveOnChange(of: pendingAnchor != nil && viewModel.game != nil, initial: true) { _, ready in
            guard ready, let anchor = pendingAnchor else { return }
            consumeAnchor()
            guard !GameDevicePrefsStore.current().prefs.hidden else { return }
            let concept = ProgressionConceptModel.concept(for: anchor)
            // La fiche se pousse une fois la première page posée : deux poussées dans la même image se marchent dessus.
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 350_000_000)
                router.push(.progressionConcept(concept))
            }
        }
    }
}
