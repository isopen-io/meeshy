@preconcurrency import UIKit
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

final class MessageListViewController: UIViewController {

    // `internal` (et non `private`/`fileprivate`) car le cluster de
    // suivi de lecture vit dans `MessageListViewController+SeenTracking.swift` :
    // en Swift, `private` porte sur le FICHIER.
    var collectionView: UICollectionView!
    var dataSource: UICollectionViewDiffableDataSource<MessageListSection, MessageListItem>!
    let store: MessageStore
    let currentUserId: String
    var accentColor: String
    let isDirect: Bool
    // `internal` (pas `private`) car `+UnreadSeparator.swift` y accède :
    // `private` est de portée FICHIER en Swift, même raison que
    // `cancellables`/`lastTypingRosterFingerprint`.
    var isDark: Bool
    let router: Router
    let storyViewModel: StoryViewModel
    let statusViewModel: StatusViewModel
    let conversationListViewModel: ConversationListViewModel?  // #7006 — remis aux cellules, jamais lu ici ; nil hors liste montée.
    /// `internal` car le cluster snapshot vit dans un autre fichier : en Swift,
    /// `private` porte sur le FICHIER.
    var cancellables = Set<AnyCancellable>()
    var isLoadingOlder = false
    /// Tracks the item count from the last snapshot so we can detect that the
    /// snapshot grew at all.
    var previousSnapshotCount: Int = 0
    /// The newest item (index 0 in the inverted layout) from the last snapshot.
    /// A genuinely-new message changes item 0; older-message pagination
    /// prepends to the tail and leaves item 0 untouched. Comparing against
    /// this is deterministic — unlike the `isLoadingOlder` flag, which the
    /// ViewModel's anticipatory prefetch bypasses entirely.
    var previousNewestItem: MessageListItem?
    /// Running counter of messages that arrived while the user was scrolled
    /// away from the bottom. Reset to 0 when the user returns to near-bottom.
    var pendingUnreadCount: Int = 0
    /// Cached near-bottom state so applySnapshot can decide whether to bump
    /// the unread badge without querying contentOffset mid-layout.
    var isCurrentlyNearBottom: Bool = true
    /// Whether the previous snapshot included the typing-indicator cell — lets
    /// the list scroll the indicator into view the moment it first appears.
    var previouslyShowedTyping: Bool = false

    // MARK: - Slow scroll for quoted message search

    /// Display link that drives the slow continuous scroll while searching
    /// for a quoted message. We keep the speed at ~80pt/s so the user sees
    /// the messages "flow" past without blur, yet fast enough to feel like
    /// the app is actively searching.
    nonisolated(unsafe) var slowScrollDisplayLink: CADisplayLink?
    /// Points per second the slow scroll advances toward older messages.
    /// In the inverted layout, increasing `contentOffset.y` scrolls visually
    /// upward (toward older messages).
    let slowScrollSpeed: CGFloat = 80

    /// La dernière préparation de snapshot construite — le MÉMO.
    ///
    /// Réutilisée telle quelle tant que l'empreinte de la fenêtre ne bouge
    /// pas : un accusé de lecture, une réaction ou une transcription changent
    /// la VERSION d'une ligne, jamais la composition, et ne doivent donc rien
    /// faire reconstruire. Voir `MessageListSnapshotPrep` pour ce qui entre
    /// dans l'empreinte — et ce qui n'y entre volontairement pas.
    var lastSnapshotPrep: MessageListSnapshotPrep?

    /// Point d'accès de test — `internal`, lu par `@testable import
    /// Meeshy`, jamais par une autre cible app. Compte les préparations
    /// RÉELLEMENT construites : c'est le seul témoin qui distingue « la liste
    /// s'est reposée » de « la liste a tout recalculé ».
    var snapshotPrepBuildsForTesting: Int = 0

    /// Maps each message's gateway-side `serverId` (MongoDB ObjectId) to
    /// the client-side `localId` (UUID) that the diffable datasource uses
    /// as its item identifier. Consulted by `resolveLocalId(_:)` so the
    /// reply-tap path can find a cited message even when the caller hands us
    /// a server id (which is what `ReplyReference.messageId` carries —
    /// gateway sends `replyTo.id`, not the local UUID).
    ///
    /// SERVIE par la préparation mémoïsée, jamais recopiée à côté d'elle : une
    /// seconde carte tenue en parallèle divergerait le jour où l'une des deux
    /// se reconstruit sans l'autre — et c'est un `nil` silencieux, une
    /// citation qui ne saute plus.
    var serverIdToLocalId: [String: String] { lastSnapshotPrep?.serverIdToLocalId ?? [:] }

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
    var pendingReconfigureMessageIds = Set<String>()
    var reconfigureDebounceTimer: Timer?

    var onNewMessagesBadge: ((Int) -> Void)?
    var onScrollToMessage: ((String) -> Void)?
    /// Invoked when the scroll position approaches the older-messages
    /// threshold. The parent (typically `ConversationViewModel`) is the
    /// only owner that knows how to chain cache lookup + network fetch
    /// (see `ConversationViewModel.loadOlderMessages`). Going through the
    /// store directly would bypass the network fallback and silently
    /// stall pagination once the local GRDB window is exhausted.
    var onLoadOlder: (@MainActor () async -> Void)?
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
            // Même règle que la pill de jour — un header
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
    /// `(vus, visibles)` — deux questions distinctes : ce que la liste a
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
    /// élevé est le message NORMAL, dans tous les modes de lecture.
    /// Carries the message id and the tapped bubble
    /// cell's on-screen frame (window coords; `nil` when the cell is not
    /// realized), même patron qu'`onAddReaction` : le
    /// menu longpress ferme le clavier et remonte le message vers le centre
    /// s'il est trop bas, ce qui exige le VRAI frame de la cellule.
    var onLongPress: ((String, CGRect?) -> Void)?
    /// L'appui long d'une TUILE : message, pièce, frame de la cellule.
    var onLongPressPiece: ((String, String, CGRect?) -> Void)?
    /// La pièce citée à mettre en évidence quand le saut se pose, et le canal des tuiles.
    var pendingPieceSpotlight: (localId: String, pieceId: String)?
    let pieceSpotlight = PassthroughSubject<String, Never>()
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
                // (à l'ouverture, avant tout défilement).
                self?.applyFocalPerspectiveToVisibleCells()
            }
        }
    }
    /// **Mode sélection multiple.** `didSet` gardé (`oldValue !=
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
            // `.allItems` reconfigurerait TOUTE rangée visible pour une coche qui ne
            // change QUE sur UN message — contraire au gate `.equatable()` que ce coût
            // existe précisément pour éviter. La différence symétrique des
            // deux `Set` est exactement l'ensemble des id dont l'état de
            // coche a changé.
            //
            // La sélection stocke `message.id` (= `serverId ?? localId`,
            // cf. MessageRecord+ToMessage:107), mais les items de la data source
            // sont keyés sur le LOCAL id. Pour un message CONFIRMÉ (serverId ≠
            // localId), `.items(serverId)` ne matcherait AUCUNE cellule → la coche
            // s'incrémenterait au compteur sans jamais s'afficher. On traduit donc
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
    /// **Les opérations servies EN PREMIER par le menu système** (« Imager » y remplace « Composer »), plus la porte du GRAND menu.
    var onEditMessage: ((String) -> Void)?
    var onSelectMessage: ((String) -> Void)?
    var onComposeFromMessage: ((String) -> Void)?
    var onImagineFromMessage: ((String) -> Void)?
    /// « Plus… » ouvre `MessageMoreSheet` — la feuille COMPLÈTE — et non
    /// l'overlay d'appui long. Les deux sont des menus distincts.
    var onOpenMoreSheet: ((String) -> Void)?
    /// Éditer, répondre, transférer hors du menu (#12626) — remis par `ConversationView`, jamais recalculé ici.
    var rowOffer: ((MeeshyMessage) -> MessageRowOffer)?
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
    var longMessageExpansionState = LongMessageExpansionState() // #8147 / #8157
    /// Carte lieu de la rangée plate : plein écran (ConversationView), avec son message.
    var onFocalTapLocation: ((SharedPlace, String) -> Void)?
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
    /// **Le ViewModel peut arriver APRÈS `viewDidLoad`.** Toutes les
    /// observations qui en dépendent vivraient derrière un `guard let` au milieu
    /// d'`observeStore()`, appelée une seule fois au chargement : quand il
    /// n'est pas encore posé, la fonction sortirait et **rien ne la rappellerait**.
    /// Le roster de frappe, les traductions, les transcriptions, les audios
    /// traduits et les anneaux de story ne seraient alors JAMAIS observés — sans
    /// le moindre signe, l'abonnement d'avant le `guard` continuant de rendre
    /// les messages.
    weak var conversationViewModel: ConversationViewModel? {
        didSet {
            guard isViewLoaded else { return }
            observeConversationViewModel()
        }
    }

    /// `true` une fois les observations dépendantes du ViewModel établies.
    /// Porte l'idempotence — `updateUIViewController` réassigne le même
    /// ViewModel à chaque passe de rendu SwiftUI — et donne aux témoins un état
    /// à interroger plutôt qu'une chaîne de source.
    var didObserveConversationViewModel = false

    /// Combien de fois les observations ont été RÉELLEMENT établies. Un second
    /// abonnement doublerait chaque re-snapshot ; le témoin le garde.
    var conversationViewModelObservationCount = 0

    /// L'apparence choisie pour la conversation et la peau des bulles qui s'en déduit (`+Appearance`).
    var conversationAppearance: ConversationAppearance?
    var bubbleSkin: BubbleSkin = .brand

    // MARK: - Mode de lecture rendu (Script/bulles)

    /// Mode de lecture réellement rendu. Décision de l'orchestrateur,
    /// clampée par `ReadingModeController` : `.focal` n'atteint jamais cet hôte
    /// (il n'y a pas de pass de perspective).
    /// Deux rendus : `.bubbles` et la rangée plate
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
    var focalDetailsSyncScheduled = false
    var focalReconfigureInFlight = false
    var focalDetailsPendingAfterApply = false
    /// La SCÈNE Focal est active — perspective posée — seulement pendant un
    /// geste utilisateur et `FocalMetrics.Scene.restDelay` après la pose ;
    /// au repos, tout est Script.
    var focalSceneActive = false
    /// Instant d'activation : les ticks de la fenêtre d'entrée animent depuis
    /// la valeur présentée au lieu de sauter.
    var focalSceneEnteredAt: CFTimeInterval = 0
    /// Compte à rebours de l'aplatissement, réarmé à chaque pose, annulé au
    /// premier tick d'un nouveau geste.
    var focalFlattenWork: DispatchWorkItem?
    /// Vitesse du défilement en cours — la décélération n'en donne aucune
    /// autre (`FocalFocusDetailsMotionLaw`).
    var focalScrollSpeedMeter = ScrollSpeedMeter()

    var readingMode: ConversationReadingMode = .bubbles {
        didSet {
            guard oldValue != readingMode, isViewLoaded else { return }
            // Sous un pane OPAQUE (Rivière/Résumé) la liste se met en VEILLE :
            // son timer de suivi s'arrête, et la passe de reconfiguration
            // INTÉGRALE ci-dessous — qui ne sert qu'à redessiner des cellules
            // dans la pose du nouveau mode — n'a personne à qui montrer son
            // résultat. Elle se rejoue au RETOUR, ce `didSet` étant appelé
            // dans les deux sens.
            syncThreadQuiescence()
            collectionView.collectionViewLayout.invalidateLayout()
            // #4602 — le mémo de la pastille de jour est aveugle au LAYOUT.
            //
            // `updateStickyDayLabel` sort tôt quand l'item de tête n'a pas
            // changé d'IDENTITÉ (`lastStickyTopItem`) — juste, tant que la
            // géométrie ne bouge pas. Une bascule de mode change les hauteurs
            // de rangée sans changer les items : le même message reste en tête
            // pendant qu'un séparateur de date d'un AUTRE jour entre dans la
            // bande de la pastille. Le mémo ferait alors garder à la sticky
            // le jour d'avant, superposé au séparateur natif — deux pastilles,
            // deux dates, jusqu'au premier défilement qui change l'item de
            // tête.
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
    static let optimisticStates: Set<MessageState> = [.draft, .queued, .sending]

    /// Estimations de layout — voir `configureCollectionView` pour le
    /// raisonnement. Rangée plate : en-tête + une ligne de texte + marges.
    /// Bulle : la valeur historique, inchangée.
    /// 150 — le point de fonctionnement PROUVÉ stable du solveur self-sizing
    /// (un abaissement à 120 densifierait la
    /// réalisation de cellules par frame au fling, pression en plus sur la
    /// cascade de compensations).
    private static let estimatedFlatRowLayoutHeight: CGFloat = 150
    private static let estimatedBubbleRowLayoutHeight: CGFloat = 80

    /// **Estimations APPRISES du fil courant**, une par famille de
    /// rangée : la rangée plate (Focal/Script) et la bulle n'ont pas la même
    /// cote, et une bascule de mode ne doit jamais servir celle de l'autre.
    ///
    /// Les deux constantes ci-dessus sont le point de DÉPART, non la valeur
    /// DÉFINITIVE : 150 est la cote d'une TÊTE DE GROUPE, alors que
    /// la population dominante d'un fil est la rangée DE SUITE (~51 pt
    /// mesurés). Servir 150 à toutes ferait entrer chaque cellule ~100 pt
    /// trop haute avant qu'elle ne se rétracte — un « effet de défilement
    /// étiré ».
    ///
    /// L'adoption passe par `MessageListHeightEstimationLaw` et n'a lieu qu'à
    /// la POSE : changer l'estimation change la hauteur de tout le contenu
    /// non mesuré, donc exige le chemin d'invalidation ANCRÉ du layout.
    var learnedFlatRowHeight: CGFloat?
    var learnedBubbleRowHeight: CGFloat?

    /// L'estimation servie au provider de section en cet instant.
    var currentRowHeightEstimate: CGFloat {
        readingMode.usesFlatRow
            ? (learnedFlatRowHeight ?? Self.estimatedFlatRowLayoutHeight)
            : (learnedBubbleRowHeight ?? Self.estimatedBubbleRowLayoutHeight)
    }

    /// Point d'accès de test — `internal`, lu par `@testable import
    /// Meeshy`, jamais par une autre cible app.
    var rowHeightEstimateForTesting: CGFloat { currentRowHeightEstimate }

    /// Zone « près du bas » (en points d'offset) : en dessous, l'utilisateur
    /// SUIT la conversation — bouton « aller au bas » masqué, auto-scroll sur
    /// message entrant, et poussée naturelle des insertions en tête. Au-delà,
    /// il LIT l'historique — badge non-lus, et le layout compense les
    /// insertions pour ne jamais déplacer sa lecture (`MessageListLayout`).
    static let nearBottomFollowThreshold: CGFloat = 200

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
    var scrollTimePillHost: UIHostingController<AnyView>?
    var scrollTimePillTopConstraint: NSLayoutConstraint?

    /// Révélé des heures pendant le défilement — le successeur de la pilule
    /// flottante. Alimenté par la MÊME loi (`ScrollTimePillLaw`) et au MÊME
    /// site (§4.8 site 1), donc aucun observateur neuf ; seul le support
    /// change. Injecté dans chaque cellule par `environmentObject`.
    let timestampReveal = FocalTimestampRevealState()

    /// Début du défilement en cours (ms), `nil` au repos — l'une des deux
    /// portes de `FocalMagnificationLaw`.
    var focalScrollStartedAt: Double?
    /// La magnificence est-elle armée ? Voir `FocalMagnificationLaw` : elle ne
    /// s'arme pas au premier pixel, et une fois armée elle le reste jusqu'à ce
    /// que la scène Focal reparte.
    var focalMagnificationArmed = false

    init(
        store: MessageStore,
        currentUserId: String,
        accentColor: String,
        isDirect: Bool,
        isDark: Bool,
        router: Router,
        storyViewModel: StoryViewModel,
        statusViewModel: StatusViewModel,
        conversationListViewModel: ConversationListViewModel?
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

    nonisolated deinit {
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
            bubbleSkin = BubbleSkin.resolve(conversationAppearance, isDark: isDark)
            stickyDayState.isDark = isDark
            // F-086bis (WS-2) : la pilule jour·heure suit le même thème.
            scrollTimePillState.isDark = isDark
            applySnapshot(reconfigure: .allItems)
        }
    }

    /// Hauteur de la bande status bar / Dynamic Island que la liste recouvre
    /// depuis que le parent SwiftUI l'étend sous la safe area haute
    /// (`ignoresSafeArea(.container, edges: .top)`) pour la transparence
    /// jusqu'en bordure d'écran. Fournie par le parent
    /// (`DeviceLayout.safeAreaTop`) et JAMAIS lue via `view.safeAreaInsets` :
    /// sous `ignoresSafeArea`, SwiftUI ne propage plus l'inset au contrôleur
    /// hébergé, la vue croirait la bande inexistante et poserait la pill de
    /// jour sous l'îlot.
    private(set) var topInset: CGFloat = 0

    /// Réserve, AU REPOS, la hauteur de cette bande. Liste inversée : le HAUT
    /// visuel est `contentInset.bottom`. Le contenu la TRAVERSE au défilement
    /// — c'est tout l'objet du changement — il s'y arrête simplement quand le
    /// flux est déroulé jusqu'au message le plus ancien. Recale aussi l'ancre
    /// de la pill de jour, qui reste sous la rangée du header flottant.
    func applyTopInset(_ inset: CGFloat) {
        topInset = inset
        applyTopInsetToViews()
    }

    /// Hauteur MESURÉE de la bande d'en-tête (grandit avec Dynamic Type) :
    /// les pilules et la réserve de la rangée plate la suivent.
    var headerBandHeight: CGFloat = 0 {
        didSet { if oldValue != headerBandHeight { applyTopInsetToViews() } }
    }

    private func applyTopInsetToViews() {
        guard collectionView != nil else { return }
        // Rangée plate : le repos réserve la rangée de l'en-tête.
        let restTop = topInset + ThreadHeadClearance.value(usesFlatRow: readingMode.usesFlatRow, headerBandHeight: headerBandHeight)
        if collectionView.contentInset.bottom != restTop {
            collectionView.contentInset.bottom = restTop
            collectionView.verticalScrollIndicatorInsets.bottom = restTop
        }
        // Garde source ConversationTopChromeFadeTests (hauteur mesurée).
        stickyDayTopConstraint?.constant = topInset + MessageDayStickyPlacement.topOffset(headerBandHeight: headerBandHeight)
        // F-086bis (WS-2) : ancre de la pilule jour·heure, si montée.
        scrollTimePillTopConstraint?.constant = topInset + MessageDayStickyPlacement.scrollTimePillTop(headerBandHeight: headerBandHeight)
    }

    /// État réactif de la pill flottante « Aujourd'hui / Hier / … » posée au
    /// top du collectionView. Mis à jour à chaque `scrollViewDidScroll` et
    /// après `applySnapshot` pour que le label suive le message en haut visible.
    let stickyDayState = MessageDayStickyState()
    var stickyDayHost: UIHostingController<MessageDayStickyOverlay>?
    /// Ancre verticale de la pill, recalculée par `applyTopInset` : la vue
    /// s'étendant sous la safe area haute, l'offset produit est
    /// `topInset + MessageDayStickyPlacement.topOffset(headerBandHeight:)`.
    var stickyDayTopConstraint: NSLayoutConstraint?
    /// Défilement actif (drag OU décélération) — `store.isUserScrolling`,
    /// la garde des REPORTS de reconfigure (§4.7ter) : re-mesurer des
    /// cellules pendant que la liste bouge nourrit la cascade self-sizing.
    ///
    /// Ce signal ne pilote PAS le chrome : les boutons d'action reviennent
    /// dès la LEVÉE du doigt (`setChromeHiddenForScroll`), pas à l'arrêt
    /// complet — lorsqu'on décélère, les boutons s'affichent directement.
    func setScrollingActive(_ active: Bool) {
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
    /// Le clavier part D'ABORD — `KeyboardFirstScroll.swift`.
    let keyboardFirst = KeyboardFirstScrollGate()
    /// Offset d'arrivée de la décélération en cours (`nil` hors décélération).
    var decelerationTargetOffsetY: CGFloat?

    func setChromeHiddenForScroll(_ hidden: Bool) {
        guard isChromeHiddenForScroll != hidden else { return }
        isChromeHiddenForScroll = hidden
        // **Le sticker de date RESTE** lorsque tous les autres composants
        // disparaissent durant le scroll : c'est pendant le défilement qu'il
        // sert, c'est le seul repère qui dise OÙ l'on est dans le fil. Le reste
        // du chrome se retire (`onScrollingActiveChanged`).
        stickyDayState.isSuppressed = false
        onScrollingActiveChanged?(hidden)
    }

    /// §4.7ter — un `reconfigureItems` global est arrivé PENDANT le geste et
    /// a été retenu (re-mesurer des cellules visibles en plein défilement
    /// décale tout ce qui est au-dessus d'elles). Rejoué à la pose.
    var hasDeferredGlobalReconfigure = false

    /// §4.7ter, volet CIBLÉ — les reconfigures par message (traduction
    /// tardive, transcription Whisper, audio traduit, sélection de langue)
    /// arrivés PENDANT le geste. Une traduction qui change le nombre de
    /// lignes re-mesure une cellule visible et décale tout ce qui est
    /// au-dessus — exactement le saut que le report du reconfigure GLOBAL
    /// évite déjà.
    var deferredTargetedReconfigureIds: Set<String> = []

    func flushDeferredReconfigureAtSettle() {
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
    var lastStickyTopItem: MessageListItem?

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
        // Sur-réserve NULLE, tous modes. Elle ne servirait qu'à la COMPACTION
        // (`FocalScrollPerspective.poses` — « des cellules
        // encore hors écran pour UIKit doivent déjà exister pour occuper la
        // place libérée »), qui n'est pas APPLIQUÉE : la loi reste écrite et
        // testée, la passe ne la joue pas. Tant qu'il en est ainsi, Focal
        // pré-réaliserait 0,3 hauteur d'écran de cellules par frame pour rien.
        // `overscanFraction` et la machinerie de `MessageListLayout` restent
        // en place : c'est ici que la compaction se rebranche avec elles.
        //
        // Corollaire : `layout.focalOverscan`
        // valant TOUJOURS 0, la comptabilité ci-dessus
        // (`focalOverscanBoundsHeight`, le tracking de `bounds.height`, et le
        // guard de `viewDidLayoutSubviews` en dessous) ne prévient aucune
        // invalidation parasite — `MessageListLayout.focalOverscan`
        // déduplique déjà via son `didSet` (`if oldValue != focalOverscan`).
        // C'est de la cérémonie inoffensive, gardée intacte comme point de
        // rebranchement pour quand la compaction reviendra.
        layout.focalOverscan = 0
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        reconfigureVisibleCellsIfWidthChanged()
        guard collectionView.bounds.height != focalOverscanBoundsHeight else { return }
        syncFocalOverscan()
    }

    /// La largeur sous laquelle les cellules visibles ont lu `bubbleContainerWidth`.
    private var bubbleHostingWidth: CGFloat = 0

    /// iPad : fenêtre redimensionnée (Stage Manager, Split View), rotation,
    /// séparateur de colonnes glissé. Les cellules à l'écran garderaient la
    /// largeur max de leur configuration — bulles rognées ou trop étroites
    /// jusqu'au recyclage — et une cellule configurée avant le premier layout
    /// (largeur 0) prendrait celle de la FENÊTRE. Elles se reconfigurent.
    private func reconfigureVisibleCellsIfWidthChanged() {
        let width = collectionView.bounds.width
        guard Self.widthChangeRehostsBubbles(from: bubbleHostingWidth, to: width) else { return }
        bubbleHostingWidth = width
        guard dataSource != nil else { return }
        let visible = collectionView.indexPathsForVisibleItems.compactMap { dataSource.itemIdentifier(for: $0) }
        guard !visible.isEmpty else { return }
        var snapshot = dataSource.snapshot()
        snapshot.reconfigureItems(visible)
        applyToDataSource(snapshot) { [weak self] in self?.applyFocalPerspectiveToVisibleCells() }
    }

    /// Une largeur NOUVELLE et mesurée (au point près) re-héberge les bulles.
    nonisolated static func widthChangeRehostsBubbles(from hosted: CGFloat, to current: CGFloat) -> Bool {
        current > 0 && abs(current - hosted) >= 1
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
        // cas limite — démarrerait donc son timer 4 Hz et ne le verrait jamais
        // s'arrêter, faute de changement de mode ultérieur.
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
        // `80` convient à la bulle. La rangée Focal, elle, réserve
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
            // posé assez de cellules — la constante n'est que le
            // point de départ. Repli sur la cote de bulle quand l'hôte est
            // parti.
            let estimate = self?.currentRowHeightEstimate ?? Self.estimatedBubbleRowLayoutHeight
            return MessageListSectionLayout.section(
                estimate: estimate,
                horizontalInset: Self.sectionHorizontalInset
            )
        }
        // Même règle « près du bas » que `isCurrentlyNearBottom` : sous ce
        // seuil la poussée naturelle d'un message entrant reste le
        // comportement historique (auto-scroll RC2.1 compris).
        layout.nearBottomThreshold = Self.nearBottomFollowThreshold

        collectionView = MessageListCollectionView(frame: view.bounds, collectionViewLayout: layout)
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
        // LE FIL N'EST PAS VOILÉ. Un masque plein écran pour estomper le fil sous
        // l'en-tête et le composeur cacherait tout ce qui se trouve À CÔTÉ des
        // PASTILLES FLOTTANTES qui font le chrome, et un texte masqué ne se lit ni
        // ne se touche : le fil se manipule de l'en-tête à la frontière de
        // l'universal composer bar.
        view.addSubview(collectionView)
    }

    // MARK: - Groupe de rangées (Script/Focal)

    /// Identifiants (ordre chronologique) du groupe qui se TERMINE au
    /// message `lastLocalId` — remonte `store.messages` tant que le message
    /// précédent CONTINUE le groupe (`MessageDayGrouping`, même règle que
    /// `isFirstInGroup`/`isLastInGroup`). Sert à appliquer un choix de langue
    /// posé sur le drapeau du DERNIER message à tout le groupe qu'il ferme.
    /// Portée non-`private` pour rester directement testable (même patron
    /// que `fireOrDeferRecoveryInvalidation` de `MessageListLayout`).
    func messageIdsInGroup(endingAt lastLocalId: String) -> [String] {
        guard let lastIndex = store.index(of: lastLocalId) else { return [lastLocalId] }
        return MessageGroupRules.idsInGroup(endingAt: lastLocalId, lastIndex: lastIndex, messages: store.messages)
    }

    // MARK: - Snapshot

    // `SnapshotReconfigureScope` vit dans `MessageListViewController+Snapshot.swift`
    // avec le reste du cluster — le budget de 1000-1200 lignes interdit
    // d'ajouter à cet hôte sans en avoir d'abord extrait.

    /// Versions posées à la DERNIÈRE pose non différée — la base du diff
    /// `.changedRecords`. PAS mise à jour quand le reconfigure est différé
    /// (§4.7ter) : le flush à la pose retrouve ainsi l'intégralité du delta.
    var lastReconfigureBaseline: [String: Int64] = [:]
    /// `internal` (et non `private`) car le cluster snapshot vit dans
    /// `MessageListViewController+Snapshot.swift` : le chemin court de
    /// la frappe le tient à jour, et en Swift `private` porte sur le FICHIER.
    var lastTypingRosterFingerprint = ""
    var lastConversationStartFingerprint = ""
    /// Portée à rejouer au flush §4.7ter — `.allItems` domine si une bascule
    /// globale est arrivée pendant le geste.
    var deferredReconfigureScope: SnapshotReconfigureScope = .changedRecords

    // MARK: - Verrou de scène (rouleau)

    /// L'ancre du VERROU DE SCÈNE : la rangée du bord haut de l'écran et le
    /// décalage de l'offset par rapport à elle, capturés tant que
    /// l'utilisateur pilote (geste, momentum, scroll intentionnel). Loin du
    /// bas, TOUT mouvement d'offset qui n'est PAS piloté est annulé
    /// sur-le-champ en restaurant cette ancre — quel que soit le mécanisme
    /// du saut (re-hosting qui repasse par la hauteur estimée, clamp d'un
    /// contentSize transitoirement effondré, corrections du solveur
    /// self-sizing : tous reproduits au simulateur, aucun
    /// compensable à sa source car le chemin self-resizing des cellules
    /// hosting ne traverse aucun hook du layout). C'est la loi du ROULEAU :
    /// la scène n'appartient qu'au doigt.
    private var sceneLockAnchor: (item: MessageListItem, offsetDelta: CGFloat)?

    /// Vrai pendant un défilement programmatique VOULU (saut recherche/
    /// citation, slow-scroll de recherche) — le verrou laisse faire.
    /// `internal` car `+UnreadSeparator.swift` y accède : même raison que
    /// `isDark` juste au-dessus.
    var isIntentionalProgrammaticScroll = false
    var programmaticScrollRelease: Task<Void, Never>?

    func beginIntentionalProgrammaticScroll() {
        programmaticScrollRelease?.cancel()
        programmaticScrollRelease = nil
        isIntentionalProgrammaticScroll = true
    }

    /// La frontière gelée du séparateur de premier non-lu — voir
    /// `MessageListViewController+UnreadSeparator.swift`. `internal`, pas
    /// `private` : ce fichier est hors du budget 1000-1200 lignes, la
    /// logique vit dans son extension dédiée.
    var frozenUnreadSeparator: UnreadSeparatorBoundary?

    // MARK: - Visée vérifiée (saut vers un message)

    /// Cible d'un saut en cours de VÉRIFICATION (`ScrollToMessageSettleLaw`).
    /// `scrollToItem` vise un offset calculé sur des hauteurs ESTIMÉES : les
    /// cellules qui se réalisent pendant l'animation décalent le contenu et
    /// l'atterrissage rate la cible. À chaque fin d'animation, la loi compare
    /// l'offset atteint à l'offset qui centrerait la cible (attributs FRAIS)
    /// et re-vise tant que l'écart dépasse la tolérance, budget borné.
    /// Annulée dès que le doigt reprend la main (`scrollViewWillBeginDragging`)
    /// ou qu'un autre scroll voulu part (`scrollToBottom`, slow-scroll).
    var scrollSettleTarget: ScrollToMessageSettleLaw.PendingTarget?

    /// Démarre une visée vérifiée vers `localId` (déjà résolu, présent dans le
    /// snapshot à `indexPath`). Le flash n'est plus émis à l'AVEUGLE sur un
    /// délai — il part à la POSE vérifiée, quand la cellule est réellement là.
    func beginVerifiedScroll(toLocalId localId: String, at indexPath: IndexPath, strong: Bool) {
        // L'index vient du SNAPSHOT (`dataSource.snapshot()`), qui peut être
        // en avance sur ce que la collection view a déjà INGÉRÉ (apply en
        // vol) : `scrollToItem` sur un index pas encore matérialisé lève une
        // NSInternalInconsistencyException. Le trigger parent re-visera une
        // fois la fenêtre posée — même contrat que la cible absente.
        guard collectionView.numberOfSections > 0,
              indexPath.item < collectionView.numberOfItems(inSection: 0) else { return }
        beginIntentionalProgrammaticScroll()
        scrollSettleTarget = ScrollToMessageSettleLaw.PendingTarget(localId: localId, strong: strong)
        collectionView.scrollToItem(at: indexPath, at: .centeredVertically, animated: true)
        scheduleScrollSettleFallback()
    }

    /// Filet du no-op : un `scrollToItem(animated: true)` DÉJÀ à l'offset
    /// cible ne livre jamais `scrollViewDidEndScrollingAnimation`. Si l'offset
    /// n'a pas bougé d'ici là (aucune animation n'a démarré), la vérification
    /// se joue ici ; s'il a bougé, l'animation vit encore et son épilogue
    /// (`scrollViewDidEndScrollingAnimation`) s'en charge.
    func scheduleScrollSettleFallback() {
        let capturedOffsetY = collectionView.contentOffset.y
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            guard let self, self.scrollSettleTarget != nil else { return }
            guard !self.collectionView.isDragging, !self.collectionView.isDecelerating else { return }
            guard abs(self.collectionView.contentOffset.y - capturedOffsetY) < 0.5 else { return }
            self.verifyScrollSettleTarget()
        }
    }

    /// `visibleIndexPaths` : l'inventaire déjà lu par l'appelant du tour de
    /// frame (`scrollViewDidScroll`) — `nil` ⇒ lecture interne, pour les
    /// appels hors défilement (`scrollToBottom`, `settleAtRest`).
    // `internal` (pas `private`) car `+UnreadSeparator.swift` y accède :
    // tout défilement VOULU rend la scène au verrou en faisant ADOPTER à
    // l'ancre la position atteinte — même raison de portée que `isDark` et
    // `applySnapshot` plus haut (`private` porte sur le FICHIER en Swift).
    func captureSceneLockAnchor(visibleIndexPaths: [IndexPath]? = nil) {
        // Appelé à CHAQUE frame de défilement : une seule lecture d'attributs
        // par cellule visible (le `max(by:)` en relisait deux par comparaison,
        // soit ~2·n·log n par frame).
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
    func enforceSceneLock() {
        guard let sceneLockAnchor, let dataSource,
              let indexPath = dataSource.indexPath(for: sceneLockAnchor.item),
              let attrs = collectionView.layoutAttributesForItem(at: indexPath)
        else { return }
        let target = max(0, attrs.frame.minY + sceneLockAnchor.offsetDelta)
        guard abs(collectionView.contentOffset.y - target) > 2 else { return }
        collectionView.setContentOffset(CGPoint(x: 0, y: target), animated: false)
    }

}
