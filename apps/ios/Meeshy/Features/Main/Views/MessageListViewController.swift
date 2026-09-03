@preconcurrency import UIKit
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

/// Signposts pour profiler les segments CHAUDS du rendu de la liste dans
/// Instruments (track « Points of Interest ») ET via `XCTOSSignpostMetric` dans
/// les tests. Deux intervalles : `applySnapshot` (prépa snapshot O(n) : reversed
/// + map + groupByDay + diff) et `cellConfig` (config PAR cellule : domainMessage
/// + build `BubbleContent` + `UIHostingConfiguration`). Permet de voir EXACTEMENT
/// quel segment du rendu coûte, par device/iOS, sur un scroll réel.
enum PerfSignpost {
    static let signposter = OSSignposter(
        logHandle: OSLog(subsystem: "me.meeshy.app", category: .pointsOfInterest)
    )
}

/// §3.1 du contrat Focal — le miroir GELÉ `ReadingModeOrchestrator.
/// ConversationReadingMode` (`typealias ConversationReadingMode`, F-080,
/// `Focal/Preferences/ReadingModePreferenceStore.swift`) n'a que ses 5 cas
/// bruts, sans la computed property `usesFlatRow` que le contrat §3.1
/// documente sur le type top-level qui n'a jamais atterri (RE-PREUVE
/// F-080/F-083). Ajoutée ICI (fichier propriété WS-6, F-085) plutôt que
/// dans le Core figé — un simple regroupement de cas, aucune loi, aucune
/// constante numérique (garde R15). RETRAIT FOCAL iOS (2026-08-18) :
/// `usesPerspective` est parti avec le pass — `usesFlatRow` reste (Script).
extension ConversationReadingMode {
    /// `.script` et `.focal` rendent la MÊME rangée plate uniforme ; Focal y
    /// ajoute la perspective minimale au défilement (`FocalScrollPerspective`,
    /// 2026-08-21 — transform + opacity CALayer, zéro relayout).
    var usesFlatRow: Bool { self == .focal || self == .script }
}

final class MessageListViewController: UIViewController {

    // `internal` (et non `private`/`fileprivate`) depuis la sortie du cluster de
    // suivi de lecture vers `MessageListViewController+SeenTracking.swift`
    // (#3947) : en Swift, `private` porte sur le FICHIER.
    var collectionView: UICollectionView!
    var dataSource: UICollectionViewDiffableDataSource<MessageListSection, MessageListItem>!
    let store: MessageStore
    private let currentUserId: String
    private var accentColor: String
    private let isDirect: Bool
    private var isDark: Bool
    private let router: Router
    private let storyViewModel: StoryViewModel
    private let statusViewModel: StatusViewModel
    private let conversationListViewModel: ConversationListViewModel
    private var cancellables = Set<AnyCancellable>()
    private var isLoadingOlder = false
    /// Tracks the item count from the last snapshot so we can detect that the
    /// snapshot grew at all.
    private var previousSnapshotCount: Int = 0
    /// The newest item (index 0 in the inverted layout) from the last snapshot.
    /// A genuinely-new message changes item 0; older-message pagination
    /// prepends to the tail and leaves item 0 untouched. Comparing against
    /// this is deterministic — unlike the `isLoadingOlder` flag, which the
    /// ViewModel's anticipatory prefetch bypasses entirely.
    private var previousNewestItem: MessageListItem?
    /// Running counter of messages that arrived while the user was scrolled
    /// away from the bottom. Reset to 0 when the user returns to near-bottom.
    private var pendingUnreadCount: Int = 0
    /// Cached near-bottom state so applySnapshot can decide whether to bump
    /// the unread badge without querying contentOffset mid-layout.
    private var isCurrentlyNearBottom: Bool = true
    /// Whether the previous snapshot included the typing-indicator cell — lets
    /// the list scroll the indicator into view the moment it first appears.
    private var previouslyShowedTyping: Bool = false

    // MARK: - Slow scroll for quoted message search

    /// Display link that drives the slow continuous scroll while searching
    /// for a quoted message. We keep the speed at ~80pt/s so the user sees
    /// the messages "flow" past without blur, yet fast enough to feel like
    /// the app is actively searching.
    nonisolated(unsafe) private var slowScrollDisplayLink: CADisplayLink?
    /// Points per second the slow scroll advances toward older messages.
    /// In the inverted layout, increasing `contentOffset.y` scrolls visually
    /// upward (toward older messages).
    private let slowScrollSpeed: CGFloat = 80

    /// Maps each message's gateway-side `serverId` (MongoDB ObjectId) to
    /// the client-side `localId` (UUID) that the diffable datasource uses
    /// as its item identifier. Rebuilt from `store.messages` on every
    /// `applySnapshot`. Consulted by `resolveLocalId(_:)` so the reply-tap
    /// path can find a cited message even when the caller hands us a
    /// server id (which is what `ReplyReference.messageId` carries —
    /// gateway sends `replyTo.id`, not the local UUID).
    private var serverIdToLocalId: [String: String] = [:]

    // MARK: Suivi de lecture exact
    /// Traduit les apparitions/disparitions de cellules en messages réellement
    /// lus. Le seuil de présence distingue une lecture d'un défilement.
    /// Voir `docs/superpowers/specs/2026-07-24-read-exactness-design.md`.
    var seenAccumulator = SeenMessageAccumulator()
    /// Uniquement touché depuis le MainActor (`viewDidLoad`,
    /// `dismantleUIViewController`), donc sans `nonisolated(unsafe)` : cette
    /// échappatoire n'était nécessaire que pour un accès en `deinit`, qui a été
    /// supprimé au profit du démontage explicite.
    var seenTimer: Timer?
    var lastSeenActivityMs: Int = 0
    /// Une promotion immédiate a été demandée alors que rien n'était encore
    /// paru à l'écran. Consommé UNE fois par le réveil suivant — sans quoi une
    /// conversation vide relancerait la demande quatre fois par seconde.
    var wantsImmediateSeenFlush: Bool = false
    private var pendingReconfigureMessageIds = Set<String>()
    private var reconfigureDebounceTimer: Timer?

    var onNewMessagesBadge: ((Int) -> Void)?
    var onScrollToMessage: ((String) -> Void)?
    /// Invoked when the scroll position approaches the older-messages
    /// threshold. The parent (typically `ConversationViewModel`) is the
    /// only owner that knows how to chain cache lookup + network fetch
    /// (see `ConversationViewModel.loadOlderMessages`). Going through the
    /// store directly would bypass the network fallback and silently
    /// stall pagination once the local GRDB window is exhausted.
    var onLoadOlder: (() async -> Void)?
    /// Invoked when the scroll position crosses the near-bottom threshold.
    /// Drives the floating "scroll to latest" button in the parent SwiftUI view.
    var onNearBottomChanged: ((Bool) -> Void)?
    /// Invoked when active scrolling (drag or deceleration) starts/stops.
    /// Drives the header ACTION BUTTONS in `ConversationView` (call, search),
    /// which fade while this is true — loi commune `ScrollMotion` : une vue
    /// en mouvement ne montre pas ses boutons d'action. Le header lui-même
    /// (retour, avatar, titre) et la pill de jour restent en place.
    var onScrollingActiveChanged: ((Bool) -> Void)?
    /// Header de conversation déplié (tap sur l'avatar / l'icône de
    /// conversation). Retire entièrement la pill de jour tant qu'il est
    /// ouvert : l'utilisateur vient de demander à voir les détails de la
    /// conversation, la pill les encombrerait.
    var isHeaderExpanded: Bool = false {
        didSet {
            guard isHeaderExpanded != oldValue else { return }
            stickyDayState.isHeaderExpanded = isHeaderExpanded
            // F-086bis (WS-2) : même règle que la pill de jour — un header
            // déplié retire aussi la pilule jour·heure.
            scrollTimePillState.isHeaderExpanded = isHeaderExpanded
        }
    }
    /// Identifiants SERVEUR des messages restés assez longtemps à l'écran pour
    /// compter comme lus. Le gateway ne marque plus lus que les messages qu'un
    /// client lui nomme : sans ce signal, il retombe sur son chemin par fenêtre
    /// temporelle, qui déclarait lus 200 messages quand 10 tenaient à l'écran.
    ///
    /// Voir `docs/superpowers/specs/2026-07-24-read-exactness-design.md`.
    /// `(vus, visibles)` — #3902, deux questions distinctes : ce que la liste a
    /// vu ASSEZ LONGTEMPS, et ce qu'elle MONTRE. La seconde dit le rattrapage.
    var onMessagesSeen: (([String], [String]) -> Void)?
    /// Invoked when the user taps a story reply preview inside a bubble.
    /// Receives the story id (NOT the message id). Wire to the parent's
    /// story viewer presentation logic.
    var onStoryReplyTap: ((String) -> Void)?
    /// Invoked when the user taps the sender avatar's story ring in a bubble
    /// footer. Receives the sender's user id. Wire to the parent's story
    /// viewer presentation logic (singleGroup, first unviewed).
    var onViewSenderStory: ((String) -> Void)?
    /// Invoked when the user swipes a bubble far enough to commit a reply
    /// gesture. Receives the message id of the swiped bubble.
    var onSwipeReply: ((String) -> Void)?
    /// Invoked when the user swipes a bubble in the opposite direction
    /// (forward gesture). Receives the message id of the swiped bubble.
    var onSwipeForward: ((String) -> Void)?
    /// Long press on a bubble — opens the contextual options menu. L'aperçu
    /// élevé est le message NORMAL, dans tous les modes de lecture
    /// (directive 2026-08-23) : voir la note à l'emplacement de l'ancien
    /// `focalOverlayPreview`. Carries the message id and the tapped bubble
    /// cell's on-screen frame (window coords; `nil` when the cell is not
    /// realized), même patron qu'`onAddReaction` — #4004 (2026-08-27) : le
    /// menu longpress ferme le clavier et remonte le message vers le centre
    /// s'il est trop bas, ce qui exige le VRAI frame de la cellule.
    var onLongPress: ((String, CGRect?) -> Void)?
    /// iOS 26+ : builder du contenu `.contextMenu` NATIF (Liquid Glass) d'une
    /// bulle, fourni par `ConversationView`. Quand présent (donc iOS 26+), la
    /// cellule attache le menu natif et DÉSACTIVE le long-press custom.
    var nativeMessageMenu: ((Message) -> AnyView)?
    /// id de la bulle présentée dans l'overlay d'appui long. La cellule live
    /// correspondante passe à `opacity 0` (masquée) le temps de l'overlay —
    /// seule la copie élevée reste visible (anti double-bulle fantôme). Ne
    /// reconfigure QUE les cellules VISIBLES concernées (ancienne + nouvelle) :
    /// les items du diffable sont keyés par `localId`, on résout donc l'id
    /// ciblé via le store, borné aux cellules à l'écran.
    var overlaidMessageId: String? {
        didSet {
            guard oldValue != overlaidMessageId, isViewLoaded else { return }
            let targets = Set([oldValue, overlaidMessageId].compactMap { $0 })
            guard !targets.isEmpty else { return }
            let affected = collectionView.indexPathsForVisibleItems
                .compactMap { dataSource.itemIdentifier(for: $0) }
                .filter { item in
                    guard case .message(let localId) = item,
                          let m = store.domainMessage(for: localId, currentUserId: currentUserId)
                    else { return false }
                    return targets.contains(m.id)
                }
            guard !affected.isEmpty else { return }
            var snap = dataSource.snapshot()
            snap.reconfigureItems(affected)
            applyToDataSource(snap) { [weak self] in
                // Focal : une reconfiguration remet la cellule à plat et sans
                // carte (registration) — la passe la repose aussitôt, sinon la
                // carte du message en focus disparaît jusqu'au prochain tick
                // (à l'ouverture, avant tout défilement : capture 2026-08-21).
                self?.applyFocalPerspectiveToVisibleCells()
            }
        }
    }
    /// **Mode sélection multiple (#4005).** `didSet` gardé (`oldValue !=
    /// newValue`), même patron que `readingMode` : une réaffectation
    /// identique à chaque tick SwiftUI (`updateUIViewController` s'exécute à
    /// chaque re-render) est un no-op — sans la garde, `applySnapshot`
    /// rejouerait à chaque frappe dans le composer, par exemple.
    var isSelectionModeActive: Bool = false {
        didSet {
            guard oldValue != isSelectionModeActive, isViewLoaded else { return }
            applySnapshot(reconfigure: .allItems)
        }
    }
    var selectedMessageIds: Set<String> = [] {
        didSet {
            guard oldValue != selectedMessageIds, isViewLoaded else { return }
            // Retour porteur 2026-08-27 (#515) : `.allItems` reconfigurait
            // TOUTE rangée visible pour une coche qui ne change QUE sur UN
            // message — contraire au gate `.equatable()` (#515) que ce coût
            // existe précisément pour éviter. La différence symétrique des
            // deux `Set` est exactement l'ensemble des id dont l'état de
            // coche a changé.
            //
            // #4022 : la sélection stocke `message.id` (= `serverId ?? localId`,
            // cf. MessageRecord+ToMessage:107), mais les items de la data source
            // sont keyés sur le LOCAL id. Pour un message CONFIRMÉ (serverId ≠
            // localId), `.items(serverId)` ne matchait AUCUNE cellule → la coche
            // s'incrémentait au compteur sans jamais s'afficher. On traduit donc
            // chaque id changé vers son localId (`serverIdToLocalId`, sinon l'id
            // est déjà un localId — message optimiste).
            let changedIds = oldValue.symmetricDifference(selectedMessageIds)
            let changedLocalIds = Set(changedIds.map { serverIdToLocalId[$0] ?? $0 })
            applySnapshot(reconfigure: .items(changedLocalIds))
        }
    }
    /// Bascule la sélection d'UN message — `ConversationView` décide de la
    /// mutation (plafond `ConversationOverlayState.selectionCap` compris),
    /// ce contrôleur ne fait que relayer l'id tapé.
    var onToggleSelection: ((String) -> Void)?
    /// Add reaction. Carries the message id and the tapped bubble cell's
    /// on-screen frame (window coords; `nil` when the cell is not realized)
    /// so the quick-reaction bar can anchor to the bubble.
    var onAddReaction: ((String, CGRect?) -> Void)?
    /// Toggle an existing reaction emoji on a message.
    var onToggleReaction: ((String, String) -> Void)?
    /// BUG2 A' — réaction par-image (attachmentId, messageId, emoji).
    var onReactToAttachment: ((String, String, String) -> Void)?
    /// Open the full reaction picker / list for a message.
    var onOpenReactPicker: ((String) -> Void)?
    /// Open the detail sheet on the message-info tab.
    var onShowMessageInfo: ((String) -> Void)?
    /// Tap on the delivery checkmarks (✓ / ✓✓ / ✓✓ bleu) of a sent message.
    /// Opens the detail sheet on the "vues" tab so the author can inspect who
    /// received / read the message. Only fires for `isMe` messages — received
    /// bubbles never render a delivery check.
    var onShowReadStatus: ((String) -> Void)?
    /// Manual resend of a FAILED outgoing message (id) → `retryMessage`.
    var onRetry: ((String) -> Void)?
    /// Open the detail sheet on the reactions tab.
    var onShowReactions: ((String) -> Void)?
    /// Open the detail sheet on the language / translation tab.
    var onShowTranslationDetail: ((String) -> Void)?
    var onReadMore: ((FocalReadMorePayload) -> Void)?
    /// Lot 3.2 — carte lieu de la rangée plate : plein écran présenté par
    /// ConversationView (même chaîne que `onReadMore`).
    var onFocalTapLocation: ((SharedPlace) -> Void)?
    /// Lot 3.2 — partage d'un fichier téléchargé depuis la rangée plate.
    var onFocalShareFile: ((URL) -> Void)?
    /// Tap on a media attachment — typically presents a fullscreen viewer.
    var onMediaTap: ((MessageAttachment) -> Void)?
    /// Consume a view-once message.
    var onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)?
    /// Request an on-demand translation for a message into a target language.
    var onRequestTranslation: ((String, String) -> Void)?
    /// Tap on a call-summary notice → re-initiate (call back) the same media
    /// type with the conversation peer.
    var onCallBack: ((CallSummaryMetadata) -> Void)?
    /// Long-press on a call-summary notice → request the shared call-detail
    /// sheet (transcript-aware) for that message, via `ConversationView`.
    var onCallDetailRequest: ((String) -> Void)?
    /// Live source of dynamic per-message data (translations, transcriptions,
    /// audio translations, last-message gating). Held weakly: the cell
    /// registration closure runs on the main runloop alongside the VM, but
    /// the controller is otherwise owned by a SwiftUI `Representable` and
    /// must not retain its parent's state. When nil (deallocating), cells
    /// render with empty translation state — the next `applySnapshot` after
    /// re-attachment will refresh them.
    weak var conversationViewModel: ConversationViewModel?

    // MARK: - Mode de lecture rendu (Script/bulles)

    /// Mode de lecture réellement rendu. Décision de l'orchestrateur,
    /// clampée par `ReadingModeController` — **RETRAIT FOCAL iOS
    /// (2026-08-18)** : `.focal` n'atteint plus jamais cet hôte, le pass de
    /// perspective et ses six sites d'appel sont SUPPRIMÉS (code complet au
    /// commit `bce87148c`, doc `docs/focal-retrait-ios-2026-08-18.md`).
    /// Restent DEUX rendus : `.bubbles` (historique) et la rangée plate
    /// uniforme (`usesFlatRow` — Script). Un changement de mode re-registre
    /// toutes les cellules (bulle ↔ rangée plate) et recale les estimations
    /// de hauteur du layout.
    /// Message EN FOCUS (Focal) — l'élu de la ligne, avec hystérésis ; porte
    /// la carte teintée accent. Mis à jour par la passe, jamais par un événement.
    var focalFocusedLocalId: String?
    /// Le message dont la rangée est RENDUE avec ses détails de focus (avatar,
    /// jour + heure, texte plafonné). Rejoint `focalFocusedLocalId` à la pose
    /// (`syncFocalFocusDetails`) — jamais pendant le mouvement : une
    /// reconfiguration change la hauteur de la cellule, et une hauteur qui
    /// change en plein momentum est exactement ce qui faisait boguer l'ancien
    /// pass.
    var focalDetailedLocalId: String?
    /// Reconfiguration des détails du focus : différée et coalescée (voir
    /// `syncFocalFocusDetails`).
    private var focalDetailsSyncScheduled = false
    private var focalReconfigureInFlight = false
    private var focalDetailsPendingAfterApply = false
    /// La SCÈNE Focal est active — perspective posée — seulement pendant un
    /// geste utilisateur et `FocalMetrics.Scene.restDelay` après la pose ;
    /// au repos, tout est Script (directive user 2026-08-21).
    var focalSceneActive = false
    /// Instant d'activation : les ticks de la fenêtre d'entrée animent depuis
    /// la valeur présentée au lieu de sauter.
    var focalSceneEnteredAt: CFTimeInterval = 0
    /// Compte à rebours de l'aplatissement, réarmé à chaque pose, annulé au
    /// premier tick d'un nouveau geste.
    var focalFlattenWork: DispatchWorkItem?

    var readingMode: ConversationReadingMode = .bubbles {
        didSet {
            guard oldValue != readingMode, isViewLoaded else { return }
            // Sous un pane OPAQUE (Rivière/Résumé) la liste se met en VEILLE :
            // son timer de suivi s'arrête, et la passe de reconfiguration
            // INTÉGRALE ci-dessous — qui ne sert qu'à redessiner des cellules
            // dans la pose du nouveau mode — n'a personne à qui montrer son
            // résultat. Elle se rejoue au RETOUR, ce `didSet` étant appelé
            // dans les deux sens (#3947).
            syncThreadQuiescence()
            collectionView.collectionViewLayout.invalidateLayout()
            // #4602 — le mémo de la pastille de jour est aveugle au LAYOUT.
            //
            // `updateStickyDayLabel` sort tôt quand l'item de tête n'a pas
            // changé d'IDENTITÉ (`lastStickyTopItem`) — juste, tant que la
            // géométrie ne bouge pas. Une bascule de mode change les hauteurs
            // de rangée sans changer les items : le même message reste en tête
            // pendant qu'un séparateur de date d'un AUTRE jour entre dans la
            // bande de la pastille. Le mémo faisait alors garder à la sticky
            // le jour d'avant, superposé au séparateur natif — deux pastilles,
            // deux dates, jusqu'au premier défilement qui change l'item de
            // tête (d'où la résorption spontanée en quelques secondes).
            //
            // On VIDE plutôt qu'on ne recalcule ici : `invalidateLayout()` est
            // paresseux, la nouvelle géométrie n'existe pas encore. Le
            // recalcul juste a lieu dans la complétion d'`applySnapshot`
            // ci-dessous, « dès que les cellules sont en place ».
            lastStickyTopItem = nil
            if rendersThread {
                applySnapshot(reconfigure: .allItems)
            }
            applyTopInsetToViews()
            updateScrollTimePillMounting()
            // Entrée/sortie de Focal : les cellules visibles reprennent leur
            // pose (ou la perdent) sans attendre le prochain tick ; la
            // sur-réserve de cellules du layout suit le mode.
            syncFocalOverscan()
            resetFocalPerspectiveOnVisibleCells()
            // Retour d'un pane OPAQUE (Rivière/Résumé) vers un mode RENDU :
            // les cellules déjà à l'écran ne repasseront jamais par
            // `willDisplay`, donc sans cette re-notation elles resteraient
            // éternellement non lues — le trou INVERSE de celui que le gate
            // du suivi de lecture ferme.
            if Self.rendersThread(readingMode), !Self.rendersThread(oldValue) {
                reNoteVisibleCellsAsSeen()
            }
        }
    }
    /// États non encore accusés par le gateway — « message en vol ». Rendu
    /// à 0,7 d'opacité PAR LA RANGÉE PLATE (`FocalRowInput.isOptimistic` —
    /// depuis le retrait du pass, la rangée possède son opacité).
    private static let optimisticStates: Set<MessageState> = [.draft, .queued, .sending]

    /// Estimations de layout — voir `configureCollectionView` pour le
    /// raisonnement. Rangée plate : en-tête + une ligne de texte + marges
    /// (la réserve de barre de focus est retirée avec le mode Focal).
    /// Bulle : la valeur historique, inchangée.
    /// 150 — le point de fonctionnement PROUVÉ stable du solveur self-sizing
    /// (l'abaissement d'essai à 120 pendant le retrait Focal densifiait la
    /// réalisation de cellules par frame au fling, pression en plus sur la
    /// cascade de compensations — revenu à 150 le 2026-08-18).
    private static let estimatedFlatRowLayoutHeight: CGFloat = 150
    private static let estimatedBubbleRowLayoutHeight: CGFloat = 80

    /// **Estimations APPRISES du fil courant** (#4041), une par famille de
    /// rangée : la rangée plate (Focal/Script) et la bulle n'ont pas la même
    /// cote, et une bascule de mode ne doit jamais servir celle de l'autre.
    ///
    /// Les deux constantes ci-dessus ne sont plus la valeur DÉFINITIVE mais
    /// le point de DÉPART : 150 est la cote d'une TÊTE DE GROUPE, alors que
    /// la population dominante d'un fil est la rangée DE SUITE (~51 pt
    /// mesurés). Servir 150 à toutes faisait entrer chaque cellule ~100 pt
    /// trop haute avant qu'elle ne se rétracte — l'« effet de défilement
    /// étiré » de la capture du 2026-08-27.
    ///
    /// L'adoption passe par `MessageListHeightEstimationLaw` et n'a lieu qu'à
    /// la POSE : changer l'estimation change la hauteur de tout le contenu
    /// non mesuré, donc exige le chemin d'invalidation ANCRÉ du layout.
    private var learnedFlatRowHeight: CGFloat?
    private var learnedBubbleRowHeight: CGFloat?

    /// L'estimation servie au provider de section en cet instant.
    private var currentRowHeightEstimate: CGFloat {
        readingMode.usesFlatRow
            ? (learnedFlatRowHeight ?? Self.estimatedFlatRowLayoutHeight)
            : (learnedBubbleRowHeight ?? Self.estimatedBubbleRowLayoutHeight)
    }

    /// Point d'accès de test (#4041) — `internal`, lu par `@testable import
    /// Meeshy`, jamais par une autre cible app.
    var rowHeightEstimateForTesting: CGFloat { currentRowHeightEstimate }

    /// Zone « près du bas » (en points d'offset) : en dessous, l'utilisateur
    /// SUIT la conversation — bouton « aller au bas » masqué, auto-scroll sur
    /// message entrant, et poussée naturelle des insertions en tête. Au-delà,
    /// il LIT l'historique — badge non-lus, et le layout compense les
    /// insertions pour ne jamais déplacer sa lecture (`MessageListLayout`).
    private static let nearBottomFollowThreshold: CGFloat = 200

    /// Points d'accès de test (WS-6, F-085) — `internal`, lus par
    /// `@testable import Meeshy`, jamais par une autre cible app.
    var focalCollectionViewForTesting: UICollectionView? { collectionView }
    var focalDataSourceForTesting: UICollectionViewDiffableDataSource<MessageListSection, MessageListItem>? { dataSource }
    /// Visée vérifiée en cours — lue par les tests pour prouver qu'un saut
    /// se solde (cible flashée puis vidée) au lieu de rester pendant.
    var scrollSettleTargetForTesting: ScrollToMessageSettleLaw.PendingTarget? { scrollSettleTarget }

    // MARK: - WS-2 (F-086bis) — pilule « jour · heure » du fil, montage

    /// État de la pilule (F-081, GELÉ `Focal/Chrome/ScrollTimePillState.swift`)
    /// — piloté ICI par le site 1 existant (`scrollViewDidScroll`) et par le
    /// timer de suivi de lecture déjà en place (`startSeenTracking`), jamais
    /// par un observateur neuf.
    let scrollTimePillState = ScrollTimePillState()
    private var scrollTimePillHost: UIHostingController<AnyView>?
    private var scrollTimePillTopConstraint: NSLayoutConstraint?

    /// Révélé des heures pendant le défilement — le successeur de la pilule
    /// flottante. Alimenté par la MÊME loi (`ScrollTimePillLaw`) et au MÊME
    /// site (§4.8 site 1), donc aucun observateur neuf ; seul le support
    /// change. Injecté dans chaque cellule par `environmentObject`.
    let timestampReveal = FocalTimestampRevealState()

    /// Début du défilement en cours (ms), `nil` au repos — l'une des deux
    /// portes de `FocalMagnificationLaw`.
    private var focalScrollStartedAt: Double?
    /// La magnificence est-elle armée ? Voir `FocalMagnificationLaw` : elle ne
    /// s'arme pas au premier pixel, et une fois armée elle le reste jusqu'à ce
    /// que la scène Focal reparte.
    private var focalMagnificationArmed = false

    init(
        store: MessageStore,
        currentUserId: String,
        accentColor: String,
        isDirect: Bool,
        isDark: Bool,
        router: Router,
        storyViewModel: StoryViewModel,
        statusViewModel: StatusViewModel,
        conversationListViewModel: ConversationListViewModel
    ) {
        self.store = store
        self.currentUserId = currentUserId
        self.accentColor = accentColor
        self.isDirect = isDirect
        self.isDark = isDark
        self.router = router
        self.storyViewModel = storyViewModel
        self.statusViewModel = statusViewModel
        self.conversationListViewModel = conversationListViewModel
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    deinit {
        // Ni vidange ni invalidation du timer ici : `deinit` n'est pas isolé au
        // MainActor et `Timer` n'est pas Sendable — y toucher ne compile pas
        // sous Swift 6. (`CADisplayLink` ci-dessous passe, lui, ce qui rend le
        // geste trompeusement naturel.) Le démontage passe par
        // `dismantleUIViewController`, qui vide puis arrête le suivi ; le timer
        // capture `self` faiblement, donc il ne retient pas ce contrôleur.
        slowScrollDisplayLink?.invalidate()
        slowScrollDisplayLink = nil
    }

    func update(isDark: Bool, accentColor: String) {
        var changed = false
        if self.isDark != isDark { self.isDark = isDark; changed = true }
        if self.accentColor != accentColor { self.accentColor = accentColor; changed = true }
        if changed {
            stickyDayState.isDark = isDark
            // F-086bis (WS-2) : la pilule jour·heure suit le même thème.
            scrollTimePillState.isDark = isDark
            applySnapshot(reconfigure: .allItems)
        }
    }

    /// Reserves vertical clearance at the visual bottom of the list. Because
    /// the collection view is transformed with `scaleY: -1`, what looks like
    /// the bottom on screen is `contentInset.top` in the underlying scroll
    /// view's coordinate space. Same flip applies to the scroll indicator
    /// inset so the bar isn't hidden under the composer.
    func applyBottomInset(_ inset: CGFloat) {
        guard collectionView != nil else { return }
        if collectionView.contentInset.top != inset {
            collectionView.contentInset.top = inset
            collectionView.verticalScrollIndicatorInsets.top = inset
        }
    }

    /// Hauteur de la bande status bar / Dynamic Island que la liste recouvre
    /// depuis que le parent SwiftUI l'étend sous la safe area haute
    /// (`ignoresSafeArea(.container, edges: .top)`, retour user 2026-08-12 :
    /// « de la transparence jusqu'en bordure d'écran »). Fournie par le parent
    /// (`DeviceLayout.safeAreaTop`) et JAMAIS lue via `view.safeAreaInsets` :
    /// sous `ignoresSafeArea`, SwiftUI ne propage plus l'inset au contrôleur
    /// hébergé, la vue croirait la bande inexistante et poserait la pill de
    /// jour sous l'îlot.
    private var topInset: CGFloat = 0

    /// Réserve, AU REPOS, la hauteur de cette bande. Liste inversée : le HAUT
    /// visuel est `contentInset.bottom`. Le contenu la TRAVERSE au défilement
    /// — c'est tout l'objet du changement — il s'y arrête simplement quand le
    /// flux est déroulé jusqu'au message le plus ancien. Recale aussi l'ancre
    /// de la pill de jour, qui reste sous la rangée du header flottant.
    func applyTopInset(_ inset: CGFloat) {
        topInset = inset
        applyTopInsetToViews()
    }

    private func applyTopInsetToViews() {
        guard collectionView != nil else { return }
        // RETRAIT FOCAL iOS (2026-08-18) : plus d'inset de tête §4.5 — le
        // HAUT visuel ne réserve que la bande îlot/barre d'état.
        if collectionView.contentInset.bottom != topInset {
            collectionView.contentInset.bottom = topInset
            collectionView.verticalScrollIndicatorInsets.bottom = topInset
        }
        // INCHANGÉ — garde source ConversationTopChromeFadeTests:119
        stickyDayTopConstraint?.constant = topInset + MessageDayStickyPlacement.topOffset
        // F-086bis (WS-2) : ancre de la pilule jour·heure, si montée.
        scrollTimePillTopConstraint?.constant = topInset + FocalMetrics.Pill.top
    }

    /// État réactif de la pill flottante « Aujourd'hui / Hier / … » posée au
    /// top du collectionView. Mis à jour à chaque `scrollViewDidScroll` et
    /// après `applySnapshot` pour que le label suive le message en haut visible.
    private let stickyDayState = MessageDayStickyState()
    private var stickyDayHost: UIHostingController<MessageDayStickyOverlay>?
    /// Ancre verticale de la pill, recalculée par `applyTopInset` : la vue
    /// s'étendant sous la safe area haute, l'offset produit est
    /// `topInset + MessageDayStickyPlacement.topOffset`.
    private var stickyDayTopConstraint: NSLayoutConstraint?
    /// Défilement actif (drag OU décélération) — `store.isUserScrolling`,
    /// la garde des REPORTS de reconfigure (§4.7ter) : re-mesurer des
    /// cellules pendant que la liste bouge nourrit la cascade self-sizing.
    ///
    /// Ce signal ne pilote PLUS le chrome : les boutons d'action reviennent
    /// dès la LEVÉE du doigt (`setChromeHiddenForScroll`, retour user
    /// 2026-08-18 — « lorsqu'on décélère, les boutons doivent s'afficher
    /// directement »), pas à l'arrêt complet.
    private func setScrollingActive(_ active: Bool) {
        guard store.isUserScrolling != active else { return }
        store.isUserScrolling = active
    }

    /// Chrome escamoté (boutons d'action du header, composeur, pilule de
    /// jour) — piloté par le DOIGT seul (`isDragging`), jamais par la
    /// décélération : dès la levée, tout revient, pendant que la liste file
    /// encore. Dédoublonné aux transitions, jamais à chaque frame.
    ///
    /// La pill de jour suit la même règle en rangée plate ; Bulles :
    /// comportement historique, la pilule suit le défilement.
    private var isChromeHiddenForScroll = false
    /// Offset d'arrivée de la décélération en cours (`nil` hors décélération).
    var decelerationTargetOffsetY: CGFloat?

    private func setChromeHiddenForScroll(_ hidden: Bool) {
        guard isChromeHiddenForScroll != hidden else { return }
        isChromeHiddenForScroll = hidden
        // **Le sticker de date RESTE** (directive 2026-08-24 : « il doit rester
        // lorsque tous les autres composants disparaissent durant le scroll »).
        // Il s'effaçait avec le reste du chrome en Script et en Focal — or
        // c'est pendant le défilement qu'il sert : c'est le seul repère qui
        // dise OÙ l'on est dans le fil. Le reste du chrome continue de se
        // retirer (`onScrollingActiveChanged`).
        stickyDayState.isSuppressed = false
        onScrollingActiveChanged?(hidden)
    }

    /// §4.7ter — un `reconfigureItems` global est arrivé PENDANT le geste et
    /// a été retenu (re-mesurer des cellules visibles en plein défilement
    /// décale tout ce qui est au-dessus d'elles). Rejoué à la pose.
    private var hasDeferredGlobalReconfigure = false

    /// §4.7ter, volet CIBLÉ — les reconfigures par message (traduction
    /// tardive, transcription Whisper, audio traduit, sélection de langue)
    /// arrivés PENDANT le geste. Une traduction qui change le nombre de
    /// lignes re-mesure une cellule visible et décale tout ce qui est
    /// au-dessus — exactement le saut que le report du reconfigure GLOBAL
    /// évitait déjà (audit 2026-08-18 : ce chemin-ci n'était pas gardé).
    private var deferredTargetedReconfigureIds: Set<String> = []

    private func flushDeferredReconfigureAtSettle() {
        if hasDeferredGlobalReconfigure {
            hasDeferredGlobalReconfigure = false
            deferredTargetedReconfigureIds.removeAll()
            let scope = deferredReconfigureScope
            deferredReconfigureScope = .changedRecords
            applySnapshot(reconfigure: scope)
            return
        }
        guard !deferredTargetedReconfigureIds.isEmpty else { return }
        let ids = deferredTargetedReconfigureIds
        deferredTargetedReconfigureIds.removeAll()
        reconfigureMessages(serverIds: ids)
    }

    /// Dernier item de tête pour lequel la sticky pill a été calculée. Permet
    /// d'éviter le recalcul (résolution `store.message` + `toMessage`) à chaque
    /// frame de `scrollViewDidScroll` tant que la cellule de tête ne change pas.
    private var lastStickyTopItem: MessageListItem?

    /// Hauteur visible pour laquelle la sur-réserve Focal a été posée — la
    /// rejouer à chaque layout serait une invalidation par frame.
    private var focalOverscanBoundsHeight: CGFloat = 0

    /// Sur-réserve de cellules du layout (`MessageListLayout.focalOverscan`) :
    /// fraction de la hauteur visible en Focal, `0` ailleurs. Appelée au
    /// changement de mode ET au premier layout (le mode arrive AVANT le
    /// chargement de la vue — `readingMode.didSet` sort alors sur
    /// `isViewLoaded` — donc sans ce rappel la compaction d'ouverture tirait
    /// des rangées vers des cellules qu'UIKit n'avait pas encore réalisées).
    private func syncFocalOverscan() {
        guard isViewLoaded, let layout = collectionView.collectionViewLayout as? MessageListLayout else { return }
        focalOverscanBoundsHeight = collectionView.bounds.height
        // 2026-08-25 : sur-réserve NULLE, tous modes. Elle n'a jamais servi
        // qu'à la COMPACTION (`FocalScrollPerspective.poses` — « des cellules
        // encore hors écran pour UIKit doivent déjà exister pour occuper la
        // place libérée »), qui n'est plus APPLIQUÉE : la loi reste écrite et
        // testée, la passe ne la joue pas. Tant qu'il en est ainsi, Focal
        // pré-réalisait 0,3 hauteur d'écran de cellules par frame pour rien.
        // `overscanFraction` et la machinerie de `MessageListLayout` restent
        // en place : c'est ici que la compaction se rebranche avec elles.
        //
        // Corollaire (F8, revue adversariale 2026-08-25) : `layout.focalOverscan`
        // valant désormais TOUJOURS 0, la comptabilité ci-dessus
        // (`focalOverscanBoundsHeight`, le tracking de `bounds.height`, et le
        // guard de `viewDidLayoutSubviews` en dessous) ne prévient plus
        // aucune invalidation parasite — `MessageListLayout.focalOverscan`
        // déduplique déjà via son `didSet` (`if oldValue != focalOverscan`).
        // C'est de la cérémonie inoffensive, gardée intacte comme point de
        // rebranchement pour quand la compaction reviendra.
        layout.focalOverscan = 0
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard collectionView.bounds.height != focalOverscanBoundsHeight else { return }
        syncFocalOverscan()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        configureCollectionView()
        configureStickyDayOverlay()
        applyTopInsetToViews()
        configureDataSource()
        observeStore()
        // `syncThreadQuiescence()` et non `startSeenTracking()` : le mode de
        // lecture est PERSISTANT et arrive AVANT le chargement de la vue, si
        // bien que son `didSet` y sort sur `isViewLoaded`. Une conversation
        // ouverte DIRECTEMENT en Rivière ou en Résumé — le cas nominal, pas un
        // cas limite — démarrait donc son timer 4 Hz et ne le voyait jamais
        // s'arrêter, faute de changement de mode ultérieur (#3947).
        syncThreadQuiescence()
        // Apply the initial snapshot from whatever the store already holds.
        // The store's `messagesDidChange` PassthroughSubject is fire-and-forget:
        // any emission that happened before this VC subscribed is lost. The
        // ViewModel typically populates the store via `loadInitial()` from its
        // own `init`, which runs BEFORE `viewDidLoad`, so the first refresh
        // emission is missed and the list would render empty even though
        // `store.messages` is non-empty.
        applySnapshot()
        updateScrollTimePillMounting()
        applyTopInsetToViews()
        // `onNewMessagesBadge` only fires on an INCREASE or on the two
        // explicit scroll-to-bottom reset paths — never on "nothing changed,
        // still at rest". A stale nonzero value already held by the SwiftUI
        // `@State` (from before this fresh controller existed) is therefore
        // never corrected on a settled initial load. `pendingUnreadCount` is
        // guaranteed 0 here (first `applySnapshot` never increments it), so
        // this force-syncs the badge to the truth.
        onNewMessagesBadge?(pendingUnreadCount)
    }

    private func configureStickyDayOverlay() {
        stickyDayState.isDark = isDark
        let host = UIHostingController(
            rootView: MessageDayStickyOverlay(state: stickyDayState)
        )
        host.view.backgroundColor = .clear
        host.view.isUserInteractionEnabled = false
        addChild(host)
        view.addSubview(host.view)
        host.didMove(toParent: self)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        // Ancrée au bord HAUT DE LA VUE (qui court désormais jusqu'au bord de
        // l'écran) + `topInset` : la position à l'écran est identique à
        // l'ancrage safe-area d'avant, mais elle ne dépend plus de ce que
        // SwiftUI propage comme safe area au contrôleur hébergé.
        let stickyTop = host.view.topAnchor.constraint(
            equalTo: view.topAnchor,
            constant: topInset + MessageDayStickyPlacement.topOffset
        )
        NSLayoutConstraint.activate([
            stickyTop,
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        stickyDayTopConstraint = stickyTop
        stickyDayHost = host
    }

    // MARK: - WS-2 (F-086bis) — montage de la pilule « jour · heure »

    /// SOUS DRAPEAU : montée/démontée dynamiquement selon `readingMode` —
    /// `.bubbles` ⇒ aucun `UIHostingController` enfant supplémentaire
    /// (contrat §WS-6 « bit-à-bit identique »). Appelée depuis `viewDidLoad`
    /// et depuis le `didSet` de `readingMode`.
    /// **La pilule flottante n'est plus montée — nulle part.**
    ///
    /// Elle datait un POINT DE L'ÉCRAN (« Mercredi · 17:42 » figé en haut),
    /// pendant que le sticker de jour occupait déjà la bande au-dessus et
    /// que chaque rangée portait son heure en permanence : trois chromes
    /// temporels concurrents pour une seule question, « quand ce
    /// message-ci ? ». Seule la rangée sait y répondre.
    ///
    /// `ScrollTimePillState` et sa loi restent en place et continuent d'être
    /// alimentés (`noteScrollTimePillActivity`) — c'est cette même loi qui
    /// pilote désormais `timestampReveal`. Rien n'est réimplémenté ; seul le
    /// SUPPORT de l'information change. Le démontage est inconditionnel pour
    /// qu'un contrôleur recyclé depuis un mode antérieur n'en garde pas une
    /// à l'écran.
    private func updateScrollTimePillMounting() {
        teardownScrollTimePillOverlay()
    }

    /// Second `UIHostingController` enfant, MÊME topologie que
    /// `configureStickyDayOverlay` ci-dessus — `ScrollTimePillOverlay` (F-081,
    /// GELÉ `Focal/Chrome/`) est une vue PURE, aucune modification.
    /// Ancrage/cotes via `FocalMetrics.Pill` (`top` 72, `fadeDuration` déjà
    /// consommé PAR l'overlay lui-même) — jamais un littéral ici (garde R15).
    private func configureScrollTimePillOverlay() {
        scrollTimePillState.isDark = isDark
        scrollTimePillState.isHeaderExpanded = isHeaderExpanded
        let host = UIHostingController(
            rootView: AnyView(
                ScrollTimePillOverlay(state: scrollTimePillState)
                    // Reduce Motion (§4.9, DEUX sources) : « pas d'animation
                    // de fondu ». `ScrollTimePillOverlay` est GELÉ et anime
                    // en interne (`.animation(value: isVisible)`, cote
                    // `FocalMetrics.Pill.fadeDuration`) — désactiver la
                    // TRANSACTION plutôt qu'éditer ce fichier hors périmètre.
                    .transaction { transaction in
                        if MeeshyMotion.shouldReduce(
                            system: UIAccessibility.isReduceMotionEnabled,
                            userForced: false
                        ) {
                            transaction.disablesAnimations = true
                        }
                    }
            )
        )
        host.view.backgroundColor = .clear
        host.view.isUserInteractionEnabled = false
        addChild(host)
        view.addSubview(host.view)
        host.didMove(toParent: self)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        let pillTop = host.view.topAnchor.constraint(
            equalTo: view.topAnchor,
            constant: topInset + FocalMetrics.Pill.top
        )
        NSLayoutConstraint.activate([
            pillTop,
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        scrollTimePillTopConstraint = pillTop
        scrollTimePillHost = host
    }

    private func teardownScrollTimePillOverlay() {
        guard let host = scrollTimePillHost else { return }
        host.willMove(toParent: nil)
        host.view.removeFromSuperview()
        host.removeFromParent()
        scrollTimePillHost = nil
        scrollTimePillTopConstraint = nil
    }

    /// Site 1 (§4.8), RÉUTILISÉ — aucun observateur neuf. Label « jour ·
    /// heure » du message en haut visible, même approche que
    /// `updateStickyDayLabel` (jour seul) mais `createdAt` complet : la
    /// pilule a besoin de l'heure en plus du jour.
    /// Appelée à CHAQUE frame de `scrollViewDidScroll`.
    ///
    /// **Le calcul du libellé a été retiré — c'était du travail MORT.** Il
    /// résolvait le message du haut de l'écran (`indexPathsForVisibleItems
    /// .max()` + `store.message(for:)`) puis formatait « jour · heure »
    /// (`MessageDayLabel` + `TimeStringCache`) pour alimenter
    /// `ScrollTimePillState.label` — c'est-à-dire une pilule qui n'est PLUS
    /// MONTÉE nulle part depuis que les heures sont revenues aux rangées.
    /// Une résolution de message et deux formatages par frame de défilement,
    /// pour un état que plus aucune vue n'observait.
    ///
    /// La LOI, elle, reste alimentée : c'est elle qui décide de la fenêtre du
    /// révélé, et son horloge doit continuer de recevoir chaque événement.
    /// Seul l'étiquetage disparaît.
    ///
    /// L'horodatage est pris UNE fois et partagé par les deux consommateurs :
    /// deux appels à `nowMs()` dans la même frame produisaient deux instants
    /// différents pour un seul et même événement.
    private func noteScrollTimePillActivity() {
        guard readingMode != .bubbles else { return }
        let now = Double(Self.nowMs())
        scrollTimePillState.note(.scrolled(at: now))
        // Même événement, même horloge, même loi — §WS-2 amendement A4
        // (« une loi, deux libellés »), ici un troisième support. C'est ce
        // qui garantit que les heures des rangées s'ouvrent et se referment
        // EXACTEMENT sur le tempo qu'avait la pilule, sans réimplémenter la
        // fenêtre.
        timestampReveal.note(.scrolled(at: now))

        // Magnificence (directive 2026-08-24) : elle ne s'arme ni au premier
        // pixel ni sur un rebond. La vitesse du geste ouvre la porte tout de
        // suite ; un défilement lent mais SOUTENU l'ouvre passé le seuil de
        // durée. Le début de session se pose ici, au premier événement d'une
        // série — `scrollViewDidEndDecelerating` le remet à nil.
        guard readingMode == .focal else { return }
        if focalScrollStartedAt == nil { focalScrollStartedAt = now }
        let velocity = collectionView.panGestureRecognizer.velocity(in: collectionView).y
        let armed = FocalMagnificationLaw.isArmed(
            alreadyArmed: focalMagnificationArmed,
            scrollStartedAt: focalScrollStartedAt,
            now: now,
            velocity: velocity
        )
        if armed != focalMagnificationArmed {
            focalMagnificationArmed = armed
            applyFocalPerspectiveToVisibleCells()
        }
    }

    private func topVisibleMessageDate() -> Date? {
        guard let dataSource,
              let topIndexPath = collectionView.indexPathsForVisibleItems.max(),
              let topItem = dataSource.itemIdentifier(for: topIndexPath),
              case .message(let localId) = topItem,
              let record = store.message(for: localId)
        else { return nil }
        return record.createdAt
    }

    /// Recalcule le label de la pill sticky à partir de la cellule la plus
    /// haute visuellement. Liste inversée : « plus haute » = plus grand index
    /// dans le snapshot diffable. Si le séparateur natif de ce même jour est
    /// déjà visible, on cache la sticky pour éviter le doublon visuel.
    /// `visibleIndexPaths` : l'inventaire déjà lu par l'appelant du tour de
    /// frame (`scrollViewDidScroll`) — `nil` ⇒ lecture interne, pour les
    /// appels hors défilement.
    private func updateStickyDayLabel(visibleIndexPaths: [IndexPath]? = nil) {
        guard let dataSource else { return }
        // O(1) : l'item du haut visible = plus grand IndexPath visible, résolu
        // par `itemIdentifier(for:)`. AVANT : `dataSource.snapshot()` copiait
        // TOUT le snapshot (O(n) item identifiers) à CHAQUE frame de scroll —
        // coûteux sur les grandes conversations (jusqu'à 120 fps en ProMotion).
        guard let topIndexPath = (visibleIndexPaths ?? collectionView.indexPathsForVisibleItems).max(),
              let topItem = dataSource.itemIdentifier(for: topIndexPath) else {
            lastStickyTopItem = nil
            stickyDayState.label = nil
            return
        }
        // La cellule de tête n'a pas changé depuis le dernier calcul → le label
        // est déjà à jour. Évite un `store.message(for:)` + `toMessage`
        // (jusqu'à 5 décodages JSON) à chaque frame tant qu'on reste dessus.
        guard topItem != lastStickyTopItem else { return }
        lastStickyTopItem = topItem

        let calendar = Calendar.current
        let now = Date()
        let topDayStart: Date?
        switch topItem {
        case .dayHeader:
            // Le séparateur natif est l'item du haut — la sticky doublonnerait,
            // on la masque le temps qu'il défile hors écran.
            stickyDayState.label = nil
            return
        case .message(let localId):
            if let record = store.message(for: localId) {
                // Read `createdAt` straight off the record — `toMessage` decodes
                // five JSON blobs (attachments/reactions/reply/forward/call) and
                // we only need the day. This path runs per top-cell change while
                // scrolling; `toMessage().createdAt` is just `record.createdAt`.
                topDayStart = calendar.startOfDay(for: record.createdAt)
            } else {
                topDayStart = nil
            }
        case .typingIndicator:
            topDayStart = nil
        case .conversationStart:
            // R-d : marqueur de tête, jamais un jour — même traitement que
            // le typing (aucune sticky day label à en tirer).
            topDayStart = nil
        }
        guard let dayStart = topDayStart else {
            stickyDayState.label = nil
            return
        }
        let label = MessageDayLabel.label(
            for: dayStart,
            now: now,
            calendar: calendar,
            locale: .current,
            today: String(localized: "date.today", defaultValue: "Aujourd'hui"),
            yesterday: String(localized: "date.yesterday", defaultValue: "Hier"),
            dayBeforeYesterday: String(localized: "date.dayBeforeYesterday", defaultValue: "Avant-hier")
        )
        if stickyDayState.label != label {
            stickyDayState.label = label
        }
    }

    // MARK: - CollectionView Setup

    private func configureCollectionView() {
        // **L'estimation doit coller au mode rendu.**
        //
        // `.estimated(h)` est la hauteur que le layout SUPPOSE avant qu'une
        // cellule ne se mesure. Chaque écart entre cette supposition et la
        // hauteur réelle produit une correction de `contentSize` au moment où
        // la cellule se réalise — et dans une liste INVERSÉE, une correction
        // au-dessus de la zone visible fait RECULER le contenu sous le doigt.
        //
        // Mesuré sur un film utilisateur : au milieu d'un geste régulier
        // (−7, −7, −6, −6, −5…), le contenu repart à +9, +3, +3, +4 avant de
        // reprendre. Ce n'est pas une saccade de rendu, c'est le contenu qui
        // recule.
        //
        // `80` convenait à la bulle. La rangée Focal, elle, réserve désormais
        // en permanence la hauteur d'en-tête focale (34) ET le créneau de la
        // barre de contrôles (28), plus ses marges : elle tourne autour de
        // 150. Supposer 80 garantissait donc une correction de ~70 pt par
        // cellule réalisée, à chaque fois qu'on remonte le fil.
        //
        // Le provider est rappelé à chaque invalidation de layout, il peut
        // donc lire le mode courant — `applyReadingModeChange` invalide déjà.
        // `MessageListLayout` (et pas le compositionnel nu) : les corrections
        // de self-sizing sous la fenêtre et les insertions en tête sont
        // absorbées par `contentOffset` dans la même transaction de layout —
        // sans quoi la scène visible saute (et l'échelle Focal avec elle,
        // `visualMidY` étant fonction de `center.y − offset`).
        let layout = MessageListLayout { [weak self] _, _ in
            // L'estimation est APPRISE du fil courant dès que la liste a
            // posé assez de cellules (#4041) — la constante n'est plus que le
            // point de départ. Repli sur la cote de bulle quand l'hôte est
            // parti : comportement historique de ce closure, inchangé.
            let estimate = self?.currentRowHeightEstimate ?? Self.estimatedBubbleRowLayoutHeight
            let itemSize = NSCollectionLayoutSize(
                widthDimension: .fractionalWidth(1),
                heightDimension: .estimated(estimate)
            )
            let item = NSCollectionLayoutItem(layoutSize: itemSize)
            let groupSize = NSCollectionLayoutSize(
                widthDimension: .fractionalWidth(1),
                heightDimension: .estimated(estimate)
            )
            let group = NSCollectionLayoutGroup.vertical(layoutSize: groupSize, subitems: [item])
            let section = NSCollectionLayoutSection(group: group)
            section.interGroupSpacing = 0
            // 12pt horizontal breathing room so bubbles don't kiss the screen
            // edge — identique dans TOUS les modes depuis le retrait de la
            // loupe (spec §5 réancrée : échelle ≤ 1, aucune réserve à payer ;
            // la date de l'élu retrouve au passage sa pleine largeur).
            section.contentInsets = NSDirectionalEdgeInsets(
                top: 8,
                leading: 12,
                bottom: 8,
                trailing: 12
            )
            return section
        }
        // Même règle « près du bas » que `isCurrentlyNearBottom` : sous ce
        // seuil la poussée naturelle d'un message entrant reste le
        // comportement historique (auto-scroll RC2.1 compris).
        layout.nearBottomThreshold = Self.nearBottomFollowThreshold

        collectionView = UICollectionView(frame: view.bounds, collectionViewLayout: layout)
        collectionView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        collectionView.backgroundColor = .clear
        // La liste est inversée (transform ci-dessous) : l'ajustement
        // automatique poserait la safe area du mauvais côté du flux. Les deux
        // gardes sont donc explicites — `applyBottomInset` (composer, côté
        // `contentInset.top`) et `applyTopInset` (bande îlot, côté
        // `contentInset.bottom`).
        collectionView.contentInsetAdjustmentBehavior = .never
        collectionView.keyboardDismissMode = .interactive
        // Inverted axis: newest messages appear at the bottom while data flows
        // from top of the array. The cell's contentView is counter-flipped in
        // the SwiftUI host so visual content stays right-side-up.
        collectionView.transform = CGAffineTransform(scaleX: 1, y: -1)
        // Disable native status-bar-tap scroll-to-top: with the inverted
        // transform it would scroll to the newest (visual bottom) instead of
        // the oldest (visual top). We handle status-bar taps manually if needed.
        collectionView.scrollsToTop = false
        collectionView.delegate = self
        view.addSubview(collectionView)
    }

    // MARK: - Groupe de rangées (Script/Focal, #3919)

    /// Identifiants (ordre chronologique) du groupe qui se TERMINE au
    /// message `lastLocalId` — remonte `store.messages` tant que le message
    /// précédent CONTINUE le groupe (`MessageDayGrouping`, même règle que
    /// `isFirstInGroup`/`isLastInGroup`). Sert à appliquer un choix de langue
    /// posé sur le drapeau du DERNIER message à tout le groupe qu'il ferme.
    /// Portée non-`private` pour rester directement testable (même patron
    /// que `fireOrDeferRecoveryInvalidation` de `MessageListLayout`).
    func messageIdsInGroup(endingAt lastLocalId: String) -> [String] {
        guard let lastIndex = store.index(of: lastLocalId) else { return [lastLocalId] }
        var ids = [lastLocalId]
        var index = lastIndex
        while index > 0 {
            let current = store.messages[index]
            let previous = store.messages[index - 1]
            let isHead = MessageDayGrouping.isGroupHead(
                previous: .init(
                    senderId: previous.senderId,
                    isSystem: previous.messageSource == MeeshyMessage.MessageSource.system.rawValue,
                    createdAt: previous.createdAt
                ),
                current: .init(
                    senderId: current.senderId,
                    isSystem: current.messageSource == MeeshyMessage.MessageSource.system.rawValue,
                    createdAt: current.createdAt
                )
            )
            if isHead { break }
            ids.append(previous.localId)
            index -= 1
        }
        return ids
    }

    // MARK: - DataSource

    private func configureDataSource() {
        // Cells host their SwiftUI content via UIHostingConfiguration
        // (iOS 16+). The message registration reuses the rich SwiftUI bubble
        // shipped before — avatars, sender chrome, accent gradients,
        // translations, reactions, etc. — without manually mirroring its
        // layout in UIKit. The hosting configuration diff-updates on reuse,
        // so scroll performance is preserved.
        // Une registration PAR type d'item (bulle / séparateur de jour /
        // typing). Avec une registration unique, UIKit recyclait une cellule
        // hébergeant un `BubbleSwipeContainer<…>` pour y poser une
        // configuration `MessageDaySeparator` (et inversement) : le hosting
        // content view existant ne supporte pas le nouveau type racine, UIKit
        // détruit et reconstruit la content view à chaque recyclage croisé
        // (warning runtime `UIContentConfigurationAlertForReplacedContentView`,
        // coût visible au scroll). Des registrations distinctes donnent des
        // pools de réutilisation distincts : chaque cellule ne reçoit que des
        // configurations de son propre type racine et se diff-update en place.

        // Typing indicator — vraie cellule (dernière du flux inversé,
        // donc bas visuel). Pas un overlay : un message reçu en direct
        // s'insère au-dessus et remonte la conversation. La bulle anime
        // ses points en autonomie ; le contre-flip annule la transform.
        let typingRegistration = UICollectionView.CellRegistration<UICollectionViewCell, MessageListItem> { [weak self] cell, _, item in
            guard let self else {
                cell.contentConfiguration = nil
                return
            }
            let typingRoster = self.conversationViewModel?.typingParticipants ?? []
            let typingAccent = self.accentColor
            let typingDark = self.isDark
            // Matrice §5 « Typing indicator » : en rangée plate (Focal/Script),
            // pastille 22 de l'auteur + points pulsants accent SANS capsule ;
            // la capsule reste le rendu du mode bulles.
            let typingFlat = self.readingMode != .bubbles
            cell.contentConfiguration = UIHostingConfiguration {
                TypingIndicatorBubble(
                    participants: typingRoster,
                    accentHex: typingAccent,
                    isDark: typingDark,
                    isFlat: typingFlat
                )
                .scaleEffect(x: 1, y: -1)
            }
            .margins(.all, 0)
            cell.backgroundColor = .clear
        }

        // Séparateur de jour — pill "Aujourd'hui / Hier / Lundi 9 mai"
        // posée entre deux groupes de messages de jours distincts. Le
        // label est recalculé à chaque rendu de cellule afin de suivre
        // le passage de minuit sans avoir à reconstruire la datasource.
        // Les libellés relatifs sont injectés depuis le catalogue de
        // chaînes localisées pour suivre la langue d'interface de l'app.
        let dayHeaderRegistration = UICollectionView.CellRegistration<UICollectionViewCell, MessageListItem> { [weak self] cell, _, item in
            guard let self, case .dayHeader(let dayStart) = item else {
                cell.contentConfiguration = nil
                return
            }
            let label = MessageDayLabel.label(
                for: dayStart,
                now: Date(),
                calendar: .current,
                locale: .current,
                today: String(localized: "date.today", defaultValue: "Aujourd'hui"),
                yesterday: String(localized: "date.yesterday", defaultValue: "Hier"),
                dayBeforeYesterday: String(localized: "date.dayBeforeYesterday", defaultValue: "Avant-hier")
            )
            let dark = self.isDark
            cell.contentConfiguration = UIHostingConfiguration {
                MessageDaySeparator(label: label, isDark: dark)
                    .scaleEffect(x: 1, y: -1)
            }
            .margins(.all, 0)
            cell.backgroundColor = .clear
        }

        // 4ᵉ registration — marqueur « Début de la conversation »
        // (`FocalConversationStartRow`, `Focal/Row/`). RETRAIT FOCAL iOS
        // (2026-08-18) : la rangée vivait dans l'inset de tête du mode
        // Focal, parti avec le pass — `applySnapshot` n'appende plus jamais
        // `.conversationStart` ; cette registration est conservée INERTE
        // pour que le cas d'item reste rendable si le marqueur revient.
        let startRegistration = UICollectionView.CellRegistration<UICollectionViewCell, MessageListItem> { [weak self] cell, _, item in
            guard let self, case .conversationStart = item else {
                cell.contentConfiguration = nil
                return
            }
            let name = self.conversationViewModel?.currentConversationName ?? ""
            let dark = self.isDark
            // Spec §5 « Début de la conversation · {date} » (lot 3.4) : la
            // date du PREMIER message, formatée par la MÊME loi que les
            // séparateurs de jour (MessageDayLabel) — jamais un second
            // formateur. `store.messages` est CHRONOLOGIQUE (le snapshot le
            // renverse, `applySnapshot`) : le plus ancien est `.first`.
            let firstDayLabel: String? = self.store.messages.first.map { oldest in
                MessageDayLabel.label(
                    for: oldest.createdAt,
                    now: Date(),
                    calendar: .current,
                    locale: .current,
                    today: String(localized: "date.today", defaultValue: "Aujourd'hui"),
                    yesterday: String(localized: "date.yesterday", defaultValue: "Hier"),
                    dayBeforeYesterday: String(localized: "date.dayBeforeYesterday", defaultValue: "Avant-hier")
                )
            }
            cell.contentConfiguration = UIHostingConfiguration {
                FocalConversationStartRow(
                    conversationName: name,
                    isDark: dark,
                    firstMessageDayLabel: firstDayLabel
                )
                .scaleEffect(x: 1, y: -1)
            }
            .margins(.all, 0)
            cell.backgroundColor = .clear
        }

        let messageRegistration = UICollectionView.CellRegistration<UICollectionViewCell, MessageListItem> { [weak self] cell, _, item in
            guard let self else {
                cell.contentConfiguration = nil
                return
            }
            let _spState = PerfSignpost.signposter.beginInterval("cellConfig")
            defer { PerfSignpost.signposter.endInterval("cellConfig", _spState) }
            // Étiquette « tête de groupe » (marges de la carte Focal) : remise
            // à zéro à chaque configuration — la branche rangée plate la pose.
            cell.tag = 0

            guard case .message(let localId) = item,
                  let message = self.store.domainMessage(for: localId, currentUserId: self.currentUserId) else {
                cell.contentConfiguration = nil
                return
            }
            let accent = self.accentColor
            let dark = self.isDark
            let direct = self.isDirect
            let myId = self.currentUserId
            let host = self.router
            let stories = self.storyViewModel
            let statuses = self.statusViewModel
            let convList = self.conversationListViewModel

            // Snap dynamic VM-owned state into immutable lets. SwiftUI then
            // sees the bubble depend only on these primitive inputs (Equatable),
            // so VM @Published changes elsewhere don't re-render this cell.
            let vm = self.conversationViewModel
            // Recipient denominator for the all-or-nothing delivery indicator:
            // active conversation members EXCLUDING me. Prefer the gateway's
            // authoritative per-message `recipientCount` (active participants
            // minus the sender, computed server-side at fetch time); fall back to
            // the local member count only when the server did not provide it
            // (`0` — a socket-origin row or an older payload). Direct chats
            // resolve to 1 (the stored status is trusted verbatim); groups require
            // EVERY recipient before the bubble shows ✓✓ / indigo ✓✓.
            let serverRecipients = message.recipientCount
            let recipients = direct
                ? 1
                : (serverRecipients > 0
                    ? serverRecipients
                    : max(1, (vm?.currentConversation?.memberCount ?? 2) - 1))
            let translations = vm?.messageTranslations[message.id] ?? []
            let preferred = vm?.preferredTranslation(for: message.id)
            let transcription = vm?.messageTranscriptions[message.id]
            let translatedAudios = vm?.messageTranslatedAudios[message.id] ?? []
            // Active in-conversation search term — snapped as a primitive so the
            // Equatable bubble highlights matches in search-filter mode. Nil in
            // normal mode (no highlight). The visible cells reconfigure whenever
            // the filtered message set changes (which always accompanies a query
            // change), so the highlight stays in sync.
            let highlightTerm = vm?.currentSearchQuery
            // Galerie audio plein écran : `AudioFullscreenView` n'affiche son
            // pager que si cette liste est non-vide. Sans ce wiring, le tap
            // sur l'icône / chip plein écran d'une bulle audio ouvre un
            // ZStack contenant uniquement le `Color.black` de fond — d'où
            // l'écran noir observé en prod.
            let allAudioItems = vm?.allAudioItems ?? []
            // Cold-open plein écran audio (F1) : sans lecture déjà active, la
            // carte Now Playing / l'avance auto doivent porter le même
            // contexte conversation que `ConversationViewModel.playAudio`
            // (mini-player / lock screen). `audioQueueTail(after:)` est
            // réutilisée telle quelle — jamais redéfinie ici.
            let conversationName = vm?.currentConversationName
            let audioQueueTailProvider: (String) -> [QueuedAudio] = { [weak self] attachmentId in
                self?.conversationViewModel?.audioQueueTail(after: attachmentId) ?? []
            }
            let mentionDisplayNames = vm?.mentionDisplayNames ?? [:]
            let isLastReceived = (vm?.lastReceivedMessageId == message.id)
            let isLastSent = (vm?.lastSentMessageId == message.id)
            let messageId = message.id
            // Flag-strip language selection — VM-owned (lifted out of the
            // bubble's @State so it flows through the Equatable gate). A tap
            // writes back to the VM, whose publisher triggers a targeted
            // reconfigure of this cell with the fresh snapped values.
            let languageSelection = vm?.bubbleLanguageSelections[messageId]
            let setActiveDisplayLanguage: ((String?) -> Void) = { [weak self] code in
                self?.conversationViewModel?.setBubbleActiveDisplayLanguage(code, for: messageId)
            }
            let setSecondaryLanguage: ((String?) -> Void) = { [weak self] code in
                self?.conversationViewModel?.setBubbleSecondaryLanguage(code, for: messageId)
            }
            // Avatar/name tap → profile deep link. Routed through the
            // controller-held Router so the bubble no longer needs the
            // `@EnvironmentObject Router` that re-rendered every visible
            // bubble on every Router publish.
            // Deux fiches, et le discriminant est l'existence d'un COMPTE.
            //
            // `deepLinkProfileUser` présente un compte : bio, bannière, voix,
            // langues — tout cela se demande par `User.id`. Un visiteur entré
            // par lien n'en a aucun ; le lui appliquer ouvrait une feuille vide,
            // exact pendant iOS du lien `/u/{pseudo}` mort côté web. Son
            // identité vit dans CETTE conversation et se demande par le couple
            // `(conversationId, participantId)`.
            // L'avis d'arrivée mène TOUJOURS à la fiche de participation, quelle
            // que soit la porte empruntée : c'est là que vit l'identité fournie
            // en entrant. Un arrivant qui a un compte y figure aussi, simplement
            // sans conditions d'entrée à énoncer.
            let openParticipantProfileHandler: ((String) -> Void) = { [weak self] participantId in
                self?.router.participantProfileTarget = ParticipantProfileTarget(
                    conversationId: message.conversationId,
                    participantId: participantId
                )
            }

            let openProfileHandler: ((ProfileSheetUser) -> Void) = { [weak self] user in
                guard let self else { return }
                if user.isAnonymous, let participantId = user.participantId {
                    self.router.participantProfileTarget = ParticipantProfileTarget(
                        conversationId: message.conversationId,
                        participantId: participantId
                    )
                } else {
                    self.router.deepLinkProfileUser = user
                }
            }
            let user = AuthManager.shared.currentUser
            let userLanguages: (regional: String?, custom: String?) = (
                user?.regionalLanguage,
                user?.customDestinationLanguage
            )
            // Langue de piste AUDIO préférée du Prisme — même loi que
            // `ConversationViewModel.playAudio` (`AudioTrackLanguageResolver`).
            // Alimente le repli du builder pour que le drapeau-toggle d'un
            // vocal SANS traduction texte montre la bonne face et agisse.
            let preferredAudioLang = AudioTrackLanguageResolver.resolve(
                manualOverride: nil,
                originalLanguage: message.originalLanguage,
                preferredLanguages: ConversationLanguagePreferences(user: user).resolved,
                translatedAudios: translatedAudios
            )

            // Capture self weakly inside the @Sendable closure passed as
            // ThemedMessageBubble.onReplyTap. The bubble fires it on tap of
            // a reply chip; we forward to the controller's scroll routine.
            let scrollHandler: ((String) -> Void) = { [weak self] targetId in
                self?.scrollToMessage(localId: targetId)
            }
            let storyReplyHandler = self.onStoryReplyTap
            let swipeReplyHandler = self.onSwipeReply
            let swipeForwardHandler = self.onSwipeForward
            // Wrap the raw handler so each tap also carries the bubble cell's
            // on-screen frame — the quick-reaction bar anchors to it.
            let addReactionHandler: ((String) -> Void) = { [weak self] tappedId in
                guard let self else { return }
                self.onAddReaction?(tappedId, self.cellFrameInWindow(messageId: tappedId))
            }
            // Même patron qu'`addReactionHandler` : le frame de la cellule est
            // résolu ICI (UIKit, `cellFrameInWindow`) et voyage AVEC l'appel —
            // `MessageFramePreferenceKey` (mode Rivière uniquement) ne
            // traverse pas la frontière UIKit pour ce mode-ci (#4004, revue
            // 2026-08-27).
            let longPressHandler: ((String) -> Void) = { [weak self] tappedId in
                guard let self else { return }
                self.onLongPress?(tappedId, self.cellFrameInWindow(messageId: tappedId))
            }
            let toggleReactionHandler = self.onToggleReaction
            let attachmentReactionHandler = self.onReactToAttachment
            let selectionModeActive = self.isSelectionModeActive
            let selectedIds = self.selectedMessageIds
            let toggleSelectionHandler = self.onToggleSelection
            let openReactPickerHandler = self.onOpenReactPicker
            let showInfoHandler = self.onShowMessageInfo
            let showReadStatusHandler = self.onShowReadStatus
            let retryHandler = self.onRetry
            let showReactionsHandler = self.onShowReactions
            let showTranslationHandler = self.onShowTranslationDetail
            let readMoreHandler = self.onReadMore
            let tapLocationHandler = self.onFocalTapLocation
            let shareFileHandler = self.onFocalShareFile
            let callBackHandler = self.onCallBack
            let callDetailHandler = self.onCallDetailRequest
            let mediaTapHandler = self.onMediaTap
            let consumeViewOnceHandler = self.onConsumeViewOnce
            let requestTranslationHandler = self.onRequestTranslation
            let isMine = message.isMe
            // Anneau story de l'expéditeur — snappé en input primitif comme
            // presence/mood : la cellule ne dépend pas du StoryViewModel, le
            // sink storyGroups (observeStore) reconfigure les cellules
            // visibles quand l'état vu/non-vu change.
            let senderId = message.senderId
            let senderRingState: StoryRingState = isMine
                ? .none
                : stories.storyRingState(forUserId: senderId)
            let viewSenderStoryHandler = self.onViewSenderStory

            // Menu d'appui long — DEUX chemins par version d'OS (miroir des
            // lignes de conversation) :
            // - iOS 26+ : menu contextuel NATIF (Liquid Glass) attaché au
            //   contenu SwiftUI via `.nativeMessageContextMenu`. Le builder
            //   vient de `ConversationView` (toutes les actions y sont déjà
            //   résolues) ; on le fige UNE fois en AnyView stable — précédent
            //   anti-crash EXC_BAD_ACCESS de `ConversationRowItem`.
            // - < iOS 26 : overlay custom (long-press du BubbleSwipeContainer
            //   → `onLongPress` → état d'overlay de ConversationView). Le menu
            //   natif UIMenu ne se style pas comme cet overlay.
            var nativeMenu: (() -> AnyView)? = nil
            if #available(iOS 26.0, *), let builder = self.nativeMessageMenu {
                nativeMenu = { builder(message) }
            }

            // Chemin overlay custom uniquement : retirer toute
            // UIContextMenuInteraction que le système aurait posée. Sur le
            // chemin natif on la GARDE — c'est précisément notre menu.
            if nativeMenu == nil {
                cell.interactions
                    .filter { $0 is UIContextMenuInteraction }
                    .forEach { cell.removeInteraction($0) }
            }

            // Bulles avec piste temporelle (audio/vidéo) → swipe résistant :
            // le curseur de lecture se manipule sans déclencher Répondre/
            // Transférer, sauf swipe horizontal franc (seuil relevé).
            let hasTimebasedMedia = message.attachments.contains {
                AttachmentKind(mimeType: $0.mimeType).hasTimebasedTrack
            }
            // Bulle construite UNE fois, réutilisée pour le contenu de cellule
            // ET l'aperçu du `.contextMenu` natif (iOS 26) : l'aperçu élevé
            // montre alors la VRAIE bulle/attachement d'origine.
            // (Equatable re-render gate conservé : le @State restant de la bulle
            // vit sur un CHILD du gate stateless, ses invalidations contournent
            // `==` — topologie du `FeedPostCard().equatable()`.)
            // Fabrique la MÊME bulle en deux tenues : `standalone: false` pour
            // le contenu de cellule (alignement isMe/reçu via les spacers de
            // row) et `standalone: true` pour l'aperçu du `.contextMenu` natif
            // (bulle qui épouse son contenu → platter système collé à la bulle,
            // plus de « card » bordé). Une seule liste de paramètres, pas de
            // duplication de l'init ~40 champs.
            // Mode Bulles : c'est le DERNIER message d'une suite qui porte
            // l'identité — `BubbleStandardLayout.showIdentityBar` s'accroche à
            // `isLastInGroup`, et l'espacement bas aussi (10pt en fin de suite,
            // 2pt à l'intérieur). Ce drapeau était figé à `true`, donc AUCUN
            // regroupement n'existait : chaque bulle reçue montrait son avatar.
            //
            // Même règle de continuité que la tête de groupe du mode Focal
            // (`MessageDayGrouping`) — un message système n'entre dans aucune
            // suite, et deux expéditeurs sans identifiant ne sont pas la même
            // personne.
            let isLastInGroup: Bool = {
                guard let index = self.store.index(of: localId),
                      index + 1 < self.store.messages.count else { return true }
                let next = self.store.messages[index + 1]
                return MessageDayGrouping.isGroupTail(
                    current: .init(
                        senderId: senderId,
                        isSystem: message.messageSource == .system,
                        createdAt: message.createdAt
                    ),
                    next: .init(
                        senderId: next.senderId,
                        // `MessageRecord` porte la source en CHAÎNE, `MeeshyMessage`
                        // l'énumération — comparaison au `rawValue`, pas à un littéral.
                        isSystem: next.messageSource == MeeshyMessage.MessageSource.system.rawValue,
                        createdAt: next.createdAt
                    )
                )
            }()
            let makeThemedBubble: (Bool) -> ThemedMessageBubble = { standalone in
                ThemedMessageBubble(
                        message: message,
                        contactColor: accent,
                        recipientCount: recipients,
                        isDirect: direct,
                        isDark: dark,
                        transcription: transcription,
                        translatedAudios: translatedAudios,
                        textTranslations: translations,
                        preferredTranslation: preferred,
                        // Résolue UNE fois ici (déjà calculée pour la rangée
                        // plate) : la bulle ne la recalcule plus à chaque
                        // évaluation de son body (audit fluidité 2026-08-21).
                        preferredAudioLangCode: preferredAudioLang,
                        showAvatar: !direct,
                        senderStoryRingState: senderRingState,
                        onViewStory: (senderRingState != .none)
                            ? { viewSenderStoryHandler?(senderId) }
                            : nil,
                        onAddReaction: addReactionHandler,
                        onToggleReaction: { emoji in toggleReactionHandler?(messageId, emoji) },
                        onOpenReactPicker: openReactPickerHandler,
                        onShowInfo: { showInfoHandler?(messageId) },
                        onShowReactions: showReactionsHandler,
                        onShowReadStatus: showReadStatusHandler,
                        onRetry: retryHandler,
                        onReplyTap: scrollHandler,
                        onStoryReplyTap: storyReplyHandler,
                        onMediaTap: mediaTapHandler,
                        // LOI DES ZONES (2026-08-24) — les MEMES deux
                        // gestionnaires que la rangee plate, montes ici sur la
                        // peau BULLE, celle que voit tout le monde tant que le
                        // programme beta reste eteint (defaut OFF).
                        onQuotedAuthorTap: { [weak self] ref in
                            self?.openQuotedAuthorProfile(ref)
                        },
                        onQuotedMediaTap: { [weak self] ref in
                            self?.openQuotedMedia(ref)
                        },
                        onConsumeViewOnce: consumeViewOnceHandler,
                        onReactToAttachment: { attId, emoji in attachmentReactionHandler?(attId, messageId, emoji) },
                        onRequestTranslation: requestTranslationHandler,
                        onShowTranslationDetail: showTranslationHandler,
                        onPlayAudio: { [weak self] attachmentId in
                            self?.conversationViewModel?.playAudio(attachmentId: attachmentId)
                        },
                        allAudioItems: allAudioItems,
                        conversationName: conversationName,
                        audioQueueTailProvider: audioQueueTailProvider,
                        onScrollToMessage: scrollHandler,
                        onCallBack: callBackHandler,
                        onLongPressCallDetail: { callDetailHandler?(messageId) },
                        // Le drapeau-toggle pilote AUSSI la piste audio et
                        // ses segments karaoké (user 2026-08-18) — canal
                        // resté mort depuis sa pose (jamais alimenté), le
                        // reste du chemin ThemedMessageBubble →
                        // BubbleStandardLayout → AudioMediaView était déjà
                        // câblé de bout en bout.
                        activeAudioLanguage: languageSelection?.activeDisplayLangCode,
                        isLastInGroup: isLastInGroup,
                        isLastReceivedMessage: isLastReceived,
                        isLastSentMessage: isLastSent,
                        mentionDisplayNames: mentionDisplayNames,
                        highlightSearchTerm: highlightTerm,
                        currentUserId: myId,
                        userLanguages: userLanguages,
                        activeDisplayLangCode: languageSelection?.activeDisplayLangCode,
                        secondaryLangCode: languageSelection?.secondaryLangCode,
                        onSetActiveDisplayLanguage: setActiveDisplayLanguage,
                        onSetSecondaryLanguage: setSecondaryLanguage,
                        onOpenProfile: openProfileHandler,
                        onOpenParticipantProfile: openParticipantProfileHandler,
                        voiceConsentMissing: vm?.voiceConsentMissing ?? false,
                        onTapConsentNotice: { [weak self] in self?.router.push(.settings) },
                        standalone: standalone
                )
            }
            let messageBubble = EquatableMessageBubble(bubble: makeThemedBubble(false)).equatable()

            // WS-7 (F-086) — mux de rangée SOUS DRAPEAU (contrat §WS-6 travail
            // 2) : Focal/Script (FocalRow, WS-4 GELÉ) vs bulle historique.
            // `readingMode.usesFlatRow` (extension F-085) est le SEUL point de
            // branchement — vrai pour `.focal` ET `.script`, jamais pour
            // `.summary`/`.river`/`.bubbles`. Gardé SOUS `if` (pas un ternaire) :
            // la construction (BubbleContent, groupement, présence) ne doit
            // JAMAIS s'exécuter sur le chemin bulle — flag off ⇒ zéro coût
            // additionnel, bit-à-bit identique (contrat §WS-6).
            //
            // ÉCART SIGNALÉ (RE-PREUVE, rapport F-086) : le contrat §WS-6
            // travail 2 assume que WS-6 construit `FocalRowInput` « à partir
            // des lets déjà snapés — aucun calcul nouveau ». Trois lookups
            // s'avèrent RÉELLEMENT nouveaux — aucun équivalent ailleurs dans
            // le dépôt : `isFirstInGroup` (le regroupement vit désormais dans
            // `MessageDayGrouping` — tête ici, queue au-dessus pour les bulles,
            // même règle de continuité), `senderPresence`
            // (`PresenceManager.shared`, déjà utilisé par `ConversationView
            // .headerPresenceState`) et `isRightToLeft`
            // (`collectionView.effectiveUserInterfaceLayoutDirection`,
            // API UIKit standard). Les trois sont des
            // lookups TRIVIAUX via des API déjà établies ailleurs dans le
            // dépôt — signalés, pas improvisés à l'aveugle.
            let focalRow: EquatableFocalRow?
            if self.readingMode.usesFlatRow {
                let record = self.store.message(for: localId)
                let isOptimistic = record.map { Self.optimisticStates.contains($0.state) } ?? false
                let focalContent = BubbleContent(
                    message: message,
                    translations: translations,
                    preferredTranslation: preferred,
                    translatedAudios: translatedAudios,
                    userLanguages: userLanguages,
                    secondaryLangCode: languageSelection?.secondaryLangCode,
                    activeDisplayLangCode: languageSelection?.activeDisplayLangCode,
                    preferredAudioLangCode: preferredAudioLang,
                    currentUserId: myId,
                    recipientCount: recipients
                )
                // « Pseudo · HH:mm en tête de groupe uniquement » (contrat
                // §WS-4) : un message ouvre un nouveau groupe quand son
                // voisin CHRONOLOGIQUEMENT PRÉCÉDENT (`store.messages`,
                // ordre chronologique croissant, `index - 1`) change
                // d'expéditeur ou de jour calendaire. Heuristique standard
                // (iMessage/WhatsApp) — voir écart signalé ci-dessus.
                let isFirstInGroup: Bool = {
                    guard let index = self.store.index(of: localId), index > 0 else { return true }
                    let previous = self.store.messages[index - 1]
                    return MessageDayGrouping.isGroupHead(
                        previous: .init(
                            senderId: previous.senderId,
                            // `MessageRecord` (persistance) porte la source en CHAÎNE,
                            // là où `MeeshyMessage` porte l'énumération — on compare
                            // au `rawValue` plutôt qu'à un littéral.
                            isSystem: previous.messageSource == MeeshyMessage.MessageSource.system.rawValue,
                            createdAt: previous.createdAt
                        ),
                        current: .init(
                            senderId: senderId,
                            isSystem: message.messageSource == .system,
                            createdAt: message.createdAt
                        )
                    )
                }()
                cell.tag = isFirstInGroup ? FocalScrollPerspective.groupHeadCellTag : 0
                let focalInput = FocalRowInput(
                    localId: localId,
                    serverId: record?.serverId,
                    content: focalContent,
                    density: self.readingMode == .script ? .script : .focal,
                    isFirstInGroup: isFirstInGroup,
                    isLastInGroup: isLastInGroup,
                    senderId: senderId,
                    senderDisplayName: message.senderName ?? message.senderUsername ?? "",
                    senderUsername: message.senderUsername,
                    senderAvatarURL: message.senderAvatarURL,
                    senderThumbHash: nil,
                    senderColorHex: message.senderColor ?? accent,
                    senderPresence: PresenceManager.shared.presenceState(for: senderId),
                    senderStoryRing: senderRingState,
                    senderMoodEmoji: statuses.statusForUser(userId: senderId)?.moodEmoji,
                    senderIsAnonymous: message.senderIsAnonymous,
                    accentHex: accent,
                    isDark: dark,
                    isDirect: direct,
                    isRightToLeft: self.collectionView.effectiveUserInterfaceLayoutDirection == .rightToLeft,
                    isOptimistic: isOptimistic,
                    isAgentAuthored: message.messageSource == .agent,
                    // R6-2 — WS-10 A LIVRÉ `isAgentGrammarEnabled`
                    // (`MeeshyFeatureFlags.swift:69`) : ce site le branche
                    // enfin. Le drapeau lui-même reste OFF PAR DÉFAUT (§5.2
                    // du contrat : le chemin serveur non écrivant n'existe
                    // toujours pas — activation soumise à décision produit
                    // écrite, non prise ici) ; brancher le site rend
                    // seulement le levier réel, il ne l'actionne pas.
                    showsAgentGrammar: MeeshyFeatureFlags.isAgentGrammarEnabled,
                    highlightSearchTerm: highlightTerm,
                    mentionDisplayNames: mentionDisplayNames,
                    userLanguages: userLanguages,
                    activeDisplayLangCode: languageSelection?.activeDisplayLangCode,
                    secondaryLangCode: languageSelection?.secondaryLangCode,
                    voiceConsentMissing: vm?.voiceConsentMissing ?? false,
                    transcription: transcription?.text,
                    translatedAudios: translatedAudios,
                    allAudioItems: allAudioItems,
                    conversationName: conversationName ?? "",
                    // Matrice §5 « Effets, mentions, appels » : le bitfield du
                    // message alimente `.messageEffects` de FocalRow — resté
                    // au défaut `.none` jusqu'au 2026-08-18 (feature morte,
                    // audit) : aucune rangée Focal ne jouait le moindre effet.
                    effects: message.effects,
                    // Script/Focal : le (+) d'ajout rapide de réaction sur le
                    // dernier message reçu — même signal que la bulle.
                    isLastReceivedMessage: isLastReceived,
                    // Focal : le message en focus (posé à la POSE par
                    // `syncFocalFocusDetails`) porte ses détails complets.
                    isFocused: self.focalDetailedLocalId == localId,
                    sentAt: message.createdAt,
                    // Pré-calculée ici, jamais dans un body (directive 2026-08-22).
                    focusTimestamp: self.focalDetailedLocalId == localId ? self.focalFocusTimestamp(for: message.createdAt) : nil
                )
                var focalActions = FocalRowActions()
                focalActions.onToggleReaction = { emoji in toggleReactionHandler?(messageId, emoji) }
                focalActions.onAddReaction = addReactionHandler
                focalActions.onOpenReactPicker = openReactPickerHandler
                focalActions.onOpenParticipantProfile = openParticipantProfileHandler
                focalActions.onShowReactions = showReactionsHandler
                focalActions.onShowReadStatus = showReadStatusHandler
                focalActions.onRetry = retryHandler
                focalActions.onReplyTap = scrollHandler
                focalActions.onStoryReplyTap = storyReplyHandler
                focalActions.onMediaTap = mediaTapHandler
                focalActions.onConsumeViewOnce = consumeViewOnceHandler
                focalActions.onReactToAttachment = { attId, emoji in attachmentReactionHandler?(attId, messageId, emoji) }
                focalActions.onRequestTranslation = requestTranslationHandler
                focalActions.onShowTranslationDetail = showTranslationHandler
                focalActions.onReadMore = readMoreHandler
                focalActions.onTapLocation = tapLocationHandler
                focalActions.onShareFile = shareFileHandler
                focalActions.onSetActiveDisplayLanguage = { [weak self] msgId, code in
                    self?.conversationViewModel?.setBubbleActiveDisplayLanguage(code, for: msgId)
                }
                // Rangée ORDINAIRE (jamais magnifiée) montée sur le DERNIER
                // message d'un groupe (#3919) : le choix posé là s'applique
                // à CHAQUE message du groupe qu'elle ferme.
                focalActions.onSetActiveDisplayLanguageForGroup = { [weak self] msgId, code in
                    guard let self else { return }
                    for memberId in self.messageIdsInGroup(endingAt: msgId) {
                        self.conversationViewModel?.setBubbleActiveDisplayLanguage(code, for: memberId)
                    }
                }
                focalActions.onSetSecondaryLanguage = { [weak self] msgId, code in
                    self?.conversationViewModel?.setBubbleSecondaryLanguage(code, for: msgId)
                }
                focalActions.onPlayAudio = { [weak self] attachmentId in
                    self?.conversationViewModel?.playAudio(attachmentId: attachmentId)
                }
                // Parité audio avec le chemin bulle : la MÊME file de lecture
                // continue et le MÊME tap de consentement (→ Réglages) — les
                // deux étaient les seuls câblages absents du lecteur Focal.
                focalActions.audioQueueTailProvider = audioQueueTailProvider
                focalActions.onTapConsentNotice = { [weak self] in self?.router.push(.settings) }
                focalActions.onOpenProfile = openProfileHandler
                // Citations riches (user 2026-08-18), sous LOI DES ZONES
                // depuis le 2026-08-24 : AVATAR → profil de l'auteur CITÉ
                // (le NOM ne l'ouvre plus, il retombe sur le retour au
                // message cité) ; zone média → plein écran / lecture.
                focalActions.onQuotedAuthorTap = { [weak self] ref in
                    self?.openQuotedAuthorProfile(ref)
                }
                focalActions.onQuotedMediaTap = { [weak self] ref in
                    self?.openQuotedMedia(ref)
                }
                // Le « … » de la barre de contrôles ouvre EXACTEMENT le menu
                // de l'appui long — même gestionnaire, donc même liste
                // d'actions (édition, suppression, signalement, traduction),
                // sans qu'aucune seconde liste n'existe à maintenir.
                focalActions.onMore = { _ in longPressHandler(messageId) }
                focalActions.onViewStory = (senderRingState != .none) ? { _ in viewSenderStoryHandler?(senderId) } : nil
                focalActions.onCallBack = { _ in
                    guard let summary = message.callSummary else { return }
                    callBackHandler?(summary)
                }
                focalActions.onLongPressCallDetail = { _ in callDetailHandler?(messageId) }
                focalRow = EquatableFocalRow(row: FocalRow(input: focalInput, actions: focalActions))
            } else {
                focalRow = nil
            }

            // Chips du message en focus SUR la ligne de la carte : elles
            // débordent du bas de la cellule — jamais rognées, et la cellule
            // passe au-dessus de ses voisines le temps du focus.
            let isFocusedCell = self.readingMode.usesFlatRow && self.focalDetailedLocalId == localId
            cell.clipsToBounds = false
            cell.contentView.clipsToBounds = false
            cell.layer.zPosition = isFocusedCell ? 1 : 0

            cell.contentConfiguration = UIHostingConfiguration {
                BubbleSwipeContainer(
                    isMine: isMine,
                    messageId: messageId,
                    messageCreatedAt: message.createdAt,
                    // Masquée pendant que l'overlay d'appui long présente CETTE
                    // bulle : seule la copie élevée reste visible (anti ghost).
                    isHiddenForOverlay: message.id == self.overlaidMessageId,
                    resistance: hasTimebasedMedia ? .resistant : .normal,
                    // Rangée plate : reply à droite/icône gauche, forward à
                    // gauche/icône droite — uniforme, loi `BubbleSwipeResistance`.
                    uniformFlatDirection: self.readingMode.usesFlatRow,
                    onSwipeReply: { swipeReplyHandler?(messageId) },
                    onSwipeForward: { swipeForwardHandler?(messageId) },
                    onLongPress: { longPressHandler(messageId) },
                    // iOS 26+ (menu natif présent) : couper le long-press
                    // custom — le `.contextMenu` natif possède la pression.
                    enableLongPress: nativeMenu == nil,
                    isSelectionModeActive: selectionModeActive,
                    isSelected: selectedIds.contains(messageId),
                    onToggleSelection: { toggleSelectionHandler?(messageId) }
                ) {
                    if let focalRow {
                        focalRow.equatable()
                    } else {
                        messageBubble
                    }
                }
                .environmentObject(host)
                .environmentObject(stories)
                .environmentObject(statuses)
                .environmentObject(convList)
                // Révélé des heures au défilement (successeur de la pilule
                // « jour · heure »). Observé par `FocalRevealedTime` SEULE —
                // une `Text` et rien d'autre — donc son basculement
                // n'invalide jamais la rangée entière ni ne traverse le gate
                // `EquatableFocalRow`.
                .environmentObject(timestampReveal)
                // Counter-flip to undo the parent collectionView.transform.
                .scaleEffect(x: 1, y: -1)
                // iOS 26+ : `.contextMenu` NATIF + aperçu = le RENDU d'origine.
                // En rangée plate (Focal/Script), l'aperçu est LA RANGÉE PLATE
                // (lot 3.3, 2026-08-18 — l'aperçu montrait une BULLE alors que
                // l'utilisateur pressait une rangée plate : deux rendus pour
                // le même message). En bulles : la vraie bulle « standalone »
                // (épouse son contenu, pas de spacers de row), mise à
                // l'échelle SEULEMENT si trop haute (proportions intactes) —
                // « prise de sa position et affichée comme avant » (feedback
                // device 2026-07-14). No-op < iOS 26 → overlay custom.
                .nativeMessageContextMenu(menu: nativeMenu) {
                    MessageMenuPreviewContainer {
                        if let focalRow {
                            focalRow
                                .environmentObject(host)
                                .environmentObject(stories)
                                .environmentObject(statuses)
                                .environmentObject(convList)
                                .environmentObject(self.timestampReveal)
                        } else {
                            makeThemedBubble(true)
                                .environmentObject(host)
                                .environmentObject(stories)
                                .environmentObject(statuses)
                                .environmentObject(convList)
                        }
                    }
                }
            }
            .margins(.all, 0)
            cell.backgroundColor = .clear
            // Cellule (re)configurée : à plat, sans carte. Focal la reposera à
            // l'affichage (`willDisplay`) puis à chaque tick — jamais une pose
            // héritée d'un recyclage.
            FocalScrollPerspective.reset(cell.contentView.layer)
            FocalScrollPerspective.hideFocusCard(in: cell.contentView)
        }

        dataSource = UICollectionViewDiffableDataSource(collectionView: collectionView) { cv, indexPath, item in
            switch item {
            case .message:
                return cv.dequeueConfiguredReusableCell(using: messageRegistration, for: indexPath, item: item)
            case .dayHeader:
                return cv.dequeueConfiguredReusableCell(using: dayHeaderRegistration, for: indexPath, item: item)
            case .typingIndicator:
                return cv.dequeueConfiguredReusableCell(using: typingRegistration, for: indexPath, item: item)
            case .conversationStart:
                return cv.dequeueConfiguredReusableCell(using: startRegistration, for: indexPath, item: item)
            }
        }
    }

    // MARK: - Snapshot

    /// Portée du `reconfigureItems` d'un `applySnapshot`.
    ///
    /// `.changedRecords` (défaut, chemin CHAUD `messagesDidChange`) : seuls
    /// les messages dont le `changeVersion` a bougé depuis la dernière pose
    /// re-passent par la registration — l'égalité O(1) de `MessageRecord`
    /// (invariant grdb-04 : toute écriture visible bumpe la version) est le
    /// pivot. AVANT (audit film user 2026-08-18) : TOUTES les cellules
    /// visibles re-hébergeaient leur SwiftUI à CHAQUE mutation du store — la
    /// file hors-ligne en boucle de retry faisait donc tressauter la scène
    /// ENTIÈRE au repos (re-mesures ± sous-point, pulsation 0,7↔1,0 des
    /// rangées en vol), l'élu compris.
    ///
    /// `.allItems` : bascules GLOBALES qui changent le rendu de toutes les
    /// rangées sans toucher aux records — thème, terme de recherche,
    /// révision de langue préférée, consentement voix.
    enum SnapshotReconfigureScope: Equatable {
        case changedRecords
        case allItems
        /// Reconfigure UNIQUEMENT ces `localId` — retour porteur 2026-08-27
        /// (#515) : la sélection multiple (#4005) posait `.allItems` sur
        /// CHAQUE coche, reconfigurant toute rangée visible pour un état qui
        /// ne change QUE sur UN message. Contraire au gate `.equatable()`
        /// (#515) que ce coût existe précisément pour éviter.
        case items(Set<String>)
    }

    /// Versions posées à la DERNIÈRE pose non différée — la base du diff
    /// `.changedRecords`. PAS mise à jour quand le reconfigure est différé
    /// (§4.7ter) : le flush à la pose retrouve ainsi l'intégralité du delta.
    private var lastReconfigureBaseline: [String: Int64] = [:]
    private var lastTypingRosterFingerprint = ""
    private var lastConversationStartFingerprint = ""
    /// Portée à rejouer au flush §4.7ter — `.allItems` domine si une bascule
    /// globale est arrivée pendant le geste.
    private var deferredReconfigureScope: SnapshotReconfigureScope = .changedRecords

    private func applySnapshot(reconfigure: SnapshotReconfigureScope = .changedRecords) {
        // VEILLE (#3947) — on sort AVANT la construction, pas seulement
        // avant l'application : c'est la PRÉPA qui coûte (O(n) reversed +
        // map + groupByDay + reconstruction de la carte serverId), et elle
        // précède l'entonnoir. Le réveil réapplique `.allItems` depuis
        // `store.messages`, jamais suspendu — il subsume cette passe.
        guard rendersThread else { return }
        let _spState = PerfSignpost.signposter.beginInterval("applySnapshot")
        defer { PerfSignpost.signposter.endInterval("applySnapshot", _spState) }
        // Sous-segments pour pinpointer le coût des 75ms mesurés sur device :
        // `snapshot.build` (prépa O(n) : reversed+map+groupByDay+serverId+
        // reconfigure-scan) vs `snapshot.apply` (dataSource.apply = diff +
        // animation + réalisation des cellules). IDs uniques car imbriqués.
        let _buildState = PerfSignpost.signposter.beginInterval("snapshot.build", id: PerfSignpost.signposter.makeSignpostID())
        var snapshot = NSDiffableDataSourceSnapshot<MessageListSection, MessageListItem>()
        snapshot.appendSections([.main])

        // Liste inversée : index 0 = visuel bas (message le plus récent).
        let reversedMessages = Array(store.messages.reversed())
        let messageItems = reversedMessages.map { MessageListItem.message(localId: $0.localId) }

        // Rebuild the serverId → localId map every time we apply a new
        // snapshot. The reply chip in a bubble carries the cited message's
        // SERVER id (gateway sends `replyTo.id` = MongoDB ObjectId), but the
        // diffable datasource items are keyed on the LOCAL id (UUID minted
        // client-side, kept stable across send → ack). Without this map,
        // `scrollToMessage(localId:)` would never find a reply target that
        // wasn't sent during this session — typical for any reply.
        serverIdToLocalId.removeAll(keepingCapacity: true)
        for record in reversedMessages {
            if let serverId = record.serverId, !serverId.isEmpty {
                serverIdToLocalId[serverId] = record.localId
            }
        }

        // Pour chaque groupe de jour on aligne d'abord les messages dans
        // l'ordre du flux puis on pousse le séparateur juste après — qui se
        // retrouve visuellement AU-DESSUS de ses messages, à la WhatsApp.
        // On part de `messageItems` (sans typing) pour pouvoir conserver le
        // count "messages stricts" plus bas, intact des dayHeader insérés.
        let groups = MessageDayGrouping.groupByDay(
            dates: reversedMessages.map(\.createdAt),
            calendar: .current
        )
        var bodyItems: [MessageListItem] = []
        for group in groups {
            for idx in group.indices {
                bodyItems.append(messageItems[idx])
            }
            bodyItems.append(.dayHeader(dayStart: group.dayStart))
        }

        // The typing indicator is a real cell at index 0 — the visual bottom of
        // the inverted layout, just below the newest message. A live message
        // then inserts at index 1 and pushes the conversation up naturally.
        let showTyping = !(conversationViewModel?.typingParticipants.isEmpty ?? true)
        let items: [MessageListItem] = showTyping ? [.typingIndicator] + bodyItems : bodyItems
        // RETRAIT FOCAL iOS (2026-08-18) : `.conversationStart` vivait dans
        // l'espace réservé par l'inset de tête du mode Focal — plus jamais
        // appendé (registration conservée, inerte).
        snapshot.appendItems(items, toSection: .main)
        // The diffable datasource only re-runs the cell registration closure
        // when an item's IDENTIFIER changes — we key items by `localId` which
        // stays stable across `.sending → .sent → .delivered`, so without
        // explicitly reconfiguring the rows the bubble would render with its
        // first state forever and only flip after the user leaves and re-opens
        // the conversation (which throws the cells away). `reconfigureItems`
        // forces the registration to re-run for every visible row, picking up
        // GRDB-driven state / content / delivery / reaction changes in place
        // without triggering the costly insert/move/delete diff animation.
        //
        // CRITICAL: only reconfigure items that ALREADY exist in the applied
        // snapshot. Reconfiguring an identifier that this same apply is also
        // INSERTING is unsupported — UIKit resolves the insert against the new
        // snapshot and the reconfigure against the old one, and the conflicting
        // instructions can drop a freshly-inserted bubble (the new message
        // flashes in then vanishes when the next message triggers the next
        // apply). Inserted items are configured fresh anyway, so excluding them
        // here is both correct and sufficient.
        let previousItems = Set(dataSource.snapshot().itemIdentifiers)
        // L'empreinte inclut l'AVATAR : la rangée doit se reconfigurer quand le
        // visage d'un frappeur devient connu (il vient d'écrire son premier
        // message du fil), pas seulement quand le roster change de composition.
        let typingRosterFingerprint = (conversationViewModel?.typingParticipants ?? [])
            .map { "\($0.id):\($0.displayName):\($0.avatarURL ?? "")" }
            .joined(separator: "|")
        let startFingerprint = (conversationViewModel?.currentConversationName ?? "")
            + "|" + (reversedMessages.last?.localId ?? "")
        var itemsToReconfigure: [MessageListItem]
        switch reconfigure {
        case .allItems:
            itemsToReconfigure = items.filter { previousItems.contains($0) }
        case .items(let targetLocalIds):
            itemsToReconfigure = targetLocalIds.compactMap { localId in
                let item = MessageListItem.message(localId: localId)
                return previousItems.contains(item) ? item : nil
            }
        case .changedRecords:
            // Seuls les records dont la VERSION a bougé depuis la base — les
            // séparateurs de jour ne se reconfigurent jamais ici (leur libellé
            // ne dépend que de la date ; le passage de minuit est rattrapé par
            // les poses `.allItems`), la cellule typing suit son roster, la
            // rangée « Début de la conversation » son empreinte nom + plus
            // ancien message.
            var changed: [MessageListItem] = []
            for record in reversedMessages {
                let item = MessageListItem.message(localId: record.localId)
                guard previousItems.contains(item) else { continue }
                if lastReconfigureBaseline[record.localId] != record.changeVersion {
                    changed.append(item)
                }
            }
            if showTyping, previousItems.contains(.typingIndicator),
               typingRosterFingerprint != lastTypingRosterFingerprint {
                changed.append(.typingIndicator)
            }
            if items.last == .conversationStart, previousItems.contains(.conversationStart),
               startFingerprint != lastConversationStartFingerprint {
                changed.append(.conversationStart)
            }
            itemsToReconfigure = changed
        }
        // §4.7ter — AUCUN reconfigure global pendant le geste, TOUS MODES.
        //
        // L'exclusion de `.bubbles` est tombée le 2026-08-25 : le report est
        // une règle de FLUIDITÉ, pas une règle de mode — `reconfigureVisibleCells`
        // ne l'a d'ailleurs jamais faite. En bulles aussi, une coche, une
        // réaction ou une traduction arrivée sous le doigt attend donc la
        // pose ; les INSERTIONS, elles, restent immédiates.
        //
        // Reconfigurer une cellule VISIBLE en plein défilement la fait
        // re-mesurer (UIHostingConfiguration neuve) : un texte traduit qui
        // change de nombre de lignes, une image qui vient de charger, et
        // toutes les cellules d'index supérieur se décalent d'un coup —
        // c'est l'un des « sauts d'échelle » mesurés (chasse Fable
        // 2026-08-16, cause n°2 confirmée). Les INSERTIONS restent
        // appliquées immédiatement (la pagination doit matérialiser ses
        // cellules avant que le doigt n'atteigne le bord) — elles
        // n'affectent que le bout non visible du fil. Le reconfigure, lui,
        // attend la pose : `flushDeferredReconfigureAtSettle`. La BASE du
        // diff n'est PAS avancée pendant le report — le flush retrouve tout
        // le delta — et la portée demandée est retenue (`.allItems` domine).
        let isDeferringReconfigure = !itemsToReconfigure.isEmpty
            && (collectionView.isDragging || collectionView.isDecelerating)
        if isDeferringReconfigure {
            hasDeferredGlobalReconfigure = true
            // #4022 — `.allItems` domine toujours ; `.items` s'ACCUMULE (union)
            // au lieu d'être jeté avec `itemsToReconfigure` ci-dessous. Avant ce
            // correctif, seul `.allItems` était retenu ici : un `.items` (coche
            // de sélection, #515) arrivé pendant une décélération perdait
            // silencieusement son id à reconfigurer — le compteur de sélection
            // changeait, la coche visuelle non.
            switch reconfigure {
            case .allItems:
                deferredReconfigureScope = .allItems
            case .items(let ids):
                if case .items(let pending) = deferredReconfigureScope {
                    deferredReconfigureScope = .items(pending.union(ids))
                } else if deferredReconfigureScope != .allItems {
                    deferredReconfigureScope = .items(ids)
                }
            case .changedRecords:
                break
            }
            itemsToReconfigure = []
        } else {
            lastReconfigureBaseline = Dictionary(
                uniqueKeysWithValues: reversedMessages.map { ($0.localId, $0.changeVersion) }
            )
            lastTypingRosterFingerprint = typingRosterFingerprint
            lastConversationStartFingerprint = startFingerprint
        }
        if !itemsToReconfigure.isEmpty {
            // JAMAIS de reconfigure HORS ÉCRAN (rouleau, user 2026-08-18) :
            // re-héberger une cellule invisible fait transitoirement
            // retomber sa hauteur à l'ESTIMÉE par le chemin self-resizing
            // (qui ne passe par AUCUNE compensation — même canal que le
            // SIGTRAP), le contentSize s'effondre et l'offset est re-clampé
            // vers le bas : chaque tick d'outbox « rappelait » la scène au
            // bas. Une cellule invisible n'a RIEN à reconfigurer : sa
            // prochaine RÉALISATION relit le record frais via la
            // registration. Seules les cellules visibles re-hébergent.
            let visibleItems = Set(
                collectionView.indexPathsForVisibleItems.compactMap { dataSource.itemIdentifier(for: $0) }
            )
            let visibleToReconfigure = itemsToReconfigure.filter { visibleItems.contains($0) }
            if !visibleToReconfigure.isEmpty {
                snapshot.reconfigureItems(visibleToReconfigure)
            }
        }

        // Detect genuinely-new messages: the MESSAGE count grew AND the newest
        // message changed. Tracking message items only (never the typing cell)
        // means the typing indicator toggling on/off can never be mistaken for
        // a new message nor bump the unread badge. Older-message pagination
        // prepends to the tail and leaves the newest untouched, so it never
        // counts — including the ViewModel's anticipatory prefetch, which
        // loads older pages from an internal Task that bypasses the
        // `isLoadingOlder` flag entirely (the flag is therefore NOT a
        // reliable discriminator). The very first load
        // (previousSnapshotCount == 0) is excluded.
        let newCount = messageItems.count
        let delta = newCount - previousSnapshotCount
        let newestItem = messageItems.first
        // Un item RÉINSÉRÉ (retry outbox qui retire puis rejoue le même
        // localId — churn ~1/s gateway coupée) n'est PAS un nouveau message :
        // exiger que le newest soit ABSENT du snapshot précédent. Sans ce
        // discriminant, chaque tick de retry « recollait » la vue au bas.
        let hasGenuinelyNewMessages = delta > 0
            && previousSnapshotCount > 0
            && newestItem != previousNewestItem
            && newestItem.map { !previousItems.contains($0) } ?? false
        // RC2.1 — when the user is following the conversation (near bottom),
        // auto-scroll onto the new message; otherwise bump the unread badge.
        // The typing cell appearing also auto-scrolls (when near bottom) so it
        // stays visible just below the last message.
        //
        // JAMAIS pendant un geste ni un momentum (rouleau, user 2026-08-18) :
        // un `scrollToBottom` posé au milieu d'un fling TUE la décélération —
        // la liste semblait « avaler » chaque tentative de remonter dès
        // qu'un tick d'outbox tombait. Le doigt et l'inertie ont toujours
        // priorité sur le confort de suivi.
        let typingJustAppeared = showTyping && !previouslyShowedTyping
        let isGestureOrMomentumActive = collectionView.isDragging
            || collectionView.isDecelerating
            || collectionView.isTracking
        let shouldAutoScroll = (hasGenuinelyNewMessages || typingJustAppeared)
            && isCurrentlyNearBottom
            && !isGestureOrMomentumActive
        // Le badge non-lus ne compte JAMAIS un message dont l'utilisateur est
        // l'AUTEUR : envoyer depuis l'historique (rangée optimiste insérée en
        // bas pendant qu'on lit plus haut) n'est pas un « nouveau message à
        // lire » (matrice §5, audit 2026-08-18). Le seuil regarde le PLUS
        // RÉCENT : un envoi propre accompagné d'un vrai message entrant dans
        // le même batch reste compté par le delta.
        let newestIsOwnMessage: Bool = {
            guard case .message(let localId) = newestItem,
                  let record = store.message(for: localId) else { return false }
            return record.senderId == currentUserId
        }()
        if hasGenuinelyNewMessages && !isCurrentlyNearBottom && !newestIsOwnMessage {
            pendingUnreadCount += delta
            onNewMessagesBadge?(pendingUnreadCount)
        }
        previousSnapshotCount = newCount
        previousNewestItem = newestItem
        previouslyShowedTyping = showTyping

        // Scroll in the apply completion handler so the new item exists in the
        // layout before `scrollToItem` runs (apply is asynchronous for the
        // animated diff path).
        PerfSignpost.signposter.endInterval("snapshot.build", _buildState)
        // ROULEAU (directive user 2026-08-18) : AUCUNE animation d'insertion
        // ni de suppression, jamais — ni slide-in de message entrant, ni
        // apparition du typing, ni bulk-load. Les rangées existent dans le
        // flux avant d'être visibles ; le SEUL mouvement à l'écran est celui
        // du défilement lui-même. (La trace device montrait déjà que l'apply
        // ANIMÉ était le coût dominant — 2136 ms sur 17 applies.)
        // Stabilité du champ visuel — les hauteurs des items SUPPRIMÉS sous
        // la fenêtre (typing indicator qui s'éteint, message effacé déjà
        // défilé) ne seront plus lisibles pendant le batch update : mesurées
        // ICI sur le layout encore courant, déposées au layout qui les
        // absorbera dans `contentOffset` (cf. `MessageListLayout`). Posé à
        // CHAQUE apply — un dépôt non consommé ne doit jamais survivre à
        // l'update suivant.
        let deletedBelowWindowHeight: CGFloat = previousItems
            .subtracting(Set(items))
            .compactMap { dataSource.indexPath(for: $0) }
            .compactMap { collectionView.layoutAttributesForItem(at: $0) }
            .filter { $0.frame.minY < collectionView.contentOffset.y }
            .reduce(0) { $0 + $1.frame.height }
        (collectionView.collectionViewLayout as? MessageListLayout)?
            .noteUpcomingDeletionCompensation(height: deletedBelowWindowHeight)
        let _applyState = PerfSignpost.signposter.beginInterval("snapshot.apply", id: PerfSignpost.signposter.makeSignpostID())
        applyToDataSource(snapshot) { [weak self] in
            PerfSignpost.signposter.endInterval("snapshot.apply", _applyState)
            guard let self else { return }
            // La pill flottante doit refléter le nouveau top du flux dès que
            // les cellules sont en place (insertion d'un nouveau message, etc.).
            self.updateStickyDayLabel()
            self.applyFocalPerspectiveToVisibleCells()
            // Au repos (ouverture, message entrant sans geste en cours), le
            // message en focus reçoit ses détails sans attendre une pose de
            // défilement qui ne viendra pas ; pendant un geste, `settleAtRest`
            // s'en charge à la levée — jamais une hauteur qui change en plein
            // momentum.
            if !self.store.isUserScrolling {
                self.syncFocalFocusDetails()
                // À l'OUVERTURE, la liste a posé ses premières cellules sans
                // qu'aucun geste n'ait eu lieu : sans cette adoption, le tout
                // premier défilement — celui de la capture #4041 — serait le
                // seul à rester étiré.
                self.adoptRowHeightEstimateIfWorthwhile()
            }
            if shouldAutoScroll {
                // Le rouleau avance d'un cran, net — pas de ressort.
                self.scrollToBottom(animated: false)
            }
        }
    }

    // MARK: - Verrou de scène (rouleau)

    /// L'ancre du VERROU DE SCÈNE : la rangée du bord haut de l'écran et le
    /// décalage de l'offset par rapport à elle, capturés tant que
    /// l'utilisateur pilote (geste, momentum, scroll intentionnel). Loin du
    /// bas, TOUT mouvement d'offset qui n'est PAS piloté est annulé
    /// sur-le-champ en restaurant cette ancre — quel que soit le mécanisme
    /// du saut (re-hosting qui repasse par la hauteur estimée, clamp d'un
    /// contentSize transitoirement effondré, corrections du solveur
    /// self-sizing : tous reproduits au simulateur 2026-08-18, aucun
    /// compensable à sa source car le chemin self-resizing des cellules
    /// hosting ne traverse aucun hook du layout). C'est la loi du ROULEAU :
    /// la scène n'appartient qu'au doigt.
    private var sceneLockAnchor: (item: MessageListItem, offsetDelta: CGFloat)?

    /// Vrai pendant un défilement programmatique VOULU (saut recherche/
    /// citation, slow-scroll de recherche) — le verrou laisse faire.
    private var isIntentionalProgrammaticScroll = false

    // MARK: - Visée vérifiée (saut vers un message)

    /// Cible d'un saut en cours de VÉRIFICATION (`ScrollToMessageSettleLaw`).
    /// `scrollToItem` vise un offset calculé sur des hauteurs ESTIMÉES : les
    /// cellules qui se réalisent pendant l'animation décalent le contenu et
    /// l'atterrissage rate la cible. À chaque fin d'animation, la loi compare
    /// l'offset atteint à l'offset qui centrerait la cible (attributs FRAIS)
    /// et re-vise tant que l'écart dépasse la tolérance, budget borné.
    /// Annulée dès que le doigt reprend la main (`scrollViewWillBeginDragging`)
    /// ou qu'un autre scroll voulu part (`scrollToBottom`, slow-scroll).
    private var scrollSettleTarget: ScrollToMessageSettleLaw.PendingTarget?

    /// Démarre une visée vérifiée vers `localId` (déjà résolu, présent dans le
    /// snapshot à `indexPath`). Le flash n'est plus émis à l'AVEUGLE sur un
    /// délai — il part à la POSE vérifiée, quand la cellule est réellement là.
    private func beginVerifiedScroll(toLocalId localId: String, at indexPath: IndexPath, strong: Bool) {
        // L'index vient du SNAPSHOT (`dataSource.snapshot()`), qui peut être
        // en avance sur ce que la collection view a déjà INGÉRÉ (apply en
        // vol) : `scrollToItem` sur un index pas encore matérialisé lève une
        // NSInternalInconsistencyException. Le trigger parent re-visera une
        // fois la fenêtre posée — même contrat que la cible absente.
        guard indexPath.item < collectionView.numberOfItems(inSection: 0) else { return }
        isIntentionalProgrammaticScroll = true
        scrollSettleTarget = ScrollToMessageSettleLaw.PendingTarget(localId: localId, strong: strong)
        collectionView.scrollToItem(at: indexPath, at: .centeredVertically, animated: true)
        scheduleScrollSettleFallback()
    }

    /// Filet du no-op : un `scrollToItem(animated: true)` DÉJÀ à l'offset
    /// cible ne livre jamais `scrollViewDidEndScrollingAnimation`. Si l'offset
    /// n'a pas bougé d'ici là (aucune animation n'a démarré), la vérification
    /// se joue ici ; s'il a bougé, l'animation vit encore et son épilogue
    /// (`scrollViewDidEndScrollingAnimation`) s'en charge.
    private func scheduleScrollSettleFallback() {
        let capturedOffsetY = collectionView.contentOffset.y
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            guard let self, self.scrollSettleTarget != nil else { return }
            guard !self.collectionView.isDragging, !self.collectionView.isDecelerating else { return }
            guard abs(self.collectionView.contentOffset.y - capturedOffsetY) < 0.5 else { return }
            self.verifyScrollSettleTarget()
        }
    }

    /// Fin d'une passe : la loi tranche — posé (flash), re-visée (nouvelle
    /// animation, budget décrémenté), ou abandon (flash sur place, la cible
    /// est de toute façon à l'écran ou presque).
    private func verifyScrollSettleTarget() {
        guard var target = scrollSettleTarget else { return }
        guard let dataSource,
              let indexPath = dataSource.indexPath(for: .message(localId: target.localId)),
              let attrs = collectionView.layoutAttributesForItem(at: indexPath)
        else {
            // Cible sortie du snapshot (changement de fenêtre) — le chemin
            // parent (jumpToQuotedMessage) reprendra avec son propre trigger.
            scrollSettleTarget = nil
            return
        }
        let desired = ScrollToMessageSettleLaw.centeredOffsetY(
            itemFrame: attrs.frame,
            boundsHeight: collectionView.bounds.height,
            contentHeight: collectionView.contentSize.height,
            topContentInset: collectionView.contentInset.top,
            bottomContentInset: collectionView.contentInset.bottom
        )
        switch ScrollToMessageSettleLaw.verdict(
            currentOffsetY: collectionView.contentOffset.y,
            desiredOffsetY: desired,
            passesRemaining: target.passesRemaining
        ) {
        case .settled, .giveUp:
            scrollSettleTarget = nil
            isIntentionalProgrammaticScroll = false
            captureSceneLockAnchor()
            flashCell(at: indexPath, strong: target.strong)
        case .correct:
            target.passesRemaining -= 1
            scrollSettleTarget = target
            isIntentionalProgrammaticScroll = true
            collectionView.scrollToItem(at: indexPath, at: .centeredVertically, animated: true)
            scheduleScrollSettleFallback()
        }
    }

    /// `visibleIndexPaths` : l'inventaire déjà lu par l'appelant du tour de
    /// frame (`scrollViewDidScroll`) — `nil` ⇒ lecture interne, pour les
    /// appels hors défilement (`scrollToBottom`, `settleAtRest`).
    private func captureSceneLockAnchor(visibleIndexPaths: [IndexPath]? = nil) {
        // Appelé à CHAQUE frame de défilement : une seule lecture d'attributs
        // par cellule visible (le `max(by:)` en relisait deux par comparaison,
        // soit ~2·n·log n par frame — audit fluidité 2026-08-21).
        var topIndexPath: IndexPath?
        var topAttributes: UICollectionViewLayoutAttributes?
        for indexPath in visibleIndexPaths ?? collectionView.indexPathsForVisibleItems {
            guard let attributes = collectionView.layoutAttributesForItem(at: indexPath) else { continue }
            if let current = topAttributes, attributes.frame.minY <= current.frame.minY { continue }
            topIndexPath = indexPath
            topAttributes = attributes
        }
        guard let dataSource,
              let topIndexPath,
              let attrs = topAttributes,
              let item = dataSource.itemIdentifier(for: topIndexPath)
        else {
            sceneLockAnchor = nil
            return
        }
        sceneLockAnchor = (item, collectionView.contentOffset.y - attrs.frame.minY)
    }

    /// Restaure l'ancre si la scène a bougé sans pilote (> 2 pt). Sans
    /// animation — le rouleau ne rebondit pas.
    private func enforceSceneLock() {
        guard let sceneLockAnchor, let dataSource,
              let indexPath = dataSource.indexPath(for: sceneLockAnchor.item),
              let attrs = collectionView.layoutAttributesForItem(at: indexPath)
        else { return }
        let target = max(0, attrs.frame.minY + sceneLockAnchor.offsetDelta)
        guard abs(collectionView.contentOffset.y - target) > 2 else { return }
        collectionView.setContentOffset(CGPoint(x: 0, y: target), animated: false)
    }

    // MARK: - Observation

    private func observeStore() {
        store.messagesDidChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                self?.applySnapshot()
            }
            .store(in: &cancellables)

        // GRDB-driven changes (insert / state transition / delivery / read)
        // already trigger `messagesDidChange` and re-snapshot. But translation
        // / transcription / audio-translation events arrive via Socket.IO
        // and only update `@Published` dictionaries on the ViewModel — they
        // never touch GRDB so the diffable datasource never sees them. Force
        // a snapshot reconfigure when those publishers fire so the cell
        // registration re-runs and `resolveBubbleData` picks the new payload
        // up. Coalesce by 80ms to absorb multilingual bursts (the SDK
        // already collects translation events on that interval, so two
        // collapsed re-snapshots is the worst case).
        guard let vm = conversationViewModel else { return }

        observePerMessageDictionary(vm.$messageTranslations, initial: vm.messageTranslations)
        observePerMessageDictionary(vm.$messageTranscriptions, initial: vm.messageTranscriptions)
        observePerMessageDictionary(vm.$messageTranslatedAudios, initial: vm.messageTranslatedAudios)
        observePerMessageDictionary(vm.$activeTranslationOverrides, initial: vm.activeTranslationOverrides)
        // Flag-strip selection lifted out of the bubble's @State — a tap
        // writes to the VM; reconfigure the touched cell so the bubble
        // re-renders with the fresh snapped inputs (the Equatable gate sees
        // them change and lets the body re-run).
        observePerMessageDictionary(vm.$bubbleLanguageSelections, initial: vm.bubbleLanguageSelections)

        vm.$preferredLanguageRevision
            .receive(on: DispatchQueue.main)
            .dropFirst()
            .sink { [weak self] _ in
                // Preferred language revision change requires full reconfigure of all items
                self?.applySnapshot(reconfigure: .allItems)
            }
            .store(in: &cancellables)

        vm.$voiceConsentMissing
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .dropFirst()
            .sink { [weak self] _ in
                self?.applySnapshot(reconfigure: .allItems)
            }
            .store(in: &cancellables)

        // In-conversation search term changes (enter / exit / refine the
        // filtered-conversation search) require re-running the cell registration
        // so each bubble shows or clears the highlight. `applySnapshot`
        // reconfigures every existing item in place — same full-reconfigure
        // pattern as preferredLanguageRevision. The set change on enter/exit
        // already triggers this; the explicit sink also covers a refinement
        // that keeps the same match set but a different term.
        vm.$currentSearchQuery
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .dropFirst()
            .sink { [weak self] _ in
                self?.applySnapshot(reconfigure: .allItems)
            }
            .store(in: &cancellables)

        // Typing roster — re-snapshot : la cellule typing entre/sort du flux
        // comme toute rangée du rouleau, sans animation. Low-frequency signal, no debounce.
        // Uses stateStore publisher so typing doesn't trigger full ConversationViewModel re-render.
        vm.typingParticipantsPublisher
            .receive(on: DispatchQueue.main)
            .dropFirst()
            .sink { [weak self] _ in
                self?.applySnapshot()
            }
            .store(in: &cancellables)

        // Anneaux story des avatars expéditeurs — l'état vu/non-vu vit dans
        // StoryViewModel (jamais dans GRDB), donc aucun chemin existant ne
        // reconfigure les cellules quand il change. Fingerprint id:hasUnviewed
        // pour ignorer les mutations sans effet sur l'anneau (compteurs de
        // vues, réactions…) ; la reconfiguration ne touche que les cellules
        // visibles — les autres re-snappent l'état à leur prochaine config.
        storyViewModel.$storyGroups
            .map { groups in
                groups.map { "\($0.id):\($0.hasUnviewed)" }.joined(separator: ",")
            }
            .removeDuplicates()
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.reconfigureVisibleCells()
            }
            .store(in: &cancellables)

        // Présence 1/3/5 sur la pastille d'identité (matrice §5) — l'état
        // vit dans PresenceManager, hors GRDB : aucun chemin existant ne
        // reconfigurait les rangées quand il change, la pastille restait
        // FIGÉE à l'état de sa dernière configuration (audit 2026-08-18).
        // Même canal que les anneaux story : `refreshSignal.presenceVersion`
        // est publié pour ça (débouncé, un tick par rafale d'événements),
        // reconfiguration des seules cellules visibles — les autres
        // re-snappent à leur prochaine config.
        PresenceManager.shared.refreshSignal.$presenceVersion
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] (_: Int) in
                self?.reconfigureVisibleCells()
            }
            .store(in: &cancellables)
    }

    private func reconfigureVisibleCells() {
        guard let dataSource else { return }
        // §4.7ter — MÊME report que les reconfigures globaux et ciblés :
        // re-mesurer les cellules visibles EN PLEIN geste déclenche la
        // cascade d'invalidation du solveur self-sizing (récursion
        // `_updateVisibleCellsNow` → SIGTRAP, crash reproduit sur long
        // fling 2026-08-18 — le tick de présence ~30 s tombait au milieu du
        // défilement). À la pose, le flush global re-servira l'état frais.
        if store.isUserScrolling {
            hasDeferredGlobalReconfigure = true
            return
        }
        let visibleItems = collectionView.indexPathsForVisibleItems
            .compactMap { dataSource.itemIdentifier(for: $0) }
        guard !visibleItems.isEmpty else { return }
        var snapshot = dataSource.snapshot()
        let existing = visibleItems.filter { snapshot.indexOfItem($0) != nil }
        guard !existing.isEmpty else { return }
        snapshot.reconfigureItems(existing)
        applyToDataSource(snapshot) { [weak self] in
            // Focal : une reconfiguration remet la cellule à plat et sans
            // carte (registration) — la passe la repose aussitôt, sinon la
            // carte du message en focus disparaît jusqu'au prochain tick
            // (à l'ouverture, avant tout défilement : capture 2026-08-21).
            self?.applyFocalPerspectiveToVisibleCells()
        }
    }

    /// Diffe un dictionnaire `[messageId: Value]` publié par le ViewModel et
    /// queue un reconfigure ciblé pour chaque clé dont la valeur a changé ou
    /// disparu. Mutualise les cinq flux de métadonnées par message
    /// (traductions, transcriptions, audios traduits, overrides, sélection
    /// drapeaux) — avant, chaque flux dupliquait ce diff sur 18 lignes avec
    /// sa propre propriété `lastX`. Le snapshot précédent vit dans la closure
    /// (capture `var`), le sink s'exécute sur le main via `receive(on:)`.
    private func observePerMessageDictionary<Value: Equatable>(
        _ publisher: Published<[String: Value]>.Publisher,
        initial: [String: Value]
    ) {
        var last = initial
        publisher
            .receive(on: DispatchQueue.main)
            .dropFirst()
            .sink { [weak self] new in
                guard let self else { return }
                var changed: Set<String> = []
                for (msgId, val) in new where last[msgId] != val {
                    changed.insert(msgId)
                }
                for msgId in last.keys where new[msgId] == nil {
                    changed.insert(msgId)
                }
                last = new
                self.queueReconfigure(for: changed)
            }
            .store(in: &cancellables)
    }

    private func queueReconfigure(for messageIds: Set<String>) {
        guard !messageIds.isEmpty else { return }
        pendingReconfigureMessageIds.formUnion(messageIds)

        reconfigureDebounceTimer?.invalidate()
        reconfigureDebounceTimer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                let ids = self.pendingReconfigureMessageIds
                self.pendingReconfigureMessageIds.removeAll()
                self.reconfigureMessages(serverIds: ids)
            }
        }
    }

    private func reconfigureMessages(serverIds: Set<String>) {
        guard let dataSource = dataSource, !serverIds.isEmpty else { return }

        // §4.7ter (volet ciblé) : pendant un geste, différer — re-mesurer une
        // cellule visible en plein défilement fait sauter le champ visuel ET
        // la perspective (visualMidY = f(center.y − offset)). Vaut dans TOUS
        // les modes depuis le 2026-08-25 : l'exception `.bubbles` faisait du
        // mode NOMINAL le seul où une traduction tardive sautait sous le
        // doigt. Le flush à la pose (`flushDeferredReconfigureAtSettle`) est
        // mode-agnostique — rien ne peut rester périmé.
        if store.isUserScrolling {
            deferredTargetedReconfigureIds.formUnion(serverIds)
            return
        }

        // Translation/transcription events key by server id; the flag-strip
        // selection keys by `message.id`, which IS the local id for a not-yet
        // acked optimistic row. Fall back to the raw key — non-existent items
        // are filtered against the snapshot below anyway.
        let localIds = serverIds.map { self.serverIdToLocalId[$0] ?? $0 }
        guard !localIds.isEmpty else { return }

        var snapshot = dataSource.snapshot()
        let itemsToReconfigure = localIds.map { MessageListItem.message(localId: $0) }

        // Only reconfigure items that actually exist in the current snapshot
        // — et qui sont VISIBLES (même règle que applySnapshot : re-héberger
        // hors écran effondre le contentSize, la réalisation suivante relit
        // le record frais de toute façon).
        let visibleItems = Set(
            collectionView.indexPathsForVisibleItems.compactMap { dataSource.itemIdentifier(for: $0) }
        )
        let existingItems = itemsToReconfigure.filter { snapshot.indexOfItem($0) != nil && visibleItems.contains($0) }
        guard !existingItems.isEmpty else { return }

        snapshot.reconfigureItems(existingItems)
        applyToDataSource(snapshot) { [weak self] in
            // Focal : une reconfiguration remet la cellule à plat et sans
            // carte (registration) — la passe la repose aussitôt, sinon la
            // carte du message en focus disparaît jusqu'au prochain tick
            // (à l'ouverture, avant tout défilement : capture 2026-08-21).
            self?.applyFocalPerspectiveToVisibleCells()
        }
    }

    // MARK: - Scroll to Bottom

    func scrollToBottom(animated: Bool = true) {
        guard collectionView.numberOfItems(inSection: 0) > 0 else { return }
        // Scroll VOULU : le verrou de scène doit le laisser passer (sans ce
        // drapeau, l'ancre annulait chaque frame de l'animation — le bouton
        // « aller au dernier message » ne fonctionnait plus, user 2026-08-18).
        // Posé APRÈS le guard (revue adversariale : une sortie précoce le
        // laissait fuir à true). Animé : retombe à
        // `scrollViewDidEndScrollingAnimation`, ET à `settleAtRest` — un
        // doigt qui rattrape la liste en vol TUE l'animation sans livrer le
        // callback UIKit, le geste se termine alors par
        // didEndDragging/Decelerating → settleAtRest. Non animé : l'offset
        // est posé synchrone, on retombe au tour suivant.
        isIntentionalProgrammaticScroll = true
        // Un « aller au dernier message » remplace toute visée vérifiée en
        // cours — sans quoi la fin de SON animation re-viserait l'ancienne
        // cible et renverrait l'utilisateur en arrière.
        scrollSettleTarget = nil
        if !animated {
            DispatchQueue.main.async { [weak self] in
                self?.isIntentionalProgrammaticScroll = false
                self?.captureSceneLockAnchor()
            }
        }
        collectionView.scrollToItem(at: IndexPath(item: 0, section: 0), at: .top, animated: animated)
        // RC2.4 — a programmatic scroll does not reliably fire
        // `scrollViewDidScroll` (no drag/decelerate phase), so the near-bottom
        // state and the unread badge must be resynced here. Without this the
        // NEXT `applySnapshot` re-bumps the badge against a stale
        // `isCurrentlyNearBottom`, and the badge never reliably clears.
        if !isCurrentlyNearBottom {
            isCurrentlyNearBottom = true
            onNearBottomChanged?(true)
            // Même règle qu'un défilement au doigt : arriver au bas signale ce
            // qui s'y trouve. Le remontage auto d'un message entrant n'entre
            // pas ici — il ne se produit QUE déjà au bas.
            flushSeenNow()
        }
        if pendingUnreadCount > 0 {
            pendingUnreadCount = 0
            onNewMessagesBadge?(0)
        }
    }

    // MARK: - Scroll to specific message (reply chip tap)

    /// Locates `localId` in the current snapshot and scrolls it into view,
    /// then briefly flashes the cell so the user can find it. Called by the
    /// reply-chip tap inside `ThemedMessageBubble`. Forwards to the SwiftUI
    /// `onScrollToMessage` closure so the parent ConversationViewModel can
    /// also load older messages if the target lives outside the current
    /// window.
    /// Resolves a message id — either a local UUID or a gateway-issued
    /// server id — to the local UUID used by the diffable datasource. The
    /// snapshot items are keyed on `localId`; reply chips pass the server
    /// id; this method bridges the two without forcing every call site
    /// to remember which kind it has.
    private func resolveLocalId(_ id: String) -> String {
        // Most call sites pass a localId already (e.g. the typing → message
        // glue, the scroll-to-bottom action). Look it up via the
        // server-side map only when we don't already match an item key —
        // saves a dict probe on the hot scroll-to-bottom path.
        serverIdToLocalId[id] ?? id
    }

    /// ZONE 1 de la LOI DES ZONES (2026-08-24) — tap sur l'AVATAR de l'auteur
    /// cité (le NOM ne l'ouvre plus). Résout le message cité dans le store
    /// local pour ouvrir le profil RÉEL (username/avatar) ; repli sur une
    /// fiche nom-seul (la sheet profil résout par username) quand le cité
    /// n'est plus dans la fenêtre locale.
    ///
    /// L'avatar de la RÉFÉRENCE est le dernier recours des deux branches : il
    /// voyage avec la citation depuis le 2026-08-24, là où la relecture du
    /// store dépend, elle, de la position de défilement. Sans lui, la fiche
    /// ouverte depuis un message sorti de la fenêtre chargée s'affichait sans
    /// visage — le geste ouvrait bien la porte, mais la pièce était vide.
    private func openQuotedAuthorProfile(_ reference: ReplyReference) {
        let localId = resolveLocalId(reference.messageId)
        if let quoted = store.domainMessage(for: localId, currentUserId: currentUserId) {
            router.deepLinkProfileUser = ProfileSheetUser(
                userId: quoted.senderId,
                username: quoted.senderUsername ?? quoted.senderName ?? reference.authorName,
                displayName: quoted.senderName ?? reference.authorName,
                avatarURL: quoted.senderAvatarURL ?? reference.authorAvatarUrl,
                accentColor: reference.authorColor
            )
            return
        }
        router.deepLinkProfileUser = ProfileSheetUser(
            userId: nil,
            username: reference.authorName,
            displayName: reference.authorName,
            avatarURL: reference.authorAvatarUrl,
            accentColor: reference.authorColor
        )
    }

    /// Tap sur la zone MÉDIA d'une citation — résout la pièce jointe citée :
    /// image/vidéo → plein écran (`onMediaTap`, la même galerie que la
    /// rangée), audio → lecture (`playAudio`, même file que la rangée) ;
    /// document et cité hors fenêtre locale → saut à l'original (la carte
    /// document y offre téléchargement/partage).
    private func openQuotedMedia(_ reference: ReplyReference) {
        let localId = resolveLocalId(reference.messageId)
        guard let quoted = store.domainMessage(for: localId, currentUserId: currentUserId),
              let attachment = quoted.attachments.first(where: { $0.type != .location })
        else {
            scrollToMessage(localId: localId)
            return
        }
        // Miroir explicite de `BubbleGridCell.handleTap`
        // (`BubbleStandardLayout+Media.swift`), qui refuse d'ouvrir un
        // attachement protégé tant qu'il n'a pas été révélé. Ce verrou
        // manquait ici, et la LOI DES ZONES vient d'ÉLARGIR la porte : une
        // icône de lecture explicite invite là où un `waveform` inerte ne le
        // faisait pas, et la peau BULLE — celle de tout le monde — vient
        // d'acquérir la zone. Élargir une porte sans son verrou serait une
        // régression d'exposition. Le repli est le saut à l'original, où le
        // média garde son propre geste de révélation.
        guard !(attachment.isViewOnce || attachment.isBlurred) else {
            scrollToMessage(localId: localId)
            return
        }
        switch attachment.type {
        case .image, .video:
            onMediaTap?(attachment)
        case .audio:
            conversationViewModel?.playAudio(attachmentId: attachment.id)
        case .file, .location:
            scrollToMessage(localId: localId)
        }
    }

    func scrollToMessage(localId: String) {
        isIntentionalProgrammaticScroll = true
        // Forward to parent first — if the message lives outside the current
        // window, the parent ViewModel will trigger a `loadWindow(around:)`
        // which repopulates the store. The store observer reapplies the
        // snapshot, then this method runs again with the message visible.
        Logger.messages.debug("scrollToMessage requested target=\(localId, privacy: .public)")
        onScrollToMessage?(localId)

        // Reply chips pass the citation's SERVER id; the snapshot uses
        // LOCAL ids. Translate before the lookup so any message in the
        // current window is reachable, regardless of which id flavour the
        // caller has.
        let resolvedId = resolveLocalId(localId)

        // Items are inserted reversed (newest first) for the inverted
        // collection view. Locate by linear scan over the snapshot — there
        // are at most `MessageStore.initialWindowSize` items initially (growing dynamically) so the cost is
        // negligible compared to the layout pass that follows.
        let snapshot = dataSource.snapshot()
        guard let index = snapshot.itemIdentifiers.firstIndex(where: {
            if case .message(let id) = $0 { return id == resolvedId }
            return false
        }) else {
            // Not in the current snapshot — `onScrollToMessage` was just
            // asked to load it. When the store observer reapplies the
            // snapshot, the second pass through `scrollToMessage` (driven
            // by `scrollState.scrollToMessageId`) will find it. If it
            // doesn't, the log below will show the gap during diagnostic.
            Logger.messages.debug("scrollToMessage target=\(localId, privacy: .public) NOT in snapshot — relying on parent jump path")
            return
        }

        // Visée VÉRIFIÉE (ScrollToMessageSettleLaw) : l'ancien
        // `scrollToItem` + flash différé visait un offset calculé sur des
        // hauteurs estimées et atterrissait à côté dès que des cellules se
        // réalisaient pendant l'animation — le flash partait alors sur une
        // cellule hors écran, et l'utilisateur voyait le fil « sauter au
        // mauvais endroit ». Le flash part désormais à la pose vérifiée.
        beginVerifiedScroll(toLocalId: resolvedId, at: IndexPath(item: index, section: 0), strong: false)
    }

    /// Scrolls fast (no slow-scroll preamble) to a message that was just loaded
    /// from the server after a quoted-message search. Stops any ongoing slow
    /// scroll, then jumps directly to the target with a highlight flash.
    func scrollToMessageFast(localId: String) {
        isIntentionalProgrammaticScroll = true
        stopSlowScroll()

        // Same id-flavour bridge as `scrollToMessage` — see
        // `resolveLocalId(_:)` for the rationale.
        let resolvedId = resolveLocalId(localId)

        let snapshot = dataSource.snapshot()
        guard let index = snapshot.itemIdentifiers.firstIndex(where: {
            if case .message(let id) = $0 { return id == resolvedId }
            return false
        }) else { return }

        // Même visée vérifiée que `scrollToMessage` — ce chemin arrive après
        // un `loadWindow(around:)` : la fenêtre vient d'être ENTIÈREMENT
        // remplacée, donc AUCUNE cellule autour de la cible n'est réalisée et
        // l'écart estimé/réel y est maximal. C'était le saut « au mauvais
        // emplacement » le plus visible (recherche, citation hors fenêtre).
        beginVerifiedScroll(toLocalId: resolvedId, at: IndexPath(item: index, section: 0), strong: true)
    }

    // MARK: - Cell Frame Lookup

    // `focalOverlayPreview(messageId:)` a vécu ici jusqu'au 2026-08-23 :
    // il capturait les PIXELS de la cellule Focal pour que l'aperçu élevé de
    // l'appui long soit le rendu RÉEL, sans second chemin. L'intention tenait ;
    // le cadrage non. La cellule Focal fait tenir son identité et sa barre de
    // méta À CHEVAL sur son cadre — bornée aux `bounds` de la cellule, la
    // capture les tranchait en deux. Retiré : l'overlay rend le message NORMAL
    // dans tous les modes de lecture (directive produit 2026-08-23).

    /// On-screen frame (window coordinates) of the realized cell hosting
    /// `messageId`, or `nil` when that cell is not currently visible.
    /// `convert(_:to: nil)` resolves the collection view's inverted-axis
    /// transform, so the returned rect is the upright frame the user sees.
    /// Used to anchor the floating quick-reaction bar to the tapped bubble.
    func cellFrameInWindow(messageId: String) -> CGRect? {
        // Quick-reaction bar anchors on a tap by id — same server/local
        // id-flavour bridge as the scroll routines.
        let resolvedId = resolveLocalId(messageId)
        let snapshot = dataSource.snapshot()
        guard let index = snapshot.itemIdentifiers.firstIndex(where: {
            if case .message(let id) = $0 { return id == resolvedId }
            return false
        }) else { return nil }
        guard let cell = collectionView.cellForItem(at: IndexPath(item: index, section: 0)) else {
            return nil
        }
        return cell.convert(cell.bounds, to: nil)
    }

    // MARK: - Slow Continuous Scroll (Quoted Message Search)

    /// Starts a slow, continuous scroll toward older messages (visually upward).
    /// Used during quoted message search to give the user a visual impression
    /// that the app is actively browsing through message history.
    func startSlowScrollUp() {
        isIntentionalProgrammaticScroll = true
        // Le slow-scroll pilote l'offset frame par frame : aucune visée
        // vérifiée ne doit lui disputer la destination.
        scrollSettleTarget = nil
        guard slowScrollDisplayLink == nil else { return }
        // Proxy weak partagé (WeakDisplayLinkTarget) : un link `target: self`
        // retenait le VC entier (run loop → link → VC, deinit inatteignable)
        // quand on quittait la conversation pendant une recherche de message
        // cité — tick 60-120 fps + paginations réseau pour un écran mort.
        let link = WeakDisplayLinkTarget.makeLink { [weak self] link in
            guard let self else {
                link.invalidate()
                return
            }
            self.slowScrollTick(link)
        }
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)
        link.add(to: .main, forMode: .common)
        slowScrollDisplayLink = link
    }

    /// Stops the slow continuous scroll.
    func stopSlowScroll() {
        isIntentionalProgrammaticScroll = false
        slowScrollDisplayLink?.invalidate()
        slowScrollDisplayLink = nil
    }

    @objc private func slowScrollTick(_ displayLink: CADisplayLink) {
        guard let cv = collectionView else {
            stopSlowScroll()
            return
        }
        let dt = displayLink.targetTimestamp - displayLink.timestamp
        let delta = slowScrollSpeed * CGFloat(dt)
        let maxY = cv.contentSize.height - cv.bounds.height + cv.contentInset.bottom
        guard maxY > 0 else { return }
        let newY = min(cv.contentOffset.y + delta, maxY)
        cv.contentOffset.y = newY

        // If we hit the end, trigger pagination so the slow scroll can continue
        // once new older messages are loaded.
        if newY >= maxY - 100, !isLoadingOlder {
            guard !store.messages.isEmpty, let onLoadOlder else { return }
            isLoadingOlder = true
            Task { @MainActor [weak self] in
                defer { self?.isLoadingOlder = false }
                await onLoadOlder()
            }
        }
    }

    // MARK: - Cell Flash Highlight

    /// RETRAIT FOCAL iOS (2026-08-18) : le flash CALayer de la décoration
    /// est parti avec le pass — l'historique (transform + alpha de cellule)
    /// sert TOUS les modes, il n'y a plus de perspective à préserver.
    private func flashCell(at indexPath: IndexPath, strong: Bool = false) {
        legacyFlashCell(at: indexPath, strong: strong)
    }

    /// Comportement HISTORIQUE, verbatim — Script / bulles (R1 sans objet :
    /// ces modes ne portent aucune perspective à préserver).
    private func legacyFlashCell(at indexPath: IndexPath, strong: Bool = false) {
        let delay: TimeInterval = strong ? 0.25 : 0.35
        let flashAlpha: CGFloat = strong ? 0.2 : 0.4
        let flashDuration: TimeInterval = strong ? 0.15 : 0.18
        let recoverDuration: TimeInterval = strong ? 0.25 : 0.22

        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let cell = self?.collectionView.cellForItem(at: indexPath) else { return }
            // Scale bounce for strong flash
            if strong {
                cell.transform = CGAffineTransform(scaleX: 1.02, y: 1.02)
            }
            UIView.animate(withDuration: flashDuration, animations: {
                cell.alpha = flashAlpha
            }) { _ in
                UIView.animate(withDuration: recoverDuration, delay: 0, options: .curveEaseOut) {
                    cell.alpha = 1.0
                    if strong {
                        cell.transform = .identity
                    }
                }
            }
        }
    }
}

// MARK: - UICollectionViewDelegate

extension MessageListViewController: UICollectionViewDelegate {

    func collectionView(
        _ collectionView: UICollectionView,
        willDisplay cell: UICollectionViewCell,
        forItemAt indexPath: IndexPath
    ) {
        applyFocalPerspective(to: cell)
        guard rendersThread, let serverId = serverMessageId(at: indexPath) else { return }
        let now = Self.nowMs()
        lastSeenActivityMs = now
        seenAccumulator.appeared(serverId, at: now)
    }

    func collectionView(
        _ collectionView: UICollectionView,
        didEndDisplaying cell: UICollectionViewCell,
        forItemAt indexPath: IndexPath
    ) {
        guard rendersThread, let serverId = serverMessageId(at: indexPath) else { return }
        let now = Self.nowMs()
        lastSeenActivityMs = now
        seenAccumulator.disappeared(serverId, at: now)
    }

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        let offset = scrollView.contentOffset.y
        let contentHeight = scrollView.contentSize.height
        let frameHeight = scrollView.frame.height

        setScrollingActive(scrollView.isDragging || scrollView.isDecelerating)
        // Chrome (boutons, composeur, bulle « retour en bas », pilule) :
        // caché tant que le doigt est posé, puis tant que la décélération est
        // LOIN de son offset d'arrivée ; il revient « quand on s'approche de
        // la fin du scroll » (directive user 2026-08-21, `FocalChromeReturn`),
        // plus à la levée du doigt.
        setChromeHiddenForScroll(FocalChromeReturn.isHidden(
            isTracking: scrollView.isTracking,
            isDecelerating: scrollView.isDecelerating,
            remainingDistance: decelerationTargetOffsetY.map { $0 - scrollView.contentOffset.y }
        ))

        // Verrou de scène (rouleau) : le doigt/momentum RE-CAPTURE l'ancre à
        // chaque frame ; sans pilote et loin du bas, tout écart est annulé.
        //
        // UN SEUL inventaire de cellules visibles pour le tour de frame : le
        // verrou et la pilule de jour le reconstruisaient chacun le sien
        // (audit fluidité 2026-08-25), soit deux balayages UIKit par frame
        // pour la même réponse. Il n'est PARTAGÉ que sur la branche qui laisse
        // l'offset en place : `enforceSceneLock` appelle `setContentOffset`,
        // donc l'inventaire d'AVANT n'y décrit plus l'écran — la pilule y
        // reprend sa lecture interne (`nil`), comme avant.
        let isUserDriven = scrollView.isDragging || scrollView.isTracking || scrollView.isDecelerating
        let keepsOffset = isUserDriven || isIntentionalProgrammaticScroll || isCurrentlyNearBottom
        let visibleIndexPaths: [IndexPath]? = keepsOffset ? collectionView.indexPathsForVisibleItems : nil
        if let visibleIndexPaths {
            captureSceneLockAnchor(visibleIndexPaths: visibleIndexPaths)
        } else {
            enforceSceneLock()
        }

        // Focal : une pose par cellule visible et par frame — transform +
        // opacity CALayer, rien qui invalide le layout — et SEULEMENT sur un
        // geste utilisateur : la scène s'active au premier tick, s'aplatit
        // `restDelay` après la pose (`FocalScrollPerspective`).
        noteFocalScrollTick(scrollView)

        // F-086bis (WS-2) : pilule « jour · heure », RÉUTILISE ce site — pas
        // d'observateur neuf. Gardée par readingMode (`.bubbles` ⇒ no-op).
        noteScrollTimePillActivity()

        // Met à jour le label de la pill flottante en fonction du message
        // en haut visible. Léger : un lookup de l'item à l'index max + une
        // string formatée. Aucune allocation inutile si le label ne change pas.
        updateStickyDayLabel(visibleIndexPaths: visibleIndexPaths)

        // Near-bottom detection for the floating "scroll to latest" button.
        // In the inverted layout, contentOffset.y ≈ 0 means the user is at
        // the visual bottom (newest messages). The threshold gives a
        // comfortable zone before the button appears.
        let nearBottom = offset < Self.nearBottomFollowThreshold
        if nearBottom != isCurrentlyNearBottom {
            isCurrentlyNearBottom = nearBottom
            onNearBottomChanged?(nearBottom)
            // Reset unread badge when the user scrolls back to bottom
            if nearBottom && pendingUnreadCount > 0 {
                pendingUnreadCount = 0
                onNewMessagesBadge?(0)
            }
            // Atteindre le bas est une déclaration : ce qui s'y trouve est sous
            // les yeux du lecteur. L'accusé part maintenant, pas au repos d'une
            // seconde du réveil périodique.
            if nearBottom {
                flushSeenNow()
            }
        }

        guard contentHeight > frameHeight else { return }
        let distanceFromBottom = contentHeight - offset - frameHeight

        if distanceFromBottom < frameHeight * 4, !isLoadingOlder {
            // ROULEAU (user 2026-08-18) : 4 hauteurs d'ÉCRAN d'avance — les
            // rangées suivantes s'insèrent dans le flux bien AVANT d'être
            // visibles, on ne frappe jamais le bord chargé (l'ancien seuil de
            // 800 pt faisait MOINS d'un écran : au fling, le bord arrivait
            // avant la page → rebond élastique puis insertion, l'effet
            // « ressort » signalé). La fenêtre GRDB se sert en cache-first et
            // le prefetch anticipatif du VM enchaîne les pages suivantes.
            guard !store.messages.isEmpty, let onLoadOlder else { return }
            isLoadingOlder = true
            Task { @MainActor [weak self] in
                defer { self?.isLoadingOlder = false }
                await onLoadOlder()
            }
        }
    }

    // `scrollViewDidScroll` stops firing the instant motion actually stops —
    // it cannot observe the "scrolling ended" edge itself. These two catch
    // it: `willDecelerate == false` means the drag ended with no momentum
    // (finger lift while already still), `scrollViewDidEndDecelerating` is
    // the end of the momentum phase otherwise.
    /// Offset d'arrivée de la décélération qui commence — la distance qu'il
    /// reste à parcourir décide du retour du chrome (`FocalChromeReturn`).
    func scrollViewWillEndDragging(_ scrollView: UIScrollView, withVelocity velocity: CGPoint, targetContentOffset: UnsafeMutablePointer<CGPoint>) {
        decelerationTargetOffsetY = targetContentOffset.pointee.y
    }

    func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
        // Sans momentum : repos immédiat, le chrome revient. Avec momentum :
        // c'est l'approche de l'offset d'arrivée qui le fait revenir
        // (directive user 2026-08-21), plus la levée du doigt. Le flush des
        // reconfigures, lui, attend toujours le vrai arrêt.
        if !decelerate {
            decelerationTargetOffsetY = nil
            setChromeHiddenForScroll(false)
            settleAtRest()
        }
    }

    func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
        // La session de défilement se referme : la prochaine « durée soutenue »
        // se mesurera depuis son propre début. L'armement DÉJÀ acquis, lui,
        // survit — le désarmer ferait clignoter la carte à chaque pause, or
        // c'est à l'arrêt qu'on lit le message élu.
        focalScrollStartedAt = nil
        decelerationTargetOffsetY = nil
        settleAtRest()
    }

    /// Fin d'une animation programmatique (`scrollToItem(animated:)` /
    /// `setContentOffset(animated:)`) — jamais un geste. Même épilogue que
    /// l'arrêt d'un geste : retour du chrome + flush des reconfigures
    /// différés (§4.7ter).
    func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
        isIntentionalProgrammaticScroll = false
        settleAtRest()
        // Visée vérifiée : l'animation vient d'atterrir — la loi compare
        // l'offset atteint à celui qui centre la cible (attributs frais,
        // les cellules autour d'elle sont désormais réalisées) et re-vise
        // si l'écart dépasse la tolérance. Après `settleAtRest()` : le flush
        // des reconfigures différés est passé, les hauteurs sont posées.
        verifyScrollSettleTarget()
    }

    /// Le doigt reprend la main : toute visée vérifiée en cours est annulée —
    /// la scène n'appartient qu'au doigt (loi du rouleau), on ne re-vise
    /// jamais par-dessus un geste.
    func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
        scrollSettleTarget = nil
    }

    /// **Adopter ce que le fil MESURE** (#4041) — à la POSE uniquement.
    ///
    /// L'échantillon est l'état RÉEL du layout : la hauteur que chaque item
    /// visible porte à cet instant, mesurée pour les cellules qui se sont
    /// posées, égale à l'estimation courante pour les autres. N'échantillonner
    /// que les cellules qui INVALIDENT biaiserait vers celles dont
    /// l'estimation est déjà fausse : une fois la rangée de suite adoptée,
    /// elle disparaîtrait de l'échantillon et seules les têtes de groupe y
    /// resteraient — la loi oscillerait de l'une à l'autre, une invalidation
    /// complète par pose.
    ///
    /// Jamais pendant un geste : la loi ne décide qu'au repos, et le layout
    /// ancre le repositionnement qui suit.
    func adoptRowHeightEstimateIfWorthwhile() {
        guard isViewLoaded,
              !collectionView.isDragging,
              !collectionView.isDecelerating,
              let layout = collectionView.collectionViewLayout as? MessageListLayout
        else { return }
        let visibleHeights = collectionView.indexPathsForVisibleItems.compactMap {
            layout.layoutAttributesForItem(at: $0)?.frame.height
        }
        guard let adopted = MessageListHeightEstimationLaw.proposal(
            visibleHeights: visibleHeights,
            current: currentRowHeightEstimate
        ) else { return }
        if readingMode.usesFlatRow {
            learnedFlatRowHeight = adopted
        } else {
            learnedBubbleRowHeight = adopted
        }
        layout.invalidateForAdoptedEstimate()
    }

    /// Pose commune à l'arrêt (geste ou animation) — RETRAIT FOCAL iOS
    /// (2026-08-18) : plus d'élection, plus de nudge, plus de typographie de
    /// focus ; il ne reste que le chrome et les reconfigures différés.
    private func settleAtRest() {
        // Le rattrapage d'invalidation noté pendant le mouvement se joue ICI,
        // à la pose — plus jamais par re-proposition à chaque tour de boucle
        // (Time Profiler 2026-08-21, voir `MessageListLayout`).
        (collectionView.collectionViewLayout as? MessageListLayout)?.flushPendingRecoveryInvalidation()
        // Le fil vient de montrer ce qu'il mesure vraiment (#4041) : c'est le
        // seul moment où l'on a le droit de changer l'estimation servie.
        adoptRowHeightEstimateIfWorthwhile()
        syncFocalFocusDetails()
        scheduleFocalFlatten()
        // Filet de la revue adversariale 2026-08-18 : une animation
        // programmatique interrompue AU DOIGT ne livre jamais
        // `scrollViewDidEndScrollingAnimation` — le geste qui l'a tuée se
        // termine ICI. Sans cette retombée, le drapeau fuyait à true et le
        // verrou de scène restait désarmé pour la session.
        isIntentionalProgrammaticScroll = false
        setScrollingActive(false)
        setChromeHiddenForScroll(false)
        captureSceneLockAnchor()
        flushDeferredReconfigureAtSettle()
    }

}

// MARK: - Typing Indicator Cell

/// Bulle « X écrit… » rendue comme dernière cellule du flux de messages
/// (bas visuel de la liste inversée). Alignée côté expéditeur ; les points
/// s'animent en autonomie via `@State` (pas de timer externe).
///
/// **`internal`, pas `private` (2026-08-25, constat L2b/2b-7).** La Rivière
/// monte la MÊME vue en tenue plate (la peau de `Riviere/View/`) : `private` étant à
/// portée de FICHIER, elle était invisible depuis `Riviere/View/` et la seule
/// façon d'y rendre la frappe aurait été d'en déclarer une SECONDE — deux
/// vues qui divergeraient sur les timings, le libellé et l'accessibilité, et
/// la frappe n'aurait pas le même visage selon le mode de lecture.
struct TypingIndicatorBubble: View {
    let participants: [TypingParticipant]
    let accentHex: String
    let isDark: Bool
    /// Rangée PLATE (Focal/Script, matrice §5) : pastille 22 de l'auteur +
    /// trois points pulsants accent, SANS capsule ni libellé visible (mêmes
    /// timings 0.5 s / 0.18 s). `false` = capsule historique du mode bulles.
    var isFlat: Bool = false

    @State private var animating = false

    private var names: [String] { participants.displayNames }

    private var label: String {
        switch names.count {
        case 0: return ""
        case 1: return String(format: String(localized: "typing.named", bundle: .main), names[0])
        case 2: return String(format: String(localized: "typing.double", bundle: .main), names[0], names[1])
        default: return String(localized: "typing.several", bundle: .main)
        }
    }

    /// Le frappeur dont on montre le visage : le premier du roster, dans
    /// l'ordre de première apparition tenu par `ConversationSocketHandler`.
    private var lead: TypingParticipant? { participants.first }

    /// Pastille de l'auteur — sa VRAIE photo dès qu'elle est connue localement,
    /// ses initiales déterministes sinon. `MeeshyAvatar` porte déjà la cascade
    /// (cache disque → réseau → initiales) : lui passer `avatarURL` suffit.
    @ViewBuilder
    private func leadAvatar(size: CGFloat) -> some View {
        if let lead {
            MeeshyAvatar(
                name: lead.displayName,
                context: .custom(size),
                accentColor: accentHex,
                avatarURL: lead.avatarURL,
                isDark: isDark
            )
        }
    }

    /// Les trois points pulsants — mêmes timings dans les deux tenues.
    private func pulsingDots(accent: Color) -> some View {
        HStack(spacing: 3) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(accent)
                    .frame(width: 5, height: 5)
                    .scaleEffect(animating ? 1.0 : 0.5)
                    .opacity(animating ? 1.0 : 0.4)
                    // Ici le repos EST la cible (`animating == true` : pleine
                    // taille, pleine opacité) — l'inverse du point d'appel juste
                    // à côté. En tenue plate il n'y a aucun libellé : ce qui dit
                    // « quelqu'un écrit » est la PRÉSENCE des trois points, pas
                    // leur mouvement. Les rendre à demi-taille et à 40 %
                    // d'opacité les ferait passer pour une décoration éteinte.
                    .meeshyAnimation(
                        .easeInOut(duration: 0.5)
                            .repeatForever(autoreverses: true)
                            .delay(Double(i) * 0.18),
                        value: animating
                    )
            }
        }
    }

    var body: some View {
        let accent = Color(hex: accentHex)
        HStack(spacing: 0) {
            if isFlat {
                HStack(spacing: 7) {
                    leadAvatar(size: 22)
                    pulsingDots(accent: accent)
                }
                // Aligné sur la colonne d'identité de FocalRow (retrait
                // horizontal de rangée) — aucune capsule, aucun bord.
                .padding(.horizontal, FocalMetrics.Row.paddingHorizontal)
            } else {
                HStack(spacing: 6) {
                    // Le visage AVANT le libellé : « qui écrit » se lit d'un
                    // coup d'œil, sans lire le nom. La capsule du mode bulles
                    // ne le portait pas — seule la rangée plate en avait un, et
                    // sans photo (initiales seules).
                    leadAvatar(size: 18)
                    if !label.isEmpty {
                        Text(label)
                            // Dynamic Type (153i) : libellé « X écrit… » réel et localisé —
                            // scale via MeeshyFont.relative. La bulle est dimensionnée par
                            // padding (pas de frame figée), donc elle grandit proprement ;
                            // les 3 points restent des `Circle` décoratifs de 5pt.
                            .font(MeeshyFont.relative(12, weight: .medium))
                            .foregroundColor(isDark ? accent.opacity(0.85) : accent.opacity(0.7))
                            .lineLimit(1)
                    }
                    pulsingDots(accent: accent)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Capsule().fill(isDark ? Color.white.opacity(0.07) : Color.black.opacity(0.05)))
                .overlay(Capsule().strokeBorder(accent.opacity(isDark ? 0.25 : 0.18), lineWidth: 1))
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .onAppear { animating = true }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label)
    }
}


// MARK: - Focal : perspective minimale, pendant le défilement seulement (2026-08-21)

extension MessageListViewController {

    /// Région visible du fil dans le repère de `view` : sous le chrome haut
    /// (`contentInset.bottom` du repère renversé) et au-dessus du composeur
    /// (`contentInset.top`).
    private var focalVisibleBounds: (top: CGFloat, bottom: CGFloat) {
        (collectionView.frame.minY + collectionView.contentInset.bottom,
         collectionView.frame.maxY - collectionView.contentInset.top)
    }

    /// Ligne de focus : le centre de la région visible, qui descend au bord
    /// bas au repos sur le dernier message (`FocalScrollPerspective.focusY`).
    /// `offsetFromBottom` : `contentOffset.y + contentInset.top` vaut 0 au
    /// repos en bas du fil renversé et croît vers l'historique.
    private var focalFocusY: CGFloat {
        let bounds = focalVisibleBounds
        return FocalScrollPerspective.focusY(
            visibleTop: bounds.top,
            visibleBottom: bounds.bottom,
            offsetFromBottom: collectionView.contentOffset.y + collectionView.contentInset.top
        )
    }

    private func focalGeometry(of cell: UICollectionViewCell) -> FocalScrollPerspective.CellGeometry? {
        guard let indexPath = collectionView.indexPath(for: cell),
              let item = dataSource?.itemIdentifier(for: indexPath) else { return nil }
        let visual = collectionView.convert(cell.frame, to: view)
        let id: String
        let isMessage: Bool
        switch item {
        case .message(let localId):
            id = localId
            isMessage = true
        case .dayHeader, .typingIndicator, .conversationStart:
            id = "\(indexPath.item)"
            isMessage = false
        }
        return FocalScrollPerspective.CellGeometry(id: id, visualMidY: visual.midY, height: visual.height, isMessage: isMessage)
    }

    /// Tick de défilement : la scène ne s'active que sur un geste UTILISATEUR
    /// (doigt posé ou décélération) — jamais sur un défilement programmé
    /// (message entrant, atterrissage de recherche). Le premier tick arme la
    /// fenêtre d'entrée animée ; chaque tick annule l'aplatissement en attente.
    func noteFocalScrollTick(_ scrollView: UIScrollView) {
        guard readingMode == .focal, scrollView.isDragging || scrollView.isDecelerating else { return }
        focalFlattenWork?.cancel()
        focalFlattenWork = nil
        if !focalSceneActive {
            focalSceneActive = true
            focalSceneEnteredAt = CACurrentMediaTime()
        }
        applyFocalPerspectiveToVisibleCells()
    }

    /// À la POSE : compte à rebours de l'aplatissement
    /// (`FocalMetrics.Scene.restDelay`), réarmé à chaque pose.
    func scheduleFocalFlatten() {
        guard readingMode == .focal, focalSceneActive else { return }
        focalFlattenWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.flattenFocalScene(animated: true) }
        focalFlattenWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + FocalMetrics.Scene.restDelay, execute: work)
    }

    /// Retour à Script : transforms, opacités et carte rejoignent l'identité
    /// — animés au repos (`flattenDuration`), secs au changement de mode —
    /// puis la rangée détaillée rend ses détails (UNE reconfiguration, hors
    /// mouvement). Un geste qui reprend pendant l'animation la reprend depuis
    /// la valeur présentée (`beginFromCurrentState`) et garde sa carte.
    func flattenFocalScene(animated: Bool) {
        focalFlattenWork?.cancel()
        focalFlattenWork = nil
        focalSceneActive = false
        // La scène repart de zéro : la magnificence devra se mériter à nouveau.
        focalMagnificationArmed = false
        focalScrollStartedAt = nil
        focalFocusedLocalId = nil
        guard isViewLoaded else { return }
        let cells = collectionView.visibleCells
        let flatten = {
            for cell in cells {
                FocalScrollPerspective.reset(cell.contentView.layer)
                FocalScrollPerspective.focusCard(in: cell.contentView)?.alpha = 0
            }
        }
        let finish = { [weak self] in
            guard let self, !self.focalSceneActive else { return }
            for cell in cells { FocalScrollPerspective.hideFocusCard(in: cell.contentView) }
            self.syncFocalFocusDetails()
        }
        if animated {
            UIView.animate(
                withDuration: FocalMetrics.Scene.flattenDuration,
                delay: 0,
                options: [.curveEaseInOut, .beginFromCurrentState, .allowUserInteraction],
                animations: flatten,
                completion: { _ in finish() }
            )
        } else {
            UIView.performWithoutAnimation(flatten)
            finish()
        }
    }

    /// Pose d'UNE cellule qui entre à l'écran (sur-réserve comprise) : la
    /// passe collective — elle a besoin des voisines pour la compaction.
    /// No-op scène inactive : la cellule arrive à plat, comme en Script.
    func applyFocalPerspective(to cell: UICollectionViewCell) {
        guard readingMode == .focal, focalSceneActive else { return }
        applyFocalPerspectiveToVisibleCells()
    }

    /// Toutes les cellules visibles, une transaction — appelée par tick et
    /// après chaque reconfiguration : loi par distance + compaction symétrique
    /// + carte du message en focus. Dans la fenêtre d'entrée, chaque tick
    /// anime depuis la valeur présentée (pas de saut) ; ensuite, sec.
    func applyFocalPerspectiveToVisibleCells() {
        guard readingMode == .focal, isViewLoaded, focalSceneActive else { return }
        let focusY = focalFocusY
        let cells = collectionView.visibleCells
        // **Tant que la magnificence n'est pas armée, le fil défile comme en
        // Script** (directive 2026-08-24 : « si la magnificence n'est pas
        // activée, la réduction et l'effet loop non plus ; le scroll se fait
        // naturellement en Script jusqu'à activation, où on considère TOUTES
        // les fonctions du mode Focal »). J'avais d'abord retardé la seule
        // élection en laissant le relief s'appliquer — c'était la moitié de la
        // règle : la réduction et la compaction sont, elles aussi, des
        // fonctions du mode, pas un décor neutre.
        guard focalMagnificationArmed else {
            for cell in cells { FocalScrollPerspective.reset(cell.contentView.layer) }
            if focalFocusedLocalId != nil {
                focalFocusedLocalId = nil
                syncFocalFocusDetails()
            }
            return
        }
        // Les géométries ne servent QU'à l'élection, donc qu'une fois armé :
        // les construire avant la garde, c'était une résolution d'indexPath,
        // d'identifiant et de conversion de repère PAR CELLULE ET PAR FRAME
        // jetée pendant les quatre secondes de défilement soutenu qui
        // précèdent l'armement (`FocalMagnificationLaw.sustainedScrollMs`).
        var geometries: [FocalScrollPerspective.CellGeometry] = []
        geometries.reserveCapacity(cells.count)
        for cell in cells {
            guard let geometry = focalGeometry(of: cell) else { continue }
            geometries.append(geometry)
        }
        // **Aucune animation ENTRE les messages** (directive 2026-08-24 :
        // « les messages font comme des ressorts pour entrer et ressortir de
        // l'écran ; JE NE VEUX aucune animation entre les messages — une fois
        // dans la planche ils sont fixes »).
        //
        // `FocalScrollPerspective.poses` appliquait à CHAQUE rangée une échelle
        // et une opacité fonction de sa distance à la ligne de focus, plus une
        // compaction : c'est ce qui donnait le ressort à l'entrée et à la
        // sortie de l'écran. La loi elle-même (spec Focal §5, courbe gelée)
        // reste écrite et testée — elle n'est simplement plus APPLIQUÉE ; la
        // planche est fixe.
        //
        // Ce qui distingue le message élu n'est donc plus sa taille mais sa
        // CARTE et ses chips, posées par la reconfiguration au tick d'élection.
        for cell in cells { FocalScrollPerspective.reset(cell.contentView.layer) }
        let focused = FocalScrollPerspective.focusedId(cells: geometries, focusY: focusY, currentId: focalFocusedLocalId)
        let electionChanged = focalFocusedLocalId != focused
        focalFocusedLocalId = focused
        // Les détails du message en focus apparaissent AVEC la carte, pas au
        // posé (directive 2026-08-22) : la reconfiguration ne change aucune
        // hauteur (chips et identité sont des superpositions sur les lignes
        // de la carte), elle ne coûte qu'un rendu de deux cellules.
        if electionChanged { syncFocalFocusDetails() }  // différé + coalescé, jamais réentrant
        // La carte du focus est le FOND SwiftUI de la rangée
        // (`FocalRow.focusCardBackground`, posée à la reconfiguration du tick
        // d'élection) : plus AUCUNE carte UIKit n'est posée par cette passe,
        // donc plus rien à démonter ici. Le balayage des sous-vues qui s'y
        // trouvait tournait par cellule et par frame pour retirer une vue
        // qui n'existe plus. Le démontage d'une carte héritée d'un recyclage
        // reste assuré aux deux seuls points qui en produisent l'occasion :
        // la registration (cellule (re)configurée) et `flattenFocalScene`.
    }

    /// Les détails du message en focus (identité, jour + heure, texte
    /// plafonné) — par UNE reconfiguration ciblée, jamais par frame : posés à
    /// la pose tant que la scène est active, rendus à l'aplatissement.
    /// Même loi et mêmes mots que le message en focus de la rangée.
    func focalFocusTimestamp(for sentAt: Date) -> String {
        FocalFocusTimestamp.label(
            sentAt: sentAt,
            timeString: TimeStringCache.shared.format(sentAt),
            now: Date(),
            calendar: .current,
            locale: .current,
            today: String(localized: "date.today", defaultValue: "Aujourd'hui"),
            yesterday: String(localized: "date.yesterday", defaultValue: "Hier"),
            dayBeforeYesterday: String(localized: "date.dayBeforeYesterday", defaultValue: "Avant-hier")
        )
    }

    /// JAMAIS un `apply` synchrone : cette méthode est appelée depuis des
    /// complétions d'`apply` (pose, aplatissement) et, depuis le 2026-08-22,
    /// depuis le tick d'élection — qui peut lui-même tourner dans la
    /// complétion d'un `apply` de reconfiguration. Un `apply` imbriqué fait
    /// abandonner UIKit (`BUG_IN_CLIENT_OF_DIFFABLE_DATA_SOURCE_…_REENTRANTLY`,
    /// crash payé au simulateur). La reconfiguration est donc DIFFÉRÉE au
    /// prochain tour de la boucle principale et COALESCÉE (un seul apply en
    /// vol ; une élection qui change pendant l'apply est reprise à sa fin).
    func syncFocalFocusDetails() {
        guard !focalDetailsSyncScheduled else { return }
        focalDetailsSyncScheduled = true
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.focalDetailsSyncScheduled = false
            self.reconfigureFocalDetailsNow()
        }
    }

    private func reconfigureFocalDetailsNow() {
        guard let dataSource else { return }
        if focalReconfigureInFlight {
            focalDetailsPendingAfterApply = true
            return
        }
        let target = (readingMode == .focal && focalSceneActive) ? focalFocusedLocalId : nil
        guard focalDetailedLocalId != target else { return }
        let previous = focalDetailedLocalId
        focalDetailedLocalId = target
        reconfigureFocalItems([previous, target].compactMap { $0 })
    }

    /// Le data source n'est plus un PARAMÈTRE : depuis #3947 l'application
    /// passe par `applyToDataSource`, donc la propriété. Garder l'argument
    /// aurait laissé croire qu'on peut viser un autre data source que celui
    /// où l'on applique.
    private func reconfigureFocalItems(_ localIds: [String]) {
        var snapshot = dataSource.snapshot()
        let present = Set(snapshot.itemIdentifiers)
        let items = localIds.map { MessageListItem.message(localId: $0) }.filter { present.contains($0) }
        guard !items.isEmpty else { return }
        snapshot.reconfigureItems(items)
        focalReconfigureInFlight = true
        applyToDataSource(snapshot) { [weak self] in
            guard let self else { return }
            self.focalReconfigureInFlight = false
            self.applyFocalPerspectiveToVisibleCells()
            if self.focalDetailsPendingAfterApply {
                self.focalDetailsPendingAfterApply = false
                self.syncFocalFocusDetails()
            }
        }
    }

    /// Sortie de Focal (changement de mode) : tout à plat, sec.
    func resetFocalPerspectiveOnVisibleCells() {
        flattenFocalScene(animated: false)
    }
}
