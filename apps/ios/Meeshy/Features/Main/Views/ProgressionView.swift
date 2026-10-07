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
///  - dans l'en-tête, à droite du titre : le blason de rang et le compteur de Meeshes (amendement n° 2) ;
///  - au-dessus : la ligne courte de Mee (le guide du moment) et l'entrée « Tableau de bord » ;
///  - la liste : une carte par concept servi — tête (emblème, nom, valeur, chevron), deux ou trois données
///    importantes, le pourquoi et le comment. La carte entière ouvre la FICHE du concept ;
///  - en dessous : Carnet, Comment ça marche, Réglages, en lignes de la même forme.
///
/// **Aucun geste du jeu ne vit dans la LISTE** : frapper, ouvrir le coffre, changer une mission, protéger ou
/// rallumer la Flamme se font dans la fiche du concept (`ProgressionConceptPage`) ; le compteur de l'en-tête rouvre
/// sa feuille des Meeshes, comme avant la refonte. Ce que l'écran REFUSE toujours :
///  - lire l'historique des notifications — il restitue l'ÉTAT courant ;
///  - peindre un spinner — squelette à froid, instantané sinon, et hors ligne l'instantané reste affiché avec
///    son avis, jamais un voile.
struct ProgressionView: View {
    @StateObject private var viewModel: ProgressionViewModel

    /// **Une fiche est POUSSÉE, jamais présentée** (#5843, directive porteur 2026-09-09) : poussée dans la pile,
    /// la page reçoit le retour, l'historique et le glissement depuis le bord. Le routeur n'est lu qu'AU TOUCHER
    /// (ou au ramassage d'une ancre), jamais dans le corps : la vue se monte sans lui dans les témoins de rendu.
    @EnvironmentObject private var router: Router
    /// « Jeu masqué » (#9481) : rien du jeu ne paraît alors, ni dans la liste ni dans l'en-tête.
    @ObservedObject private var prefs = GameDevicePrefsStore.current()

    /// L'ancre qu'une notification de mission demande (#9539) et la façon de la ramasser UNE fois. Passées PAR l'hôte
    /// (qui tient le routeur) plutôt que lues dans le corps : la vue se monte sans routeur dans les témoins de rendu.
    private let pendingAnchor: GameAnchor?
    private let consumeAnchor: () -> Void

    init(viewModel: ProgressionViewModel? = nil, pendingAnchor: GameAnchor? = nil, consumeAnchor: @escaping () -> Void = {}) {
        _viewModel = StateObject(wrappedValue: viewModel ?? ProgressionViewModel())
        self.pendingAnchor = pendingAnchor
        self.consumeAnchor = consumeAnchor
    }

    /// Le jeu que l'en-tête montre : aucun sous « Jeu masqué ».
    private var shownGame: GameBlock? { prefs.prefs.hidden ? nil : viewModel.game }
    private var hidesTheGame: Bool { prefs.prefs.hidden && viewModel.game != nil }

    var body: some View {
        // L'EN-TÊTE QUI SE RÉDUIT (#6480), par le gabarit que toutes les pages de Progression partagent (#9564) :
        // grand titre au repos, barre compacte en défilant, retour en verre, dans les trois contextes de
        // présentation (pile iPhone, panneau droit iPad, feuille).
        GamePageScaffold(
            title: String(localized: "progression.title", defaultValue: "Progression", bundle: .main),
            enablesEdgePop: false,
            onRefresh: { await viewModel.load(forceNetwork: true) },
            // Les précisions du rang, ouvertes depuis l'en-tête, offrent « Voir la fiche ».
            onOpenConcept: { router.push(.progressionConcept($0)) },
            trailing: { headerStanding },
            content: { content }
        )
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

    // MARK: - L'en-tête

    /// LE GROUPE DE L'EN-TÊTE (#9564, amendement n° 2) : le blason de rang et le compteur de Meeshes, comme avant
    /// la refonte plus le blason. `nil` ⇒ rien — un solde de zéro montré à quelqu'un qui en a deux serait pire
    /// qu'une absence. La frappe du compteur passe par le MÊME `viewModel.mint()`, donc la même clé d'idempotence.
    @ViewBuilder
    private var headerStanding: some View {
        if !hidesTheGame {
            ProgressionHeaderStanding(
                glory: shownGame?.glory,
                meesh: viewModel.progress?.meesh,
                isMinting: viewModel.isMinting,
                mintError: viewModel.mintError,
                // La pièce que la feuille frappe (#9537) : elle se grave au numéro que le serveur sert.
                next: viewModel.game.map { GameMintNext(number: $0.mint.number, edition: $0.mint.edition) },
                onMint: { Task { await viewModel.mint() } }
            )
        }
    }

    // MARK: - Content

    private var content: some View {
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
                if progress.isEmpty, !hidesTheGame {
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
        }
    }
}
