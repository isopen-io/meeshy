import SwiftUI
import MeeshySDK
import MeeshyUI

struct MessageListView: UIViewControllerRepresentable {
    let store: MessageStore
    /// Owner of the live per-message dynamic state (translations,
    /// transcriptions, audio translations, last-message gating). Held weakly
    /// by the underlying controller; the controller snaps required values
    /// into immutable `let`s at cell-config time so SwiftUI doesn't observe
    /// the VM directly from inside cells.
    let conversationViewModel: ConversationViewModel
    let currentUserId: String
    let accentColor: String
    let isDirect: Bool
    /// Vertical clearance reserved at the bottom of the list so the latest
    /// message is never hidden behind the composer/keyboard.
    /// Pass the composer height here.
    var bottomInset: CGFloat = 0
    /// La façon dont `bottomInset` REJOINT sa nouvelle valeur.
    ///
    /// `nil` = pose sèche. Non-nil quand le parent sait quelle
    /// animation est en train de jouer — typiquement la courbe et la durée
    /// que le clavier vient d'annoncer (`KeyboardTransition`) : le fil et la
    /// barre de composition arrivent alors ENSEMBLE, au lieu que l'un glisse
    /// pendant que l'autre se téléporte.
    ///
    /// Déclaré ICI, avec les autres valeurs de configuration (cf.
    /// `isHeaderExpanded`) : l'init memberwise impose l'ordre de déclaration
    /// aux call sites.
    var bottomInsetTransition: ListInsetTransition? = nil
    /// Hauteur de la bande status bar / Dynamic Island que la liste recouvre :
    /// le parent l'étend sous la safe area haute pour que les bulles défilent
    /// jusqu'au bord de l'écran, et lui passe ici l'inset réel de la fenêtre
    /// (`DeviceLayout.safeAreaTop`) — sous `ignoresSafeArea`, ni le
    /// `GeometryReader` ni le contrôleur hébergé ne le connaissent.
    var topInset: CGFloat = 0
    /// Hauteur MESURÉE de la bande d'en-tête flottant — ancre des
    /// pilules de jour et de la réserve de la rangée plate.
    var headerBandHeight: CGFloat = 0
    /// Ce que le chrome flottant montre en ce moment : en rangée
    /// plate, le fil s'efface sous l'en-tête et le composeur tant qu'ils sont
    /// posés, et retrouve le bord de l'écran quand le défilement les escamote.
    /// Incremented from the parent SwiftUI view when the "scroll to latest"
    /// button is tapped. The bridge compares old vs. new to fire scrollToBottom.
    var scrollToBottomTrigger: Int = 0
    /// Set by the parent when a quoted message has been loaded from the server
    /// and the VC needs to scroll to it. Pair with `scrollToMessageTrigger`
    /// (counter) so the bridge detects each distinct request.
    var scrollToMessageId: String? = nil
    var scrollToMessageTrigger: Int = 0
    /// Incrémenté par le parent aux instants où le lecteur DÉCLARE regarder le
    /// bas : ouverture de l'écran, bouton « dernier message », départ en
    /// arrière-plan. Le pont déclenche alors `flushSeenNow()`, qui signale ce
    /// qui est affiché sans attendre le seuil de présence.
    var flushSeenTrigger: Int = 0
    /// True while the ViewModel is searching for a quoted message on the server.
    /// Drives the slow continuous scroll on the underlying UICollectionView.
    var isSearchingQuotedMessage: Bool = false
    /// Header de conversation déplié. Masque la pill de jour tant qu'il est
    /// ouvert (voir `MessageDayStickyState.isHeaderExpanded`).
    ///
    /// Déclaré ICI, avec les autres valeurs de configuration, et non parmi les
    /// `on…` : l'init mémberwise d'une `View` impose l'ordre de déclaration aux
    /// call sites, donc la place d'un stockage n'est pas qu'une question de
    /// lisibilité — glissé entre deux callbacks, il force le parent à passer
    /// une config au milieu de ses fermetures.
    var isHeaderExpanded: Bool = false
    /// Mode de lecture réellement rendu — décision de l'orchestrateur WS-7
    /// (`ConversationView.init`, F-086, futur). Défaut `.bubbles` : tant que
    /// rien ne le pose, comportement bit-à-bit identique à aujourd'hui
    /// (contrat §WS-6, travail 10 — nouvelles props AVANT les closures
    /// `on…`, contrainte d'ordre de l'init memberwise, `:382-387`).
    var readingMode: ConversationReadingMode = .bubbles
    var onNewMessagesBadge: ((Int) -> Void)?
    var onScrollToMessage: ((String) -> Void)?
    /// Invoked when the user approaches the older-messages threshold. Wire to
    /// `ConversationViewModel.loadOlderMessages()` so pagination chains cache
    /// then network — bypassing this hook leaves the store stuck on whatever
    /// GRDB already holds.
    var onLoadOlder: (@MainActor () async -> Void)?
    /// Invoked when the scroll position crosses the near-bottom threshold.
    /// Drives the floating "scroll to latest" button in the parent SwiftUI view.
    var onNearBottomChanged: ((Bool) -> Void)?
    /// Invoked when active scrolling (drag or deceleration) starts/stops.
    /// Wire to fade the header's ACTION BUTTONS while true (loi `ScrollMotion`) —
    /// le header et la pill de jour, eux, restent posés.
    var onScrollingActiveChanged: ((Bool) -> Void)?
    /// Identifiants SERVEUR des messages restés assez longtemps à l'écran pour
    /// compter comme lus. Voir
    /// `docs/superpowers/specs/2026-07-24-read-exactness-design.md`.
    var onMessagesSeen: (([String], [String]) -> Void)?
    /// Tap on a story reply preview inside a bubble. Argument is the story id
    /// (not the message id) — the parent resolves it to a story group + slide.
    var onStoryReplyTap: ((String) -> Void)?
    /// Tap on the sender avatar's story ring in a bubble footer. Argument is
    /// the sender's user id — the parent presents the story viewer.
    var onViewSenderStory: ((String) -> Void)?
    /// Swipe-to-reply on a bubble. Argument is the swiped message id.
    var onSwipeReply: ((String) -> Void)?
    /// Swipe-to-forward on a bubble. Argument is the swiped message id.
    var onSwipeForward: ((String) -> Void)?
    /// Long-press on a bubble — opens the contextual options menu for that
    /// message (reply, forward, react, copy, delete, …). L'overlay rend le
    /// message NORMAL, dans tous les modes de lecture : la capture de la
    /// cellule vivante, bornée à ses `bounds`, trancherait en deux l'identité
    /// et la barre de méta que le mode Focal fait tenir à cheval sur son cadre.
    ///
    /// Le SECOND paramètre du tuple porte le frame RÉEL de la
    /// cellule (`cellFrameInWindow`, résolu côté UIKit) :
    /// `MessageFramePreferenceKey` ne traverse la frontière UIKit qu'en mode
    /// Rivière (`RiverBubbleView`), jamais pour la liste standard.
    var onLongPress: ((String, CGRect?) -> Void)?
    /// L'appui long d'une TUILE — message, pièce visée, frame réel.
    var onLongPressPiece: ((String, String, CGRect?) -> Void)?
    /// id de la bulle présentée dans l'overlay custom d'appui long — la
    /// cellule live correspondante est masquée (opacity 0) le temps de
    /// l'overlay (anti double-bulle fantôme). `nil` = aucune.
    var overlaidMessageId: String? = nil
    /// Long-press on a call-summary notice → request the shared call-detail
    /// sheet for that message, distinct from `onLongPress`'s regular-message menu.
    var onCallDetailRequest: ((String) -> Void)?
    /// **Mode sélection multiple.** `false`/`[]` par défaut — sans
    /// effet sur les écrans qui ne câblent pas ces trois paramètres.
    var isSelectionModeActive: Bool = false
    var selectedMessageIds: Set<String> = []
    var onToggleSelection: ((String) -> Void)?
    /// **Les trois opérations que le menu SYSTÈME sert en premier** (éditer,
    /// sélectionner et composer), plus la porte du GRAND menu.
    ///
    /// Elles remontent chacune d'un cran — de `MessageOverlayMenu`, qui les
    /// portait déjà, jusqu'ici. Aucune n'est réécrite au passage : le menu
    /// système sert les MÊMES rappels que le menu Meeshy, sans quoi deux
    /// entrées du même nom feraient deux choses.
    var onEditMessage: ((String) -> Void)?
    /// **ARME** le mode sélection en semant ce message — ce que fait
    /// « Sélectionner » du menu Meeshy. Distinct de `onToggleSelection`,
    /// qui BASCULE une coche dans un mode déjà actif : le menu doit armer.
    var onSelectMessage: ((String) -> Void)?
    var onComposeFromMessage: ((String) -> Void)?
    /// « Imager » au double tap — remplace « Composer » en tête de barre.
    var onImagineFromMessage: ((String) -> Void)?
    /// « Plus… » ouvre le **GRAND** menu (`MessageMoreSheet`), pas l'overlay
    /// d'appui long — directive porteur : « le plus doit ouvrir le grand menu
    /// et non le menu longpress ». Les deux sont distincts : l'appui long
    /// ouvre l'overlay (réactions + actions), celui-ci la feuille complète.
    var onOpenMoreSheet: ((String) -> Void)?
    /// **Ce que la rangée offre hors du menu est REMIS, jamais recalculé**
    /// (#11214, #12626) : éditer au double toucher, répondre et transférer au
    /// glissé et à VoiceOver. La règle vit dans `MessageMenuContext.make` ; en
    /// poser une seconde ici garantirait qu'elles divergent. Absent ⇒ rien.
    var rowOffer: ((Message) -> MessageRowOffer)?
    /// User-initiated reaction add. Carries the message id and the tapped
    /// bubble cell's on-screen frame (window coords, `nil` when the cell is
    /// not realized) so the quick-reaction bar can anchor to the bubble.
    var onAddReaction: ((String, CGRect?) -> Void)?
    /// Toggle a reaction emoji on a message (tap an existing reaction chip).
    var onToggleReaction: ((String, String) -> Void)?
    /// BUG2 A' — réaction par-image (attachmentId, messageId, emoji).
    var onReactToAttachment: ((String, String, String) -> Void)?
    /// Open the full reactions list / picker sheet for a message.
    var onOpenReactPicker: ((String) -> Void)?
    /// Open the message detail sheet on the "info / views" tab.
    var onShowMessageInfo: ((String) -> Void)?
    /// Tap on the delivery checkmarks (✓ / ✓✓ / ✓✓ bleu) of a sent message —
    /// opens the detail sheet directly on the "vues" tab so the author can
    /// inspect read receipts without going through the long-press menu.
    var onShowReadStatus: ((String) -> Void)?
    /// Manual resend of a FAILED outgoing message (id) → `retryMessage`.
    var onRetry: ((String) -> Void)?
    /// Open the message detail sheet on the "reactions" tab.
    var onShowReactions: ((String) -> Void)?
    /// Open the message detail sheet on the "language / translation" tab.
    var onShowTranslationDetail: ((String) -> Void)?
    /// Lot 3.2 — carte lieu / partage fichier de la rangée plate.
    var onFocalTapLocation: ((SharedPlace, String) -> Void)?
    var onFocalShareFile: ((URL) -> Void)?
    /// Tap on a media attachment — typically pushes a fullscreen viewer.
    var onMediaTap: ((MessageAttachment) -> Void)?
    /// Consume a view-once message; the bubble flips to the consumed state.
    var onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)?
    /// Request an on-demand translation of a specific message into a target
    /// language (issues a socket `translation:request`).
    var onRequestTranslation: ((String, String) -> Void)?
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var storyViewModel: StoryViewModel
    @EnvironmentObject private var statusViewModel: StatusViewModel
    /// SANS abonnement : le fil ne LIT le modèle de liste que pour le
    /// remettre au contrôleur, dans `makeUIViewController`. Déclaré en
    /// `@EnvironmentObject`, il rejouerait `updateUIViewController` à chaque
    /// `typing:start` de n'importe quelle conversation.
    @Environment(\.meeshyConversationList) private var conversationListViewModel
    @Environment(\.colorScheme) private var colorScheme

    /// Porte aussi l'écoute des gestes du fil : un toucher n'importe
    /// où dans la liste — réagir, lancer un audio, ouvrir un menu — rend le
    /// lecteur actif aux yeux de ses pairs, sans rien retenir du geste.
    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
        var lastScrollToBottomTrigger: Int = 0
        var lastScrollToMessageTrigger: Int = 0
        var lastFlushSeenTrigger: Int = 0
        var wasSearchingQuotedMessage: Bool = false

        @MainActor @objc func threadTouched() {
            ConversationViewingReporter.shared.touched()
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                               shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    /// Le défilement du doigt relaie au parent ET au rapporteur de présence :
    /// défiler, c'est regarder.
    private var scrollingRelay: (Bool) -> Void {
        let parent = onScrollingActiveChanged
        return { isActive in
            parent?(isActive)
            ConversationViewingReporter.shared.scrollingChanged(isActive)
        }
    }

    func makeUIViewController(context: Context) -> MessageListViewController {
        let vc = MessageListViewController(
            store: store,
            currentUserId: currentUserId,
            accentColor: accentColor,
            isDirect: isDirect,
            isDark: colorScheme == .dark,
            router: router,
            storyViewModel: storyViewModel,
            statusViewModel: statusViewModel,
            conversationListViewModel: conversationListViewModel
        )
        vc.onNewMessagesBadge = onNewMessagesBadge
        vc.onScrollToMessage = onScrollToMessage
        vc.onLoadOlder = onLoadOlder
        vc.onNearBottomChanged = onNearBottomChanged
        vc.onScrollingActiveChanged = scrollingRelay
        vc.isHeaderExpanded = isHeaderExpanded
        let touches = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.threadTouched))
        touches.cancelsTouchesInView = false
        touches.delaysTouchesEnded = false
        touches.delegate = context.coordinator
        vc.view.addGestureRecognizer(touches)
        // WS-6 (F-085) : posées AVANT `applyBottomInset`/`applyTopInset`
        // ci-dessous — `applyTopInset` recompose `headInset` (§4.5) à partir
        // de `readingMode`/`hasReachedOldest`, qui doivent donc déjà être à
        // jour au moment de son premier appel.
        vc.readingMode = readingMode
        // Cf. `updateUIViewController` : la liste ne se dessine
        // pas sous un pane opaque. Posé dès le montage, sinon une ouverture
        // DIRECTE en Rivière rendrait le fil une fois pour rien.
        vc.view.isHidden = !MessageListViewController.rendersThread(readingMode)
        vc.onMessagesSeen = onMessagesSeen
        // Le fil répond « qu'est-ce qui est à l'écran ? » à une capture.
        ContentCaptureReporter.shared.register(vc)
        vc.onStoryReplyTap = onStoryReplyTap
        vc.onViewSenderStory = onViewSenderStory
        vc.onSwipeReply = onSwipeReply
        vc.onSwipeForward = onSwipeForward
        vc.onLongPress = onLongPress
        vc.onLongPressPiece = onLongPressPiece
        vc.overlaidMessageId = overlaidMessageId
        // `didSet` gardés côté VC (même patron que `readingMode`).
        vc.isSelectionModeActive = isSelectionModeActive
        vc.selectedMessageIds = selectedMessageIds
        vc.onToggleSelection = onToggleSelection
        vc.onEditMessage = onEditMessage
        vc.onSelectMessage = onSelectMessage
        vc.onComposeFromMessage = onComposeFromMessage
        vc.onImagineFromMessage = onImagineFromMessage
        vc.onOpenMoreSheet = onOpenMoreSheet
        vc.rowOffer = rowOffer
        vc.onAddReaction = onAddReaction
        vc.onToggleReaction = onToggleReaction
        vc.onReactToAttachment = onReactToAttachment
        vc.onOpenReactPicker = onOpenReactPicker
        vc.onShowMessageInfo = onShowMessageInfo
        vc.onShowReadStatus = onShowReadStatus
        vc.onRetry = onRetry
        vc.onShowReactions = onShowReactions
        vc.onShowTranslationDetail = onShowTranslationDetail
        vc.onFocalTapLocation = onFocalTapLocation
        vc.onFocalShareFile = onFocalShareFile
        vc.onMediaTap = onMediaTap
        vc.onConsumeViewOnce = onConsumeViewOnce
        vc.onRequestTranslation = onRequestTranslation
        vc.onCallBack = { [weak conversationViewModel] summary in
            conversationViewModel?.callBack(for: summary)
        }
        vc.onCallDetailRequest = onCallDetailRequest
        vc.conversationViewModel = conversationViewModel
        // Le MONTAGE reste sec : animer un inset depuis 0 sur un contrôleur
        // qui vient de naître ferait glisser le fil à chaque ouverture de
        // conversation. Seul `updateUIViewController` suit une courbe.
        vc.applyBottomInset(bottomInset)
        vc.headerBandHeight = headerBandHeight
        vc.applyTopInset(topInset)
        return vc
    }

    func updateUIViewController(_ vc: MessageListViewController, context: Context) {
        vc.update(isDark: colorScheme == .dark, accentColor: accentColor)
        // Posé AVANT `applyBottomInset`/`applyTopInset` plus bas
        // — mêmes raisons que `makeUIViewController`. Le `didSet` côté
        // contrôleur ne rejoue le pass QUE si la valeur change réellement
        // (garde `oldValue != newValue`) : une réaffectation identique à
        // chaque tick SwiftUI est un no-op.
        //
        // LE MODE D'ABORD, avant tout ORDRE POSITIONNEL. Ce
        // `didSet` est l'instant du RÉVEIL : c'est lui qui réapplique
        // `.allItems` quand un pane opaque cesse de couvrir la liste, que
        // l'entonnoir `applyToDataSource` a tenue en veille pendant. Les
        // trois déclencheurs ci-dessous — défilement bas, vidange du suivi de
        // lecture, saut vers un message — commandent une POSITION : les
        // servir avant le réveil viserait un data source qui n'a pas encore
        // repris ce qui est arrivé sous le pane. Le saut de la Rivière et du
        // Résumé (« répondre à cette personne », « ouvrir cet épisode »)
        // emprunte exactement ce chemin, et dans le MÊME passage :
        // `select(.script)` puis `scrollState.scrollToMessageId`.
        vc.readingMode = readingMode
        // If the trigger changed since last update, scroll to latest.
        if scrollToBottomTrigger != context.coordinator.lastScrollToBottomTrigger {
            context.coordinator.lastScrollToBottomTrigger = scrollToBottomTrigger
            vc.scrollToBottom(animated: true)
        }
        if flushSeenTrigger != context.coordinator.lastFlushSeenTrigger {
            context.coordinator.lastFlushSeenTrigger = flushSeenTrigger
            vc.flushSeenNow()
        }
        // If the trigger changed, FAST scroll to the requested message
        // (this fires after jumpToQuotedMessage loaded the target from server).
        if scrollToMessageTrigger != context.coordinator.lastScrollToMessageTrigger {
            context.coordinator.lastScrollToMessageTrigger = scrollToMessageTrigger
            if let targetId = scrollToMessageId {
                vc.scrollToMessageFast(localId: targetId)
            }
        }
        // Start/stop slow scroll based on search state.
        if isSearchingQuotedMessage != context.coordinator.wasSearchingQuotedMessage {
            context.coordinator.wasSearchingQuotedMessage = isSearchingQuotedMessage
            if isSearchingQuotedMessage {
                vc.startSlowScrollUp()
            } else {
                vc.stopSlowScroll()
            }
        }
        vc.onScrollToMessage = onScrollToMessage
        vc.onLoadOlder = onLoadOlder
        vc.onNearBottomChanged = onNearBottomChanged
        vc.onScrollingActiveChanged = scrollingRelay
        vc.isHeaderExpanded = isHeaderExpanded
        // **La liste ne se dessine pas sous ce qui la recouvre.**
        //
        // La Rivière (`RiverConversationHost`) et le Résumé
        // (`LivingSummaryHost`) sont posés PAR-DESSUS le fil dans le même
        // ZStack, avec un fond OPAQUE. Le représentable, lui, reste monté —
        // et c'est VOULU : le démonter perdrait la position de lecture, qui
        // est la promesse du milestone. Mais tant qu'il est visible aux yeux
        // d'UIKit, la `UICollectionView` compose, mesure ses cellules
        // self-sizing et réalise leurs `UIHostingConfiguration` pour des
        // pixels que personne ne voit.
        //
        // `isHidden` retire le RENDU sans toucher aux DONNÉES : le contrôleur
        // reste vivant, ses abonnements aussi, son `contentOffset` intact —
        // donc le retour au fil est instantané et à la bonne place, sans
        // rechargement. Les abonnements ne sont pas SUSPENDUS (les
        // reprendre exigerait de savoir lesquels se rejouent) : c'est leur
        // PUITS qui est fermé — `applyToDataSource` n'applique
        // rien sous un pane, et le réveil réapplique `.allItems`.
        //
        // La condition n'est pas réécrite : `rendersThread` est déjà la loi
        // qui distingue ces deux modes (elle gouverne le suivi de lecture).
        // Une seconde formulation divergerait.
        vc.view.isHidden = !MessageListViewController.rendersThread(readingMode)
        vc.onMessagesSeen = onMessagesSeen
        vc.onStoryReplyTap = onStoryReplyTap
        vc.onViewSenderStory = onViewSenderStory
        vc.onSwipeReply = onSwipeReply
        vc.onSwipeForward = onSwipeForward
        vc.onLongPress = onLongPress
        vc.onLongPressPiece = onLongPressPiece
        vc.overlaidMessageId = overlaidMessageId
        // `didSet` gardés côté VC (même patron que `readingMode`).
        vc.isSelectionModeActive = isSelectionModeActive
        vc.selectedMessageIds = selectedMessageIds
        vc.onToggleSelection = onToggleSelection
        vc.onEditMessage = onEditMessage
        vc.onSelectMessage = onSelectMessage
        vc.onComposeFromMessage = onComposeFromMessage
        vc.onImagineFromMessage = onImagineFromMessage
        vc.onOpenMoreSheet = onOpenMoreSheet
        vc.rowOffer = rowOffer
        vc.onAddReaction = onAddReaction
        vc.onToggleReaction = onToggleReaction
        vc.onReactToAttachment = onReactToAttachment
        vc.onOpenReactPicker = onOpenReactPicker
        vc.onShowMessageInfo = onShowMessageInfo
        vc.onShowReadStatus = onShowReadStatus
        vc.onRetry = onRetry
        vc.onShowReactions = onShowReactions
        vc.onShowTranslationDetail = onShowTranslationDetail
        vc.onFocalTapLocation = onFocalTapLocation
        vc.onFocalShareFile = onFocalShareFile
        vc.onMediaTap = onMediaTap
        vc.onConsumeViewOnce = onConsumeViewOnce
        vc.onRequestTranslation = onRequestTranslation
        vc.onCallBack = { [weak conversationViewModel] summary in
            conversationViewModel?.callBack(for: summary)
        }
        vc.onCallDetailRequest = onCallDetailRequest
        vc.conversationViewModel = conversationViewModel
        // La réserve basse rejoint sa valeur SUR la courbe de ce qui
        // l'a causée (le clavier qui monte ou descend), jamais en un pas sec.
        // `transition == nil` retombe mot pour mot sur la pose sèche.
        vc.applyBottomInset(bottomInset, transition: bottomInsetTransition)
        vc.headerBandHeight = headerBandHeight
        vc.applyTopInset(topInset)
    }

    // Filet de sécurité au démontage SwiftUI : coupe le CADisplayLink du
    // slow-scroll (qui retient le VC) même si `viewDidDisappear` n'a pas
    // été déclenché par le chemin de dismiss emprunté.
    static func dismantleUIViewController(_ vc: MessageListViewController, coordinator: Coordinator) {
        vc.stopSlowScroll()
        // Fermer la conversation ne doit pas perdre une lecture déjà acquise :
        // `deinit` ne peut pas s'en charger, il n'est pas isolé au MainActor.
        vc.flushSeenMessages()
        vc.stopSeenTracking()
        ContentCaptureReporter.shared.unregister(vc)
    }
}
