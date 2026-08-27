import SwiftUI
import Combine
import os
import PhotosUI
import AVFoundation
import Contacts
import MeeshySDK
import MeeshyUI

// MARK: - Swipe-to-go-back enabler
// Réactive le geste de retour par bord gauche d'iOS quand la nav bar est masquée.

private struct InteractivePopEnabler: UIViewControllerRepresentable {
    /// **La Rivière défile HORIZONTALEMENT — le geste de bord doit lui céder.**
    /// Retour produit 2026-08-21 : « aucune possibilité de naviguer librement
    /// horizontalement ». Le geste de retour par bord gauche d'iOS, réactivé
    /// ici pour toutes les autres vues du fil, s'emparait de chaque balayage
    /// latéral : mesuré au simulateur, un glissement dans la Rivière fermait
    /// la conversation au lieu de changer de couloir. Le fil vertical, lui,
    /// n'a jamais eu d'axe horizontal à défendre — d'où l'activation d'origine,
    /// conservée intégralement partout ailleurs. Le bouton « Retour » de
    /// l'en-tête reste, dans les deux cas, le chemin explicite.
    let allowsEdgeSwipe: Bool

    func makeUIViewController(context: Context) -> PopEnablerVC {
        let vc = PopEnablerVC()
        vc.allowsEdgeSwipe = allowsEdgeSwipe
        return vc
    }

    func updateUIViewController(_ vc: PopEnablerVC, context: Context) {
        vc.allowsEdgeSwipe = allowsEdgeSwipe
        vc.applyEdgeSwipePolicy()
    }

    final class PopEnablerVC: UIViewController {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
        var allowsEdgeSwipe: Bool = true

        override func viewWillAppear(_ animated: Bool) {
            super.viewWillAppear(animated)
            applyEdgeSwipePolicy()
        }

        func applyEdgeSwipePolicy() {
            guard let recognizer = navigationController?.interactivePopGestureRecognizer else { return }
            recognizer.isEnabled = allowsEdgeSwipe
            // delegate = nil permet le geste même sans barre de navigation visible
            recognizer.delegate = allowsEdgeSwipe ? nil : recognizer.delegate
        }
    }
}

// MARK: - Active Member (for conversation detail header)
struct ConversationActiveMember: Identifiable { // internal for cross-file extension access
    let id: String
    let name: String
    let color: String
    let avatarURL: String?
}

struct ConversationOverlayState {
    var overlayMessage: Message? = nil
    /// Aperçu d'appui long en Focal : pixels de la cellule vivante + frame
    /// écran, capturés par le contrôleur au moment du geste. `nil` en mode
    /// bulles — l'overlay garde alors son `ThemedMessageBubble` historique.
    var showOverlayMenu = false
    var longPressEnabled = false
    /// **L'état à restituer à la fermeture du menu longpress (#4004).**
    /// `presentLongPressMenu` désactive le clavier/le panneau d'options AVANT
    /// de présenter le menu — sans cette mémoire, ils resteraient fermés une
    /// fois le menu refermé, même si l'auteur était en train de taper.
    /// `nil` tant qu'aucun longpress n'a capturé d'état à restituer.
    var restoreAfterLongPress: (isTyping: Bool, showOptions: Bool)? = nil
    /// **Mode sélection multiple (#4005).** `true` pendant que la liste bascule
    /// en sélection ; chaque bulle devient tappable pour ajouter/retirer de
    /// `selectedMessageIds`, plafonné à `ConversationOverlayState.
    /// selectionCap`. Quitter le mode (bouton Annuler) vide la sélection —
    /// jamais de sélection résiduelle qui réapparaît au prochain appui long.
    var isSelectionModeActive = false
    var selectedMessageIds: Set<String> = []
    /// Maximum de messages ET pièces jointes sélectionnables au total
    /// (retour porteur 2026-08-27, #4005).
    static let selectionCap = 100
    var detailSheetMessage: Message? = nil
    /// Message whose call-detail sheet (transcript-aware, `CallSummaryDetailSheet`)
    /// is presented — separate from `detailSheetMessage`, which stays wired to
    /// `MessageMoreSheet` for regular messages.
    var callDetailMessage: Message? = nil
    var moreSheetInitialItem: MoreItem? = nil
    /// Message dont le picker d'emoji complet (réaction) est présenté.
    var fullReactionPickerMessage: Message? = nil
    var quickReactionMessageId: String? = nil

    /// Bubble cell frame (window coordinates) of the message whose
    /// add-reaction button opened the quick-reaction bar. Anchors the bar's
    /// placement; `nil` falls back to the legacy bottom-pinned position.
    var quickReactionAnchorFrame: CGRect? = nil
    var emojiOnlyMode = false
    var deleteConfirmMessageId: String? = nil
    /// Message dont la feuille de partage système (`UIActivityViewController`)
    /// est présentée — action « Partager » du menu « Plus… ».
    var shareMessage: Message? = nil
    var showStoryViewer = false
    var storyViewerUserId: String? = nil
    var storyViewerGroupIndex: Int = 0
    var storyViewerSlideIndex: Int = 0
    /// `true` quand le viewer est ouvert depuis l'avatar d'un expéditeur
    /// (première non-vue) ; `false` quand une story-reply cible une slide
    /// précise via `storyViewerSlideIndex`.
    var storyViewerStartAtFirstUnviewed = false
    var showReplyThread = false
    var replyThreadParentId: String? = nil
}

struct ConversationScrollState {
    var isNearBottom: Bool = true
    var unreadBadgeCount: Int = 0
    /// True while the message list is actively being dragged/decelerated.
    /// Efface les BOUTONS D'ACTION du header (appel, recherche) le temps du
    /// mouvement — loi commune `ScrollMotion`. Le header lui-même reste
    /// lisible, et la pill de jour garde sa bande à part
    /// (`MessageDayStickyPlacement.topOffset`).
    var isScrollingActiveList: Bool = false
    var scrollToBottomTrigger: Int = 0
    /// Incrémenté quand le lecteur déclare regarder le bas — ouverture, bouton
    /// « dernier message », départ en arrière-plan. Le pont `MessageListView`
    /// compare l'ancien et le nouveau pour vider l'accumulateur de lecture sans
    /// attendre le seuil de présence.
    var flushSeenTrigger: Int = 0
    var scrollToMessageId: String? = nil
    /// Counter incremented each time a scroll-to-message is requested via the
    /// server-loaded path (jumpToQuotedMessage). The MessageListView bridge
    /// compares old vs. new to fire the VC's scrollToMessage.
    var scrollToMessageTrigger: Int = 0
    var swipedMessageId: String? = nil
    var swipeOffset: CGFloat = 0
    var galleryStartAttachment: MessageAttachment? = nil
    var imageToPreview: UIImage? = nil
    var videoToPreview: URL? = nil

    // Media editor queues
    var photosToEdit: [UIImage] = []
    var videosToPreview: [URL] = []
    var editingPendingAttachmentId: String? = nil
    var videoToEdit: URL? = nil
    var audioToEdit: PendingAudioEdit? = nil
    // "Éditer" from the recent-media strip — edited BEFORE staging (the edited
    // output goes through the camera-capture pipeline, never the original).
    var recentImageToEdit: UIImage? = nil
    var recentVideoToEdit: URL? = nil
}

/// Lot 3.2 — enveloppe `Identifiable` d'une URL de fichier pour la
/// `ShareSheet` de la rangée plate (même patron que `BubbleFullscreenPlace`).
struct FocalShareFileItem: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

struct PreviewMedia: Identifiable {
    let id = UUID()
    let url: URL
    let type: String?
}

/// A pending audio attachment opened for editing — carries the attachment id
/// so the editor can replace that exact tray chip on confirm (never append).
struct PendingAudioEdit: Identifiable, Equatable {
    /// The id of the `MessageAttachment` being edited.
    let id: String
    let url: URL
}

struct ConversationComposerState {
    /// Plafond de sélection média du composer de conversation.
    ///
    /// Relevé de 10 à 199 (2026-08-14). Le planner ne découpe PAS par lot :
    /// `MultiAttachmentSendPlanner` produit UNE bulle par type (audio /
    /// visuel), donc 199 photos restent un seul message — la montée de plafond
    /// ne multiplie pas les bulles, elle lève juste la contrainte de saisie.
    /// L'envoi lui-même est borné par la concurrence d'upload, pas par ce
    /// nombre (cf. `TusUploadManager.maxConcurrent`).
    ///
    /// Cette dernière phrase n'est vraie que depuis le 2026-08-16 : la boucle
    /// d'upload attendait chaque fichier avant de lancer le suivant, donc le
    /// pool de l'acteur ne dépassait jamais un actif et 199 photos partaient
    /// l'une après l'autre. `sendMessageWithAttachments` confie désormais le
    /// groupe entier au manager, qui borne réellement.
    static let maxMediaSelection = 199

    var showOptions = false
    var actionAlert: String? = nil
    var forwardMessage: Message? = nil
    /// **Transfert groupé (#4005).** Vide pour les DEUX sites d'ouverture
    /// historiques (longpress simple, swipe) — `forwardMessage` seul porte
    /// alors tout. Non vide UNIQUEMENT depuis le mode sélection multiple :
    /// `endSelectionMode()`-adjacent, posée puis effacée avec
    /// `forwardMessage` par le MÊME `onDismiss` de la feuille.
    var forwardAdditionalMessages: [Message] = []
    /// La cible de « Composer » — le média reçu que la porte va semer.
    /// Non-nil = la porte est présentée.
    var composeMediaTarget: ComposableMediaTarget? = nil
    /// La même cible, RETENUE le temps qu'une feuille se referme.
    ///
    /// Le second déclencheur de « Composer » vit dans la feuille de transfert,
    /// et présenter un plein écran pendant qu'une feuille se démonte est la
    /// course que ce dépôt a déjà payée (« Attempt to present … which is
    /// already presenting »). La promotion se fait donc dans l'`onDismiss` de
    /// la feuille — la primitive SwiftUI prévue pour ce cas exact, là où un
    /// délai n'est qu'un pari.
    var pendingComposeTarget: ComposableMediaTarget? = nil
    var showConversationInfo = false

    // Popup consentement vocal à l'envoi d'audio (2026-07-08) : proposé UNE
    // fois par session de conversation ; quelle que soit la décision, l'envoi
    // repart — le refus envoie l'audio sans transcription/traduction.
    var showVoiceAutoTranslateConsent = false
    var voiceConsentPromptedThisSession = false
    
    // Attachment state
    var pendingAttachments: [MessageAttachment] = []
    var pendingMediaFiles: [String: URL] = [:]
    var pendingThumbnails: [String: UIImage] = [:]
    var isLoadingMedia = false

    /// In-flight attachment preparations (decompression → compression →
    /// thumbnailing → ThumbHash). Each entry renders an `AttachmentLoadingTile`
    /// in the composer tray until it transitions to `.ready`, at which point
    /// the result is moved into `pendingAttachments`/`pendingMediaFiles`/
    /// `pendingThumbnails` and the handle is dropped from this array.
    var preparingAttachments: [PreparingAttachment] = []
    
    // Pickers
    var showPhotoPicker = false
    var showCamera = false
    var showFilePicker = false
    var selectedPhotoItems: [PhotosPickerItem] = []
    /// True while `selectedPhotoItems` is being primed with the recent-media
    /// strip's multi-selection before presenting the PhotosPicker. Priming
    /// fires the selection onChange once — this flag swallows that echo so
    /// items are only ingested when the user actually confirms in the picker.
    var photoPickerPriming = false
    
    // Location & Upload
    var isLoadingLocation = false
    var isUploading = false
    var uploadProgress: UploadQueueProgress? = nil
    var showLocationPicker = false
    /// Lieu choisi via le picker, en attente d'envoi. `SharedPlace` porte le
    /// nom et l'adresse — `MessageAttachment.location` ne les portait pas et
    /// n'est plus le véhicule (Task 11/12, 2026-07-29).
    var pendingPlace: SharedPlace? = nil
    
    // Language (source language for outgoing messages).
    // Resolved via DefaultComposerLanguage: keyboard layout > "fr" fallback.
    // TextAnalyzer overrides this once the user types enough characters.
    var selectedLanguage: String = DefaultComposerLanguage.resolve()

    // Reply & Edit
    var pendingReplyReference: ReplyReference? = nil
    var editingMessageId: String? = nil
    var editingOriginalContent: String? = nil
    /// **Le brouillon en cours au moment d'entrer en édition (#4003).** Sans
    /// lui, `beginEdit` écrase silencieusement ce que l'auteur était en train
    /// de composer, et `cancelEdit`/`submitEdit` ne pouvaient rien restituer.
    /// Posé UNE fois par `beginEdit` (jamais réécrit tant qu'une édition est
    /// en cours), consommé et effacé par `cancelEdit`.
    var draftBeforeEdit: String? = nil

    // Reply attachment preview
    var previewMedia: PreviewMedia? = nil

    // Misc Pickers
    var showContactPicker = false
    var showTextEmojiPicker = false
    var emojiToInject = ""
}

extension ConversationComposerState {
    /// Replaces the audio attachment `attachmentId` in place with the freshly
    /// edited recording. Editing a media attachment must never spawn a second
    /// tray chip — this mirrors the image editor's replace-by-id contract
    /// (`pendingAttachments[idx] = …`). Returns the now-stale audio file URL so
    /// the caller can delete it from disk.
    @discardableResult
    mutating func applyEditedAudio(attachmentId: String, editedURL: URL, durationMs: Int) -> URL? {
        let staleURL = pendingMediaFiles[attachmentId]
        let duration = max(durationMs, 500)
        pendingMediaFiles[attachmentId] = editedURL
        if let index = pendingAttachments.firstIndex(where: { $0.id == attachmentId }) {
            pendingAttachments[index] = MessageAttachment(
                id: attachmentId,
                mimeType: "audio/mp4",
                duration: duration,
                channels: 2,
                thumbnailColor: pendingAttachments[index].thumbnailColor
            )
        } else {
            pendingAttachments.append(
                MessageAttachment(id: attachmentId, mimeType: "audio/mp4", duration: duration, channels: 2)
            )
        }
        return staleURL == editedURL ? nil : staleURL
    }
}

struct ConversationHeaderState {
    var showStoryViewerFromHeader = false
    var storyUserIdForHeader: String?
    var showSearch = false
    var searchQuery = ""
}

struct ConversationView: View {
    let conversation: Conversation?
    var replyContext: ReplyContext? = nil
    var anonymousSession: AnonymousSessionContext? = nil
    /// Lightweight preview presentation (notification long-press overlay):
    /// the composer hides file/photo attachments and exposes a view-once
    /// toggle, while keeping text / voice / effects / blur / ephemeral. Default
    /// `false` leaves the full conversation screen unchanged.
    var previewMode: Bool = false
    /// In `previewMode`, called when the user taps anywhere over the message
    /// area (composer excluded) to leave the preview and open the full
    /// conversation with a navigation transition.
    var onOpenFullConversation: (() -> Void)? = nil
    /// `true` uniquement pour les hôtes SANS point de montage racine du
    /// SyncPill (flux invité — `GuestConversationContainer`, qui ne monte
    /// jamais `RootView`/`iPadRootView` et n'a donc aucune couverture par
    /// le hoist). `false` partout ailleurs : le point de montage unique
    /// couvre déjà le flux authentifié normal, dupliquer la bannière ici
    /// l'afficherait deux fois.
    var showsOwnConnectionBanner: Bool = false
    /// I-075 — override ÉPHÉMÈRE, JAMAIS persistant : item « Focal (bêta) » du
    /// menu d'appui long de la liste (gardé par
    /// `BetaFeaturesPreference.isEnabled`, préférence utilisateur défaut ON —
    /// amendement produit 2026-08-16). `nil` (défaut) ⇒
    /// `init` bit-à-bit identique à avant ce lot — SEUL le site d'appel qui
    /// lit `router.pendingForcedReadingMode` (RootView/iPadRootView) passe une
    /// valeur non-`nil`. Transmis tel quel à
    /// `ReadingModeController.init(forcedMode:)` : court-circuite la décision
    /// D'OUVERTURE sans dupliquer ni relâcher la loi gelée
    /// `ReadingModeOrchestrator.resolveOrchestratorDecision` — voir la
    /// docstring de `ReadingModeController.forcedMode`.
    var forcedReadingMode: ReadingModeOrchestrator.ConversationReadingMode? = nil

    /// Conversation CONFIRMÉE par le serveur après un enregistrement dans
    /// `ConversationSettingsView` (titre, description, avatar, bannière,
    /// réglages), remontée par `ConversationInfoSheet.onConversationUpdated`.
    ///
    /// `conversation` ci-dessus est une valeur FIGÉE, capturée au moment de la
    /// navigation : `MeeshyConversation.==`/`.hash` ne comparent que `id`, donc
    /// aucune recomposition du `NavigationStack` ne la rafraîchit quand seuls
    /// ses champs internes changent. L'override est la seule source vivante.
    @State private var conversationOverride: Conversation?

    /// La conversation à AFFICHER : l'override serveur s'il existe, sinon la
    /// valeur figée. `internal` (pas `private`) : lue par l'extension
    /// `ConversationView+Header`, qui vit dans un autre fichier — `private` est
    /// à portée de fichier.
    var liveConversation: Conversation? { conversationOverride ?? conversation }

    // NOTE: Properties below are internal (not private) for cross-file extension access.
    // Extensions in ConversationView+MessageRow, +Header, +ScrollIndicators, +Composer.

    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) var colorScheme
    /// U1 inc.2 — namespace zoom injecté par RootView (no-op < iOS 18/nil).
    @Environment(\.zoomTransitionNamespace) private var zoomNamespace
    @Environment(\.isStoryViewerPresenting) private var isStoryViewerPresenting
    /// Bascule Reduce Motion IN-APP (§4.9) — la source SYSTÈME
    /// (`UIAccessibility.isReduceMotionEnabled`) est lue directement par
    /// `MessageListViewController` (UIKit), qui combine les DEUX. Ce
    /// contrôleur ne transmet QUE l'override applicatif à `MessageListView`.
    @Environment(\.meeshyForceReduceMotion) private var meeshyForceReduceMotion
    var isDark: Bool { colorScheme == .dark }
    // Lecture directe sans @ObservedObject — évite que chaque event presence force
    // un re-render complet de la conversation. La présence est rafraîchie via les refreshs naturels.
    var presenceManager: PresenceManager { PresenceManager.shared }
    @EnvironmentObject var storyViewModel: StoryViewModel
    @EnvironmentObject var statusViewModel: StatusViewModel
    @EnvironmentObject var router: Router
    @EnvironmentObject var conversationListViewModel: ConversationListViewModel
    @StateObject var viewModel: ConversationViewModel
    /// WS-7 (F-086, contrat §WS-7/A6) — décision de l'orchestrateur des modes
    /// de lecture, prise UNE SEULE FOIS dans `init` (écart #4 du contrat :
    /// `viewModel.start()` marque déjà lu avant la première frame,
    /// `unreadCount` y vaudrait 0 si la décision attendait `onAppear`).
    /// Enveloppe la loi GELÉE `ReadingModeOrchestrator.resolveOrchestratorDecision`
    /// (`Focal/Core/`, M-042) + le stockage local scopé (`ReadingModePreferenceStore`,
    /// F-080). Préférence collante PRIME sur la décision auto ; `auto` rend
    /// la main à l'orchestrateur (seuils ≤25 / >25 / absence>24h∧≥10) —
    /// `ReadingModeController` (F-080, GELÉ) porte cette résolution, non
    /// dupliquée ici.
    @StateObject var readingModeController: ReadingModeController
    /// Capacités résolues UNE SEULE FOIS dans `init`, aux côtés de
    /// `readingModeController` — même `capabilities` locale, aucune seconde
    /// résolution. Alimente `ReadingModeLensCatalog.rows` (§WS-7 travail 5,
    /// arbitrage F-086bis) : Rivière TOUJOURS présente au catalogue, grisée
    /// avec sa VRAIE raison et ses VRAIS seuils quand indisponible — jamais
    /// retirée de la liste (critère §7 « un mode indisponible n'est jamais
    /// un écran vide »).
    let readingModeCapabilities: ReadingModeOrchestrator.ReadingModeCapabilities
    /// « Lire plus » Focal (spec Magnificence §3) — présentée par item :
    /// l'identité du payload est le message.
    @State private var focalReadMorePayload: FocalReadMorePayload?
    /// Lot 3.2 — carte lieu de la rangée plate : plein écran (même patron
    /// que `BubbleFullscreenPlace` côté bulle, même chaîne que « Lire plus »).
    @State private var focalFullscreenPlace: BubbleFullscreenPlace?
    /// Lot 3.2 — fichier à partager depuis la rangée plate (ShareSheet).
    @State private var focalShareFileItem: FocalShareFileItem?
    /// Observes ONLY typing state — avoids full-view re-render on every keystroke.
    /// `internal` (not `private`): accessed by the `ConversationView+ScrollIndicators`
    /// extension, which lives in a separate file (private is file-scoped).
    @ObservedObject var typingObserver: ConversationStateStore
    /// Observe le blocage pour réafficher la zone composer « débloquer » dès
    /// qu'un block/unblock change. Événement rare (action explicite), hors hot
    /// path — safe (même pattern que ConversationListView). Seuls les blocages
    /// SORTANTS sont connus du client ; un blocage entrant remonte en erreur
    /// d'envoi côté gateway.
    private var blockService: BlockService { BlockService.shared }
    /// Texte du composer, ISOLÉ de l'arbre racine : tenu via `@State` (stockage
    /// stable) mais JAMAIS lu dans ce body ni observé ici — seul
    /// `ComposerTextHost` (+Composer) s'y abonne, donc la frappe ne ré-évalue
    /// que le sous-arbre composer au lieu des ~1500 lignes de la racine.
    /// Lecture/écriture depuis les handlers (send, mention, edit) via
    /// `composerText.text` — hors body, donc sans créer de dépendance.
    @State var composerText = ConversationComposerTextModel()
    @StateObject var audioRecorder = AudioRecorderManager()
    @State var scrollButtonAudioIsPlaying = false
    @StateObject var pendingAudioPlayer = AudioPlaybackManager()
    /// Composant unifié « Enregistrer » au niveau écran — sert l'action
    /// `.saveMedia` du menu appui-long (l'overlay n'est pas un cover, la
    /// sheet de destinations se présente sans conflit).
    @StateObject var mediaSaveCoordinator = MediaSaveCoordinator()

    @FocusState var isTyping: Bool
    @FocusState var isSearchFocused: Bool

    @State var composerState = ConversationComposerState()
    @State var headerState = ConversationHeaderState()

    // Overlay & Detail state
    @State var overlayState = ConversationOverlayState()

    /// Per-cell screen-frame map populated by `MessageFramePreferenceKey`
    /// publishes from each `BubbleSwipeContainer`. The long-press handler
    /// looks up the target message's frame here at gesture fire time and
    /// passes it to `MessageOverlayMenu` as the source frame.
    @State var frameTracker = MessageFrameTracker()

    /// Publisher stable (référence identique à chaque body eval) : l'inline
    /// dans scrollToBottomButton reconstruisait l'abonnement au coordinator à
    /// chaque frappe. Le mapping vers le bool dérivé se fait dans la closure
    /// onReceive (l'id d'attachment non-lu change avec les messages entrants).
    let scrollButtonAudioStatePublisher = ConversationAudioCoordinator.sharedForTesting
        .$activeContext
        .combineLatest(ConversationAudioCoordinator.sharedForTesting.$isPlaying)
        .eraseToAnyPublisher()

    // Scroll, Media & Swipe state
    @State var scrollState = ConversationScrollState()
    @State var composerHeight: CGFloat = 130
    /// Hauteur de composer sur laquelle le bouton « redescendre en bas » est
    /// ancré. FIGÉE tant qu'un message est en cours de rédaction : voir
    /// `resolvedScrollButtonAnchor(current:composerHeight:isComposing:)`.
    @State var composerScrollButtonAnchor: CGFloat = 130
    /// #3918 — non-nil pendant l'animation de survol du texte envoyé
    /// (`ComposerSendFlyPreview`). Posé par `sendMessageWithAttachments()`
    /// AVANT que le champ ne soit vidé ; auto-effacé après
    /// `ComposerSendFlyPreview.duration`.
    @State var sendFlyPayload: ComposerSendFlyPayload?
    @State private var keyboardHeight: CGFloat = 0
    @State private var initialScrollCompleted: Bool = false


    let defaultReactionEmojis = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉", "💯", "😍", "👀", "🤣", "💪", "✨", "🥺"]

    // MARK: - Composer Height Measurement

    /// Persist the whole compose state (text, inline reply, selected language,
    /// effects, blur, ephemeral duration) so the user never loses context when
    /// the app is killed mid-sentence. Empty drafts are purged from
    /// `UserDefaults` by `DraftStore.save(_:for:)`.
    private func persistDraft(text: String, attachmentRefs: [DraftAttachmentRef]? = nil) {
        let ref = composerState.pendingReplyReference
        // Les refs de pièces jointes sont l'autorité du handler background
        // (copie durable) : une frappe intermédiaire les PRÉSERVE au lieu de
        // les écraser — sinon chaque lettre tapée perdrait les pièces du
        // brouillon persisté.
        let refs = attachmentRefs
            ?? DraftStore.shared.load(for: viewModel.conversationId)?.attachments
        let draft = MessageDraft(
            text: text,
            replyToId: ref?.messageId,
            replyAuthorName: ref?.authorName,
            replyPreviewText: ref?.previewText,
            replyIsMe: ref?.isMe ?? false,
            selectedLanguage: composerState.selectedLanguage,
            effectFlags: viewModel.pendingEffects.flags.rawValue,
            isBlurEnabled: viewModel.isBlurEnabled,
            ephemeralDurationRawValue: viewModel.ephemeralDuration?.rawValue,
            attachments: (refs?.isEmpty ?? true) ? nil : refs
        )
        DraftStore.shared.save(draft, for: viewModel.conversationId)
    }

    /// Copie durable des pièces jointes du tray au passage en background,
    /// puis re-save du brouillon avec leurs références. Rebuild complet à
    /// chaque background : une pièce retirée du tray ne ressuscite jamais.
    private func persistDraftAttachmentsForBackground() {
        guard let userId = AuthManager.shared.currentUser?.id else { return }
        let refs = MessageDraftMediaStore.persist(
            attachments: composerState.pendingAttachments,
            files: composerState.pendingMediaFiles,
            userId: userId,
            conversationId: viewModel.conversationId
        )
        persistDraft(text: composerText.text, attachmentRefs: refs)
    }

    /// Hauteur cible du composer, ou `nil` quand il ne faut PAS toucher à
    /// `composerHeight`.
    ///
    /// La safe area n'est ajoutée que si le clavier est absent : quand le clavier
    /// est visible la safe area bottom passe à 0 et le `GeometryReader` fire à
    /// chaque frame d'animation, ce qui bouclerait la hauteur sur elle-même.
    ///
    /// `static` + inset injecté : la règle est vérifiable sans instancier la View
    /// ni une fenêtre (doctrine `StoryViewerView.entryStory(of:now:)`).
    static func resolvedComposerHeight(
        contentHeight: CGFloat,
        keyboardHeight: CGFloat,
        safeAreaBottom: CGFloat
    ) -> CGFloat? {
        guard keyboardHeight == 0 else { return nil }
        return contentHeight + safeAreaBottom
    }

    /// Ancrage vertical du bouton « redescendre en bas ».
    ///
    /// Le bouton était posé sur `composerHeight`, qui grandit d'une ligne à
    /// chaque retour à la ligne du champ de saisie : écrire un message faisait
    /// donc REMONTER le bouton sous le doigt, et ce déplacement se lisait comme
    /// un retour au bas de la conversation alors que l'utilisateur était en
    /// train de relire son historique.
    ///
    /// Pendant la rédaction, l'ancrage reste donc celui d'avant la première
    /// frappe. Il se réaligne dès que le champ redevient vide — à l'envoi, ou
    /// quand l'utilisateur efface — c'est-à-dire aux seuls moments où plus
    /// aucune position de lecture n'est en jeu. Les autres causes de
    /// redimensionnement du composer (ouverture des options, barre de réponse)
    /// continuent de le déplacer : elles ne sont pas « écrire ».
    static func resolvedScrollButtonAnchor(
        current: CGFloat,
        composerHeight: CGFloat,
        isComposing: Bool
    ) -> CGFloat {
        isComposing ? current : composerHeight
    }

    private func updateComposerHeight(_ contentHeight: CGFloat) {
        // `DeviceLayout.safeAreaBottom` et non un parcours de `connectedScenes` :
        // ce dernier est un `Set` NON ORDONNÉ, donc `.first` peut renvoyer une
        // scène d'arrière-plan. En Split View / Stage Manager le composer était
        // alors dimensionné contre l'inset d'une AUTRE fenêtre.
        guard let height = Self.resolvedComposerHeight(
            contentHeight: contentHeight,
            keyboardHeight: keyboardHeight,
            safeAreaBottom: DeviceLayout.safeAreaBottom
        ) else { return }
        composerHeight = height
        composerScrollButtonAnchor = Self.resolvedScrollButtonAnchor(
            current: composerScrollButtonAnchor,
            composerHeight: height,
            isComposing: !composerText.text.isEmpty
        )
    }

    // MARK: - Computed Properties

    var headerStoryRingState: StoryRingState {
        guard conversation?.type == .direct,
              let userId = conversation?.participantUserId else { return .none }
        return storyViewModel.storyRingState(forUserId: userId)
    }

    var accentColor: String {
        conversation?.accentColor ?? DynamicColorGenerator.colorForName(conversation?.name ?? "Unknown")
    }

    var secondaryColor: String {
        conversation?.colorPalette.secondary ?? MeeshyColors.indigo300Hex
    }

    var isDirect: Bool {
        conversation?.type == .direct
    }

    /// DM participant the current user has (outgoing) blocked — drives the
    /// composer "unblock to chat" zone. `nil` when not a DM, no participant, or
    /// not blocked. Only outgoing blocks are known client-side (product
    /// decision); incoming blocks surface as a gateway send error.
    var blockedDirectParticipantId: String? {
        guard isDirect, let uid = conversation?.participantUserId,
              blockService.isBlocked(userId: uid) else { return nil }
        return uid
    }

    var cachedLastReceivedIndex: Int? {
        viewModel.cachedLastReceivedIndex
    }

    var headerPresenceState: PresenceState {
        guard isDirect, let userId = conversation?.participantUserId else { return .offline }
        return presenceManager.presenceState(for: userId)
    }

    var headerMoodEmoji: String? {
        guard isDirect, let userId = conversation?.participantUserId else { return nil }
        return statusViewModel.statusForUser(userId: userId)?.moodEmoji
    }

    var conversationSection: ConversationSection? {
        guard let sectionId = conversation?.userState.sectionId else { return nil }
        // ConversationSection.allSections should be accessed via a fast dictionary in production apps,
        // but since we only have the Array here, we can lazily build a static dictionary.
        return Self.sectionLookup[sectionId]
    }

    private static var _sectionLookup: [String: ConversationSection]?
    private static var sectionLookup: [String: ConversationSection] {
        if let cached = _sectionLookup { return cached }
        let dict = Dictionary(uniqueKeysWithValues: ConversationSection.allSections.map { ($0.id, $0) })
        _sectionLookup = dict
        return dict
    }

    var topActiveMembers: [ConversationActiveMember] {
        viewModel.topActiveMembersList(accentColor: accentColor)
    }

    var isCurrentUserAdminOrMod: Bool {
        let convRole = conversation?.currentUserRole?.uppercased() ?? ""
        let platformRole = AuthManager.shared.currentUser?.role?.uppercased() ?? ""
        let modRoles: Set<String> = ["ADMIN", "MODERATOR", "BIGBOSS"]
        return modRoles.contains(convRole) || modRoles.contains(platformRole)
    }

    // MARK: - Init

    init(conversation: Conversation?, replyContext: ReplyContext? = nil, anonymousSession: AnonymousSessionContext? = nil, previewMode: Bool = false, showsOwnConnectionBanner: Bool = false, onOpenFullConversation: (() -> Void)? = nil, forcedReadingMode: ReadingModeOrchestrator.ConversationReadingMode? = nil) {
        self.conversation = conversation
        self.replyContext = replyContext
        self.anonymousSession = anonymousSession
        self.previewMode = previewMode
        self.showsOwnConnectionBanner = showsOwnConnectionBanner
        self.onOpenFullConversation = onOpenFullConversation
        self.forcedReadingMode = forcedReadingMode
        let vm = ConversationViewModel(
            conversationId: conversation?.id ?? "",
            unreadCount: conversation?.userState.unreadCount ?? 0,
            isDirect: conversation?.type == .direct,
            participantUserId: conversation?.participantUserId,
            memberJoinedAt: conversation?.currentUserJoinedAt,
            closedAt: conversation?.closedAt,
            anonymousSession: anonymousSession
        )
        _viewModel = StateObject(wrappedValue: vm)
        // Wire the typing observer separately so typing changes don't re-evaluate
        // the full conversation body — only typing-specific sub-views update.
        _typingObserver = ObservedObject(wrappedValue: vm.stateStore)

        // WS-7 (F-086, A6) — décision de l'orchestrateur, ICI, UNE SEULE
        // FOIS. `identity`/`capabilities`/`isFlagEnabled` sont les mêmes
        // entrées que celles déjà lues plus haut pour `vm` — aucune seconde
        // résolution invité/inscrit (§5.1 : `ConversationViewerIdentityResolver`
        // est l'UNIQUE point de branchement).
        let identity = ConversationViewerIdentityResolver.resolve(
            authManager: AuthManager.shared,
            anonymousSession: anonymousSession
        )
        let isFlagEnabled = MeeshyFeatureFlags.isReadingModesEnabled
        let capabilities = ReadingModeOrchestrator.resolveCapabilities(.init(
            identity: identity.readingModeIdentity,
            isFlagEnabled: isFlagEnabled,
            // Chantier Rivière iOS, lot 1 (2026-08-21) : le drapeau `riviere_mode`
            // rend `.river` réellement sélectionnable à l'ouverture du fil —
            // et `RiverConversationHost` est monté dans ce même fichier (la
            // sélection n'est plus une promesse rompue).
            isRiverFlagEnabled: LentilleFeatureFlag.isRiviereModeEnabled,
            conversationType: Self.readingModeConversationType(for: conversation?.type),
            activeParticipantCount: conversation?.memberCount ?? 0
        ))
        _readingModeController = StateObject(wrappedValue: ReadingModeController(
            conversationId: conversation?.id ?? "",
            scope: identity.scope,
            unreadCount: conversation?.userState.unreadCount ?? 0,
            capabilities: capabilities,
            isFlagEnabled: isFlagEnabled,
            forcedMode: forcedReadingMode
        ))
        // Même `capabilities` locale que ci-dessus — pas de seconde résolution
        // (§WS-7 travail 5, arbitrage F-086bis) : le catalogue de la feuille
        // Lentille lit `readingModeCapabilities`, jamais un recalcul.
        self.readingModeCapabilities = capabilities

        // Écart #4 (accepté par l'arbitrage F-086bis, documenté dans le
        // rapport WS-7/F-086bis) : ce chemin drapeau-ON de `init` ne peut pas
        // être prouvé par construction directe de `ConversationView` en test
        // — `ConversationViewModel.init` déclenche de vrais GRDB/réseau
        // (`ConversationDependencies.live`), sans point d'injection. Couvert
        // indirectement par `ConversationViewReadingModeInitTests` (les 9 cas
        // purs de `readingModeConversationType`) et
        // `ConversationViewReadingModeSourceGuardTests` (preuves par lecture
        // de source : une seule construction de `ReadingModeController`,
        // `capabilities` résolue une fois, réutilisée par `readingModeCapabilities`).
        // Risque documenté, accepté tel quel — non re-testé ici.
    }

    /// SDK `MeeshyConversation.ConversationType` (8 cas) → miroir GELÉ de la
    /// Hauteur de la bande de boutons de l'en-tête flottant, sous la safe
    /// area : une rangée à la cible tactile HIG (`meeshyTapTarget`, 44) plus
    /// le retrait haut que `expandedHeaderBand` s'applique. C'est la seule
    /// cote de CE fichier que la Rivière consomme — la peau, elle, ne connaît
    /// que ses propres tokens (`RiverMetrics`).
    static let riverHeaderClearance: CGFloat = 44 + MeeshySpacing.sm

    /// loi de lecture (`ReadingModeOrchestrator.ConversationType`, 5 cas —
    /// RE-PREUVE : `community`/`channel`/`bot` n'y existent pas). Les trois
    /// cas absents sont des conversations multi-parties comme `.group` —
    /// jamais `.direct`, la seule distinction qui compte pour
    /// `resolveCapabilities` (éligibilité Rivière : « jamais en direct »).
    /// `nil` (aucune conversation) ⇒ `.group`, cohérent avec `isDirect`
    /// (calculée plus haut), qui traite déjà un `conversation` nil comme
    /// « pas direct ».
    /// `internal` (pas `private`) : lu directement par
    /// `ConversationViewReadingModeInitTests` (`@testable import Meeshy`).
    static func readingModeConversationType(
        for sdkType: MeeshyConversation.ConversationType?
    ) -> ReadingModeOrchestrator.ConversationType {
        switch sdkType {
        case .direct: return .direct
        case .group, .community, .channel, .bot, nil: return .group
        case .public: return .public
        case .global: return .global
        case .broadcast: return .broadcast
        }
    }

    // MARK: - Encryption Disclaimer

    @ViewBuilder
    private var encryptionDisclaimer: some View {
        if let conv = conversation, conv.encryptionMode != nil, !viewModel.hasOlderMessages, !viewModel.paginationPhase.isBlockingSpinnerNeeded {
            VStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "lock.fill")
                    .font(MeeshyFont.relative(14, weight: .bold))
                    .foregroundColor(MeeshyColors.indigo400)
                    .padding(MeeshySpacing.sm)
                    .background(Circle().fill(MeeshyColors.indigo400.opacity(0.15)))

                Text(String(localized: "conversation.view.e2e_notice", bundle: .main))
                    .font(MeeshyFont.relative(12))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, MeeshySpacing.sm)
            }
            .padding(.vertical, MeeshySpacing.lg)
            .padding(.horizontal, MeeshySpacing.lg)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md - 2)
                    .fill(isDark ? Color.black.opacity(0.4) : Color(UIColor.systemBackground).opacity(0.6))
            )
            .padding(.horizontal, MeeshySpacing.xxl)
            .padding(.top, MeeshySpacing.lg)
            .padding(.bottom, MeeshySpacing.sm)
        }
    }

    // MARK: - Closed Conversation Banner

    private var closedConversationBanner: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "lock.fill")
                .foregroundColor(.secondary)
            Text(String(localized: "conversation.view.closed", bundle: .main))
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.md + 2)
        .background(.ultraThinMaterial)
    }

    // MARK: - Blocked Conversation Composer Zone

    /// Replaces the composer for a DM the user has blocked: explains they must
    /// unblock to write to and receive messages from the user, with a one-tap
    /// unblock CTA. Mirrors `closedConversationBanner`'s static-zone pattern.
    private func blockedComposerZone(userId: String) -> some View {
        VStack(spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "hand.raised.fill")
                    .foregroundColor(.secondary)
                Text(String(localized: "conversation.composer.blocked.title", bundle: .main))
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.secondary)
            }
            Text(String(localized: "conversation.composer.blocked.subtitle", bundle: .main))
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
            Button {
                HapticFeedback.medium()
                Task {
                    await BlockActionCoordinator.shared.unblock(userId: userId)
                    await MainActor.run { HapticFeedback.success() }
                }
            } label: {
                Text(String(localized: "conversation.composer.blocked.unblock", bundle: .main))
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, MeeshySpacing.xxl)
                    .padding(.vertical, MeeshySpacing.sm + 2)
                    .background(Capsule().fill(Color(hex: accentColor)))
            }
            .accessibilityLabel(String(localized: "conversation.composer.blocked.unblock", bundle: .main))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.lg)
        .padding(.horizontal, MeeshySpacing.xxl)
        .background(.ultraThinMaterial)
    }

    // MARK: - Body

    var body: some View {
        bodyWithSheets
    }

    private var bodyWithSheets: AnyView {
        AnyView(
        bodyWithCovers
            .fullScreenCover(isPresented: $headerState.showStoryViewerFromHeader) {
                StoryViewerContainer(
                    viewModel: storyViewModel,
                    userId: headerState.storyUserIdForHeader,
                    isPresented: $headerState.showStoryViewerFromHeader,
                    onReplyToStory: { replyContext in
                        headerState.showStoryViewerFromHeader = false
                        router.navigateToStoryReply(replyContext, conversationListViewModel: conversationListViewModel)
                    },
                    singleGroup: true,
                    startAtFirstUnviewed: true,
                    presentationSource: "ConversationView.header"
                )
                // Re-inject env objects required by StoryViewerView for its
                // internal SharePickerView sheet. fullScreenCover does NOT
                // inherit EnvironmentObjects automatically.
                .environmentObject(router)
                .environmentObject(statusViewModel)
                .environmentObject(conversationListViewModel)
                // U1 inc.2 — zoom depuis la bulle si elle est enregistrée
                // (tray in-chat), fallback cover standard sinon (avatar header).
                .zoomTransitionDestination(sourceID: headerState.storyUserIdForHeader ?? "", in: zoomNamespace)
            }
            .fullScreenCover(isPresented: $overlayState.showStoryViewer) {
                StoryViewerContainer(
                    viewModel: storyViewModel,
                    userId: overlayState.storyViewerUserId,
                    isPresented: $overlayState.showStoryViewer,
                    onReplyToStory: { replyContext in
                        overlayState.showStoryViewer = false
                        router.navigateToStoryReply(replyContext, conversationListViewModel: conversationListViewModel)
                    },
                    singleGroup: true,
                    initialStoryIndex: overlayState.storyViewerSlideIndex,
                    startAtFirstUnviewed: overlayState.storyViewerStartAtFirstUnviewed,
                    presentationSource: "ConversationView.overlay"
                )
                // Re-inject env objects required by StoryViewerView for its
                // internal SharePickerView sheet. fullScreenCover does NOT
                // inherit EnvironmentObjects automatically.
                .environmentObject(router)
                .environmentObject(statusViewModel)
                .environmentObject(conversationListViewModel)
                .zoomTransitionDestination(sourceID: overlayState.storyViewerUserId ?? "", in: zoomNamespace)
            }
            .sheet(isPresented: $composerState.showConversationInfo) {
                if let conv = liveConversation {
                    ConversationInfoSheet(
                        conversation: conv,
                        accentColor: accentColor,
                        messages: viewModel.messages,
                        onConversationUpdated: { conversationOverride = $0 }
                    )
                }
            }
            .alert(String(localized: "conversation.view.action_selected", bundle: .main), isPresented: Binding(get: { composerState.actionAlert != nil }, set: { if !$0 { composerState.actionAlert = nil } })) {
                Button(String(localized: "common.ok", bundle: .main)) { composerState.actionAlert = nil }
            } message: { Text(composerState.actionAlert ?? "") }
            // Popup consentement vocal (2026-07-08) : envoi d'un audio sans
            // consentement validé → proposer la traduction automatique. La
            // validation accorde le consentement de définition du profil
            // vocal ET la traduction utilisant ce profil, puis relance
            // l'envoi ; « Plus tard » envoie tel quel (le composer n'a pas
            // encore été vidé quand ce popup interrompt le send).
            .alert(
                String(localized: "conversation.voiceConsent.title",
                       defaultValue: "Traduction automatique des vocaux", bundle: .main),
                isPresented: $composerState.showVoiceAutoTranslateConsent
            ) {
                Button(String(localized: "conversation.voiceConsent.accept",
                              defaultValue: "Activer", bundle: .main)) {
                    viewModel.grantVoiceAutoTranslationConsent()
                    sendMessageWithAttachments()
                }
                Button(String(localized: "conversation.voiceConsent.later",
                              defaultValue: "Plus tard", bundle: .main), role: .cancel) {
                    sendMessageWithAttachments()
                }
            } message: {
                Text(String(localized: "conversation.voiceConsent.message",
                            defaultValue: "Autorisez la définition de votre profil vocal pour que vos messages vocaux soient transcrits et traduits automatiquement dans la langue de chaque destinataire — y compris avec votre voix.",
                            bundle: .main))
            }
            .confirmationDialog(
                String(localized: "conversation.view.delete_message.title", bundle: .main),
                isPresented: Binding(
                    get: { overlayState.deleteConfirmMessageId != nil },
                    set: { if !$0 { overlayState.deleteConfirmMessageId = nil } }
                ),
                titleVisibility: .visible,
                presenting: overlayState.deleteConfirmMessageId
            ) { msgId in
                // "Delete for everyone" only if the user authored the
                // message AND the 2-hour window hasn't elapsed — matches
                // WhatsApp's "Delete for everyone" gating.
                if let idx = viewModel.messageIndex(for: msgId),
                   viewModel.canDeleteForEveryone(viewModel.messages[idx]) {
                    Button(String(localized: "conversation.view.delete_for_everyone", bundle: .main), role: .destructive) {
                        Task { await viewModel.deleteMessage(messageId: msgId, mode: .everyone) }
                        overlayState.deleteConfirmMessageId = nil
                    }
                }
                Button(String(localized: "conversation.view.delete_for_me", bundle: .main), role: .destructive) {
                    Task { await viewModel.deleteMessage(messageId: msgId, mode: .local) }
                    overlayState.deleteConfirmMessageId = nil
                }
                Button(String(localized: "common.cancel", bundle: .main), role: .cancel) { overlayState.deleteConfirmMessageId = nil }
            } message: { _ in
                Text(String(localized: "conversation.view.delete_for_everyone.hint", bundle: .main))
            }
            .sheet(item: $overlayState.shareMessage) { msg in
                ShareSheet(activityItems: [viewModel.preferredTranslation(for: msg.id)?.translatedContent ?? msg.content])
                    .presentationDetents([.medium, .large])
            }
            .sheet(item: $composerState.forwardMessage, onDismiss: {
                // #4005 — le transfert groupé se referme AVEC le simple.
                composerState.forwardAdditionalMessages = []
                // La feuille est DÉMONTÉE : le plein écran peut prendre sa
                // place. Promouvoir plus tôt présenterait deux modaux à la fois.
                guard let attendue = composerState.pendingComposeTarget else { return }
                composerState.pendingComposeTarget = nil
                composerState.composeMediaTarget = attendue
            }) { msgToForward in
                ForwardPickerSheet(
                    message: msgToForward,
                    additionalMessages: composerState.forwardAdditionalMessages,
                    sourceConversationId: conversation?.id ?? "",
                    accentColor: accentColor,
                    onOpenConversation: { router.navigateToConversation($0) },
                    // Loi 6 — SECOND point d'entrée du MÊME chemin, jamais une
                    // dixième porte : la feuille se referme et rend la main,
                    // l'hôte pose le même état que l'appui long. Elle ne monte
                    // pas le meuble, ce qui en ferait un second contrat d'envoi.
                    onCompose: { composerState.pendingComposeTarget = ComposableMediaTarget(message: msgToForward) },
                    onDismiss: { composerState.forwardMessage = nil }
                )
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
                    // ForwardPickerSheet reads `@EnvironmentObject StatusViewModel`
                    // internally — .sheet does not reliably inherit the parent's
                    // environment across this boundary (documented crash pattern,
                    // see docs/lessons on @EnvironmentObject-across-sheet).
                    .environmentObject(statusViewModel)
            }
            // Flou du fond quand l'overlay d'appui-long est ouvert — appliqué
            // AVANT `.overlay` pour ne flouter que la conversation, jamais le
            // menu (bulle liftée + barres) qui se pose au-dessus, net.
            .blur(radius: overlayState.showOverlayMenu ? 12 : 0)
            .animation(.easeOut(duration: 0.28), value: overlayState.showOverlayMenu)
            .overlay { overlayMenuContent }
            // #4004 — restitue le clavier/panneau d'options désactivés par
            // `presentLongPressMenu` à l'ouverture, quand le menu se referme
            // (tap ailleurs, swipe, action choisie).
            .adaptiveOnChange(of: overlayState.showOverlayMenu) { _, isShowing in
                if !isShowing { restoreStateAfterLongPressIfNeeded() }
            }
            .onPreferenceChange(MessageFramePreferenceKey.self) { frames in
                frameTracker.update(frames)
            }
            .sheet(isPresented: $overlayState.showReplyThread) {
                if let parentId = overlayState.replyThreadParentId,
                   let parent = viewModel.messages.first(where: { $0.id == parentId }) {
                    ThreadView(parentMessage: parent, conversationId: viewModel.conversationId)
                        .environmentObject(statusViewModel)
                }
            }
            // Feuille Lentille (§WS-7 travail 5, arbitrage F-086bis) —
            // catalogue construit depuis `readingModeCapabilities`, résolue
            // UNE SEULE FOIS dans `init` (aucune seconde résolution).
            // Sélection ET retour-auto passent PAR `readingModeController`
            // (préférence collante F-080 GELÉE) — jamais un état local dupliqué.
            .sheet(item: $focalReadMorePayload) { payload in
                FocalReadMoreSheet(payload: payload)
            }
            // Lot 3.2 — plein écran du lieu depuis la rangée plate : mêmes
            // primitives que la bulle (`BubbleStandardLayout`,
            // `.fullScreenCover(item: $fullscreenPlace)`), présentées ICI
            // parce que la rangée vit dans une cellule de collection (même
            // chaîne que « Lire plus »).
            .fullScreenCover(item: $focalFullscreenPlace) { item in
                LocationFullscreenView(
                    latitude: item.place.latitude,
                    longitude: item.place.longitude,
                    placeName: item.place.name,
                    address: item.place.address,
                    accentColor: accentColor,
                    senderName: nil
                )
            }
            .sheet(item: $focalShareFileItem) { item in
                ShareSheet(activityItems: [item.url])
            }
        )
    }

    private var bodyWithCovers: AnyView {
        AnyView(
        bodyWithLifecycle
            // La PORTE du média reçu (lot 5, O13). Un plein écran, pas une
            // feuille : c'est un atelier, et il occupe l'écran comme celui de
            // la création. Elle vit dans la couche des COVERS et non dans celle
            // des feuilles, où le débordement de pile par profondeur de type a
            // déjà coûté dix-huit rapports device.
            //
            // Le montage du MEUBLE, lui, reste dans la porte : le poser ici
            // recopierait son envoi, sa reprise hors-ligne et sa sortie — et
            // ce lot livre justement un SECOND déclencheur du même chemin.
            .fullScreenCover(item: $composerState.composeMediaTarget) { cible in
                ConversationMediaComposerDoor(
                    // L'INTENTION naît dans la porte, pas ici : un second site
                    // qui la construirait serait un second contrat à tenir
                    // d'accord, et ce lot a DEUX déclencheurs pour une seule
                    // présentation. L'hôte ne remet que la cible.
                    target: cible,
                    storyViewModel: storyViewModel,
                    router: router,
                    conversationListViewModel: conversationListViewModel,
                    statusViewModel: statusViewModel,
                    onDismiss: { composerState.composeMediaTarget = nil }
                )
            }
            .fullScreenCover(item: $scrollState.galleryStartAttachment) { startAttachment in
                ConversationMediaGalleryView(
                    allAttachments: viewModel.allVisualAttachments,
                    startAttachmentId: startAttachment.id,
                    accentColor: accentColor,
                    captionMap: viewModel.mediaCaptionMap,
                    senderInfoMap: viewModel.mediaSenderInfoMap
                )
            }
            .fullScreenCover(item: $composerState.previewMedia) { media in
                switch media.type {
                case "video":
                    VideoFullscreenPlayer(urlString: media.url.absoluteString, speed: .x1_0)
                case "audio":
                    VideoFullscreenPlayer(urlString: media.url.absoluteString, speed: .x1_0)
                default:
                    ImageFullscreen(imageUrl: media.url, accentColor: accentColor)
                }
            }
            .mediaSaveFlow(mediaSaveCoordinator)
            .sheet(item: $overlayState.detailSheetMessage) { msg in
                let ctx = MessageMenuContext(
                    isMine: msg.isMe,
                    canEdit: msg.isMe || isCurrentUserAdminOrMod,
                    canDelete: msg.isMe || isCurrentUserAdminOrMod,
                    hasText: !msg.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                    hasMedia: !msg.attachments.isEmpty,
                    hasTimebasedMedia: msg.attachments.contains { AttachmentKind(mimeType: $0.mimeType).hasTimebasedTrack },
                    isPinned: msg.pinnedAt != nil,
                    isStarred: viewModel.isStarred(messageId: msg.id),
                    isEdited: msg.isEdited,
                    hasEditRevisions: !viewModel.editRevisions(for: msg.id).isEmpty,
                    showReadReceipts: UserPreferencesManager.shared.privacy.showReadReceipts,
                    isForwardable: msg.isForwardable
                )
                MessageMoreSheet(
                    message: msg,
                    contactColor: conversation?.accentColor ?? MeeshyColors.brandPrimaryHex,
                    conversationId: viewModel.conversationId,
                    sections: MessageActionResolver.moreSections(ctx),
                    initialItem: overlayState.moreSheetInitialItem,
                    textTranslations: viewModel.messageTranslations[msg.id] ?? [],
                    transcription: viewModel.messageTranscriptions[msg.id],
                    translatedAudios: viewModel.messageTranslatedAudios[msg.id] ?? [],
                    editRevisions: viewModel.editRevisions(for: msg.id),
                    onReply: { triggerReply(for: msg) },
                    onForward: { composerState.forwardMessage = msg },
                    onThread: {
                        overlayState.replyThreadParentId = msg.id
                        overlayState.showReplyThread = true
                    },
                    onSaveMedia: {
                        guard let attachment = msg.attachments.first(where: { $0.type != .location }) else { return }
                        HapticFeedback.light()
                        mediaSaveCoordinator.requestSave(MediaSaveRequest(
                            kind: attachment.kind,
                            remoteURLString: attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl,
                            suggestedFileName: attachment.originalName.isEmpty ? nil : attachment.originalName,
                            attachmentId: attachment.id.isEmpty ? nil : attachment.id
                        ))
                    },
                    onDeleteMedia: {
                        if let attId = msg.attachments.first?.id {
                            Task { await viewModel.deleteAttachment(messageId: msg.id, attachmentId: attId) }
                        }
                    },
                    onPin: { Task { await viewModel.togglePin(messageId: msg.id) }; HapticFeedback.medium() },
                    onToggleStar: {
                        _ = viewModel.toggleStar(messageId: msg.id, conversationName: conversation?.name, conversationAccentColor: accentColor)
                    },
                    onDeleteMessage: { overlayState.deleteConfirmMessageId = msg.id },
                    onEdit: { beginEdit(msg) },
                    onCopy: {
                        UIPasteboard.general.string = viewModel.preferredTranslation(for: msg.id)?.translatedContent ?? msg.content
                        HapticFeedback.success()
                    },
                    onShare: { overlayState.shareMessage = msg },
                    onReact: { emoji in viewModel.toggleReaction(messageId: msg.id, emoji: emoji) },
                    onSelectTranslation: { translation in
                        viewModel.setActiveTranslation(for: msg.id, translation: translation)
                    },
                    onSelectAudioLanguage: { langCode in
                        viewModel.setActiveAudioLanguage(for: msg.id, language: langCode)
                    },
                    onReport: { type, reason in
                        Task {
                            let success = await viewModel.reportMessage(messageId: msg.id, reportType: type, reason: reason)
                            if success { HapticFeedback.success() }
                            else { HapticFeedback.error() }
                        }
                    },
                    translatingTextLanguages: viewModel.translatingTextLanguages[msg.id] ?? [],
                    translatingAudioLanguages: viewModel.translatingAudioLanguages[msg.id] ?? [],
                    translationRequestFailedPublisher: viewModel.translationRequestFailed.eraseToAnyPublisher(),
                    onRequestTextTranslation: { targetLang, sourceLang in
                        Task {
                            await viewModel.requestTextTranslation(
                                messageId: msg.id, content: msg.content,
                                sourceLanguage: sourceLang, targetLanguage: targetLang
                            )
                        }
                    },
                    onRequestAudioTranslation: { targetLang, attachmentId in
                        Task {
                            await viewModel.requestAudioTranslation(
                                messageId: msg.id, attachmentId: attachmentId,
                                sourceLanguage: msg.originalLanguage, targetLanguage: targetLang
                            )
                        }
                    }
                )
            }
            .sheet(item: $overlayState.callDetailMessage) { msg in
                if let summary = msg.callSummary {
                    CallSummaryDetailSheet(
                        summary: summary,
                        isOutgoing: summary.initiatorId == viewModel.currentUserIdForView,
                        accentHex: accentColor,
                        timestamp: msg.createdAt,
                        onCallBack: { s in viewModel.callBack(for: s) }
                    )
                }
            }
            .sheet(item: $overlayState.fullReactionPickerMessage) { msg in
                // Picker CATÉGORISÉ (Reactions/Visages/Gestes/Cœurs/Animaux/Objets),
                // titre « Reactions », SANS Close ni recherche, chrome Liquid Glass —
                // le « + » de la barre de réactions ouvre ce picker, pas le clavier
                // emoji standard.
                CategorizedEmojiPickerSheet(
                    style: isDark ? .dark : .light,
                    onReact: { emoji in
                        viewModel.toggleReaction(messageId: msg.id, emoji: emoji)
                        overlayState.fullReactionPickerMessage = nil
                    }
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
        )
    }

    /// Consomme `router.pendingHighlightMessageId` : scroll + flash sur le
    /// message cible (fetch de la fenêtre autour si hors page chargée).
    /// Scopé par conversation : un highlight posé pour une AUTRE conversation
    /// n'est ni consommé ni « brûlé » ici — il reste disponible pour la bonne.
    private func consumePendingHighlightMessage() async {
        guard let messageId = router.pendingHighlightMessageId, !messageId.isEmpty else { return }
        if let scopedId = router.pendingHighlightConversationId,
           let currentId = conversation?.id,
           scopedId != currentId {
            return
        }
        router.pendingHighlightMessageId = nil
        router.pendingHighlightConversationId = nil
        try? await Task.sleep(for: .milliseconds(300))
        guard !Task.isCancelled else { return }
        if viewModel.messages.contains(where: { $0.id == messageId }) {
            scrollState.scrollToMessageId = messageId
            scrollState.scrollToMessageTrigger += 1
        } else {
            await viewModel.loadMessagesAround(messageId: messageId)
            if Task.isCancelled { return }
            try? await Task.sleep(for: .milliseconds(100))
            guard !Task.isCancelled else { return }
            scrollState.scrollToMessageId = messageId
            scrollState.scrollToMessageTrigger += 1
        }
    }

    private var bodyWithLifecycle: AnyView {
        AnyView(
        bodyContent
            .background(InteractivePopEnabler(allowsEdgeSwipe: readingModeController.mode != .river))
            .task {
                // Activate the live (StateObject-retained) VM exactly once.
                // Heavy side-effects (GRDB observation, initial load, Combine
                // subscriptions, sync-engine gate) are deferred here out of
                // `init` so the throwaway VMs SwiftUI allocates on every
                // reconstruction stay free — see ConversationViewModel.start().
                viewModel.start()
                viewModel.observeSync()
                await viewModel.loadMessages()
                // Ouvrir une conversation, c'est en regarder le bas. Le signal
                // near-bottom ne se déclenche pas ici (l'état naît déjà « au
                // bas », donc sans transition) — d'où cette demande explicite,
                // reprise au réveil suivant si les cellules n'ont pas encore paru.
                scrollState.flushSeenTrigger += 1
                MessageSocketManager.shared.connect()

                await consumePendingHighlightMessage()

                // Ouverture depuis le bouton Recherche de l'aperçu long-press :
                // active directement la barre de recherche in-conversation.
                if router.pendingOpenSearch {
                    router.pendingOpenSearch = false
                    try? await Task.sleep(for: .milliseconds(250))
                    guard !Task.isCancelled else { return }
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        headerState.showSearch = true
                    }
                }
            }
            // Tap de notification pour la conversation DÉJÀ à l'écran : `path`
            // reçoit le même id, la vue n'est pas recréée et `.task` ne rejoue
            // pas — consommer le highlight à chaud.
            .adaptiveOnChange(of: router.pendingHighlightMessageId) { _, newValue in
                guard let newValue, !newValue.isEmpty else { return }
                Task { await consumePendingHighlightMessage() }
            }
            .onAppear {
                if let context = replyContext { composerState.pendingReplyReference = context.toReplyReference }
                // Language priority (Prisme Linguistique): the user's primary
                // configured content language is the source of truth and wins
                // the compose default. The active keyboard layout is only a
                // FALLBACK — used for anonymous users or unsupported content
                // languages. It must NEVER override the in-app preference, the
                // same way `deviceLocale` ranks last in language resolution.
                //
                // Locale.current is likewise NOT consulted: it reflects the
                // device's UI language, decoupled from the chosen content
                // language. A French-speaker on an English keyboard / English
                // iPhone composes in French; live detection corrects in-flight
                // if they actually type another language.
                if let userLang = AuthManager.shared.currentUser?
                        .preferredContentLanguages.first,
                   LanguageOption.defaults.contains(where: { $0.code == userLang }) {
                    composerState.selectedLanguage = userLang
                } else if let kbd = UITextInputMode.activeInputModes.first?.primaryLanguage {
                    let code = String(kbd.prefix(2))
                    if LanguageOption.defaults.contains(where: { $0.code == code }) {
                        composerState.selectedLanguage = code
                    }
                }
                // Brancher la persistance du brouillon (immédiate à chaque
                // fin de mot / champ vidé, débouncée 400 ms en milieu de mot
                // — cf. ConversationComposerTextModel). Vit sur le modèle
                // isolé : la racine ne se ré-évalue plus à la frappe, donc un
                // `onChange` ici ne fonctionnerait plus. La closure capture
                // une copie de la vue mais lit les @State/@StateObject via
                // leur stockage LIVE.
                composerText.onPersistNeeded = { text in
                    persistDraft(text: text)
                }
                if composerText.text.isEmpty, let draft = DraftStore.shared.load(for: viewModel.conversationId) {
                    composerText.text = draft.text
                    // Restore inline reply context from the draft so the user
                    // sees the same compose chip they left — no hidden state
                    // transitions on app reopen.
                    if let replyId = draft.replyToId,
                       let authorName = draft.replyAuthorName {
                        // `authorAvatarUrl` reste nil, et c'est SANS
                        // CONSEQUENCE : `MessageDraft` aplatit la citation en
                        // quatre champs, et cette reference n'alimente que la
                        // BANNIERE du composeur, qui ne dessine aucun avatar.
                        // A l'envoi, seul `messageId` survit — la citation
                        // rendue est reconstruite par `makeReplyReference`
                        // depuis le message cite en memoire, avatar compris.
                        composerState.pendingReplyReference = ReplyReference(
                            messageId: replyId,
                            authorName: authorName,
                            previewText: draft.replyPreviewText ?? "",
                            isMe: draft.replyIsMe
                        )
                    }
                    if let lang = draft.selectedLanguage {
                        composerState.selectedLanguage = lang
                    }
                    if draft.effectFlags != 0 {
                        viewModel.pendingEffects.flags = MessageEffectFlags(rawValue: draft.effectFlags)
                    }
                    if draft.isBlurEnabled {
                        viewModel.isBlurEnabled = true
                    }
                    if let raw = draft.ephemeralDurationRawValue,
                       let duration = EphemeralDuration(rawValue: raw) {
                        viewModel.ephemeralDuration = duration
                    }
                    // Pièces jointes du brouillon (copiées en durable au
                    // background) : restaure les survivantes dans le tray —
                    // un fichier purgé est sauté silencieusement, le texte
                    // reste intact. Thumbnails régénérées pour les images.
                    if let refs = draft.attachments, !refs.isEmpty,
                       composerState.pendingAttachments.isEmpty,
                       let userId = AuthManager.shared.currentUser?.id {
                        let restored = MessageDraftMediaStore.restore(
                            refs: refs,
                            userId: userId,
                            conversationId: viewModel.conversationId
                        )
                        composerState.pendingAttachments = restored.attachments
                        composerState.pendingMediaFiles = restored.files
                        for attachment in restored.attachments where attachment.kind == .image {
                            if let url = restored.files[attachment.id],
                               let thumb = UIImage(contentsOfFile: url.path) {
                                composerState.pendingThumbnails[attachment.id] = thumb
                            }
                        }
                    }
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { overlayState.longPressEnabled = true }
            }
            .adaptiveOnChange(of: router.replyContextVersion) { _, _ in
                // Réponse à un mood affiché dans la barre directe courante : la vue
                // est déjà à l'écran, `onAppear` ne se redéclenche pas. On applique
                // le contexte au composer ssi il cible CETTE conversation directe.
                guard isDirect,
                      let ctx = router.pendingReplyContext,
                      ctx.authorId == conversation?.participantUserId else { return }
                composerState.pendingReplyReference = ctx.toReplyReference
                router.pendingReplyContext = nil
            }
            .adaptiveOnChange(of: composerState.pendingReplyReference?.messageId) { _, _ in persistDraft(text: composerText.text) }
            .adaptiveOnChange(of: composerState.selectedLanguage) { _, _ in persistDraft(text: composerText.text) }
            .adaptiveOnChange(of: viewModel.pendingEffects.flags.rawValue) { _, _ in persistDraft(text: composerText.text) }
            .adaptiveOnChange(of: viewModel.isBlurEnabled) { _, _ in persistDraft(text: composerText.text) }
            .adaptiveOnChange(of: viewModel.ephemeralDuration?.rawValue) { _, _ in persistDraft(text: composerText.text) }
            .adaptiveOnChange(of: scrollState.isNearBottom) { _, _ in
                if composerState.showTextEmojiPicker {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { composerState.showTextEmojiPicker = false }
                }
            }
            .adaptiveOnChange(of: isTyping) { _, focused in
                if focused && composerState.showTextEmojiPicker {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { composerState.showTextEmojiPicker = false }
                }
            }
            .adaptiveOnChange(of: scenePhase) { _, phase in
                // Read-receipt precision: messages that arrived while the app was
                // backgrounded were deliberately NOT auto-marked read (the user
                // wasn't looking). On return to the foreground, if the user is at
                // the bottom they now see the latest message — re-emit the read so
                // the deferred receipt completes. If scrolled up, the message is
                // still off-screen and stays unread until they scroll down. The
                // gateway-level dedup makes a redundant call harmless.
                // Revenir au premier plan ne marque plus la conversation lue :
                // l'observateur de visibilité reprend et signalera ce qui est
                // effectivement à l'écran.
                // Pièces jointes du brouillon : copie durable au passage en
                // background (les fichiers du tray vivent dans tmp/, purgeable
                // par iOS) — miroir du D1 story. Rebuild complet : la vérité
                // est l'état courant du tray.
                if phase == .background {
                    // Ce qui était à l'écran a bien été lu : le signaler AVANT
                    // que l'app ne s'endorme, sinon l'accusé attend le retour
                    // en avant-plan — ou le démontage de la vue.
                    scrollState.flushSeenTrigger += 1
                    persistDraftAttachmentsForBackground()
                }
            }
            .adaptiveOnChange(of: viewModel.accessRevoked) { _, revoked in
                // Server signalled the user no longer has access to this
                // conversation (kicked, group deleted, blocked, etc.). The
                // ViewModel has already wiped per-conversation cache and
                // local message state. We dismiss the screen here and
                // surface a toast so the user knows why.
                guard revoked else { return }
                FeedbackToastManager.shared.showError(viewModel.error ?? String(localized: "conversation.accessRevoked", bundle: .main))
                dismiss()
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { notification in
                guard let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
                keyboardHeight = frame.height
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
                keyboardHeight = 0
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)) { _ in
                // Le debounce de 400 ms a remplacé la persistance par frappe :
                // sans ce flush, backgrounder l'app (ou la tuer depuis
                // l'app-switcher) dans la fenêtre de debounce perdrait la fin
                // de la saisie — onDisappear ne couvre que la navigation.
                composerText.flushPendingChange()
            }
            .onDisappear {
                composerText.flushPendingChange()
                // Rompt le cycle de rétention : `onPersistNeeded` capture une
                // copie de cette struct, dont le wrapper State retient (via sa
                // box de stockage) le modèle vivant — soit modèle → closure →
                // copie de la vue → State box → modèle. Sans ce nil, le modèle
                // ET le ConversationViewModel (retenu transitivement par le
                // wrapper @StateObject de la copie) fuiteraient à chaque
                // teardown. onAppear réinstalle le callback si la vue revient
                // (retour d'un fullScreenCover/sheet) — aucune frappe n'est
                // possible pendant qu'elle est couverte.
                composerText.onPersistNeeded = nil
                // Arrêt déterministe du player local (preview d'audio en attente) :
                // sans lui, l'audio continuait jusqu'au dealloc du @StateObject et
                // la session restait acquise (refcount) le temps de la libération.
                // Idempotent.
                pendingAudioPlayer.stop()
                if audioRecorder.isRecording {
                    audioRecorder.cancelRecording()
                }
            }
        )
    }

    // MARK: - Skeleton Overlay

    /// Vertical stack of skeleton bubbles used as the cold-start
    /// placeholder. The bubble indices alternate left/right inside
    /// `SkeletonMessageBubble` so the column reads like a real
    /// conversation thread while the first network/cache pass runs.
    private var messageSkeletonOverlay: some View {
        VStack(spacing: MeeshySpacing.md) {
            ForEach(0..<6, id: \.self) { index in
                SkeletonMessageBubble(index: index)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, MeeshySpacing.md + 2)
        .padding(.top, 96) // Precise alignment with background gradient transition
        .padding(.bottom, composerHeight + MeeshySpacing.xxl)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(String(localized: "conversation.view.loading_messages", bundle: .main)))
    }

    // MARK: - Body Content (extracted to help type-checker)

    private var bodyContent: AnyView {
        AnyView(
        ZStack {
            conversationBackground

            // Cold-start skeleton: shown ONLY while the initial fetch is
            // in flight AND no cached messages exist yet. Renders above
            // the (empty) MessageListView so the layout stays stable
            // when the first batch lands and the placeholder fades out.
            if viewModel.paginationPhase.isBlockingSpinnerNeeded && viewModel.messages.isEmpty {
                // AnyView : `bodyContent` — même débordement de pile Swift au
                // décodage de mangled name que la chaîne header (commentaires
                // sur `floatingHeaderSection` plus haut), cette fois porté par
                // le nombre de branches conditionnelles du ZStack top-level
                // (2026-08-17). Chaque branche erasée réduit le type composite
                // que `bodyContent` doit résoudre au 1er rendu.
                AnyView(
                    messageSkeletonOverlay
                        .transition(.opacity)
                        .zIndex(1)
                )
            }

            // WS-9 (F-088) — le mode `.summary` route vers un HÔTE DÉDIÉ
            // (contrat §WS-9 : « le mode résumé a peut-être besoin d'un hôte
            // dédié »), ADDITIF à ce ZStack — aucun site F-085/086bis
            // (`MessageListView` et ses closures ci-dessous) n'est touché.
            // `LivingSummaryHost` construit son propre `@StateObject` — ce
            // site d'appel ne passe que des primitives, zéro `@State` neuf
            // ici. `zIndex(80)` : au-dessus du fil/composer/scroll-to-bottom
            // (≤ 60) et de `previewMode` (49), en-dessous du header flottant
            // (100, toujours joignable) et de la barre d'erreur/quick-reaction
            // (97/99, sans objet en mode résumé).
            // Chantier Rivière iOS, lot 1 (2026-08-21) — le mode `.river` route
            // vers un HÔTE DÉDIÉ, comme `.summary` : la géométrie vient de la
            // loi partagée (`RiverLaneResolver`), le texte du Prisme (traduction
            // préférée ou original), et un avis système n'est la voix de
            // personne (`RiverConversationMapping`).
            if readingModeController.mode == .river {
                // `Color.clear.overlay { … }` plutôt que l'hôte nu : la Rivière
                // est LARGE par nature (jusqu'à sept couloirs de 300 pt) et un
                // `ScrollView` rend la taille IDÉALE de son contenu quand on ne
                // lui propose rien — ce ZStack s'élargissait alors à ~2100 pt et
                // CENTRAIT tous ses autres enfants dessus, en-tête compris
                // (mesuré au simulateur : bouton « Retour » à x = −683, hors
                // écran, malgré son `zIndex(100)`). Un `overlay` reçoit la
                // taille de son hôte et ne la fait JAMAIS grandir : le
                // débordement s'arrête ici.
                AnyView(Color.clear.overlay(RiverConversationHost(
                    messages: viewModel.messages,
                    viewerId: viewModel.currentUserIdForView,
                    // Îlot dynamique + bande de boutons de l'en-tête flottant
                    // (`floatingHeaderSection`, zIndex 100) : la Rivière PINGLE
                    // sa bande de couloirs en haut de son pane, elle doit donc
                    // commencer SOUS l'en-tête — contrairement au fil, dont les
                    // bulles ont le droit de défiler dessous.
                    topInset: previewMode ? 0 : DeviceLayout.safeAreaTop + Self.riverHeaderClearance,
                    // R-7 : la même réserve basse que le fil — le composeur
                    // n'est jamais une zone où une bulle reste prise.
                    bottomInset: composerHeight + 16 + (previewMode ? 0 : DeviceLayout.safeAreaBottom),
                    // L2b/2b-7 : la frappe atteint le lecteur quel que soit
                    // son mode — le pane Rivière est OPAQUE et couvrait la
                    // cellule de frappe du Fil. Même source que le Fil
                    // (`typingParticipants`, avec leur visage), même vue (`TypingIndicatorBubble`).
                    //
                    // La lecture est VIVANTE sans rien ajouter : le roster est
                    // porté par `ConversationStateStore`, que cette vue observe
                    // déjà (`typingObserver`, câblé dans l'init) — c'est ce qui
                    // fait repasser le body à chaque `typing:start`/`stop`.
                    typingParticipants: viewModel.typingParticipants,
                    // R-5 : identité vivante — les MÊMES sources que le Fil
                    // (`MessageListViewController` : présence par expéditeur,
                    // anneau de story sauf pour soi, fiche par le routeur).
                    presence: { message in PresenceManager.shared.presenceState(for: message.senderId) },
                    storyRing: { message in
                        message.isMe ? .none : storyViewModel.storyRingState(forUserId: message.senderId)
                    },
                    onOpenProfile: { user in
                        if user.isAnonymous, let participantId = user.participantId, let conversationId = conversation?.id {
                            router.participantProfileTarget = ParticipantProfileTarget(
                                conversationId: conversationId,
                                participantId: participantId
                            )
                        } else {
                            router.deepLinkProfileUser = user
                        }
                    },
                    onViewStory: { userId in
                        overlayState.storyViewerUserId = userId
                        overlayState.storyViewerSlideIndex = 0
                        overlayState.storyViewerStartAtFirstUnviewed = true
                        overlayState.showStoryViewer = true
                    },
                    // Lot 3 : mêmes retours au Fil que le Résumé — Script,
                    // puis atterrissage sur le message (et le composeur en
                    // mode réponse pour « Répondre »).
                    onOpenInThread: { messageId in
                        readingModeController.select(.script)
                        scrollState.scrollToMessageId = messageId
                        scrollState.scrollToMessageTrigger += 1
                    },
                    onReply: { messageId in
                        readingModeController.select(.script)
                        guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                        triggerReply(for: msg)
                        scrollState.scrollToMessageId = messageId
                        scrollState.scrollToMessageTrigger += 1
                    },
                    // #3901 — la Rivière ne rend jamais bulle par bulle
                    // (`MessageListViewController.rendersThread`), donc ne
                    // peut jamais faire avancer le curseur de lecture par le
                    // chemin habituel (`seenIds`). Le curseur avance ici,
                    // SANS jamais geler de `readAt` individuel, quand le
                    // lecteur atteint le présent.
                    onReachPresent: {
                        viewModel.markCaughtUpFromSummaryOrRiver()
                    },
                    text: { message in
                        viewModel.preferredTranslation(for: message.id)?.translatedContent ?? message.content
                    }
                )))
                // Le pane monte JUSQU'AU bord physique haut : `topInset` porte
                // déjà la safe area, et sans cela le fil (rendu dessous)
                // réapparaissait dans la bande de la barre d'état — une
                // deuxième conversation par-dessus la première.
                .ignoresSafeArea(edges: .top)
                .zIndex(80)
                .transition(.opacity)
            }

            if readingModeController.mode == .summary {
                // AnyView : même coupe que ci-dessus (contribue au débordement
                // de pile de `bodyContent`, 2026-08-17).
                AnyView(LivingSummaryHost(
                    messages: viewModel.messages,
                    viewerId: viewModel.currentUserIdForView,
                    viewerUsername: AuthManager.shared.currentUser?.username,
                    windowCoversUnread: !viewModel.hasOlderMessages,
                    analysisProvider: isAnonymous ? nil : ConversationAnalysisService.shared,
                    conversationId: viewModel.conversationId,
                    isDark: isDark,
                    onReplyToPerson: { entry in
                        readingModeController.select(.script)
                        guard let targetId = entry.evidenceMessageIds.first,
                              let msg = viewModel.messages.first(where: { $0.id == targetId }) else { return }
                        triggerReply(for: msg)
                        scrollState.scrollToMessageId = targetId
                        scrollState.scrollToMessageTrigger += 1
                    },
                    onOpenEpisode: { episode in
                        readingModeController.select(.script)
                        guard let targetId = episode.messageIds.first else { return }
                        scrollState.scrollToMessageId = targetId
                        scrollState.scrollToMessageTrigger += 1
                    },
                    onResumeThread: {
                        readingModeController.select(.script)
                        if let firstUnread = viewModel.messages.first(where: { !$0.isMe })?.id {
                            scrollState.scrollToMessageId = firstUnread
                            scrollState.scrollToMessageTrigger += 1
                        }
                    }
                ))
                // 2b-2 — le Résumé Vivant naissait VIDE quand il était le mode
                // d'OUVERTURE. `LivingSummaryHost` construit son ViewModel dans
                // l'autoclosure d'un `@StateObject` : elle n'est évaluée qu'à la
                // CRÉATION de l'identité de vue, et le VM ne recompose jamais
                // son digest. Or le fil s'ouvre souvent AVANT ses messages
                // (cache puis réseau) — même moment d'ouverture que la Rivière,
                // qui le traite par son empreinte.
                //
                // L'identité bascule EXACTEMENT une fois, au passage vide →
                // peuplé : l'autoclosure se réévalue avec les messages, et rien
                // d'autre ne bouge. En pratique une conversation ne redevient
                // pas vide ; rien dans `viewModel.messages`
                // (`@Published var messages: [Message] = []`) ne l'interdit
                // formellement (F12, revue adversariale 2026-08-25) — si le
                // fil redevenait vide (purge, rechargement raté, réouverture
                // sur une fenêtre froide), l'hôte serait simplement RECONSTRUIT :
                // coût borné, jamais un digest périmé affiché. Coût assumé
                // par ailleurs : le `.task` d'enrichissement agent se rejoue
                // une fois (no-op pour un invité).
                //
                // Ce n'est PAS `showsSkeleton` qui peut garder ce basculement :
                // il tombe à `false` dès que la réponse agent arrive, donc avant
                // la première population sur base froide.
                .id(viewModel.messages.isEmpty)
                .zIndex(80)
                .transition(.opacity)
            }

            // UIKit bridge powered by GRDB store (always available after eager init)
            MessageListView(
                store: viewModel.messageStore,
                conversationViewModel: viewModel,
                currentUserId: viewModel.currentUserIdForView,
                accentColor: accentColor,
                isDirect: isDirect,
                // Le représentable court désormais jusqu'au bord BAS physique
                // (`ignoresSafeArea` bas, cf. plus bas) : la bande safe area
                // qu'il traverse s'ajoute à la réserve du composeur pour que
                // le repos du fil ne bouge pas d'un point.
                bottomInset: composerHeight + 16 + (previewMode ? 0 : DeviceLayout.safeAreaBottom),
                // 0 en preview : la vue y est hébergée dans une `.sheet` à
                // détentes, dont le bord haut est déjà sous la status bar —
                // réserver la bande îlot y décalerait le flux dans le vide.
                topInset: previewMode ? 0 : DeviceLayout.safeAreaTop,
                scrollToBottomTrigger: scrollState.scrollToBottomTrigger,
                scrollToMessageId: scrollState.scrollToMessageId,
                scrollToMessageTrigger: scrollState.scrollToMessageTrigger,
                flushSeenTrigger: scrollState.flushSeenTrigger,
                isSearchingQuotedMessage: viewModel.isSearchingQuotedMessage,
                // Header déplié = la pill de jour se retire. Les deux vivent
                // dans la même bande haute ; le déplié étant un geste
                // explicite vers les détails de la conversation, c'est lui qui
                // gagne (retour user 2026-08-13).
                isHeaderExpanded: composerState.showOptions,
                // WS-7 (F-086) — décision de l'orchestrateur (§WS-6 travail
                // 10 : props posées AVANT les closures on…, contrainte
                // d'ordre de l'init memberwise). `readingModeController.mode`
                // et `MessageListView.readingMode` sont le MÊME type
                // (`ConversationReadingMode`, typealias sur
                // `ReadingModeOrchestrator.ConversationReadingMode`,
                // F-080) — aucune conversion.
                readingMode: readingModeController.mode,
                onNewMessagesBadge: { count in
                    scrollState.unreadBadgeCount = count
                },
                onScrollToMessage: { targetId in
                    // Tap on a reply chip inside a bubble: jump to the cited
                    // message. Uses the new jumpToQuotedMessage flow which:
                    // 1. Checks if the message is already local → instant scroll
                    // 2. If not, shows a pulsing indicator on the scroll button
                    //    while fetching from the server
                    // 3. After loading, triggers the visual scroll + highlight
                    Task {
                        let result = await viewModel.jumpToQuotedMessage(messageId: targetId)
                        switch result {
                        case .foundLocally:
                            // The VC's scrollToMessage already handled the
                            // visual scroll for the local case.
                            break
                        case .loadedFromServer:
                            // The store snapshot was reloaded around the target.
                            // Trigger the VC to scroll to it now.
                            scrollState.scrollToMessageId = targetId
                            scrollState.scrollToMessageTrigger += 1
                        case .notFound:
                            HapticFeedback.error()
                            FeedbackToastManager.shared.show(String(localized: "conversation.messageNotFound", bundle: .main), type: .info)
                        }
                    }
                },
                onLoadOlder: {
                    // Infinite scroll: VM owns the cache + network sequence
                    // (syncEngine.fetchOlderMessages → store.loadOlder).
                    // Going through the store directly stalls once the local
                    // GRDB window is exhausted, leaving older messages
                    // unreachable.
                    await viewModel.loadOlderMessages()
                },
                onNearBottomChanged: { nearBottom in
                    let wasNearBottom = scrollState.isNearBottom
                    if scrollState.isNearBottom != nearBottom {
                        scrollState.isNearBottom = nearBottom
                    }
                    viewModel.isCurrentlyNearBottom = nearBottom
                    // Revenir au bas ne marque plus rien : la position de la
                    // barre ne dit pas ce qui a été vu. Les bulles qui
                    // réapparaissent sont signalées par `onMessagesSeen` une
                    // fois le seuil de présence franchi.
                    _ = wasNearBottom
                },
                onScrollingActiveChanged: { isActive in
                    withAnimation(.easeInOut(duration: 0.22)) {
                        scrollState.isScrollingActiveList = isActive
                    }
                },
                onMessagesSeen: { seenIds in
                    // Seule source de vérité de la lecture : ces identifiants
                    // ont été RÉELLEMENT affichés assez longtemps.
                    // @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
                    viewModel.markAsRead(messageIds: seenIds)
                },
                onStoryReplyTap: { storyId in
                    // Open the story viewer at the slide that originated the
                    // quoted reply. Resolves the story id to a (group, slide)
                    // pair via StoryViewModel — preserves the legacy behaviour
                    // from ConversationView+MessageRow (now dead code).
                    if let groupIdx = storyViewModel.groupIndex(forStoryId: storyId) {
                        let group = storyViewModel.storyGroups[groupIdx]
                        let slideIdx = group.stories.firstIndex { $0.id == storyId } ?? 0
                        overlayState.storyViewerUserId = group.id
                        overlayState.storyViewerGroupIndex = groupIdx
                        overlayState.storyViewerSlideIndex = slideIdx
                        overlayState.storyViewerStartAtFirstUnviewed = false
                        overlayState.showStoryViewer = true
                    }
                },
                onViewSenderStory: { userId in
                    // Anneau story d'un avatar de bulle (conversations de
                    // groupe) → story de CET expéditeur, première non-vue.
                    overlayState.storyViewerUserId = userId
                    overlayState.storyViewerSlideIndex = 0
                    overlayState.storyViewerStartAtFirstUnviewed = true
                    overlayState.showStoryViewer = true
                },
                onSwipeReply: { messageId in
                    // Restore swipe-to-reply: BubbleSwipeContainer commits when
                    // the bubble crosses the reply threshold. We resolve the
                    // message and reuse triggerReply() so the composer mirrors
                    // the legacy long-press / context menu reply path.
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    triggerReply(for: msg)
                },
                onSwipeForward: { messageId in
                    // Restore swipe-to-forward: opens the forward picker via
                    // composerState. HapticFeedback already fires inside the
                    // swipe container — we only stage the message here.
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }),
                          msg.isForwardable else { return }
                    composerState.forwardMessage = msg
                },
                onLongPress: { messageId, cellFrame in
                    guard overlayState.longPressEnabled else { return }
                    // Exclusivité mutuelle : si la barre de quick-reaction est
                    // déjà ouverte, l'appui-long ne fait rien (une seule feature
                    // active à la fois).
                    guard overlayState.quickReactionMessageId == nil else { return }
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    // L'appui long ouvre les options habituelles — pour TOUT
                    // message, avis système compris (directive 2026-08-24).
                    //
                    // Il aiguillait auparavant par type : un résumé d'appel
                    // ouvrait sa feuille de détail, et tout autre message
                    // système ne faisait RIEN. Ce no-op était le vrai défaut :
                    // un avis d'arrivée reste un message du fil — épinglable,
                    // favorisable, signalable, supprimable — et le geste qui
                    // ouvre ces options est le même partout.
                    //
                    // La feuille de détail d'un appel n'est pas perdue pour
                    // autant : elle est devenue une ACTION du menu
                    // (`PrimaryAction.callDetail`, cf. `onShowCallDetail`).
                    //
                    // Le clavier + le repositionnement vers le centre (#4004)
                    // passent tous les deux par `presentLongPressMenu`. Le
                    // menu NATIF iOS 26+ est présenté par le système, sans
                    // point d'interception avant ouverture — ce site est le
                    // SEUL point d'entrée (menu custom, < iOS 26).
                    presentLongPressMenu(for: msg, cellFrame: cellFrame)
                },
                // iOS 26+ : contenu du `.contextMenu` NATIF (Liquid Glass) des
                // bulles — mêmes actions que l'overlay custom (SSOT). `nil`
                // renvoyé pour les messages système / résumés d'appel (pas de
                // menu). Le builder est appelé une fois par config de cellule.
                overlaidMessageId: overlayState.showOverlayMenu ? overlayState.overlayMessage?.id : nil,
                onCallDetailRequest: { messageId in
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    overlayState.callDetailMessage = msg
                },
                isSelectionModeActive: overlayState.isSelectionModeActive,
                selectedMessageIds: overlayState.selectedMessageIds,
                onToggleSelection: { messageId in toggleMessageSelection(messageId) },
                onAddReaction: { messageId, bubbleFrame in
                    // Exclusivité mutuelle : ouvrir la barre de quick-reaction
                    // ferme d'abord l'overlay d'appui-long s'il est visible.
                    if overlayState.showOverlayMenu {
                        overlayState.showOverlayMenu = false
                        overlayState.overlayMessage = nil
                    }
                    // Spring-open the emoji bar anchored to the tapped bubble
                    // (appears below it, flips above near the composer).
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        overlayState.emojiOnlyMode = true
                        overlayState.quickReactionAnchorFrame = bubbleFrame
                        overlayState.quickReactionMessageId = messageId
                    }
                    HapticFeedback.light()
                },
                onToggleReaction: { messageId, emoji in
                    viewModel.toggleReaction(messageId: messageId, emoji: emoji)
                },
                onReactToAttachment: { attachmentId, messageId, emoji in
                    viewModel.toggleAttachmentReaction(attachmentId: attachmentId, messageId: messageId, emoji: emoji)
                },
                onOpenReactPicker: { messageId in
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    overlayState.fullReactionPickerMessage = msg
                },
                onShowMessageInfo: { messageId in
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    overlayState.moreSheetInitialItem = .views
                    overlayState.detailSheetMessage = msg
                },
                onShowReadStatus: { messageId in
                    // Tap sur les coches (✓ / ✓✓ / ✓✓ bleu) d'un message envoyé.
                    // Ouvre la sheet detail sur l'onglet "Vues" pour consulter
                    // qui a reçu / qui a lu — sans passer par le long-press.
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    overlayState.moreSheetInitialItem = .views
                    overlayState.detailSheetMessage = msg
                },
                onRetry: { messageId in
                    // Tap on the orange retry band of a FAILED outgoing message.
                    // `retryMessage` deletes the failed row and re-sends with the
                    // SAME clientMessageId (gateway dedup) AND kicks the outbox
                    // flusher — so the resend actually fires (the old local
                    // OfflineQueue reset never flushed on a foregrounded device).
                    Task { await viewModel.retryMessage(messageId: messageId) }
                },
                onShowReactions: { messageId in
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    overlayState.moreSheetInitialItem = .reactions
                    overlayState.detailSheetMessage = msg
                },
                onShowTranslationDetail: { messageId in
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    overlayState.moreSheetInitialItem = .language
                    overlayState.detailSheetMessage = msg
                },
                onReadMore: { payload in
                    focalReadMorePayload = payload
                },
                onFocalTapLocation: { place in
                    focalFullscreenPlace = BubbleFullscreenPlace(place: place)
                },
                onFocalShareFile: { url in
                    focalShareFileItem = FocalShareFileItem(url: url)
                },
                onMediaTap: { attachment in
                    // Tap sur un média : on préchauffe ce que le plein écran
                    // AFFICHE — la variante élue d'une image, le poster net
                    // d'une vidéo déjà sur l'appareil — pas l'original
                    // (`fileUrl`), sinon les deux se téléchargeaient ; puis on
                    // met la pièce jointe en scène pour la galerie.
                    GalleryPrewarm.warm(attachment)
                    scrollState.galleryStartAttachment = attachment
                },
                onConsumeViewOnce: { messageId, completion in
                    Task {
                        let success = await viewModel.consumeViewOnce(messageId: messageId)
                        completion(success)
                    }
                },
                onRequestTranslation: { messageId, targetLang in
                    MessageSocketManager.shared.requestTranslation(messageId: messageId, targetLanguage: targetLang)
                }
            )
            // Le flux traverse la zone status bar / Dynamic Island jusqu'au bord
            // haut de l'écran (retour user 2026-08-12) : sans ça, SwiftUI pose le
            // représentable DANS la safe area, la liste s'arrête sous l'îlot et
            // cette bande ne montre plus que le dégradé de fond — lu comme une
            // « couleur unie » derrière l'îlot, là où les autres écrans laissent
            // leur contenu défiler sous le header jusqu'au bord. Le repos du flux
            // est inchangé : le contrôleur réserve la hauteur de la bande en
            // inset (`applyTopInset`), le contenu ne fait qu'y transiter au
            // défilement. Le header flottant, lui, reste dans la safe area
            // (zIndex 100, au-dessus).
            //
            // MÊME règle au bord BAS (retour user 2026-08-16, capture device) :
            // borné à la safe area basse, le représentable coupait les
            // messages ~34 pt AVANT le bord physique — visible dès que le
            // chrome s'escamote au défilement (Focal) : le fil doit sortir de
            // l'écran par le bord, exactement comme en haut. La réserve du
            // composeur est portée par `bottomInset` (le contrôleur la
            // compose dans `contentInset.top`), compensée de
            // `safeAreaBottom` au site d'appel — le repos est inchangé.
            .ignoresSafeArea(.container, edges: [.top, .bottom])

            // L'indicateur de frappe n'est PAS un overlay : c'est une vraie
            // cellule du flux de messages, rendue en dernier par
            // `MessageListViewController` (voir `MessageListItem.typingIndicator`).

            // Notification preview: a tap anywhere over the message area opens
            // the full conversation (navigation transition). The composer is
            // excluded (bottom inset) so the user can still reply in place.
            if previewMode {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { onOpenFullConversation?() }
                    .padding(.bottom, composerHeight)
                    .zIndex(49)
                    .accessibilityLabel(String(localized: "conversation.preview.open", bundle: .main))
            }

            floatingHeaderSection

            // Quick reaction bar — a floating overlay anchored to the bubble
            // whose smiley "+" the user tapped. `quickReactionBarOverlay`
            // places the bar just below that bubble (using the cell frame
            // captured at tap time) and flips it above when the message
            // hugs the composer. See `QuickReactionBarPlacement`.
            if let pickerMessageId = overlayState.quickReactionMessageId {
                quickReactionBarOverlay(for: pickerMessageId)
                    .zIndex(99)
            }

            // Connection status banner — UNIQUEMENT pour les hôtes sans point
            // de montage racine (flux invité). Le flux authentifié normal
            // est couvert par le point de montage unique de RootView/
            // iPadRootView (cf. showsOwnConnectionBanner ci-dessus).
            if showsOwnConnectionBanner {
                VStack {
                    Color.clear.frame(height: ConnectionBanner.liftedTopPadding(
                        base: composerState.showOptions ? 72 : 56
                    ))
                    ConnectionBanner(conversationListViewModel: conversationListViewModel, isStoryViewerPresenting: isStoryViewerPresenting, activeConversationId: { viewModel.conversationId })
                    Spacer()
                }
                .zIndex(98)
                .allowsHitTesting(false)
            }

            // Error banner
            Group {
                if let error = viewModel.error {
                    VStack {
                        Color.clear.frame(height: composerState.showOptions ? 72 : 56)
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(MeeshyColors.warning)
                                .accessibilityHidden(true)
                            Text(error)
                                .font(.caption)
                                .lineLimit(2)
                            Spacer()
                            Button {
                                viewModel.error = nil
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.secondary)
                            }
                            .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
                        }
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.vertical, MeeshySpacing.sm)
                        .background(.ultraThinMaterial)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        Spacer()
                    }
                }
            }
            .zIndex(97)
            .animation(.easeInOut, value: viewModel.error)

            if scrollState.isNearBottom == false || viewModel.isSearchingQuotedMessage {
                // Bulle « retour en bas » : elle disparaît VERS LE BAS (bord le
                // plus proche) en fondant pendant le défilement et en revient
                // (`EdgeHiddenChrome`) ; ses propres entrées/sorties (proximité
                // du bas) suivent la même direction.
                VStack { Spacer(); HStack { Spacer(); scrollToBottomButton.padding(.trailing, MeeshySpacing.lg).padding(.bottom, composerScrollButtonAnchor + MeeshySpacing.sm) } }
                    .hiddenTowardsEdge(hidesComposerChromeForScroll, .bottom)
                    .zIndex(60)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: scrollState.isNearBottom)
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: viewModel.isSearchingQuotedMessage)
            }

            VStack {
                Spacer()
                ZStack(alignment: .bottom) {
                    // #3918, refonte #3935, retrait de la remontée #3938 — le
                    // texte envoyé apparaît EN FONDU (plus de remontée : mal
                    // rendue, retirée sans retour sur demande porteur
                    // 2026-08-27) à son emplacement final. Posé en PREMIER
                    // calque du ZStack (donc DERRIÈRE le composer qui suit,
                    // occulté par son fond opaque `composerBackground` — un
                    // `.overlay()` posé APRÈS le composer le dessinerait
                    // au-dessus). Pur calque de rendu : ne pousse ni ne
                    // redimensionne rien autour de lui.
                    if let payload = sendFlyPayload {
                        ComposerSendFlyPreview(
                            text: payload.text,
                            readingMode: readingModeController.mode,
                            isDark: isDark
                        )
                        .padding(.bottom, composerHeight)
                        .allowsHitTesting(false)
                        .id(payload.id)
                    }

                    VStack(spacing: 0) {
                        if viewModel.activeMentionQuery != nil {
                            mentionSuggestionPanel
                                .transition(.move(edge: .bottom).combined(with: .opacity))
                        }
                        if overlayState.isSelectionModeActive {
                            // #4005 — remplace le composer, jamais un
                            // troisième bandeau au-dessus : composer un
                            // nouveau message et sélectionner des anciens
                            // messages sont deux intentions qui ne
                            // coexistent pas.
                            selectionToolbar
                        } else if let blockedId = blockedDirectParticipantId {
                            blockedComposerZone(userId: blockedId)
                        } else if viewModel.isConversationClosed {
                            closedConversationBanner
                        } else {
                            themedComposer
                        }
                        // Panneau emoji inline — glisse vers le haut À LA PLACE DU
                        // CLAVIER, donc EN DESSOUS de la barre de composition (jamais
                        // au-dessus). Même placement que le carrousel de pièces
                        // jointes et que le composer story, pour une bascule
                        // clavier ⇄ emoji sans saut visuel.
                        if composerState.showTextEmojiPicker {
                            EmojiKeyboardPanel(
                                style: isDark ? .dark : .light,
                                onSelect: { emoji in
                                    composerState.emojiToInject = emoji
                                }
                            )
                            .frame(height: 260)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                        }
                    }
                    // Composer transparent, sans fond (#3920, directive porteur
                    // 2026-08-26) : le seul état qui dépendait de ce matériau
                    // PARTAGÉ était le composer nu — `mentionSuggestionPanel`,
                    // `EmojiKeyboardPanel`, `closedConversationBanner` et
                    // `blockedComposerZone` se dotent CHACUN de leur propre fond
                    // (`.ultraThinMaterial`/`.regularMaterial`), donc aucun n'en
                    // dépend plus ici.
                    .ignoresSafeArea(.container, edges: .bottom)
                    .background(
                        GeometryReader { geo in
                            Color.clear
                                .onAppear { updateComposerHeight(geo.size.height) }
                                .adaptiveOnChange(of: geo.size.height) { _, h in updateComposerHeight(h) }
                        }
                    )
                }
            }
            // R-7 (2026-08-22) : en Rivière, le composeur passe AU-DESSUS du
            // pane (80) — le pane lui réserve sa hauteur (`bottomInset`) et
            // c'est lui qui est recouvert sinon (mesuré au simulateur :
            // champ « Message… » présent à y = 797, invisible).
            .zIndex(readingModeController.mode == .river ? 85 : 50)
            // Chrome escamoté pendant le défilement Focal : glissement vers le
            // bord BAS + fondu (`EdgeHiddenChrome`) — le composeur garde sa
            // hauteur mesurée (aucun inset ne bouge, donc aucun re-scaling du
            // fil). Les touches passent au fil pendant l'escamotage.
            .hiddenTowardsEdge(hidesComposerChromeForScroll, .bottom)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: composerState.showTextEmojiPicker)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: viewModel.activeMentionQuery != nil)

            searchResultsBlurOverlay
            returnToLatestButton
        }
        // #3901 — le Résumé Vivant ne rend jamais bulle par bulle
        // (`MessageListViewController.rendersThread`), donc ne peut jamais
        // faire avancer le curseur de lecture par le chemin habituel
        // (`seenIds`). Posé sur le ZStack ENGLOBANT (jamais sur la branche
        // `.summary` elle-même) : cette branche disparaît du même geste qui
        // fait sortir `mode` de `.summary`, et un `onChange` attaché à une
        // vue qui se démonte avec la valeur surveillée ne se déclenche
        // jamais. « Quitté le Résumé après l'avoir affiché » couvre les DEUX
        // sorties possibles — bouton « Reprendre le fil » (`onResumeThread`)
        // ET sélecteur de mode de l'en-tête (`readingModeController.select`
        // depuis `ReadingModeLensCatalog`), qui contourne ce bouton.
        .adaptiveOnChange(of: readingModeController.mode) { old, new in
            guard old == .summary, new != .summary else { return }
            viewModel.markCaughtUpFromSummaryOrRiver()
        }
        )
    }

    // MARK: - Mention Suggestion Panel

    @ViewBuilder
    private var mentionSuggestionPanel: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 0) {
                ForEach(viewModel.mentionSuggestions) { candidate in
                    Button {
                        composerText.text = viewModel.insertMention(candidate, into: composerText.text)
                    } label: {
                        HStack(spacing: MeeshySpacing.sm + 2) {
                            MeeshyAvatar(
                                name: candidate.displayName,
                                context: .userListItem,
                                accentColor: accentColor,
                                avatarURL: candidate.avatarURL
                            )
                            VStack(alignment: .leading, spacing: 1) {
                                Text(candidate.displayName)
                                    .font(MeeshyFont.relative(14, weight: .semibold))
                                    .foregroundColor(theme.textPrimary)
                                Text("@\(candidate.username)")
                                    .font(MeeshyFont.relative(12))
                                    .foregroundColor(theme.textSecondary)
                            }
                            Spacer()
                        }
                        .padding(.horizontal, MeeshySpacing.lg)
                        .padding(.vertical, MeeshySpacing.sm)
                    }
                    .accessibilityLabel(String(localized: "conversation.view.mention", bundle: .main))
                    if candidate.id != viewModel.mentionSuggestions.last?.id {
                        Divider()
                            .padding(.leading, 58) // Aligned with avatar center
                    }
                }
            }
        }
        .frame(maxHeight: 200)
        .background(.ultraThinMaterial)
    }


    // MARK: - Floating Header Section (extracted to help type-checker)

    private var isAnonymous: Bool { anonymousSession != nil }

    /// Loi commune (`ScrollMotion`) : une vue en mouvement ne montre pas ses
    /// boutons d'action. Pendant le défilement de la liste, les boutons
    /// d'appel et de recherche s'effacent ; le header lui-même — retour,
    /// avatar, titre — reste lisible, et la pill de jour vit dans sa propre
    /// bande sous lui (`MessageDayStickyPlacement.topOffset`).
    ///
    /// Une recherche ouverte échappe à la règle : sa barre est un champ de
    /// SAISIE, pas un bouton, et doit rester joignable pendant qu'on fait
    /// défiler les résultats.
    static func hidesHeaderActions(isScrollingList: Bool, isSearchOpen: Bool) -> Bool {
        isScrollingList && !isSearchOpen
    }

    /// **En rangée plate (Script), c'est le header ENTIER qui s'efface** —
    /// retour, avatar, titre, recherche, appel et bascule de vue compris —
    /// là où le mode bulles n'efface que sa grappe de boutons d'action.
    ///
    /// La raison est le mode lui-même : la lecture plate met le fil au
    /// centre ; garder au-dessus une barre d'outils concurrente pendant
    /// qu'on lit contredit l'intention.
    ///
    /// **Toujours une porte de sortie** : le header revient dès l'ARRÊT du
    /// défilement (ce n'est pas un masquage permanent), et le geste de retour
    /// natif iOS reste actif en toutes circonstances. Une recherche ouverte
    /// échappe à la règle, comme pour les boutons d'action — sa barre est un
    /// champ de saisie qui doit rester joignable pendant qu'on fait défiler
    /// les résultats.
    static func hidesEntireHeader(
        usesFlatRow: Bool,
        isScrollingList: Bool,
        isSearchOpen: Bool
    ) -> Bool {
        usesFlatRow && hidesHeaderActions(isScrollingList: isScrollingList, isSearchOpen: isSearchOpen)
    }

    private var hidesEntireHeaderForScroll: Bool {
        Self.hidesEntireHeader(
            usesFlatRow: readingModeController.mode.usesFlatRow,
            isScrollingList: scrollState.isScrollingActiveList,
            isSearchOpen: headerState.showSearch
        )
    }

    /// **En rangée plate (Script), le défilement escamote TOUT le chrome** —
    /// composeur et bouton de retour au bas compris, en plus du header
    /// (`hidesEntireHeader`) et de la pilule de jour (côté hôte,
    /// `MessageDayStickyState.isSuppressed`). Le fil occupe l'écran entier le
    /// temps du mouvement ; tout revient dès la pose.
    ///
    /// Une saisie ACTIVE échappe à la règle : panneau emoji ouvert ou
    /// suggestions de mention affichées, le composeur est l'outil en main —
    /// on ne retire pas l'outil en main. Pur `opacity` : aucun inset ne
    /// bouge, donc aucune re-mise à l'échelle du fil.
    static func hidesComposerChrome(
        usesFlatRow: Bool,
        isScrollingList: Bool,
        isSearchOpen: Bool,
        isEmojiPanelOpen: Bool,
        hasMentionSuggestions: Bool
    ) -> Bool {
        hidesEntireHeader(
            usesFlatRow: usesFlatRow,
            isScrollingList: isScrollingList,
            isSearchOpen: isSearchOpen
        )
            && !isEmojiPanelOpen
            && !hasMentionSuggestions
    }

    private var hidesComposerChromeForScroll: Bool {
        Self.hidesComposerChrome(
            usesFlatRow: readingModeController.mode.usesFlatRow,
            isScrollingList: scrollState.isScrollingActiveList,
            isSearchOpen: headerState.showSearch,
            isEmojiPanelOpen: composerState.showTextEmojiPicker,
            hasMentionSuggestions: viewModel.activeMentionQuery != nil
        )
    }

    private var hidesHeaderActionsForScroll: Bool {
        Self.hidesHeaderActions(
            isScrollingList: scrollState.isScrollingActiveList,
            isSearchOpen: headerState.showSearch
        )
    }

    // Enfants en AnyView : le type structurel du tuple (branches anonymous /
    // typing / bande + searchBar) gonflait le mangled name de
    // `floatingHeaderSection` ET celui de `bodyContent` au point que leur
    // décodage récursif au 1er rendu SUR DEVICE débordait la pile du main
    // thread (dump segv du 2026-07-30 21:12, `__swift_instantiate…` dans la
    // closure du VStack). Même famille que expandedHeaderMidContent — couper
    // au niveau des ENFANTS du type décodé (leçon 5cdde93c4).
    // AnyView à la déclaration (2026-08-17) : la coupe aux ENFANTS
    // (`AnyView` sur chaque branche, commentaire ci-dessus) ne suffisait
    // toujours pas — `floatingHeaderSection` elle-même reste un maillon
    // `some View` dans le type composite de `bodyContent`, qui doit la
    // résoudre en entier. Dernière coupe de la chaîne
    // bodyContent→floatingHeaderSection→expandedHeaderBand→…→
    // readingModeAffordanceCluster.
    private var floatingHeaderSection: AnyView {
        AnyView(floatingHeaderSectionBody)
    }

    @ViewBuilder
    private var floatingHeaderSectionBody: some View {
        VStack {
            if isAnonymous {
                AnyView(anonymousHeaderBar)
            } else if isTyping {
                AnyView(typingHeaderBar)
            } else {
                // Oubliée lors de la coupe "leçon 5cdde93c4" (commentaire
                // ci-dessus) : seule branche de ce VStack encore renvoyée en
                // `some View` nu. `expandedHeaderBand` a depuis grossi (chip
                // de mode de lecture, §WS-7/Focal) jusqu'à redevenir la
                // branche la plus complexe — et donc la nouvelle cause du
                // même débordement de pile au décodage de mangled name
                // (2026-08-17, `ReadingModeController.decision` puis
                // `__swift_instantiateConcreteTypeFromMangledNameV2`,
                // toujours sous `expandedHeaderBand → … →
                // readingModeAffordanceCluster`). Même traitement que ses
                // branches sœurs.
                // Focal/Script + défilement : le header entier glisse vers le
                // bord HAUT en fondant et en revient (loi `hidesEntireHeader`,
                // rendu `EdgeHiddenChrome`) — plus de démontage ; les touches
                // passent au fil pendant l'escamotage (`allowsHitTesting`).
                AnyView(expandedHeaderBand.hiddenTowardsEdge(hidesEntireHeaderForScroll, .top))
            }

            if headerState.showSearch {
                AnyView(searchBar.transition(.move(edge: .top).combined(with: .opacity)))
            }

            Spacer()
        }
        .zIndex(100)
        // Le mouvement est PUBLIÉ ici, consommé plus bas par les seuls
        // `.hiddenWhileScrolling()` des grappes de boutons : le header garde
        // son opacité, ses branches gardent leur type-erasure individuelle
        // (note "leçon 5cdde93c4" au-dessus sur le crash de mangled name).
        .scrollMotionActive(hidesHeaderActionsForScroll)
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: composerState.showOptions)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isTyping)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: headerState.showSearch)
        .animation(.easeOut(duration: FocalMetrics.HiddenChrome.easeOut), value: hidesEntireHeaderForScroll)
    }

    private var typingHeaderBar: some View {
        HStack(spacing: MeeshySpacing.sm) {
            ThemedBackButton(color: accentColor, unreadCount: viewModel.otherConversationsUnread) { HapticFeedback.light(); router.pop() }
            Spacer()
            ThemedAvatarButton(
                name: liveConversation?.name ?? "?", color: accentColor, secondaryColor: secondaryColor,
                isExpanded: false, storyState: headerStoryRingState,
                avatarURL: liveConversation?.type == .direct ? liveConversation?.participantAvatarURL : liveConversation?.avatar,
                presenceState: headerPresenceState,
                moodEmoji: headerMoodEmoji
            ) {
                isTyping = false
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { composerState.showOptions = true }
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.sm)
        .transition(.opacity)
    }

    @ViewBuilder
    private var anonymousHeaderBar: some View {
        HStack {
            ConversationTitleLabel(
                name: conversation?.displayName ?? "Conversation",
                favoriteEmoji: conversation?.userState.reaction,
                font: MeeshyFont.relative(15, weight: .semibold, design: .rounded),
                color: .white
            )
            Spacer()
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(MeeshyFont.relative(11, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(theme.textMuted.opacity(0.12)))
            }
            .accessibilityLabel(String(localized: "conversation.view.close", bundle: .main))
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.md)
    }

    /// Type-erased to break the deep opaque-type chain that crashes the
    /// SwiftUI runtime metadata resolver on first render. The chain
    /// `body → bodyWithSheets → bodyWithCovers → bodyWithLifecycle →
    /// bodyContent → floatingHeaderSection → expandedHeaderBand` produced a
    /// mangled name long enough that `swift_getTypeByMangledName` recursed
    /// past the demangler's depth limit (60+ frames of `decodeMangledType`)
    /// and crashed in `swift::SubstGenericParametersFromMetadata::buildDescriptorPath`.
    /// AnyView is a known escape hatch for this class of bug — its mangled
    /// name is a single fixed token, capping the chain depth.
    private var expandedHeaderBand: AnyView {
        AnyView(expandedHeaderBandBody)
    }

    @ViewBuilder
    private var expandedHeaderBandBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: MeeshySpacing.sm) {
                ThemedBackButton(color: accentColor, compactMode: composerState.showOptions, unreadCount: viewModel.otherConversationsUnread) { HapticFeedback.light(); router.pop() }
                expandedHeaderMidContent
                headerAvatarView
            }
            .padding(.trailing, MeeshySpacing.sm)
        }
        .padding(.horizontal, composerState.showOptions ? MeeshySpacing.sm + 2 : 0)
        .padding(.vertical, composerState.showOptions ? MeeshySpacing.sm - 2 : 0)
        .background(expandedHeaderBackground)
        .padding(.horizontal, composerState.showOptions ? MeeshySpacing.sm : MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.sm)
    }

    /// Middle slot of the header band (between back button and avatar).
    /// Extracted as a separate `@ViewBuilder` property because inlining the
    /// `if composerState.showOptions { … } else { Spacer() }` branches
    /// alongside the rest of the band produced an opaque return type that
    /// Swift's runtime metadata resolver couldn't materialize — `body` would
    /// crash at first render with a deep `swift_getTypeByMangledName` stack.
    // AnyView : casse la récursion de type de `expandedHeaderBandBody` (crash
    // stack-overflow du décodeur de métadonnées Swift au 1er rendu SUR DEVICE).
    private var expandedHeaderMidContent: AnyView {
        if composerState.showOptions {
            return AnyView(expandedHeaderTitleAndTags)
        } else {
            // Le bouton d'appel reste à côté de la recherche dans les 2 états
            // (le collapse/expand ne bascule que la zone nom/tags).
            return AnyView(HStack {
                Spacer()
                headerButtonsCluster
            })
        }
    }

    /// Call + search buttons, grouped with zero extra spacing between them
    /// (user-requested 2026-07-11: "les boutons n'ont pas besoin d'être si
    /// loin l'un de l'autre"). Each button already carries its own ~8pt of
    /// invisible padding via `.meeshyTapTarget()`'s 44×44 HIG minimum around
    /// a visually 28×28 glass circle — stacking the HStack's own spacing ON
    /// TOP of that built-in padding is what pushed them apart. `spacing: 0`
    /// still leaves that built-in padding as the visible gap (no tap-target
    /// overlap between the two 44×44 hit areas).
    ///
    /// Grappe d'ACTIONS : elle s'efface tant que la liste défile et revient à
    /// l'arrêt (loi commune `ScrollMotion`, publiée par
    /// `floatingHeaderSection`). Le retour, l'avatar et le titre ne la
    /// suivent pas — on doit pouvoir quitter la conversation et savoir où on
    /// est, même en plein défilement.
    // AnyView : `some View` nu ici gardait la porte ouverte au même débordement
    // que `expandedHeaderBand`/`expandedHeaderMidContent` (commentaires
    // ci-dessus) — érasé un cran plus bas (le seul enfant
    // `readingModeAffordanceCluster`) ne suffisait pas : l'APPELANT
    // (`expandedHeaderMidContent`) doit quand même résoudre le type opaque
    // COMPOSITE de `headerButtonsCluster` — TOUS ses enfants combinés,
    // `headerCallButtons`/`expandedHeaderSearchButton` compris — avant de
    // pouvoir appeler `AnyView(HStack { … headerButtonsCluster })` un cran
    // plus haut. Seule l'érasure à LA DÉCLARATION de `headerButtonsCluster`
    // coupe la chaîne au bon endroit (2026-08-17, même récursion
    // `swift_getTypeByMangledName` malgré la première coupe).
    private var headerButtonsCluster: AnyView {
        AnyView(
            HStack(spacing: 0) {
                headerCallButtons.layoutPriority(1)
                expandedHeaderSearchButton
                readingModeAffordanceCluster
            }
            .hiddenWhileScrolling()
        )
    }

    /// Chip de mode + bouton Aa (§WS-7 travaux 3-4, arbitrage F-086bis) —
    /// insérée APRÈS `expandedHeaderSearchButton`, JAMAIS avant
    /// `headerCallButtons.layoutPriority(1)` (interdiction absolue du
    /// contrat). Sous drapeau uniquement : `ReadingModeController` résout
    /// TOUJOURS `.bubbles` drapeau OFF (§WS-1), donc ce bloc disparaît
    /// intégralement — bit-à-bit identique à avant ce lot.
    ///
    /// AnyView à la DÉCLARATION (pas seulement au site d'appel) : la coupe
    /// posée sur `headerButtonsCluster` seul ne suffisait pas — l'appelant
    /// devait quand même résoudre CE type composite (deux branches
    /// conditionnelles, `ReadingModeChip` + `ReadingModeDensityButton`)
    /// avant de pouvoir le boxer, et le décodage de mangled name débordait
    /// toujours la pile au 1er rendu (2026-08-17).
    private var readingModeAffordanceCluster: AnyView {
        // Drapeau OFF ⇒ la loi ne rend que `.bubbles` : pas de chip. Drapeau
        // ON ⇒ chip TOUJOURS, y compris en Bulles (c'est depuis lui qu'on en
        // sort — 2026-08-21, Bulles est l'un des trois rendus du fil).
        guard readingModeCapabilities.availableModes.contains(where: { $0 != .bubbles }) else {
            return AnyView(EmptyView())
        }
        // P2 (spec Magnificence 17/08) : UN SEUL chip — tap = CYCLE des modes
        // disponibles (loi pure ReadingModeCycle), appui long = menu natif
        // listant tous les modes. Le bouton Aa a disparu avec sa bascule de
        // densité : le cycle parcourt TOUS les modes ouverts par les
        // capacités, et le menu remplace la feuille Lentille.
        return AnyView(
            ReadingModeChip(
                model: readingModeChipModel,
                menuRows: ReadingModeLensCatalog.rows(
                    capabilities: readingModeCapabilities,
                    currentMode: readingModeController.mode
                ),
                onCycle: {
                    HapticFeedback.light()
                    guard let next = ReadingModeCycle.next(
                        after: readingModeController.mode,
                        availableInOrder: ReadingModeLensCatalog.cycleOrder.filter {
                            $0 == .bubbles || readingModeCapabilities.availableModes.contains($0)
                        }
                    ) else { return }
                    readingModeController.select(next)
                },
                onSelect: { readingModeController.select($0) },
                onAuto: { readingModeController.resetToAuto() }
            )
        )
    }

    /// Modèle pur du chip — `isAuto` distingue une décision de
    /// l'orchestrateur (§WS-1 `OrchestratorDecisionReason` ∉ {`.sticky`,
    /// `.flagDisabled`}) d'un choix manuel figé (préférence collante).
    private var readingModeChipModel: ReadingModeChipModel {
        ReadingModeChipModel(
            label: ReadingModeLensCatalog.title(for: readingModeController.mode),
            accentHex: accentColor,
            isAuto: readingModeController.decision.reason != .sticky
                && readingModeController.decision.reason != .flagDisabled
        )
    }

    /// Title + tags column shown when the composer-options drawer is open.
    ///
    /// Arbitrage user 2026-08-18 : la bande DÉPLIÉE ne porte AUCUN bouton
    /// d'action (ni mode d'affichage, ni recherche, ni appel — ils vivent
    /// dans l'état plié) : titre + tags/catégorie seulement, l'avatar-view
    /// montrant déjà les membres les plus actifs d'un groupe. Le tap du
    /// titre ouvre les détails ; en conversation DIRECTE, l'appui long
    /// propose détails OU profil de l'utilisateur.
    @ViewBuilder
    private var expandedHeaderTitleAndTags: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs - 1) {
            HStack(alignment: .top, spacing: MeeshySpacing.xs) {
                expandedHeaderTitleButton
                Spacer(minLength: 4)
            }

            // Tags row: aligned with title, scrolls under the search icon
            headerTagsRow
                .mask(
                    HStack(spacing: 0) {
                        Color.black
                        LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing)
                            .frame(width: 24)
                    }
                )
                .transition(.move(edge: .top).combined(with: .opacity))
        }
        .transition(.move(edge: .trailing).combined(with: .opacity))
    }

    /// Le bouton-titre de la bande dépliée — tap = détails de la
    /// conversation ; en DIRECT, appui long = choix détails / profil
    /// (arbitrage user 2026-08-18).
    @ViewBuilder
    private var expandedHeaderTitleButton: some View {
        let titleButton = Button { composerState.showConversationInfo = true } label: {
            expandedHeaderTitleLabel
                .meeshyTapTarget()
        }
        // F11 (revue adversariale 2026-08-25) : `liveConversation` — visible
        // sur la même surface que `headerTagsRow` juste en dessous (déjà
        // basculée). Le TITRE rendu par ce même bouton
        // (`expandedHeaderTitleLabel` → `conversation?.displayName`) reste
        // délibérément sur la valeur figée — hors du périmètre minimal de ce
        // correctif, suivi nommé séparément — seul le libellé d'accessibilité
        // change ici.
        .accessibilityLabel(liveConversation?.name ?? "Conversation")
        .accessibilityHint(String(localized: "conversation.view.open_info", bundle: .main))

        if conversation?.type == .direct {
            titleButton.contextMenu {
                Button {
                    composerState.showConversationInfo = true
                } label: {
                    Label(String(localized: "conversation.view.details", defaultValue: "Détails de la conversation", bundle: .main), systemImage: "info.circle.fill")
                }
                Button {
                    if let conv = conversation, let profileUser = ProfileSheetUser.from(conversation: conv) {
                        router.deepLinkProfileUser = profileUser
                    }
                } label: {
                    Label(String(localized: "conversation.view.view_profile", defaultValue: "Voir le profil", bundle: .main), systemImage: "person.circle.fill")
                }
            }
        } else {
            titleButton
        }
    }

    /// Title text + optional revalidation sparkle. Splitting this off keeps
    /// the conditional `Image` inside its own opaque type and prevents
    /// SwiftUI from baking it into the parent's already-complex type tree.
    @ViewBuilder
    private var expandedHeaderTitleLabel: some View {
        HStack(spacing: MeeshySpacing.xs + 2) {
            ConversationTitleLabel(
                name: conversation?.displayName ?? "Conversation",
                favoriteEmoji: conversation?.userState.reaction,
                font: MeeshyFont.relative(13, weight: .bold, design: .rounded),
                color: .white,
                lineLimit: 2
            )
            // Subtle "revalidating" sparkle: shown while we serve stale cache
            // and silently refresh from the server. Disappears as soon as the
            // REST response lands — no blocking spinner.
            if viewModel.isRevalidating {
                Image(systemName: "sparkles")
                    .font(MeeshyFont.relative(10, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.85))
                    .adaptiveSymbolPulse()
                    .accessibilityLabel(String(localized: "conversation.view.refreshing_background", bundle: .main))
            }
        }
    }

    // AnyView + label extrait en struct NOMINALE : casse la récursion de type
    // du bouton lui-même (crash stack-overflow du décodeur de métadonnées Swift
    // au 1er rendu SUR DEVICE, .ips du 2026-07-30 dans
    // `expandedHeaderSearchButton.getter`). Leçon 5cdde93c4 : couper au niveau
    // du type qui est décodé — le type structurel (opaques
    // `adaptiveGlass`/`meeshyTapTarget`, 2 branches #available chacun) reste
    // scopé au body de `HeaderSearchGlyph`, le Button devient trivial.
    private var expandedHeaderSearchButton: AnyView {
        AnyView(Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { headerState.showSearch = true }
            isSearchFocused = true
        } label: {
            HeaderSearchGlyph(accentColor: accentColor, secondaryColor: secondaryColor)
        }
        .accessibilityLabel(String(localized: "conversation.view.search_in_conversation", bundle: .main))
        .accessibilityHint(String(localized: "accessibility.search.hint", bundle: .main))
        .accessibilityIdentifier("conversation.header.search"))
    }

    private var expandedHeaderBackground: AnyView {
        guard composerState.showOptions else { return AnyView(Color.clear) }
        return AnyView(
            RoundedRectangle(cornerRadius: MeeshyRadius.xxl - 2)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.xxl - 2)
                        .stroke(
                            LinearGradient(colors: [Color(hex: accentColor).opacity(0.4), Color(hex: secondaryColor).opacity(0.15)], startPoint: .leading, endPoint: .trailing),
                            lineWidth: 1
                        )
                )
                .shadow(color: Color(hex: accentColor).opacity(0.2), radius: 8, y: 2)
                .transition(.scale(scale: 0.1, anchor: .trailing).combined(with: .opacity))
        )
    }

    // MARK: - Overlay Menu Content (extracted to help type-checker)

    // Retourne AnyView pour ÉRADIQUER le type massif de `MessageOverlayMenu` du
    // type mangled de `ConversationView.body`. Ce type profond (aggravé par les
    // ajouts .equatable()/a11y de l'overlay) faisait déborder la pile du
    // décodeur de métadonnées Swift (`swift_getTypeByMangledName`) au 1er rendu
    // SUR DEVICE → EXC_BAD_ACCESS dans l'en-tête (`expandedHeaderBandBody`).
    // L'overlay est modal (zIndex 999) → AnyView sans coût de liste.
    private var overlayMenuContent: AnyView {
        guard overlayState.showOverlayMenu, let msg = overlayState.overlayMessage else {
            return AnyView(EmptyView())
        }
        return AnyView(
            MessageOverlayMenu(
                message: msg,
                contactColor: accentColor,
                // Le frame-tracker ne suit que les BULLES : en Focal/Script il
                // rend `nil`, donc `.zero`, et l'overlay présente son aperçu
                // centré, à sa taille naturelle. C'est exactement ce que
                // demande la directive du 2026-08-23 — « le mode focal, en
                // long-press, doit afficher le message normal » — là où la
                // capture de la cellule Focal en tranchait l'identité et la
                // barre de méta, toutes deux à cheval sur son cadre.
                messageBubbleFrame: frameTracker.frame(for: msg.id) ?? .zero,
                isPresented: $overlayState.showOverlayMenu,
                canDelete: msg.isMe || isCurrentUserAdminOrMod,
                canEdit: msg.isMe || isCurrentUserAdminOrMod,
                onCopy: {
                    // Prisme: copy what's actually DISPLAYED (the preferred
                    // translation when one is showing), never blindly the
                    // original — matches the quick-reaction bar's Copier.
                    UIPasteboard.general.string = viewModel.preferredTranslation(for: msg.id)?.translatedContent ?? msg.content
                    HapticFeedback.success()
                },
                onEdit: { beginEdit(msg) },
                onPin: { Task { await viewModel.togglePin(messageId: msg.id) }; HapticFeedback.medium() },
                onToggleStar: {
                    _ = viewModel.toggleStar(
                        messageId: msg.id,
                        conversationName: conversation?.name,
                        conversationAccentColor: accentColor
                    )
                    HapticFeedback.success()
                },
                isStarred: viewModel.isStarred(messageId: msg.id),
                textTranslations: viewModel.messageTranslations[msg.id] ?? [],
                transcription: viewModel.messageTranscriptions[msg.id],
                translatedAudios: viewModel.messageTranslatedAudios[msg.id] ?? [],
                onReact: { emoji in
                    viewModel.toggleReaction(messageId: msg.id, emoji: emoji)
                },
                onDelete: {
                    // Show the confirmation dialog so the user can pick
                    // between local-only and server-broadcast deletion.
                    overlayState.deleteConfirmMessageId = msg.id
                },
                onSaveMedia: {
                    // Composant unifié « Enregistrer » — l'action n'apparaît
                    // que pour un message à exactement UN attachment.
                    guard let attachment = msg.attachments.first(where: { $0.type != .location }) else { return }
                    HapticFeedback.light()
                    mediaSaveCoordinator.requestSave(MediaSaveRequest(
                        kind: attachment.kind,
                        remoteURLString: attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl,
                        suggestedFileName: attachment.originalName.isEmpty ? nil : attachment.originalName,
                        attachmentId: attachment.id.isEmpty ? nil : attachment.id
                    ))
                },
                onCompose: {
                    // L'overlay ne monte rien : il rend la main. Le même état
                    // que le second déclencheur, un seul chemin de présentation.
                    composerState.composeMediaTarget = ComposableMediaTarget(message: msg)
                },
                onSelect: { beginSelectionMode(seedingWith: msg.id) },
                isDirect: isDirect,
                preferredTranslation: viewModel.preferredTranslation(for: msg.id),
                mentionDisplayNames: viewModel.mentionDisplayNames,
                currentUserId: AuthManager.shared.currentUser?.id ?? "",
                userRegionalLanguage: AuthManager.shared.currentUser?.regionalLanguage,
                userCustomDestinationLanguage: AuthManager.shared.currentUser?.customDestinationLanguage,
                onShowTranslate: {
                    overlayState.moreSheetInitialItem = .language
                    overlayState.detailSheetMessage = msg
                },
                onShowMore: {
                    overlayState.moreSheetInitialItem = nil
                    overlayState.detailSheetMessage = msg
                },
                onShowCallDetail: {
                    overlayState.callDetailMessage = msg
                },
                onExpandFullPicker: {
                    overlayState.fullReactionPickerMessage = msg
                }
            )
            .transition(.opacity).zIndex(999)
        )
    }

    // MARK: - Menu message NATIF (iOS 26 Liquid Glass)

    /// Contenu du `.contextMenu` natif d'une bulle (iOS 26+, cf. MessageListView
    /// / MessageListViewController). Palette d'emojis rapides (`ControlGroup`,
    /// choix produit 2026-07-14) + actions primaires via `MessageActionResolver`
    /// — EXACTEMENT les mêmes callbacks que `overlayMenuContent` (SSOT).
    /// Reply/Forward restent dans « Plus… » (feuille détail) et via le swipe
    /// latéral, inchangés.
    ///
    /// **Plus d'exclusion des messages système depuis le 2026-08-24** : la
    /// parité qui la justifiait — « l'overlay n'en donne aucun » — a disparu
    /// avec le no-op de `onLongPress`. Ce chemin doit rendre le MÊME menu que
    /// l'overlay, résumé d'appel compris (dont l'entrée `.callDetail`).
    private func buildNativeMessageMenu(for msg: Message) -> AnyView {
        let hasText = !msg.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let ctx = MessageMenuContext(
            isMine: msg.isMe,
            canEdit: msg.isMe || isCurrentUserAdminOrMod,
            canDelete: msg.isMe || isCurrentUserAdminOrMod,
            hasText: hasText,
            hasMedia: !msg.attachments.isEmpty,
            hasTimebasedMedia: msg.attachments.contains {
                AttachmentKind(mimeType: $0.mimeType).hasTimebasedTrack
            },
            isPinned: msg.pinnedAt != nil,
            isStarred: viewModel.isStarred(messageId: msg.id),
            isEdited: msg.isEdited,
            hasEditRevisions: true,
            hasCallSummary: msg.callSummary != nil,
            saveableAttachmentCount: msg.attachments.filter { $0.type != .location }.count,
            canComposeMedia: ComposableAttachment.offers(message: msg),
            showReadReceipts: UserPreferencesManager.shared.privacy.showReadReceipts,
            // `isForwardable` profitait ici de son défaut `true`, inoffensif
            // tant que `primaryActions` ne le lisait pas. Le lot 5 le rend
            // LOAD-BEARING : sans lui, « Composer » s'offrirait sur une vue
            // unique, et la clause O13 tomberait par un simple défaut.
            isForwardable: msg.isForwardable
        )
        let actions = MessageActionResolver.primaryActions(ctx)
        // 4 emojis les plus utilisés (fallback sur les défauts) — rangée rapide
        // du menu natif. PLAFOND à 4 : au-delà, `.compactMenu` passe à la ligne
        // (la rangée doit rester sur UNE seule ligne — feedback device 2026-07-14).
        let recentEmojis = EmojiUsageTracker.topEmojis(count: 4, defaults: Self.nativeQuickReactionEmojis)
        return AnyView(
            Group {
                // Réactions rapides = rangée horizontale d'emojis (4 plus
                // utilisés) via `ControlGroup` + `.controlGroupStyle(.compactMenu)`
                // — rendu système en rangée medium (pattern Messages/Photos, cf.
                // RecentMediaStrip). SANS ce style, le ControlGroup empile les
                // emojis (3 + 3 vertical, feedback device 2026-07-14). iOS 16.4+ ;
                // le menu natif n'existe que sur iOS 26 → toujours disponible.
                if #available(iOS 16.4, *) {
                    ControlGroup {
                        ForEach(recentEmojis, id: \.self) { emoji in
                            Button {
                                viewModel.toggleReaction(messageId: msg.id, emoji: emoji)
                            } label: {
                                Text(emoji)
                            }
                        }
                    }
                    .controlGroupStyle(.compactMenu)
                } else {
                    ForEach(recentEmojis, id: \.self) { emoji in
                        Button {
                            viewModel.toggleReaction(messageId: msg.id, emoji: emoji)
                        } label: {
                            Text(emoji)
                        }
                    }
                }

                // « Plus d'emojis » → picker complet (sous la rangée rapide).
                Button {
                    overlayState.fullReactionPickerMessage = msg
                } label: {
                    Label(
                        String(localized: "action.more_emojis", defaultValue: "Plus d'emojis", bundle: .main),
                        systemImage: "plus"
                    )
                }

                Divider()

                ForEach(actions, id: \.self) { action in
                    if action == .delete { Divider() }
                    nativeMenuButton(action, msg: msg)
                }
            }
        )
    }

    /// Emojis de la palette rapide du menu natif (sous-ensemble des défauts de
    /// l'overlay — un menu système ne doit pas porter les 20).
    private static let nativeQuickReactionEmojis = ["😂", "❤️", "👍", "😮", "😢", "🔥"]

    /// Un item du menu natif pour une `PrimaryAction` — mêmes actions que
    /// l'overlay (`overlayMenuContent`). `.delete` porte `role: .destructive`
    /// (rendu rouge système) et arme la confirmation, jamais de delete direct.
    @ViewBuilder
    private func nativeMenuButton(_ action: PrimaryAction, msg: Message) -> some View {
        switch action {
        case .select:
            Button {
                beginSelectionMode(seedingWith: msg.id)
            } label: {
                Label(
                    String(localized: "action.select", defaultValue: "Sélectionner", bundle: .main),
                    systemImage: "checkmark.circle"
                )
            }
        case .edit:
            Button {
                beginEdit(msg)
            } label: {
                Label(String(localized: "action.edit", defaultValue: "Éditer", bundle: .main), systemImage: "pencil")
            }
        case .translate:
            Button {
                overlayState.moreSheetInitialItem = .language
                overlayState.detailSheetMessage = msg
            } label: {
                Label(String(localized: "action.translate", defaultValue: "Traduire", bundle: .main), systemImage: "globe")
            }
        case .copy:
            Button {
                UIPasteboard.general.string = msg.content
                HapticFeedback.success()
            } label: {
                Label(String(localized: "action.copy", defaultValue: "Copier", bundle: .main), systemImage: "doc.on.doc")
            }
        case .saveMedia:
            Button {
                guard let attachment = msg.attachments.first(where: { $0.type != .location }) else { return }
                HapticFeedback.light()
                mediaSaveCoordinator.requestSave(MediaSaveRequest(
                    kind: attachment.kind,
                    remoteURLString: attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl,
                    suggestedFileName: attachment.originalName.isEmpty ? nil : attachment.originalName,
                    attachmentId: attachment.id.isEmpty ? nil : attachment.id
                ))
            } label: {
                Label(String(localized: "media.save.title", defaultValue: "Enregistrer", bundle: .main), systemImage: "arrow.down.to.line")
            }
        case .compose:
            Button {
                HapticFeedback.light()
                composerState.composeMediaTarget = ComposableMediaTarget(message: msg)
            } label: {
                Label(String(localized: "message.compose.title", defaultValue: "Composer", bundle: .main), systemImage: "wand.and.stars")
            }
        case .pin:
            Button {
                Task { await viewModel.togglePin(messageId: msg.id) }
                HapticFeedback.medium()
            } label: {
                Label(String(localized: "action.pin", defaultValue: "Épingler", bundle: .main), systemImage: "pin.fill")
            }
        case .unpin:
            Button {
                Task { await viewModel.togglePin(messageId: msg.id) }
                HapticFeedback.medium()
            } label: {
                Label(String(localized: "action.unpin", defaultValue: "Désépingler", bundle: .main), systemImage: "pin.slash.fill")
            }
        case .star:
            Button {
                _ = viewModel.toggleStar(messageId: msg.id, conversationName: conversation?.name, conversationAccentColor: accentColor)
                HapticFeedback.success()
            } label: {
                Label(String(localized: "action.star", defaultValue: "Favori", bundle: .main), systemImage: "star.fill")
            }
        case .unstar:
            Button {
                _ = viewModel.toggleStar(messageId: msg.id, conversationName: conversation?.name, conversationAccentColor: accentColor)
                HapticFeedback.success()
            } label: {
                Label(String(localized: "action.unstar", defaultValue: "Retirer des favoris", bundle: .main), systemImage: "star.slash.fill")
            }
        case .more:
            Button {
                overlayState.moreSheetInitialItem = nil
                overlayState.detailSheetMessage = msg
            } label: {
                Label(String(localized: "action.more", defaultValue: "Plus…", bundle: .main), systemImage: "ellipsis")
            }
        case .delete:
            Button(role: .destructive) {
                overlayState.deleteConfirmMessageId = msg.id
            } label: {
                Label(String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main), systemImage: "trash")
            }
        case .callDetail:
            Button {
                overlayState.callDetailMessage = msg
            } label: {
                Label(
                    String(localized: "bubble.call.details.action", defaultValue: "Détails de l'appel", bundle: .main),
                    systemImage: "info.circle"
                )
            }
        }
    }
}

// MARK: - Header Search Glyph (extracted struct to keep the Button's type trivial)

/// Struct NOMINALE : le type structurel du glyphe (opaques `adaptiveGlass` +
/// `meeshyTapTarget`, chacun portant ses 2 branches #available) reste scopé à
/// ce body au lieu de gonfler le mangled name du Button parent — dont le
/// décodage récursif débordait la pile du main thread au 1er rendu SUR DEVICE
/// (.ips 2026-07-30, `expandedHeaderSearchButton.getter`).
private struct HeaderSearchGlyph: View {
    let accentColor: String
    let secondaryColor: String

    var body: some View {
        Image(systemName: "magnifyingglass")
            .font(MeeshyFont.relative(13, weight: .semibold))
            .foregroundStyle(LinearGradient(colors: [Color(hex: accentColor), Color(hex: secondaryColor)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .frame(width: 28, height: 28)
            .adaptiveGlass(in: Circle(), tint: Color(hex: accentColor).opacity(0.25))
            .meeshyTapTarget()
    }
}
