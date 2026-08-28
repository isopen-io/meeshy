import SwiftUI
import UIKit
import AVFoundation
import Combine
import os
import MeeshySDK
import MeeshyUI

struct SharedContentWrapper: Identifiable {
    let id = UUID()
    let content: SharedContentType
}

/// Wrapper used by `StoryViewerView.fullScreenCover(item:)` to drive the
/// repost-as-post composer launched from the kebab menu's "Editer et republier
/// en post" action (C.2). Feeds the
/// `UnifiedPostComposer(repostingStory:authorHandle:onPublishRepost:onDismiss:)`
/// init introduced in B.7 — the sole surviving repost-as-story wrapper (the
/// share-button-based `RepostStorySourceWrapper` cover was dead code, removed
/// S6: the share button reposts directly via `PostService.repost`, see
/// `StoryViewerView+Sidebar.swift`).
struct RepostPostSourceWrapper: Identifiable {
    let id = UUID()
    let story: StoryItem
    let authorHandle: String
}

/// Enveloppe `Identifiable` d'un `SharedPlace` pour le
/// `.fullScreenCover(item:)` du reader — ouverte au tap d'une pastille de
/// lieu de la story (Layer 6.6). Même identité que `BubbleFullscreenPlace`
/// côté bulle : la paire de coordonnées.
struct StoryReaderPlaceWrapper: Identifiable {
    let place: SharedPlace
    var id: String { "\(place.latitude),\(place.longitude)" }
}

/// Draft state for a single story's composer
struct StoryDraft {
    var text: String = ""
    var attachments: [ComposerAttachment] = []
}

// MARK: - Prefetcher host (P3 wire-up)

/// Offscreen `UIViewRepresentable` that installs the
/// `StoryReaderPrefetcher.hostView` into the SwiftUI hierarchy. The host
/// occupies a 1x1 corner behind every visible layer so the prefetcher's
/// child canvas views go through a full `didMoveToWindow` cycle (image
/// decode, AVPlayer asset load, layer-tree build) without taking any
/// visible real estate.
///
/// `MeeshyUI` defaults to `@MainActor` isolation, so `StoryReaderPrefetcher`
/// is `@MainActor`. The closure is invoked synchronously inside
/// `makeUIView` on the main actor (SwiftUI guarantee), so the access is safe.
struct PrefetcherHostView: UIViewRepresentable {
    let prefetcher: StoryReaderPrefetcher

    func makeUIView(context: Context) -> UIView {
        // Wrapper so the prefetcher's host view sits behind any visible layer
        // and never affects layout/hit-testing of the SwiftUI tree.
        let container = UIView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
        container.isUserInteractionEnabled = false
        container.clipsToBounds = true
        container.alpha = 0
        container.accessibilityElementsHidden = true
        prefetcher.attach(to: container)
        return container
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        // Idempotent — `attach(to:)` short-circuits if already parented.
        prefetcher.attach(to: uiView)
    }
}

struct StoryViewerView: View {
    @ObservedObject var viewModel: StoryViewModel
    let groups: [StoryGroup]
    @State var currentGroupIndex: Int
    @Binding var isPresented: Bool
    var isPreviewMode: Bool = false
    var onReplyToStory: ((ReplyContext) -> Void)? = nil
    /// Assets préchargés localement transmis depuis le composer (mode preview uniquement).
    var preloadedImages: [String: UIImage] = [:]
    var preloadedVideoURLs: [String: URL] = [:]
    var preloadedAudioURLs: [String: URL] = [:]
    var initialStoryIndex: Int = 0
    /// Quand `true` (et sans slide explicite), le viewer s'ouvre directement sur
    /// la PREMIÈRE story non vue du groupe courant (fallback : index 0 si tout est
    /// déjà vu). Utilisé par les points d'entrée « toucher le profil / l'avatar /
    /// le tray » pour afficher la première nouvelle story. Les points d'entrée
    /// ciblant une slide précise (réponse à une story, deep link de notification)
    /// gardent `false` + `initialStoryIndex` explicite.
    var startAtFirstUnviewed: Bool = false
    /// One-shot side-effect for the notification flow (Phase F): when set, the
    /// viewer auto-opens either the comments overlay or the viewers sheet on
    /// first appear, then pauses the timer so the user can read what they
    /// were notified about. Default `nil` keeps every legacy entry point
    /// (tray, deep link, story-reaction redirect) on the existing path.
    var initialAction: StoryViewerInitialAction? = nil

    /// Commentaire ciblé par la notification : l'overlay commentaires scrolle
    /// dessus (au lieu du dernier) une fois la liste chargée. `parent` sert de
    /// repli de scroll pour une réponse dont le thread n'est pas déplié.
    /// Non-private : consommés par StoryViewerView+Content (fichier extension).
    var targetCommentId: String? = nil
    var targetParentCommentId: String? = nil

    static let heartEmoji = "\u{2764}\u{FE0F}"

    @State var currentStoryIndex = 0 // internal for cross-file extension access
    @State var progress: CGFloat = 0 // internal for cross-file extension access
    /// Interstitiel d'identité inter-groupes (directive user 2026-07-03) :
    /// au passage au groupe d'une AUTRE personne, bannière en fond + pseudo,
    /// nom, présence, mood pendant `groupIntroDuration` avant le slide.
    @State var showGroupIntro = false
    @State var groupIntroData: StoryViewModel.StoryGroupIntro?
    @State var groupIntroTask: Task<Void, Never>?
    /// Identités PRÉ-RÉSOLUES par groupe (directive 2026-07-10) : les groupes
    /// voisins sont résolus PENDANT la lecture du groupe courant, si bien que
    /// l'interstitiel du switch s'affiche COMPLET (nom, bannière, mood) dès la
    /// première frame — plus d'enrichissement visible en second temps.
    @State var groupIntroCache: [String: StoryViewModel.StoryGroupIntro] = [:]
    /// 500 ms (directive user 2026-08-20, resserré depuis 2,2 s) : l'interlude
    /// est un battement d'identité entre deux groupes, plus une pause.
    ///
    /// C'est la durée NOMINALE de l'interlude, pas l'instant où le voile a
    /// physiquement disparu. Deux raisons, toutes deux voulues :
    /// 1. RECOUVREMENT — l'apparition de la story entrante démarre
    ///    `StoryGroupIntroPolicy.revealOverlap` (200 ms) AVANT la fin annoncée,
    ///    donc à t = 300 ms : le slide monte PENDANT que le voile se retire, un
    ///    seul geste au lieu de deux temps collés bout à bout.
    /// 2. TRAÎNÉE ASSUMÉE — les courbes de sortie du voile
    ///    (`StoryGroupIntroPolicy.dismissAnimation`) sont préservées telles
    ///    quelles par choix utilisateur : le voile finit donc de s'effacer un
    ///    peu après 500 ms (le ressort n'a pas de fin bornée). Arbitrage, pas
    ///    bug — on ne raccourcit pas ces courbes pour faire coller la
    ///    constante.
    ///
    /// RENDU unique par ailleurs : l'interstitiel et la face du cube
    /// (`NeighborGroupCubeFace`, qui révèle ce même interlude au doigt depuis
    /// 2026-07-25) montrent tous deux `StoryAuthorIdentityCard` — une seule
    /// carte, deux surfaces.
    static let groupIntroDuration: TimeInterval = 0.5
    /// True once the visible slide's background media is fully usable (real
    /// bitmap / video `.readyToPlay` / solid color). Gates the progress timer
    /// and the centered loading spinner.
    @State var isContentReady: Bool = false // internal for cross-file extension access
    @State var isPaused = false // internal for cross-file extension access
    /// Spécifique au toggle long-press : `true` UNIQUEMENT entre le hold
    /// confirmé (200 ms) et le tap suivant de reprise. Distinct de `isPaused`,
    /// qui couvre **toutes** les pauses du timer (sheets, drag-to-dismiss,
    /// composer engaged…). Le notification au canvas (`storyPlayerPause` /
    /// `storyPlayerResume`) n'est postée QUE quand ce drapeau bascule —
    /// sinon ouvrir une sheet ou drag pour dismiss freezerait la vidéo BG
    /// et l'audio mixer (blip audible au play/pause rapide).
    @State var isLongPressPaused = false // internal for cross-file extension access
    @State var isGlobalMuted = false // internal for cross-file extension access
    /// Audio-track presence for the current slide's foreground videos, keyed by
    /// `StoryMediaObject.id`. Populated by `refreshVideoAudioTrackPresence()` —
    /// a video only counts toward `storyHasAudibleSound` once probed `true`.
    @State private var videoAudioTrackPresence: [String: Bool] = [:]
    /// True when user is actively engaging with the composer (focused, recording, emoji panel, etc.)
    @State var isComposerEngaged = false // internal for cross-file extension access
    /// True when composer has pending content (text, attachments, or recording)
    @State var hasComposerContent = false // internal for cross-file extension access

    // Per-story draft storage
    @State var storyDrafts: [String: StoryDraft] = [:]

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    /// Durée dynamique du slide courant — max(6, durée max des médias vidéo/audio).
    /// Static text/image slides default to 6s (parité Instagram/Snapchat) — la
    /// transition n'interrompt JAMAIS un média en cours : `updateStoryDuration`
    /// retient `max(6, durée vidéo BG, durée vidéo FG, durée audio, words/6)` puis
    /// arrondit à `ceil(base / loopPeriod) × loopPeriod` pour que chaque loop bg
    /// termine son cycle avant l'avance.
    @State var computedStoryDuration: Double = 6.0 // internal for cross-file extension access
    @State var hasFiredFadeOut = false // internal for cross-file extension access
    @State var hasFiredNextPrefetch = false // déclencheur du prefetch de la slide N+1, armé à 5s de la fin de la slide en cours pour que la transition soit fluide.

    /// Visibilité du chrome (header, sidebar droite, composer) — animé par
    /// glissements directionnels. En mode normal `chromeVisible = true` au
    /// repos, passe à `false` pendant un touch-and-hold pour révéler le
    /// contenu en pleine surface (typique « immersion lecture »). En mode
    /// `isFullscreenStorySession`, l'état au repos est inversé : `false`,
    /// révélé temporairement par le toucher.
    @State var chromeVisible: Bool = true // internal for cross-file extension access

    /// Mode "plein écran" toggleable via le menu hamburger « … ». Quand actif,
    /// le chrome est caché par défaut pour TOUTE la session story (jusqu'au
    /// prochain toggle), et n'apparaît que pendant un touch-and-hold. La
    /// distinction avec le toggle ponctuel : ici l'état au repos est inversé.
    @State var isFullscreenStorySession: Bool = false // internal for cross-file extension access

    // MARK: - P3 wire-up : Prefetcher + gated timer
    //
    // `StoryReaderPrefetcher` maintains a sliding window of 3 bootstrapped
    // canvas views around `currentStoryIndex` so the next/previous slide is
    // one CATransaction away when the user taps to advance. The
    // prefetcher's offscreen canvas reports `onContentReady` once its
    // background image lands in the shared cache — we use that signal to
    // drive `StoryReaderTimerController` for the visible slide, since the
    // visible `StoryReaderRepresentable` shares the same image cache (its
    // canvas hits the cache directly on `setReaderContext` → `rebuildLayers`).
    //
    // Lot 2 (2026-06-11) : le timer gated est l'UNIQUE pilote — barre de
    // progression (`onProgressChange`), seuil de prefetch N+1 et auto-advance
    // (`onCompletion` → `goToNext()`). Le display-link legacy
    // (`StoryProgressDisplayLinkProxy` + `timerCancellable`) est supprimé ;
    // `startTimer()` (extension +Content) ne garde que les resets d'état de
    // slide puis ré-arme via `refreshPrefetchWindowAndTimer()`.
    @State private var prefetcher = StoryReaderPrefetcher()
    @State var slideTimer = StoryReaderTimerController() // internal for cross-file extension access
    /// Handles des tasks de prefetch média (`prefetchAllMedia`, +Content) —
    /// annulés à l'onDisappear pour ne pas continuer downloads + prerolls
    /// AVPlayer après la fermeture du viewer. internal for cross-file
    /// extension access.
    @State var prefetchTasks: [Task<Void, Never>] = []
    /// Latched once `attach(to:)` has been wired via the host
    /// representable — guards against re-firing every onAppear cycle
    /// (scene phase changes / parent re-renders).
    @State private var hasInstalledPrefetchPipeline = false

    @State var showFullEmojiPicker = false // internal for cross-file extension access
    @State var showTextEmojiPicker = false // internal for cross-file extension access
    @State private var selectedProfileUser: ProfileSheetUser?
    // Deferred profile open from the viewers sheet: set when a viewer row is
    // tapped, consumed in the viewers sheet's `onDismiss` so the profile sheet
    // presents cleanly after the viewers sheet closes (avoids stacking two
    // sheets and reaching the Router across the sheet boundary).
    @State private var pendingViewerProfile: ProfileSheetUser?
    @State var emojiToInject = "" // internal for cross-file extension access
    @State var composerFocusTrigger = false // internal for cross-file extension access
    @State var composerLanguage: String = DefaultComposerLanguage.resolve() // internal for cross-file extension access
    @State var commentBlurEnabled: Bool = false // internal for cross-file extension access
    @State var commentEffects: MessageEffects = .none // internal for cross-file extension access
    @State var showLanguageOptions = false // internal for cross-file extension access
    @State var showFullLanguagePicker = false // internal for cross-file extension access
    /// Langue d'exploration choisie via le picker (Prisme « Exploration »). Prépendue à
    /// `resolvedViewerLanguageChain` tant qu'elle est non-nil. Éphémère : réinitialisée au
    /// changement de slide. `nil` = affichage selon les préférences de base uniquement.
    @State var sessionLanguageOverride: String? = nil // internal for cross-file extension access
    /// Affichage de la transcription de l'audio parlé, basculé depuis le menu « … ».
    /// Éteint par défaut (directive user 2026-07-25) : la transcription est une
    /// AIDE qu'on demande, pas un bandeau imposé par-dessus la story.
    @State var showAudioTranscript = false // internal for cross-file extension access
    @StateObject private var keyboard = KeyboardObserver()
    @Environment(\.scenePhase) var scenePhase // internal for cross-file extension access (shouldPauseTimer)

    // Required by `SharePickerView` presented via `.sheet(item:)` below. The
    // sheet creates a separate presentation hierarchy so EnvironmentObjects
    // from the parent fullScreenCover are NOT inherited automatically — we
    // must capture them here and re-inject onto SharePickerView (see line
    // ~257) to avoid the `EnvironmentObject error` crash that previously
    // happened the moment a user tapped the share button on a story.
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var statusViewModel: StatusViewModel

    // === Transition states ===

    // Appear — start visible to avoid blank screen if animation doesn't fire
    @State private var appearScale: CGFloat = 0.92
    @State private var appearCornerRadius: CGFloat = 24
    @State private var appearOpacity: Double = 1

    // Dismiss
    @State var isDismissing = false // internal for cross-file extension access
    @State var dragOffset: CGFloat = 0 // internal for cross-file extension access

    // Group slide (group ↔ group)
    @State var groupSlide: CGFloat = 0 // internal for cross-file extension access

    // Content cross-fade (story ↔ story within group)
    @State var contentOpacity: Double = 1 // internal for cross-file extension access

    // Outgoing layer for true cross-dissolve (old stays visible while new fades in)
    @State var outgoingStory: StoryItem? = nil // internal for cross-file extension access
    @State var outgoingOpacity: Double = 0 // internal for cross-file extension access

    // Transition lock — prevents overlapping animations
    @State var isTransitioning = false // internal for cross-file extension access

    // Text parallax offset (slides up during cross-dissolve for depth)
    @State var textSlideOffset: CGFloat = 0 // internal for cross-file extension access
    /// Glissement HORIZONTAL de l'ouverture `.slide`, en fraction de la largeur
    /// du canvas — même unité que `StoryRenderer.slideTransitionTravelFraction`.
    @State var openingSlideFraction: CGFloat = 0 // internal for cross-file extension access

    // Opening effect animation states
    @State var openingScale: CGFloat = 1.0        // internal for cross-file extension access
    @State var isRevealActive: Bool = false       // internal for cross-file extension access
    @State var closingScale: CGFloat = 1.0        // internal for cross-file extension access

    // Horizontal swipe (group ↔ group)
    @State var horizontalDrag: CGFloat = 0 // internal for cross-file extension access
    /// Direction de la face entrante du cube inter-groupes : +1 = groupe
    /// suivant (face à droite), -1 = précédent (face à gauche), 0 = aucune.
    /// Posée par le drag horizontal (réversible mi-geste) et par
    /// `groupTransition` (tap/auto-advance), nettoyée au snap-back/commit.
    @State var neighborPreviewDirection: Int = 0 // internal for cross-file extension access
    @State var gestureAxis: Int = 0 // internal for cross-file extension access  // 0=undecided, 1=horizontal, 2=vertical
    /// Valeur de `hasActiveReaderFeature` FIGÉE à la décision d'axe vertical du
    /// drag parent. Le relâchement ne peut PAS relire l'état vivant : l'overlay
    /// gestuel du canvas consomme la surface ouverte dès le touch-down (il appelle
    /// `dismissActiveReaderFeature()`), donc au touch-up `hasActiveReaderFeature`
    /// est déjà `false` et le drag concluait `.dismissViewer` — l'utilisateur qui
    /// glissait vers le bas pour refermer son overlay perdait la story avec.
    @State var hadActiveFeatureAtDragStart: Bool = false // internal for cross-file extension access
    /// Jeton de purge de l'état gestuel du canvas (cf. `resetGestureTracking()`).
    /// Incrémenté sur les chemins NON NOMINAUX — snap-back, transition de groupe,
    /// sortie du lecteur — parce que SwiftUI n'appelle pas `onEnded` quand un
    /// recognizer concurrent emporte la séquence : sans purge, `gestureAxis`
    /// restait collé (la décision d'axe est sautée par `if gestureAxis == 0`) et
    /// l'overlay de Layer 6 traitait tous les touchers suivants comme un drag en
    /// cours — plus aucun tap de navigation, plus aucun long-press.
    @State var gestureResetToken: Int = 0 // internal for cross-file extension access
    /// Posé par `StoryGestureOverlayView` quand le TOUCH-DOWN du toucher courant
    /// a servi à refermer une surface du reader.
    ///
    /// Complément indispensable de `hadActiveFeatureAtDragStart` : cette
    /// photographie-là est prise à la décision d'axe du drag, donc APRÈS 15 pt de
    /// déplacement — l'enfant a déjà refermé la surface au premier contact et la
    /// photographie vaut `false`. Sans ce drapeau, un glissement bas de plus de
    /// 120 pt parti du canvas concluait `.dismissViewer` : l'utilisateur perdait
    /// la story alors qu'il refermait un strip.
    ///
    /// Consommé (remis à `false`) par le `onEnded` du drag et par
    /// `resetGestureTracking()`, et réarmé à chaque touch-down de l'enfant : il ne
    /// peut donc pas neutraliser le geste SUIVANT.
    @State var readerFeatureConsumedByTouch: Bool = false // internal for cross-file extension access
    /// Bord SUPÉRIEUR (coordonnées `.global`) de la surface scrollable ouverte,
    /// remonté par `StoryReaderScrollableSurfaceTopKey`. `nil` = aucune surface
    /// ouverte, ou surface dont le cadre n'est pas mesurable ici (cf.
    /// `effectiveScrollableSurfaceTopY`) — dans ce dernier cas la garde de point
    /// de départ retombe sur son comportement conservateur.
    @State var scrollableSurfaceTopY: CGFloat? // internal for cross-file extension access
    @State var showViewersSheet = false
    @State var showExportShareSheet = false
    @StateObject var exportShareViewModel = StoryExportShareViewModel()
    @State var showCommentsOverlay = false
    @State var storyReactionCount: Int = 0
    /// Emojis the logged-in user has applied to the CURRENT story. Seeded from
    /// `currentStory?.currentUserReactions` in `startTimer()` and bumped
    /// optimistically by `triggerStoryReaction`. Drives the sidebar heart's
    /// active state so it only lights up when *this* viewer has reacted —
    /// not when somebody else has (bug 2026-05-28).
    @State var storyCurrentUserReactions: [String] = []
    @State var storyComments: [FeedComment] = []
    /// Pagination des commentaires top-level de la story — suivie pour la
    /// chasse paginée d'un commentaire notifié hors de la première page (50).
    @State var storyCommentsNextCursor: String?
    @State var storyCommentsHasMore = false
    @State var isLoadingComments = false
    @State var storyCommentCount: Int = 0
    /// Impulsion (mirroir `heartBouncePulse`) incrémentée UNIQUEMENT par la
    /// réconciliation d'ouverture de `loadStoryCommentCount()` (+Content.swift :
    /// cache commentaires local puis, si toujours à 0, une requête réseau
    /// bornée ~400 ms) — jamais par une activité TEMPS RÉEL (`sendComment`,
    /// le socket `comment:added` via `applyStoryCommentAdded` +Content.swift,
    /// ou `StoryViewModel.applyStoryCommentCountDelta` qui tient
    /// `currentStory?.commentCount` lui-même live). Ces trois derniers canaux
    /// DOIVENT rester hors du gel du rail (directive 2026-07-10 : jamais de
    /// bouton qui surgit en cours de lecture) ; seule cette impulsion dédiée
    /// permet à `StoryActionSidebarView` de distinguer « le payload d'entrée
    /// était périmé » de « quelqu'un vient de commenter pendant que je lis ».
    @State var storyCommentCountReconciledPulse: Int = 0
    @State var replyingToStoryComment: FeedComment? = nil
    @State var storyCommentRepliesMap: [String: [FeedComment]] = [:]
    @State var storyCommentExpandedThreads: Set<String> = []
    @State var storyCommentLoadingReplies: Set<String> = []
    /// Pagination des réponses par commentaire racine (endpoint replies paginé
    /// ASC 20/page). NON-private : consommé par l'extension frère
    /// StoryViewerView+Content (piège protection level cross-file).
    @State var storyCommentRepliesHasMore: [String: Bool] = [:]
    @State var storyCommentRepliesNextCursor: [String: String] = [:]
    /// Optimistic local tracking of liked comments (id ∈ set => current user reacted).
    @State var storyCommentLikedIds: Set<String> = []
    /// Local like-count delta keyed by comment id, applied on top of the server `comment.likes`
    /// to avoid waiting for refetch after a tap.
    @State var storyCommentLikeDelta: [String: Int] = [:]
    /// In-flight heart taps: commentIds with a pending network call. Prevents rapid-tap desync.
    @State var heartInFlightIds: Set<String> = []
    /// Latched once the `initialAction` (Phase F notification entry point) has
    /// been honoured. Guards against re-firing on every `.onAppear` cycle —
    /// scene phase transitions and parent re-renders both republish onAppear,
    /// and we only ever want to auto-open the overlay/sheet once per
    /// presentation.
    @State var hasTriggeredInitialAction = false

    // Use the active window bounds rather than `UIScreen.main.bounds` so
    // iPad split-screen / Stage Manager / multi-window scenes report the
    // viewer's actual window (UIScreen reports the full display). Used by
    // swipe-to-dismiss thresholds and horizontal-slide normalization.
    private var windowSize: CGSize { DeviceLayout.windowSize }

    /// Bas du safe area lu directement sur la keyWindow. Necessaire parce que
    /// le `GeometryReader` interne au viewer est rendu dans un contexte
    /// `.ignoresSafeArea()` (cf. `viewerContent`), ce qui aplatit
    /// `geometry.safeAreaInsets.bottom` a 0 — le composer et la liste de
    /// commentaires se retrouvaient alors plaques sur le bord physique et
    /// chevauchaient le home indicator + les coins arrondis (bug 2026-05-28).
    var windowBottomInset: CGFloat { // internal for cross-file extension access
        DeviceLayout.safeAreaBottom
    }

    private var screenH: CGFloat { windowSize.height }

    var screenW: CGFloat { windowSize.width } // internal for cross-file extension access

    // Drag dismiss progress 0–1
    private var dragProgress: CGFloat {
        min(max(dragOffset / 350, 0), 1)
    }

    // Combined horizontal offset (programmatic slide + interactive drag)
    /// 1:1 avec le doigt (Lot 3 — l'ancien amorti ×0.5 rendait le cube
    /// inter-groupes « lourd » : un commit exigeait 2× la largeur de course).
    private var totalSlideX: CGFloat {
        groupSlide + horizontalDrag
    }

    /// Slide d'entrée d'un groupe pour la face du cube — même règle que le
    /// prefetch inter-groupes : première non-vue non-expirée, sinon première
    /// non-expirée. `nil` = le groupe n'a RIEN à afficher (toutes vues+expirées,
    /// ou toutes expirées) — sert aussi de prédicat de gating pour
    /// `neighborCubeGroup`/`presentGroupIntroIfNeeded` (n'afficher un
    /// placeholder de transition QUE si le groupe cible a effectivement une
    /// story à montrer). `static` + `now` injectable : aucune dépendance à
    /// `self`, testable directement sans instancier la View.
    static func entryStory(of group: StoryGroup, now: Date = Date()) -> StoryItem? {
        group.stories.first(where: { !$0.isViewed && !$0.isExpired(at: now) })
            ?? group.stories.first(where: { !$0.isExpired(at: now) })
    }

    /// Index d'entrée d'un groupe — MÊME règle que `entryStory` (et que
    /// l'aperçu du cube inter-groupes) : première slide non-vue non-expirée,
    /// sinon première non-expirée, sinon 0. Utilisé au commit d'une transition
    /// FORWARD pour reprendre CHAQUE auteur à sa première story non lue —
    /// parité avec l'aperçu du cube qui montrait déjà cette slide, et respect
    /// de la reprise par-utilisateur (si tout est vu → 0, première slide).
    func entryIndex(of group: StoryGroup) -> Int {
        let now = Date()
        if let i = group.stories.firstIndex(where: { !$0.isViewed && !$0.isExpired(at: now) }) { return i }
        if let i = group.stories.firstIndex(where: { !$0.isExpired(at: now) }) { return i }
        return 0
    }

    private var neighborCubeGroup: StoryGroup? {
        guard neighborPreviewDirection != 0, !isPreviewMode else { return nil }
        let idx = currentGroupIndex + neighborPreviewDirection
        guard groups.indices.contains(idx) else { return nil }
        let candidate = groups[idx]
        // N'afficher le placeholder de transition QUE si ce groupe a
        // effectivement une story à montrer — sinon l'avatar/bannière
        // flashent pour un auteur dont tout est vu/expiré (directive user).
        guard Self.entryStory(of: candidate) != nil else { return nil }
        return candidate
    }

    // Depth effect from horizontal movement (slight scale + rotation)
    private var slideProgress: CGFloat {
        min(abs(totalSlideX) / screenW, 1.0)
    }

    // Extracted into the nominal `StoryViewerContentView` struct (see
    // StoryViewerView+Canvas.swift) so the deeply-nested story canvas no
    // longer composes into `StoryViewerView.body`'s opaque type. That
    // monolithic type triggered a Swift type-metadata instantiation crash on
    // low-memory devices (cf. ConversationListView). A real struct breaks the
    // type just as effectively as `AnyView` while preserving SwiftUI
    // structural identity / diffing.
    private var viewerContent: some View {
        StoryViewerContentView(
            prefetcher: prefetcher,
            cardScale: cardScale,
            cardCornerRadius: cardCornerRadius,
            cardOpacity: cardOpacity,
            cardOffsetY: cardOffsetY,
            totalSlideX: totalSlideX,
            slideProgress: slideProgress,
            dragProgress: dragProgress,
            neighborGroup: neighborCubeGroup,
            neighborEntryStory: neighborCubeGroup.flatMap { Self.entryStory(of: $0) },
            neighborDirection: neighborPreviewDirection,
            // Interlude révélé au doigt : on ne descend QUE l'identité déjà
            // pré-résolue par `prefetchNeighborGroupIntros()`. Pas de
            // placeholder « username seul » ici — une carte d'identité sans
            // bannière ni nom réel serait un flash vide pendant le geste ;
            // la face du cube se dégrade alors sur son backdrop flouté.
            neighborIntro: neighborCubeGroup.flatMap { groupIntroCache[$0.id] },
            // Même résolution que l'interstitiel : realtime PresenceManager
            // d'abord (le plus frais), sinon le snapshot serveur embarqué par
            // le payload stories. Lookups O(1) synchrones descendus en
            // primitives (règle « Zero Unnecessary Re-render » : pas
            // d'@ObservedObject sur ces singletons dans la face du cube).
            neighborPresence: neighborCubeGroup.flatMap {
                PresenceManager.shared.presenceMap[$0.id] ?? $0.authorPresence
            },
            neighborIsFriend: neighborCubeGroup.map { FriendshipCache.shared.isFriend($0.id) } ?? false,
            isPresented: $isPresented,
            makeStoryCard: { geometry in storyCard(geometry: geometry) }
        )
        .background(Color.black)
        .preferredColorScheme(.dark)
        .ignoresSafeArea()
        .statusBarHidden()
        .onAppear {
            if initialStoryIndex > 0, currentGroupIndex < groups.count {
                currentStoryIndex = min(initialStoryIndex, groups[currentGroupIndex].stories.count - 1)
            } else if startAtFirstUnviewed, currentGroupIndex < groups.count,
                      let firstUnviewed = groups[currentGroupIndex].stories.firstIndex(where: { !$0.isViewed }) {
                // Toucher le profil → afficher directement la première story non vue.
                currentStoryIndex = firstUnviewed
            }
            // A5 — skip past stories whose 24h visibility window has elapsed.
            // Cache TTL > 24h is intentional (avoid redownloading avatars)
            // but the *content* must not be rendered once expired. If no
            // non-expired story remains in the current group, dismiss.
            skipUnplayableStoriesIfNeeded()
            StoryMediaCoordinator.shared.activate {
                // No-op : ne PAS forcer `isGlobalMuted = true` ici. Cette
                // closure est invoquée par `PlaybackCoordinator` chaque fois
                // qu'un autre `StoppablePlayer` claim le canal audio — y
                // compris l'`audioMixer` interne à la story elle-même
                // (cf. `StoryCanvasUIView.startAudioPlayback` →
                // `willStartPlaying(external: audioMixer)` qui sweep tous
                // les externals sauf lui-même → arrête `StoryMediaCoordinator`
                // → invoque ce closure). Le résultat était que le viewer
                // s'ouvrait toujours en muted parce que le canvas lui-même
                // déclenchait le stop handler dès le premier `startAudioPlayback`.
                //
                // L'état `isGlobalMuted` doit rester un choix utilisateur. Si
                // une vraie interruption externe arrive (appel iOS, autre app
                // qui prend le canal), `AVAudioSession` s'occupera de
                // l'interruption au niveau système, et le canvas réagira via
                // `observeAudioSessionEvents` (interruption began/ended). Pas
                // besoin de basculer la UI mute pour ça.
            }
            installPrefetchPipelineIfNeeded()
            startTimer()
            prefetchCurrentGroup()
            // PAS d'interlude à l'ouverture du viewer (directive user
            // 2026-08-20 : « l'interlude s'affiche UNIQUEMENT lorsqu'on lit
            // les groupes à la suite, non à la première ouverture ») — la
            // story demandée s'affiche immédiatement, l'interstitiel ne vit
            // que dans `adaptiveOnChange(of: currentGroupIndex)`. Sans
            // interlude, `markCurrentViewed` marque tout de suite (sa garde
            // `showGroupIntro` ne bloque que les switches de groupe).
            markCurrentViewed()
            // Pré-résolution des identités voisines dès l'ouverture : le
            // premier switch de groupe présente un interstitiel déjà complet.
            prefetchNeighborGroupIntros()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                appearScale = 1.0
                appearCornerRadius = 0
            }
            triggerInitialActionIfNeeded()
            if let story = currentStory {
                SocialSocketManager.shared.joinPostRoom(postId: story.id)
                EngagementTracker.shared.begin(postId: story.id, contentType: .story, surface: .storyViewer)
            }
        }
        .task(id: currentStory?.id) {
            await refreshVideoAudioTrackPresence()
        }
        .onDisappear {
            // `invalidate()` (et non `reset()`) : coupe le CADisplayLink 60 Hz
            // et libère les callbacks qui capturent l'état du viewer. Le
            // pipeline est ré-installé au prochain onAppear
            // (`hasInstalledPrefetchPipeline = false` ci-dessous).
            slideTimer.invalidate()
            // Purge l'état gestuel transient : le lecteur peut être quitté au
            // beau milieu d'un drag (dismiss, background, navigation externe) et
            // le `onEnded` du recognizer ne viendra jamais. Sans ça, `gestureAxis`
            // survivait à la vue et la réouverture démarrait avec un axe déjà
            // décidé, court-circuitant tap et long-press.
            resetGestureTracking()
            groupIntroTask?.cancel()
            groupIntroTask = nil
            prefetchTasks.forEach { $0.cancel() }
            prefetchTasks.removeAll()
            prefetcher.detach()
            hasInstalledPrefetchPipeline = false
            StoryMediaCoordinator.shared.deactivate()
            // RC4.5 — cut the reader audio engine on exit. `ReaderAudioMixer`
            // is a registered external player, so `stopAll()` reaches it
            // without the viewer needing a direct reference.
            PlaybackCoordinator.shared.stopAll()
            if let story = currentStory {
                SocialSocketManager.shared.leavePostRoom(postId: story.id)
                // Relâche la déclaration de contenu actif — conditionnelle à
                // l'identité pour rester correcte si un autre écran a déjà
                // déclaré le sien entre-temps.
                NotificationToastManager.shared.onPostClosed(story.id)
            }
            Task { await EngagementTracker.shared.end(surface: .storyViewer) }
        }
        .adaptiveOnChange(of: scenePhase) { _, newPhase in
            if newPhase == .background {
                slideTimer.reset()
                PlaybackCoordinator.shared.stopAll()
                // Release the shared playback session so other apps' audio
                // un-ducks while Meeshy is backgrounded (RC4.3 / RC4.5).
                Task { await MediaSessionCoordinator.shared.deactivateForBackground() }
                isPresented = false
            }
        }
        // Long-press toggle UNIQUEMENT — pas les autres pauses du timer.
        //
        // Sheets, drag-to-dismiss, composer engaged… mutent `isPaused`
        // (timer-only). Si on postait `.storyPlayerPause` dessus, chaque
        // ouverture/fermeture de sheet ferait un cycle pause/play sur
        // l'audio mixer et la vidéo BG — blip audible. Le canvas ne se
        // freeze comme une vidéo que quand l'utilisateur le demande
        // explicitement via long-press.
        .adaptiveOnChange(of: isLongPressPaused) { _, paused in
            NotificationCenter.default.post(
                name: paused ? .storyPlayerPause : .storyPlayerResume,
                object: nil
            )
        }
        // Toutes les pauses UI (sheets, composer engaged, pickers, overlay
        // commentaires, transitions, dismiss, long-press) convergent vers le
        // timer gated — ex-gate par-tick `guard !shouldPauseTimer` du proxy.
        .adaptiveOnChange(of: shouldPauseTimer) { _, paused in
            slideTimer.setPaused(paused)
        }
        // Readiness du canvas VISIBLE (StoryReaderRepresentable) — signal
        // jumeau de celui du canvas préfetché câblé dans
        // `refreshPrefetchWindowAndTimer` (markContentReady est idempotent,
        // premier arrivé gagne). Garde le gate fonctionnel même quand le
        // prefetcher n'a pas (encore) de canvas pour la slide courante.
        .adaptiveOnChange(of: isContentReady) { _, ready in
            guard ready, let id = currentStory?.id else { return }
            slideTimer.markContentReady(slideId: id)
        }
        .adaptiveOnChange(of: currentStoryIndex) { oldValue, _ in
            // Pas de haptic au changement de slide : ce onChange fire pour
            // TOUTE navigation (auto-advance compris) et doublait le tick du
            // point de geste — 2 à 3 vibrations par slide qui ralentissaient
            // la lecture (retour user 2026-07-13). Le tick unique vit dans
            // le geste manuel (+Canvas touchUp, commit de swipe de groupe).
            // U6 — VoiceOver : annonce du changement de slide (« Story 2 sur
            // 5 ») — sans elle, un utilisateur non-voyant n'a AUCUN signal
            // que le contenu vient de changer sous ses doigts.
            if UIAccessibility.isVoiceOverRunning,
               let total = currentGroup?.stories.count {
                UIAccessibility.post(
                    notification: .announcement,
                    argument: String(
                        localized: "story.viewer.a11y.slideChanged",
                        defaultValue: "Story \(currentStoryIndex + 1) sur \(total)"
                    )
                )
            }
            skipUnplayableStoriesIfNeeded()
            isContentReady = false
            refreshPrefetchWindowAndTimer()
            let previousStory = currentGroup.flatMap { group in
                group.stories.indices.contains(oldValue) ? group.stories[oldValue] : nil
            }
            transitionPostRoom(from: previousStory, to: currentStory)
            transitionEngagement(to: currentStory)
        }
        // Interstitiel d'identité inter-groupes — au-dessus du canvas ET des
        // contrôles (identité pleine pendant ~500 ms, tap droite/double-tap =
        // skip, tap gauche = retour au groupe précédent).
        .overlay {
            if showGroupIntro, let intro = groupIntroData {
                StoryGroupIntroOverlay(
                    intro: intro,
                    avatarURL: currentGroup?.avatarURL,
                    avatarColor: currentGroup?.avatarColor ?? "6366F1",
                    // Présence résolue AU switch (directive 2026-07-10) :
                    // entrée realtime du PresenceManager si elle existe (socket,
                    // la plus fraîche), sinon le snapshot serveur embarqué par
                    // le payload stories (`StoryGroup.authorPresence`) — plus
                    // de « Hors ligne » par défaut faute de donnée pour un
                    // auteur hors contacts.
                    presence: PresenceManager.shared.presenceMap[intro.userId]
                        ?? currentGroup?.authorPresence,
                    // Détail « en ligne » réservé aux amis (directive user
                    // 2026-07-13) : lookup O(1) synchrone, primitive Bool
                    // descendue à la leaf view (règle "Zero Unnecessary
                    // Re-render" — pas d'@ObservedObject sur le singleton
                    // dans StoryGroupIntroOverlay).
                    isFriend: FriendshipCache.shared.isFriend(intro.userId),
                    onSkip: { skipGroupIntro() },
                    onBack: { goBackToPreviousGroupFromIntro() },
                    // Même jeton que l'overlay gestuel du canvas : il purge le
                    // mouchard de déplacement de l'interlude sur les chemins où
                    // SwiftUI n'a pas délivré la fin du geste.
                    gestureResetToken: gestureResetToken
                )
                .transition(.opacity)
                .zIndex(30)
            }
        }
        // POINT D'ATTACHE UNIQUE des swipes du lecteur — volontairement APRÈS
        // l'overlay d'interlude ci-dessus. Deux raisons, dans cet ordre :
        //
        // 1. `simultaneousGesture` et non `gesture` : un `.gesture()` d'ancêtre
        //    est de priorité INFÉRIEURE aux gestes de son sous-arbre, et le
        //    `DragGesture(minimumDistance: 0)` de `StoryGestureOverlayView`
        //    (Layer 6) reconnaît dès le touch-down sans jamais relâcher son
        //    recognizer — il subordonnait donc définitivement ce drag, swipes
        //    morts pendant toute la story. En simultané, les deux reconnaissent
        //    en parallèle. NE JAMAIS passer à `highPriorityGesture` ici : ça
        //    préempterait ce même DragGesture(0), qui porte le touch-down /
        //    touch-up — donc plus de navigation par tap NI de long-press.
        // 2. Monté au-dessus de l'overlay d'interlude, le geste le couvre : les
        //    swipes restent actifs pendant l'écran d'identité inter-groupes
        //    (directive user). L'overlay, lui, conditionne ses taps à l'absence
        //    de mouvement pour ne pas commiter tap ET swipe sur un même geste.
        .simultaneousGesture(unifiedDragGesture)
        // Cadre STATIQUE de la surface scrollable ouverte, publié par le
        // conteneur PARENT de son `ScrollView` (jamais depuis l'intérieur du
        // défilement : sous iOS 18+, `onPreferenceChange` ne re-tire plus quand
        // la valeur est pilotée par le scroll — ici elle ne l'est pas, elle ne
        // bouge qu'au layout).
        .onPreferenceChange(StoryReaderScrollableSurfaceTopKey.self) { top in
            scrollableSurfaceTopY = top
        }
        // Filet de fermeture : à la disparition de la surface, SwiftUI republie
        // normalement la valeur par défaut (`nil`), mais la transition peut la
        // maintenir montée quelques frames. On coupe la mesure dès que l'état
        // logique dit qu'il n'y a plus rien à scroller — une mesure périmée
        // ferait passer un geste pour « né dans la surface ».
        .adaptiveOnChange(of: hasScrollableReaderSurface) { _, isOpen in
            if !isOpen { scrollableSurfaceTopY = nil }
        }
        .adaptiveOnChange(of: currentGroupIndex) { oldValue, _ in
            skipUnplayableStoriesIfNeeded()
            isContentReady = false
            refreshPrefetchWindowAndTimer()
            let previousStory: StoryItem? = (oldValue >= 0 && oldValue < groups.count &&
                groups[oldValue].stories.indices.contains(currentStoryIndex))
                ? groups[oldValue].stories[currentStoryIndex]
                : nil
            transitionPostRoom(from: previousStory, to: currentStory)
            transitionEngagement(to: currentStory)
            presentGroupIntroIfNeeded()
            // APRÈS la décision d'interlude : si un interlude s'affiche, la
            // garde de `markCurrentViewed` bloque et c'est `dismissGroupIntro`
            // qui marquera à la révélation ; sinon (mode preview, groupe sans
            // story affichable) le nouveau groupe est visible tout de suite et
            // se marque ici. Point unique pour les switches de groupe.
            markCurrentViewed()
        }
        .onReceive(SocialSocketManager.shared.commentReactionAdded.receive(on: DispatchQueue.main)) { event in
            applyCommentReactionEvent(event)
        }
        .onReceive(SocialSocketManager.shared.commentReactionRemoved.receive(on: DispatchQueue.main)) { event in
            applyCommentReactionEvent(event)
        }
        // Realtime story reactions (it.23) : le `StoryViewModel` applique le delta
        // `story:reacted`/`story:unreacted` sur l'item (`storyGroups` @Published). On
        // re-dérive ici le @State affiché par la sidebar dès que le compteur de la story
        // COURANTE change — sinon une réaction d'un autre viewer ne se voyait pas en direct.
        .adaptiveOnChange(of: currentStory?.reactionCount) { _, newCount in
            storyReactionCount = newCount ?? 0
            storyCurrentUserReactions = currentStory?.currentUserReactions ?? []
        }
        // Mirror of the reaction sink above (asymmetry fix): `StoryViewModel`
        // applies `comment:added`/`comment:deleted` to `storyGroups` the same
        // way it applies `story:reacted`, but nothing re-derived the sidebar's
        // @State counter from it — a comment posted by another viewer never
        // moved the visible count until the user swiped away and back.
        .adaptiveOnChange(of: currentStory?.commentCount) { _, newCount in
            storyCommentCount = newCount ?? 0
        }
        // The counter mirror above keeps the number honest, but the comments
        // OVERLAY itself (when open) never received the new comment's content —
        // only a full close/reopen picked it up. Mirrors
        // `PostDetailViewModel.subscribeToSocket`'s `commentAdded` sink.
        .onReceive(SocialSocketManager.shared.commentAdded.receive(on: DispatchQueue.main)) { data in
            applyStoryCommentAdded(data)
        }
        // Édition en temps réel : remplace la ligne EN PLACE dans l'overlay
        // (contenu, effets, traductions régénérées) — idempotent par id.
        .onReceive(SocialSocketManager.shared.commentUpdated.receive(on: DispatchQueue.main)) { data in
            applyStoryCommentUpdated(data)
        }
        // Traduction de commentaire arrivée : pose `translatedContent` dans
        // l'overlay si la langue est préférée (chaîne du Prisme du viewer).
        .onReceive(SocialSocketManager.shared.commentTranslationUpdated.receive(on: DispatchQueue.main)) { data in
            applyStoryCommentTranslationUpdated(data)
        }
    }

    var body: some View {
        viewerContent
        // Prisme « Exploration » : l'override de langue est éphémère — il se réinitialise
        // dès qu'on change de story (slide ou groupe), de sorte que chaque story s'affiche
        // d'abord dans la langue préférée de base. `adaptiveOnChange` = wrapper iOS 16.
        .adaptiveOnChange(of: currentStory?.id) { _, _ in
            if sessionLanguageOverride != nil { sessionLanguageOverride = nil }
            // Même contrat éphémère pour la transcription : elle est demandée
            // POUR une story, pas pour la session. La laisser ouverte imposerait
            // un bandeau sur les stories suivantes, qui n'ont peut-être même pas
            // de son (directive user 2026-07-25).
            if showAudioTranscript { showAudioTranscript = false }
        }
        .sheet(isPresented: $showViewersSheet, onDismiss: {
            resumeTimer()
            if let pending = pendingViewerProfile {
                pendingViewerProfile = nil
                selectedProfileUser = pending
            }
        }) {
            if let story = currentStory {
                StoryViewersSheet(
                    story: story,
                    accentColor: Color(hex: currentGroup?.avatarColor ?? MeeshyColors.brandPrimaryHex),
                    statusViewModel: statusViewModel,
                    onOpenProfile: { viewer in
                        pendingViewerProfile = ProfileSheetUser(username: viewer.username)
                        showViewersSheet = false
                    }
                )
            }
        }
        .sheet(isPresented: $showExportShareSheet, onDismiss: {
            exportShareViewModel.cancel()
            resumeTimer()
        }) {
            if let story = currentStory {
                StoryExportShareSheet(
                    story: story,
                    viewModel: exportShareViewModel
                )
                .presentationDetents([.medium, .large] as Set<PresentationDetent>)
                .presentationDragIndicator(.visible)
            }
        }
        .sheet(item: $sharedContentWrapper, onDismiss: { resumeTimer() }) { wrapper in
            SharePickerView(
                sharedContent: wrapper.content,
                onDismiss: { sharedContentWrapper = nil },
                onShareToConversation: nil
            )
            .environmentObject(router)
            .environmentObject(conversationListViewModel)
            .environmentObject(statusViewModel)
            .presentationDetents([.medium, .large] as Set<PresentationDetent>)
        }
        .fullScreenCover(item: $readerFullscreenPlace, onDismiss: { resumeTimer() }) { wrapper in
            // Tap d'une pastille de lieu (Layer 6.6) : la story est déjà en
            // pause (`pauseTimer()` au tap), la carte plein écran offre
            // « Ouvrir dans Plans » / « Itinéraire » — même surface que la
            // bulle de message (`LocationFullscreenView`).
            LocationFullscreenView(
                latitude: wrapper.place.latitude,
                longitude: wrapper.place.longitude,
                placeName: wrapper.place.name,
                address: wrapper.place.address,
                accentColor: currentGroup?.avatarColor ?? MeeshyColors.brandPrimaryHex,
                senderName: currentGroup?.username
            )
        }
        .fullScreenCover(item: $editAndRepostAsPostSource, onDismiss: { resumeTimer() }) { wrapper in
            UnifiedPostComposer(
                repostingStory: wrapper.story,
                authorHandle: wrapper.authorHandle,
                onPublishRepost: { content, sourceStory, visibility in
                    do {
                        try await RepostPublisher.shared.publish(
                            .quoted(
                                postId: sourceStory.id,
                                targetType: .post,
                                comment: content,
                                visibility: visibility
                            )
                        )
                        editAndRepostAsPostSource = nil
                        FeedbackToastManager.shared.show(String(localized: "story.publish.success", defaultValue: "Publié", bundle: .main))
                    } catch {
                        FeedbackToastManager.shared.showError(String(localized: "story.publish.error", defaultValue: "Échec de la publication", bundle: .main))
                        throw error
                    }
                },
                onStoryImported: { result in
                    Logger.stories.info(
                        "repost.import slide=\(result.targetSize.width, privacy: .public)x\(result.targetSize.height, privacy: .public) texts=\(result.texts.count, privacy: .public) media=\(result.media.count, privacy: .public) stickers=\(result.stickers.count, privacy: .public) drawing=\(result.drawingData != nil, privacy: .public) audios=\(result.audios.count, privacy: .public) locations=\(result.locations.count, privacy: .public) clamped=\(result.warnings.count, privacy: .public)"
                    )
                },
                onDismiss: { editAndRepostAsPostSource = nil }
            )
            .storyLocationPickerProvided()
            .storyCameraCaptureProvided()
            .storyRecentCameraRollProvided()
            .storyPasteProvided()
            .storyStickerLibraryProvided()
        }
        // Republication en STORY — le composeur s'ouvre prérempli avec la
        // slide source et un badge d'attribution VERROUILLÉ (le republieur ne
        // peut pas le retirer, cf. `StoryComposerViewModel+Repost`).
        //
        // Audience : la story source est le DÉFAUT, et `allowedVisibilities`
        // plafonne le sélecteur — même audience ou plus restreinte, jamais plus
        // large. Le serveur refuse l'élargissement de son côté (403
        // `REPOST_AUDIENCE_WIDENING`) ; ce plafond n'est qu'une affordance.
        //
        // `repostOfId` descend jusqu'à `createStory` via la file de
        // publication : sans lui la republication naîtrait sans lien vers son
        // original, donc sans attribution ni crédit de vues.
        .fullScreenCover(item: $republishStorySource, onDismiss: { resumeTimer() }) { wrapper in
            StoryComposerView(
                viewModel: StoryComposerViewModel(
                    reposting: wrapper.story,
                    authorHandle: wrapper.authorHandle
                ),
                initialVisibility: wrapper.story.visibility ?? PostVisibility.private.rawValue,
                initialVisibilityUserIds: wrapper.story.visibilityUserIds ?? [],
                allowedVisibilities: StoryRepostAudience.allowed(fromRawValue: wrapper.story.visibility),
                onPublishAllInBackground: { slides, slideImages, loadedImages, loadedVideoURLs, loadedAudioURLs, originalLanguage, visibility, visibilityUserIds, draftId, references, accessibility, targetType in
                    viewModel.publishStoryInBackground(
                        targetType: targetType,
                        slides: slides,
                        slideImages: slideImages,
                        loadedImages: loadedImages,
                        loadedVideoURLs: loadedVideoURLs,
                        loadedAudioURLs: loadedAudioURLs,
                        originalLanguage: originalLanguage,
                        visibility: visibility,
                        visibilityUserIds: visibilityUserIds,
                        draftId: draftId,
                        repostOfId: wrapper.story.id,
                        references: references,
                        composerMediaTexts: ComposerMediaTexts(alt: accessibility.mediaAlt ?? [:],
                                                               caption: accessibility.mediaCaption ?? [:]),
                        allowSoundExtraction: accessibility.allowSoundExtraction
                    )
                    republishStorySource = nil
                    // La création accepte TOUJOURS : hors-ligne, la story part
                    // en file d'attente au lieu de rester dans le composeur —
                    // même contrat que la publication nominale.
                    return true
                },
                onDismiss: { republishStorySource = nil }
            )
            .storyLocationPickerProvided()
            .storyCameraCaptureProvided()
            .storyRecentCameraRollProvided()
            .storyPasteProvided()
            .storyStickerLibraryProvided()
        }
    }

    // MARK: - P3 wire-up : prefetcher + gated timer (internal for tests)

    /// Languages used by the prefetcher to project `StoryItem → StorySlide`
    /// (Prisme Linguistique chain). Mirrors `resolvedViewerLanguageChain`
    /// — both come from `MeeshyUser.preferredContentLanguages` — but exposed
    /// here so the wire-up integration tests can intercept the call without
    /// touching the private accessor.
    var preferredContentLanguagesForReader: [String] {
        AuthManager.shared.currentUser?.preferredContentLanguages ?? []
    }

    /// Stories of the current group, snapshotted via `currentGroup`. Empty
    /// when the index points past the end of `groups`.
    var currentGroupStories: [StoryItem] {
        currentGroup?.stories ?? []
    }

    /// Slide duration used to arm the gated timer. Mirrors the legacy
    /// `computedStoryDuration` path so a slide with bg-loop video / long
    /// foreground media still gets the rounded-up duration. The legacy
    /// `updateStoryDuration()` writes `computedStoryDuration` synchronously
    /// for the non-preview path (only `isPreviewMode` defers to AVURLAsset),
    /// so reading it here after `refreshPrefetchWindowAndTimer()` calls
    /// `updateStoryDuration()` indirectly via `startTimer()` is safe.
    var currentSlideDuration: TimeInterval {
        computedStoryDuration > 0 ? computedStoryDuration : 6.0
    }

    /// Installs the prefetcher host pipeline once per viewer lifecycle. The
    /// `PrefetcherHostView` representable handles the `attach(to:)` call
    /// inside `makeUIView` — this method only wires the timer callbacks
    /// and latches the install flag so re-entrant `.onAppear` cycles are
    /// no-ops.
    ///
    /// Parameters intentionally exposed so the integration tests can pass
    /// in dedicated prefetcher/timer instances without going through
    /// SwiftUI's `@State` storage (which only binds inside body evaluation).
    /// Production callers always use the defaults.
    func installPrefetchPipelineIfNeeded(
        prefetcher: StoryReaderPrefetcher? = nil,
        timer: StoryReaderTimerController? = nil
    ) {
        guard !hasInstalledPrefetchPipeline else { return }
        hasInstalledPrefetchPipeline = true
        // The prefetcher itself is bootstrapped via
        // `PrefetcherHostView.makeUIView` — this method only owns the
        // timer callbacks (which can't be wired from the representable
        // because the representable cannot read SwiftUI state). The
        // `prefetcher` parameter is part of the API for symmetry with
        // `refreshPrefetchWindowAndTimer(prefetcher:timer:)`; the tests
        // pass it through so the install fence is uniform on both seams.
        _ = prefetcher
        let t = timer ?? self.slideTimer
        // Reset the gated timer so a re-entrant `.onAppear` doesn't keep
        // the previous slide's countdown alive across the host re-install.
        t.reset()
        // Lot 2 (2026-06-11) : le timer gated est désormais l'UNIQUE pilote
        // de progression — le display-link legacy `StoryProgressDisplayLinkProxy`
        // est supprimé. La barre, le seuil de prefetch N+1 et l'auto-advance
        // vivent ici ; la pause est asservie à `shouldPauseTimer` via
        // `adaptiveOnChange` (+ `setPaused` initial dans `startTimer()`).
        t.onProgressChange = { [self] p in
            let raw = CGFloat(min(1.0, p))
            // Granularité 1/300 : évite de committer le @State `progress`
            // à chaque tick 60 Hz pour des deltas invisibles (la barre fait
            // ~300 pt de large au maximum).
            if abs(raw - progress) >= 1.0 / 300.0 || raw >= 1.0 || raw == 0 {
                progress = raw
            }
            // Seuil d'amorçage du prefetch de la slide suivante : 5 s avant
            // la fin, borné à 50 % minimum (cf. rationale historique dans
            // l'ancien `startTimer()` — conservée à l'identique).
            let duration = computedStoryDuration
            let threshold = max(0.5, 1.0 - (5.0 / max(duration, 0.1)))
            if p >= threshold && !hasFiredNextPrefetch {
                hasFiredNextPrefetch = true
                _ = prefetchStory(at: currentStoryIndex + 1)
            }
        }
        t.onCompletion = { [self] in
            goToNext()
        }
    }

    /// Re-arms the prefetcher's sliding window AND the gated slide timer
    /// to track `currentStory`. Called on `.onAppear` and on every change
    /// of `currentStoryIndex` / `currentGroupIndex`.
    ///
    /// 1. Updates the prefetch window to `[N-1, N, N+1]`.
    /// 2. Re-wires `onContentReady` on the prefetched canvas of the
    ///    current slide so the gated timer flips to active the moment
    ///    the background image lands in the shared cache. The visible
    ///    `StoryReaderRepresentable` hits the same cache, so this is a
    ///    strong proxy for "user is actually seeing real content".
    /// 3. Calls `setCurrentSlide(id:duration:)` to reset the gated timer.
    ///
    /// `prefetcher` / `timer` parameters default to the view's `@State`
    /// instances. The integration tests pass in dedicated instances so
    /// the assertions can read window state and slide id without going
    /// through SwiftUI's `@State` storage.
    /// - Parameter paused: surcharge de `shouldPauseTimer`. Les `@State` d'une
    ///   `View` non installée dans le graphe SwiftUI ne retiennent pas les
    ///   écritures faites depuis un test — même raison que les paramètres
    ///   `prefetcher`/`timer` ci-dessus. Sans cette entrée, la préservation de
    ///   la pause n'est pas vérifiable. Production : `nil`.
    /// - Parameter currentIndex: surcharge de `currentStoryIndex`, même raison.
    ///   Réclamée de longue date par le `TODO(test-seam)` de
    ///   `test_storyIndexChange_updatesPrefetcherWindow`, resté désactivé faute
    ///   de ce point d'entrée. Production : `nil`.
    func refreshPrefetchWindowAndTimer(
        prefetcher: StoryReaderPrefetcher? = nil,
        timer: StoryReaderTimerController? = nil,
        paused: Bool? = nil,
        currentIndex: Int? = nil
    ) {
        let p = prefetcher ?? self.prefetcher
        let t = timer ?? self.slideTimer
        let stories = currentGroupStories
        let index = currentIndex ?? currentStoryIndex
        guard !stories.isEmpty,
              stories.indices.contains(index) else {
            t.reset()
            return
        }
        let chain = preferredContentLanguagesForReader
        // Build a postMediaId → URL resolver across the whole prefetch window.
        // The audio mixer needs this to map `StoryAudioPlayerObject.postMediaId`
        // to a streamable URL — without it, `reconfigureAudioForPlayback`
        // skips every clip silently (logged via `Logger.storyAudio`).
        // Images bypass the resolver via `CachedAsyncImage`, but audio has no
        // equivalent prefetch path, so we MUST provide a resolver here.
        // Prefetch inter-groupes (Lot 3) : garde chaud le slide d'ENTRÉE des
        // groupes voisins pour que la première frame d'un swipe auteur→auteur
        // soit instantanée (zéro rebuildLayers perceptible). Entrée = première
        // non-vue non-expirée du groupe suivant (là où `startAtFirstUnviewed`
        // atterrira), sinon la première ; pour le groupe précédent, la première
        // (comportement back-swipe actuel).
        let now = Date()
        var extraWarmItems: [StoryItem] = []
        if groups.indices.contains(currentGroupIndex + 1) {
            let next = groups[currentGroupIndex + 1].stories
            if let entry = next.first(where: { !$0.isViewed && !$0.isExpired(at: now) })
                ?? next.first(where: { !$0.isExpired(at: now) }) {
                extraWarmItems.append(entry)
            }
        }
        if currentGroupIndex > 0, groups.indices.contains(currentGroupIndex - 1) {
            let previous = groups[currentGroupIndex - 1].stories
            if let entry = previous.first(where: { !$0.isExpired(at: now) }) {
                extraWarmItems.append(entry)
            }
        }

        let windowItems = stories
        let mediaIndex: [String: URL] = Dictionary(
            (windowItems + extraWarmItems)
                .flatMap { $0.media }
                .compactMap { m -> (String, URL)? in
                    guard let raw = m.url, let url = URL(string: raw) else { return nil }
                    return (m.id, url)
                },
            uniquingKeysWith: { first, _ in first }
        )
        let resolver: @Sendable (String) -> URL? = { postMediaId in
            mediaIndex[postMediaId]
        }
        let context = StoryReaderContext(
            preferredLanguages: chain,
            mute: isGlobalMuted,
            onCompletion: nil,
            postMediaURLResolver: resolver,
            imageCache: nil
        )
        p.updateWindow(items: stories,
                       currentIndex: index,
                       context: context,
                       preferredLanguages: chain,
                       extraWarmItems: extraWarmItems)

        let current = stories[index]
        // PREFETCHER CANVASES RESTENT EN `.edit` (jamais promus en `.play`).
        //
        // Le promote-au-`.play` du canvas prefetcher du slide courant a été
        // retiré 2026-05-28 : il créait une double-lecture parallèle avec le
        // `StoryReaderRepresentable` visible (qui est, lui, instancié en
        // `.play` par `makeUIView`). Chaque slide visible avait alors DEUX
        // canvases qui démarraient leur AVPlayer bg + leur audio mixer + leurs
        // AVPlayer FG. `PlaybackCoordinator` mutex-stoppait le second audio
        // mixer mais ni les bg/FG AVPlayer ni leur piste audio embarquée
        // (= bleed audio + bleed vidéo bg).
        //
        // Le prefetcher conserve son rôle de **cache chaud** : ses canvases
        // restent en `.edit` à vie pour pré-décoder l'image bg, charger
        // l'asset AVPlayer, etc. Le canvas visible (StoryReaderRepresentable)
        // est la SEULE source de lecture média.
        t.setCurrentSlide(id: current.id, duration: currentSlideDuration)
        // `setCurrentSlide` remet `isPaused = false` par contrat (« a new slide
        // always starts un-paused »). Sans la ligne suivante, tout ré-armement
        // survenant PENDANT une pause la relâche en silence : `startTimer()` se
        // protégeait déjà, mais pas les ré-armements déclenchés par les
        // `adaptiveOnChange` de `currentStoryIndex` / `currentGroupIndex`. Et
        // `adaptiveOnChange(of: shouldPauseTimer)` ne rattrape rien — la valeur
        // n'a pas *changé*, donc SwiftUI ne refire pas le closure.
        //
        // Symptôme mesuré : 3 s d'horloge intégrées sous l'interlude d'identité
        // (la moitié d'une slide de 6 s), et un long-press maintenu pendant un
        // changement de slide qui ne gelait plus rien.
        //
        // La garde vit ICI, au seul point d'appel de `setCurrentSlide`, pour
        // couvrir aussi les appelants futurs.
        t.setPaused(paused ?? shouldPauseTimer)

        // Re-wire `onContentReady` on the prefetched canvas of the
        // CURRENT slide. The prefetcher's canvas reports readiness once
        // its background image bytes land — same cache as the visible
        // canvas, so this is a strong proxy. `[weak t = t]` captures the
        // timer reference weakly so an in-flight onContentReady ping after
        // the viewer is torn down doesn't keep the timer alive.
        if let canvas = p.view(for: current.id) {
            let slideId = current.id
            canvas.onContentReady = { [weak t = t] in
                t?.markContentReady(slideId: slideId)
            }
            // The prefetcher bootstrapped this canvas before we could attach
            // the callback — its `scheduleContentReadyEvaluation` may have
            // already fired (solidColor backgrounds fire on the next runloop
            // tick). When that happens `contentReadyFired == true` and our
            // newly-attached callback would never be invoked. Fast-forward
            // the timer here so the loader doesn't stick on already-settled
            // backgrounds.
            if canvas.contentReadyFired {
                t.markContentReady(slideId: slideId)
            }
        }
    }

    /// Avance la lecture au-delà des slides qu'on ne peut pas donner à voir.
    ///
    /// Deux cas, arbitrés par `StoryPlaybackSkipResolver` :
    /// - **expirée** — le TTL du cache dépasse volontairement la fenêtre de
    ///   24 h (pour ne pas re-télécharger avatars et métadonnées à froid), donc
    ///   le lecteur reçoit des stories que le GC serveur a déjà supprimées. On
    ///   filtre ICI et non au niveau du tray : l'anneau de l'auteur doit rester
    ///   visible pour la continuité, mais afficher une story expirée renverrait
    ///   404 sur les réactions ;
    /// - **vide** — sans média, sans texte, sans audio : un écran noir pendant
    ///   toute la durée de slide (cf. `StoryContentPresence`).
    ///
    /// Le saut est FORWARD only, et un groupe entièrement illisible fait passer
    /// au groupe suivant qui a du contenu — la fermeture du lecteur n'arrive
    /// qu'une fois la liste épuisée. L'auteur, lui, garde l'accès à ses propres
    /// stories pour y lire réactions et commentaires.
    private func skipUnplayableStoriesIfNeeded() {
        let outcome = StoryPlaybackSkipResolver.resolve(
            groups: groups,
            groupIndex: currentGroupIndex,
            storyIndex: currentStoryIndex,
            currentUserId: AuthManager.shared.currentUser?.id,
            now: Date()
        )
        switch outcome {
        case .stay:
            return
        case .advanceStory(let index):
            currentStoryIndex = index
        case .advanceGroup(let groupIndex, let storyIndex):
            // Saut correctif, pas une navigation utilisateur : on pose les
            // index directement plutôt que de passer par `groupTransition`.
            // L'`adaptiveOnChange(of: currentGroupIndex)` qui suit rejoue
            // `skipUnplayableStoriesIfNeeded` — le résolveur ne renvoie que des
            // groupes ayant du contenu, donc il répondra `.stay` et la
            // récursion s'arrête au premier tour. L'interlude d'identité du
            // nouvel auteur s'affiche normalement via ce même onChange.
            currentGroupIndex = groupIndex
            currentStoryIndex = storyIndex
        case .close:
            isPresented = false
        }
    }

    /// composer — fires `PostService.repost` immediately with no content and
    /// Transitions the Socket.IO post room subscription from `oldStory` to `newStory`.
    /// The old.id != new.id check makes redundant calls (e.g. double-fire from both
    /// onChange handlers at a group boundary) idempotent.
    private func transitionPostRoom(from oldStory: StoryItem?, to newStory: StoryItem?) {
        if let old = oldStory, old.id != newStory?.id {
            SocialSocketManager.shared.leavePostRoom(postId: old.id)
        }
        if let new = newStory, new.id != oldStory?.id {
            SocialSocketManager.shared.joinPostRoom(postId: new.id)
        }
    }

    /// Finalizes the open `.storyViewer` engagement session and begins one for
    /// `newStory`. The viewer reuses a single surface, so each story switch ends
    /// the previous session (pushing video watch-time when present) before the
    /// next begins. `end` is idempotent when no session is open.
    private func transitionEngagement(to newStory: StoryItem?) {
        let m = SharedAVPlayerManager.shared
        let watchMs = m.currentTime.isNaN ? 0 : Int(m.currentTime * 1000)
        let durMs = m.duration > 0 ? Int(m.duration * 1000) : nil
        let drained = m.drainWatchSamples()
        let maxPos = max(watchMs, drained.samples.map(\.positionMs).max() ?? 0)
        let completed: Bool = {
            if drained.reachedEnd { return true }
            guard let d = durMs, d > 0 else { return false }
            return maxPos >= Int(Double(d) * 0.95)
        }()
        EngagementTracker.shared.attachWatch(surface: .storyViewer, watchMs: watchMs,
            mediaDurationMs: durMs, completed: completed, samples: drained.samples)
        Task {
            await EngagementTracker.shared.end(surface: .storyViewer)
            if let new = newStory {
                EngagementTracker.shared.begin(postId: new.id, contentType: .story, surface: .storyViewer)
            }
        }
    }

    /// Republication SÈCHE d'une story dans le fil (`isQuote: false`), avec ses
    /// deux refus NOMMÉS : 404 = la source a disparu, 403 = l'audience demandée
    /// élargit celle de l'original.
    ///
    /// **Ces deux refus étaient INATTEIGNABLES avant le lot 7.5, et le
    /// doc-comment affirmait le contraire** : il disait « errors are mapped
    /// against `APIError.serverError` ... since that's the shape `APIClient`
    /// throws ». C'est faux — mesuré : les vingt-cinq `throw` d'`APIClient`
    /// lancent tous `MeeshyError`, et pas un seul `APIError`. Les deux `catch`
    /// typés ne s'exécutaient donc jamais, et TOUT refus tombait dans le
    /// fourre-tout « Échec de la republication ». Un utilisateur dont la story
    /// avait simplement expiré n'apprenait rien.
    ///
    /// La classification vit désormais dans `RepostFailure`, avec les mêmes
    /// verdicts que la file durable applique de son côté
    /// (`OutboxFlusher.isPermanentServerRejection`) : un seul endroit à
    /// corriger le jour où le gateway changera de forme.
    private func repostAsPostDirect() {
        guard let story = currentStory else { return }
        HapticFeedback.light()
        Task {
            do {
                try await RepostPublisher.shared.publish(
                    .simple(postId: story.id, targetType: .post, visibility: nil)
                )
                await MainActor.run {
                    HapticFeedback.success()
                    FeedbackToastManager.shared.show(String(localized: "story.repost.success", defaultValue: "Republié dans ton feed", bundle: .main))
                }
            } catch {
                let verdict = RepostFailure.classify(error)
                await MainActor.run {
                    switch verdict {
                    case .sourceGone:
                        FeedbackToastManager.shared.showError(String(localized: "story.repost.error.unavailable", defaultValue: "La story n'est plus disponible", bundle: .main))
                    case .audienceWidening:
                        FeedbackToastManager.shared.showError(String(localized: "story.repost.error.forbidden", defaultValue: "Cette story ne peut pas être repartagée", bundle: .main))
                    case .other:
                        FeedbackToastManager.shared.showError(String(localized: "story.repost.error.generic", defaultValue: "Échec de la republication", bundle: .main))
                    }
                }
            }
        }
    }

    // MARK: - External share URL builder

    /// Builds the public web URL surfaced through ShareLink so the story can
    /// be shared outside Meeshy (Messages, Mail, other apps). Aligned with
    /// the existing pattern in `SharePickerView.swift` that already references
    /// `https://meeshy.me/story/<id>`. Returns nil if the story id is empty.
    private func makeStoryExternalShareURL(_ storyId: String) -> URL? {
        guard !storyId.isEmpty else { return nil }
        return URL(string: "https://meeshy.me/story/\(storyId)")
    }

    // MARK: - Computed Card Transforms

    private var cardScale: CGFloat {
        if isDismissing { return 0.12 }
        return appearScale * (1.0 - dragProgress * 0.35)
    }

    private var cardCornerRadius: CGFloat {
        if isDismissing { return 32 }
        return max(appearCornerRadius, dragProgress * 36)
    }

    private var cardOpacity: Double {
        if isDismissing { return 0 }
        return appearOpacity * (1.0 - Double(dragProgress) * 0.3)
    }

    private var cardOffsetY: CGFloat {
        // La sortie CONTINUE le geste : le doigt allait vers le bas, la carte
        // s'en va vers le bas. Elle partait vers le HAUT, ce qui cassait la
        // continuité du swipe de fermeture (directive user 2026-07-25).
        if isDismissing { return screenH * 0.35 }
        // Suivi 1:1 du doigt. L'amorti à 0,5 rendait le retour en arrière
        // infidèle : la carte ne revenait pas sous le doigt, et l'annulation
        // du geste ne se « sentait » pas.
        return dragOffset
    }

    @State var showEmojiStrip = false // internal for cross-file extension access
    /// Réaction en vol vers le cœur (remplace la big reaction 100 pt).
    @State var reactionFlight: StoryReactionFlight?
    /// Cadre du bouton cœur dans StoryScrubSpace (cible du vol).
    @State var heartFrame: CGRect = .zero
    /// Scrub longpress→drag en cours sur le rail (pause le timer).
    @State var isScrubbingRail = false
    /// Ticks at the flight's ARRIVAL, not when the reaction is sent — the
    /// impact is what bounces the heart, regardless of origin (quick strip,
    /// scrub, or full-screen picker). Drives the heart-button bounce in the
    /// sidebar.
    @State private var heartBouncePulse: Int = 0
    @State private var sharedContentWrapper: SharedContentWrapper?
    @State private var editAndRepostAsPostSource: RepostPostSourceWrapper?
    /// Republication d'une story d'AUTRUI dans une story à soi — ouvre le
    /// composeur prérempli (« Phase C » annoncée depuis l'écriture de
    /// `StoryComposerViewModel.init(reposting:authorHandle:)`, restée sans
    /// appelant jusqu'au 2026-08-19). Remplace l'ancien repost un-tap côté
    /// serveur, qui ne laissait ni ajouter de texte ni choisir l'audience.
    @State private var republishStorySource: RepostPostSourceWrapper?
    /// Lieu de la story ouvert plein écran (tap sur une pastille de position).
    @State private var readerFullscreenPlace: StoryReaderPlaceWrapper?

    private let quickEmojis = ["❤️", "😂", "😮", "🔥", "😢", "👏"]

    // MARK: - Comments Overlay (Instagram-style)

    /// Builds the floating comments overlay (`StoryCommentsOverlayView`).
    /// Rendered by `StoryViewerContentView` as a sibling of the story card,
    /// NOT inside it, so the overlay does not inherit the card's drag offset,
    /// scale, or 3D rotation (bug 2026-05-28: overlay shifted left during
    /// drag / scale transitions).
    private func storyCommentsOverlay() -> StoryCommentsOverlayView {
        // L'overlay commentaires n'embarque PLUS son propre composer. Il
        // affiche uniquement : (1) la liste des commentaires, (2) les
        // actions « Répondre » / « like » de chaque row qui mutent
        // `replyingToStoryComment`. Le composer principal — toujours
        // visible en bas via `StoryComposerBarView` rendu dans la canvas
        // « Bottom area » — lit ce binding et affiche sa reply banner
        // au-dessus de sa rangée de saisie. Spec user 2026-05-28 :
        // « une seule zone de saisie de commentaire ».
        StoryCommentsOverlayView(
            storyComments: storyComments,
            storyCommentCount: storyCommentCount,
            storyCommentRepliesMap: storyCommentRepliesMap,
            storyCommentExpandedThreads: storyCommentExpandedThreads,
            storyCommentLoadingReplies: storyCommentLoadingReplies,
            storyCommentRepliesHasMore: storyCommentRepliesHasMore,
            isLoadingComments: isLoadingComments,
            userLang: AuthManager.shared.currentUser?.preferredContentLanguages.first ?? "fr",
            isStoryExpired: currentStory?.isExpired() ?? false,
            targetCommentId: targetCommentId,
            targetParentCommentId: targetParentCommentId,
            huntTargetComment: { await huntTargetStoryComment() },
            loadMoreStoryCommentReplies: { await loadMoreStoryCommentReplies(commentId: $0) },
            revealTargetReply: { parentId, replyId in
                await revealTargetStoryReply(parentId: parentId, replyId: replyId)
            },
            showCommentsOverlay: $showCommentsOverlay,
            replyingToStoryComment: $replyingToStoryComment,
            keyboard: keyboard,
            safeBottom: windowBottomInset,
            makeStoryCommentRow: makeStoryCommentRow,
            toggleStoryCommentThread: toggleStoryCommentThread
        )
    }

    // MARK: - Story Card

    /// Builds the story canvas for the supplied geometry. Extracted into the
    /// nominal `StoryCardView` struct (see StoryViewerView+Canvas.swift) so
    /// its ~10-layer `ZStack` is its own type-metadata unit.
    private func storyCard(geometry: GeometryProxy) -> StoryCardView {
        StoryCardView(
            geometry: geometry,
            currentStory: currentStory,
            outgoingStory: outgoingStory,
            currentGroup: currentGroup,
            currentStoryIndex: currentStoryIndex,
            resolvedViewerLanguage: resolvedViewerLanguage,
            resolvedViewerLanguageChain: resolvedViewerLanguageChain,
            preloadedImages: preloadedImages,
            preloadedVideoURLs: preloadedVideoURLs,
            preloadedAudioURLs: preloadedAudioURLs,
            currentVoiceCaption: currentVoiceCaption,
            isContentTranslated: isContentTranslated,
            isOwnStory: isOwnStory,
            quickEmojis: quickEmojis,
            progress: progress,
            currentSlideDuration: currentSlideDuration,
            outgoingOpacity: outgoingOpacity,
            closingScale: closingScale,
            contentOpacity: contentOpacity,
            textSlideOffset: textSlideOffset,
            openingScale: openingScale,
            openingSlideFraction: openingSlideFraction,
            isRevealActive: isRevealActive,
            reactionFlight: $reactionFlight,
            heartFrame: $heartFrame,
            heartBouncePulse: $heartBouncePulse,
            storyReactionCount: storyReactionCount,
            storyCurrentUserHasReacted: !storyCurrentUserReactions.isEmpty,
            storyCommentCount: storyCommentCount,
            storyCommentCountReconciledPulse: storyCommentCountReconciledPulse,
            storyShareCount: currentStory?.shareCount ?? 0,
            storyViewCount: currentStory?.viewCount ?? 0,
            storyRepostCount: currentStory?.repostCount ?? 0,
            isStoryCommentsEmpty: storyComments.isEmpty,
            storyHasAudibleSound: storyHasAudibleSound,
            storyHasTranslatableContent: storyHasTranslatableContent,
            backgroundSoundAnnouncement: backgroundSoundAnnouncement,
            storyHasAudioTranscript: storyHasAudioTranscript,
            isGlobalMuted: isGlobalMuted,
            availableTranslationLanguages: availableTranslationLanguages,
            activeLanguageCode: sessionLanguageOverride,
            hasActiveReaderFeature: hasActiveReaderFeature,
            onDismissActiveReaderFeature: { dismissActiveReaderFeature() },
            onReplyToStory: onReplyToStory,
            onSelectLanguageOverride: { lang in
                withAnimation(.easeInOut(duration: 0.2)) { sessionLanguageOverride = lang }
            },
            composerAccentColor: currentGroup?.avatarColor ?? MeeshyColors.brandPrimaryHex,
            storyComments: storyComments,
            storyCommentRepliesMap: storyCommentRepliesMap,
            storyCommentExpandedThreads: storyCommentExpandedThreads,
            storyCommentLoadingReplies: storyCommentLoadingReplies,
            isLoadingComments: isLoadingComments,
            commentsUserLang: AuthManager.shared.currentUser?.preferredContentLanguages.first ?? "fr",
            isContentReady: $isContentReady,
            showEmojiStrip: $showEmojiStrip,
            showFullEmojiPicker: $showFullEmojiPicker,
            showCommentsOverlay: $showCommentsOverlay,
            showAudioTranscript: $showAudioTranscript,
            showLanguageOptions: $showLanguageOptions,
            showFullLanguagePicker: $showFullLanguagePicker,
            showViewersSheet: $showViewersSheet,
            showExportShareSheet: $showExportShareSheet,
            isGlobalMutedBinding: $isGlobalMuted,
            showTextEmojiPicker: $showTextEmojiPicker,
            isComposerEngaged: $isComposerEngaged,
            hasComposerContent: $hasComposerContent,
            sharedContentWrapper: $sharedContentWrapper,
            republishStorySource: $republishStorySource,
            editAndRepostAsPostSource: $editAndRepostAsPostSource,
            readerFullscreenPlace: $readerFullscreenPlace,
            isPresented: $isPresented,
            selectedProfileUser: $selectedProfileUser,
            showReportSheet: $showReportSheet,
            replyingToStoryComment: $replyingToStoryComment,
            composerLanguage: $composerLanguage,
            commentEffects: $commentEffects,
            commentBlurEnabled: $commentBlurEnabled,
            emojiToInject: $emojiToInject,
            composerFocusTrigger: $composerFocusTrigger,
            storyDrafts: $storyDrafts,
            chromeVisible: $chromeVisible,
            isFullscreenStorySession: $isFullscreenStorySession,
            isLongPressPaused: $isLongPressPaused,
            isCanvasPlaybackPaused: shouldPauseTimer,
            gestureResetToken: gestureResetToken,
            readerFeatureConsumedByTouch: $readerFeatureConsumedByTouch,
            keyboard: keyboard,
            triggerStoryReaction: { emoji, frame in
                triggerStoryReaction(emoji, from: frame)
            },
            onScrubStateChanged: { isScrubbingRail = $0 },
            pauseTimer: { pauseTimer() },
            resumeTimer: { resumeTimer() },
            onPlaybackProgressing: { progressing in slideTimer.setPlaybackStalled(!progressing) },
            loadStoryComments: { loadStoryComments() },
            dismissComposer: { dismissComposer() },
            goToPrevious: { goToPrevious() },
            goToNext: { goToNext() },
            sendComment: { text, effectFlags, parentId, pendingMedia, location in
                sendComment(text: text, effectFlags: effectFlags, parentId: parentId, pendingMedia: pendingMedia, location: location)
            },
            makeStoryCommentRow: { comment, userLang in
                makeStoryCommentRow(comment, userLang: userLang)
            },
            toggleStoryCommentThread: { await toggleStoryCommentThread($0) },
            makeStoryExternalShareURL: { makeStoryExternalShareURL($0) },
            deleteCurrentStory: { deleteCurrentStory() },
            repostAsPostDirect: { repostAsPostDirect() },
            dismissViewer: { dismissViewer() },
            reportStory: { storyId, reportType, reason in
                try await ReportService.shared.reportStory(storyId: storyId, reportType: reportType, reason: reason)
            },
            composerBottomPadding: { composerBottomPadding(geometry: $0) },
            makeCommentsOverlay: { storyCommentsOverlay() }
        )
    }

    // MARK: - Right Action Sidebar

    private var isOwnStory: Bool {
        currentGroup?.id == AuthManager.shared.currentUser?.id
    }

    // MARK: - Surfaces du reader

    /// Surfaces que le reader ouvre PAR-DESSUS la story : strip de langues,
    /// barre d'emojis, overlay de commentaires, sélecteurs plein écran.
    ///
    /// Elles ont toutes le même contrat (directive user 2026-07-25) : un toucher
    /// n'importe où les referme, et un changement de slide aussi. Sans ce
    /// contrat commun, chaque surface exigeait un geste différent — et taper à
    /// côté faisait avancer la story au lieu de la refermer.
    var hasActiveReaderFeature: Bool { // internal for cross-file extension access
        showLanguageOptions || showFullLanguagePicker
            || showEmojiStrip || showFullEmojiPicker
            || showCommentsOverlay
            || showAudioTranscript
    }

    /// Sous-ensemble des surfaces du reader qui embarquent leur PROPRE
    /// `ScrollView` (liste de commentaires, sélecteur d'emojis plein écran,
    /// explorateur de langues). Le drag du lecteur est monté sur un ancêtre de
    /// toutes : quand l'`UIScrollView` de la surface emporte la séquence de
    /// touches, SwiftUI ne délivre JAMAIS le `onEnded` du drag — et la lecture
    /// restait gelée. Un geste NÉ dans l'une d'elles est donc rendu au scroll
    /// (cf. la garde de point de départ dans `unifiedDragGesture`), tandis
    /// qu'un geste né dans la story encore visible AU-DESSUS reste au drag
    /// parent, qui peut ainsi refermer la surface d'un glissement.
    ///
    /// Les surfaces NON scrollables (strip d'emojis, strip de langues,
    /// transcription) gardent, elles, le swipe de fermeture — c'est un simple
    /// bandeau, aucun recognizer concurrent ne peut voler le geste.
    var hasScrollableReaderSurface: Bool { // internal for cross-file extension access
        showCommentsOverlay || showFullEmojiPicker || showFullLanguagePicker
    }

    /// Bord supérieur de la surface scrollable à opposer au point de départ du
    /// drag — `nil` quand il n'est pas connu, ce que la garde interprète comme
    /// « tout le geste revient à la surface » (fail-safe).
    ///
    /// DEUX SURFACES SUR TROIS RESTENT `nil` VOLONTAIREMENT : le sélecteur
    /// d'emojis plein écran (`EmojiFullPickerSheet`, MeeshyUI) et l'explorateur
    /// de langues (`StoryLanguageDetailView`) rendent tous deux un panneau
    /// bas-ancré À L'INTÉRIEUR d'une racine plein écran (scrim + panneau). Depuis
    /// le point d'insertion, un `GeometryReader` ne mesurerait que cette racine —
    /// `minY == 0`, soit « la surface commence en haut de l'écran », une valeur
    /// vraie mais inutile. Leur panneau, lui, est redimensionnable (poignée de
    /// l'emoji picker) et son cadre n'est publié nulle part. Estimer sa hauteur
    /// ici dupliquerait des constantes d'un autre module, dont la dérive
    /// laisserait passer un geste NÉ DANS le `ScrollView` : `onEnded` jamais
    /// délivré, `gestureAxis` collé à 2, lecture gelée. On préfère le
    /// conservatisme jusqu'à ce que ces deux vues publient elles-mêmes la clé
    /// `StoryReaderScrollableSurfaceTopKey` depuis le parent de leur `ScrollView`
    /// (une ligne dans chacune, hors périmètre de ce lot).
    var effectiveScrollableSurfaceTopY: CGFloat? { // internal for cross-file extension access
        if showFullEmojiPicker || showFullLanguagePicker { return nil }
        return scrollableSurfaceTopY
    }

    /// Referme toute surface ouverte. Idempotent : sans surface, ne fait rien.
    @discardableResult
    func dismissActiveReaderFeature() -> Bool { // internal for cross-file extension access
        guard hasActiveReaderFeature else { return false }
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            showLanguageOptions = false
            showFullLanguagePicker = false
            showEmojiStrip = false
            showFullEmojiPicker = false
            showCommentsOverlay = false
            showAudioTranscript = false
        }
        return true
    }

    // MARK: - Available Translation Languages

    /// Drapeaux proposés par le strip « Traductions ». Couvre le texte du
    /// CANVAS (`StoryTextObject.sourceLanguage` + clés de ses `translations`)
    /// autant que la légende du post : avant 2026-07-25 seule la légende était
    /// consultée, si bien qu'une story faite de texte sur le canvas — le cas
    /// courant — n'offrait aucune langue à explorer malgré ses traductions.
    private var availableTranslationLanguages: [TranslationLanguage] {
        guard let story = currentStory else { return [] }
        let availableCodes = Set(StoryTextLanguageAvailability.availableLanguages(
            effects: story.storyEffects,
            postTranslations: story.translations
        ))
        guard !availableCodes.isEmpty else { return [] }
        return TranslationLanguage.all.filter { availableCodes.contains($0.id) }
    }

    // MARK: - Story Reactions

    /// `heartBouncePulse` n'est PLUS tiqué ici — il tique à l'ARRIVÉE du vol
    /// (`StoryReactionFlightView.onArrived`, +Canvas.swift Layer 9), c'est
    /// l'impact qui fait rebondir le cœur (spec scrub 2026-08-11).
    private func triggerStoryReaction(_ emoji: String, from originFrame: CGRect? = nil) {
        HapticFeedback.medium()

        if showFullEmojiPicker {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                showFullEmojiPicker = false
            }
        }
        // La barre disparaît VITE (~120 ms) pour laisser la scène au vol
        // (spec scrub 2026-08-11) — l'ancien écho de 0.5 s est supprimé.
        withAnimation(.easeOut(duration: 0.12)) {
            showEmojiStrip = false
        }

        // Vol tuile → cœur ; un tap direct (originFrame nil) part du cœur
        // lui-même : le vol dégénère en pop sur place, même chemin de code.
        let origin = originFrame ?? heartFrame
        reactionFlight = StoryReactionFlight(emoji: emoji, from: origin)

        // Snapshot capturé AVANT la mutation optimiste — cible du rollback si
        // le réseau échoue (409 REACTION_LIMIT_REACHED notamment).
        let priorReactions = storyCurrentUserReactions
        let priorCount = storyReactionCount

        if !storyCurrentUserReactions.contains(emoji) {
            storyCurrentUserReactions.append(emoji)
            storyReactionCount += 1
        }
        sendReaction(emoji: emoji, priorReactions: priorReactions, priorCount: priorCount)
    }

    // MARK: - Computed Bottom Padding

    private func composerBottomPadding(geometry: GeometryProxy) -> CGFloat {
        // `.ignoresSafeArea()` au root du viewer aplatit `geometry.safeAreaInsets.bottom`
        // a 0 dans le `GeometryReader` interne. On retombe sur le vrai inset de la
        // keyWindow (`windowBottomInset`) pour ne pas plaquer le composer sur le
        // home indicator et les coins arrondis iPhone Pro (bug 2026-05-28).
        let safeBottom = max(geometry.safeAreaInsets.bottom, windowBottomInset)
        if showTextEmojiPicker {
            // Emoji panel is showing — just need safe area below it
            return safeBottom
        } else if keyboard.isVisible {
            // Keyboard is showing — push everything above it
            return keyboard.height
        } else {
            // Default — safe area + breathing room
            return safeBottom + 20
        }
    }

    // MARK: - Current State

    var currentGroup: StoryGroup? { // internal for cross-file extension access
        guard currentGroupIndex >= 0 && currentGroupIndex < groups.count else { return nil }
        return groups[currentGroupIndex]
    }

    var currentStory: StoryItem? { // internal for cross-file extension access
        guard let group = currentGroup,
              currentStoryIndex >= 0 && currentStoryIndex < group.stories.count else { return nil }
        return group.stories[currentStoryIndex]
    }

    /// Premier element de la chaine Prisme — utilise pour les API single-string
    /// (audio variants legacy, contenu de message, etc.). Pour la resolution complete
    /// on passe `resolvedViewerLanguageChain` au reader.
    private var resolvedViewerLanguage: String? {
        resolvedViewerLanguageChain.first
    }

    /// Chaine complete : systemLanguage → regionalLanguage → customDestinationLanguage → "fr"
    /// (cf. `MeeshyUser.preferredContentLanguages`). Utilisee par le reader pour resoudre
    /// les traductions selon le Prisme Linguistique.
    ///
    /// Quand l'utilisateur explore une autre langue via le picker (`sessionLanguageOverride`),
    /// celle-ci est PRÉPENDUE à la chaine (priorité la plus haute) sans supprimer les
    /// préférences de base — cf. Prisme « Exploration ». L'override est éphémère : il se
    /// réinitialise au changement de slide (cf. `.onChange(of: currentStory?.id)`).
    ///
    /// Internal (not private): `StoryViewerView+Content.swift` needs it for
    /// Prisme-correct resolution of realtime socket comments
    /// (`applyStoryCommentAdded`) — the cross-file-private-access trap
    /// documented in apps/ios/CLAUDE.md.
    var resolvedViewerLanguageChain: [String] {
        Self.viewerLanguageChain(
            base: AuthManager.shared.currentUser?.preferredContentLanguages ?? [],
            override: sessionLanguageOverride
        )
    }

    /// Sentinelle « Original » de la feuille des langues.
    ///
    /// Une story est multilingue par nature : ses overlays peuvent être écrits
    /// dans des langues différentes. Revenir à l'original ne peut donc PAS se
    /// faire en choisissant la langue d'origine de la story — un overlay rédigé
    /// en français dans une story marquée `en` possède une traduction `en`, qui
    /// serait servie à la place de son texte réel. Aligner tous les bouts sur
    /// une seule langue en efface.
    ///
    /// `StoryTextObject.resolvedText` rend le texte source dès que la chaîne
    /// préférée est vide. « Original » est donc une chaîne VIDE : chaque overlay
    /// retombe sur son propre texte, dans sa propre langue. La valeur choisie ne
    /// peut pas entrer en collision avec un code BCP-47.
    nonisolated static let originalLanguageOverride = "__meeshy.original__"

    /// Helper pur (testable) : prépend l'override langue à la chaine préférée, dédupliqué.
    /// `nil`/vide → chaine de base inchangée. Sinon l'override passe en tête et est retiré
    /// de sa position d'origine (jamais de doublon).
    ///
    /// La sentinelle « Original » VIDE la chaine — voir `originalLanguageOverride`.
    static func viewerLanguageChain(base: [String], override: String?) -> [String] {
        guard let override, !override.isEmpty else { return base }
        if override == originalLanguageOverride { return [] }
        return [override] + base.filter { $0 != override }
    }

    /// Drives the sidebar sound/mute button. A silent video (muted by the author
    /// or shot without an audio track) keeps the button hidden — the video-track
    /// presence is resolved asynchronously by `refreshVideoAudioTrackPresence()`.
    var storyHasAudibleSound: Bool { // internal for cross-file extension access
        StoryAudioAvailability.hasAudibleSound(
            effects: currentStory?.storyEffects,
            videoAudioTracks: videoAudioTrackPresence
        )
    }

    /// Annonce du fond (B3.3-5) — résolveur unique partagé avec la carte de
    /// post et le plein écran réel (E1, `BackgroundSoundBadge`). `.none`
    /// sans piste (B3.5 : c'est l'EXISTENCE d'une piste qui gouverne
    /// l'annonce, pas son audibilité — l'ancien gate `hasBackgroundAudio`
    /// exigeait `volume > 0`, une notion que les deux autres surfaces
    /// n'avaient pas ; alignement E1). `.original`/`.credit` selon la
    /// provenance (B3.4). `story.backgroundAudio`
    /// (`StoryBackgroundAudioEntry`) n'est retenu nulle part ici : le chemin
    /// de décodage de production (`toStoryGroups`, StoryModels.swift) ne le
    /// peuple pas — `APIPost` n'a pas de champ `backgroundAudio`.
    var backgroundSoundAnnouncement: BackgroundAudioAnnouncement { // internal for cross-file extension access
        BackgroundSoundBadge.announcement(for: currentStory?.storyEffects)
    }

    /// Probes each foreground video of the current slide for a real audio track.
    /// Until a video is confirmed to carry audio it does NOT count toward
    /// `storyHasAudibleSound`, so the sound button never appears for a clip that
    /// turns out silent. A probe failure (unreachable URL, decode error) is
    /// treated as "no audio" — conservative, matching the no-false-button intent.
    /// Backstop probe when `prefetchAllMedia` couldn't pre-resolve the audio
    /// track presence (cold start on first slide, race after a rapid skip).
    /// Merges into `videoAudioTrackPresence` instead of replacing — the dict
    /// is shared across stories and entries seeded by `preProbeVideoAudio`
    /// must not be wiped on slide change (regression 2026-05-28 « bouton son
    /// apparait après affichage »).
    @MainActor
    private func refreshVideoAudioTrackPresence() async {
        let videos = StoryAudioAvailability.videosNeedingAudioProbe(effects: currentStory?.storyEffects)
        guard let story = currentStory, !videos.isEmpty else { return }
        for video in videos {
            // Already resolved (pre-probed during prefetch) — keep it.
            if videoAudioTrackPresence[video.id] != nil { continue }
            let count = await probeAudioTrackCount(for: video, in: story)
            if Task.isCancelled { return }
            videoAudioTrackPresence = StoryAudioAvailability.merging(
                videoAudioTrackPresence, id: video.id, probedTrackCount: count)
        }
    }

    /// Nombre de pistes audio de `media`, ou `nil` quand le probe n'a PAS pu
    /// aboutir (URL non résolue, asset injoignable). La distinction est
    /// essentielle : les deux probes sautent toute entrée déjà écrite, donc
    /// enregistrer `false` sur un échec réseau masquait le bouton son pour
    /// toute la session, réouverture comprise.
    @MainActor
    private func probeAudioTrackCount(for media: StoryMediaObject,
                                      in story: StoryItem) async -> Int? {
        guard let url = resolveVideoURL(for: media, in: story) else {
            Logger.media.debug("story sound probe: unresolved URL for \(media.id, privacy: .public)")
            return nil
        }
        do {
            return try await AVURLAsset(url: url).loadTracks(withMediaType: .audio).count
        } catch {
            Logger.media.debug("story sound probe failed for \(media.id, privacy: .public)")
            return nil
        }
    }

    /// Probes each foreground video of `story` for an audio track and merges
    /// the result into `videoAudioTrackPresence`. Called from
    /// `prefetchAllMedia` (in `+Content.swift`) so the sound-button
    /// visibility is already settled by the time the slide becomes the
    /// active `currentStory`. Idempotent — entries that are already resolved
    /// are skipped, so re-prefetching the same story is cheap.
    @MainActor
    func preProbeVideoAudio(for story: StoryItem) async {
        let videos = StoryAudioAvailability.videosNeedingAudioProbe(effects: story.storyEffects)
        guard !videos.isEmpty else { return }
        for video in videos {
            if videoAudioTrackPresence[video.id] != nil { continue }
            let count = await probeAudioTrackCount(for: video, in: story)
            if Task.isCancelled { return }
            videoAudioTrackPresence = StoryAudioAvailability.merging(
                videoAudioTrackPresence, id: video.id, probedTrackCount: count)
        }
    }

    /// Resolves the playable URL for a foreground video — mirrors the order used
    /// by `StoryMediaLayer.resolvedMediaURL`: preloaded composer asset, then the
    /// published `StoryItem.media` remote URL, then the embedded `mediaURL`.
    private func resolveVideoURL(for media: StoryMediaObject, in story: StoryItem) -> URL? {
        if !media.postMediaId.isEmpty {
            if let preloaded = preloadedVideoURLs[media.postMediaId] { return preloaded }
            if let feed = story.media.first(where: { $0.id == media.postMediaId }),
               let urlString = feed.url, let url = URL(string: urlString) {
                return url
            }
        }
        if let urlString = media.mediaURL, let url = URL(string: urlString) {
            return url
        }
        return nil
    }

    var storyHasTranslatableContent: Bool { // internal for cross-file extension access
        guard let story = currentStory else { return false }
        // Texte du canvas ET légende — une story faite de texte posé sur le
        // canvas est traduisible même sans légende (corrigé 2026-07-25 : seule
        // la légende comptait, donc le bouton restait absent sur le cas le plus
        // courant).
        if StoryTextLanguageAvailability.hasTranslatableText(
            effects: story.storyEffects, content: story.content) { return true }
        if let effects = story.storyEffects {
            if effects.voiceAttachmentId != nil { return true }
            if let audioObjs = effects.audioPlayerObjects, !audioObjs.isEmpty { return true }
        }
        return false
    }

    var isContentTranslated: Bool { // internal for cross-file extension access
        guard storyHasTranslatableContent,
              let story = currentStory,
              let translations = story.translations,
              !translations.isEmpty,
              !resolvedViewerLanguageChain.isEmpty else { return false }
        // Prisme : le contenu est affiché via la CHAÎNE préférée complète
        // (systemLanguage > regionalLanguage > customDestination > deviceLocale)
        // — `resolvedText` retourne une traduction dès qu'UNE langue de la chaîne
        // a une entrée. Le badge « translate » doit donc refléter la même logique :
        // tester la chaîne entière, pas seulement la première. Sinon un viewer
        // voyant le contenu traduit dans sa langue SECONDAIRE ne voyait aucun
        // indicateur (incohérent avec le texte/caption affichés — bug 2026-06-01).
        return translations.contains { resolvedViewerLanguageChain.contains($0.language) }
    }

    // MARK: - Voice Caption

    var currentVoiceCaption: String? { // internal for cross-file extension access
        // La transcription ne s'affiche QUE sur demande, via le menu « … »
        // (directive user 2026-07-25, item 7a).
        guard showAudioTranscript else { return nil }
        // Ne PAS gater sur `voiceAttachmentId` : ce champ n'est écrit par aucun
        // producteur (vérifié sur tout le dépôt le 2026-07-26) — la voix vit
        // dans `audioPlayerObjects`. S'y adosser rendait la bascule inerte pour
        // TOUTES les stories. La seule condition qui vaille est l'existence
        // d'une transcription, ce que tranche le moteur SDK.
        guard let effects = currentStory?.storyEffects else { return nil }
        // Résolution déléguée au moteur du SDK : la chaîne complète des langues
        // préférées d'abord (systemLanguage > regionalLanguage >
        // customDestination > deviceLocale, override d'exploration en tête),
        // puis la langue PARLÉE d'origine. Jamais une traduction arbitraire.
        return StoryAudioTranscript.resolve(effects: effects,
                                            preferredLanguages: resolvedViewerLanguageChain)?.content
    }

    /// La story porte-t-elle une transcription qu'on puisse afficher ?
    /// Pilote l'entrée « Transcription » du menu « … ».
    var storyHasAudioTranscript: Bool { // internal for cross-file extension access
        guard let effects = currentStory?.storyEffects else { return false }
        return StoryAudioTranscript.hasTranscript(effects: effects)
    }


    // MARK: - Header state

    /// Used by `StoryHeaderView`'s report sheet — owned here so the sheet
    /// presentation survives header re-renders.
    @State private var showReportSheet = false

    // MARK: - Content, Gestures, Navigation, Timer & Actions (see StoryViewerView+Content.swift)
}

// MARK: - Group intro (interstitiel d'identité inter-groupes)

/// Quand présenter l'interstitiel d'identité d'un groupe.
///
/// Règle resserrée le 2026-08-20 sur directive user : l'interlude s'affiche
/// UNIQUEMENT quand on lit les groupes à la suite — à chaque changement de
/// groupe, en avant comme en arrière, mes propres stories comprises — et
/// JAMAIS à la première ouverture du viewer, qui doit être instantanée. Le
/// site d'appel unique est donc `adaptiveOnChange(of: currentGroupIndex)` ;
/// l'`onAppear` n'appelle plus `presentGroupIntroIfNeeded()`. La règle reste
/// indépendante de l'identité de l'auteur (simplification 2026-07-25
/// conservée : un filtre « est-ce moi ? » produisait un comportement à trous).
///
/// S'y ajoutent deux exclusions techniques : le mode preview du composer,
/// qui n'a pas d'identité à annoncer, et un groupe sans aucune story affichable.
nonisolated enum StoryGroupIntroPolicy {
    static func shouldPresent(isPreviewMode: Bool, hasEntryStory: Bool) -> Bool {
        !isPreviewMode && hasEntryStory
    }

    /// Avance de l'apparition de la story sur la fin annoncée de l'interlude
    /// (directive user 2026-07-26). Le slide ne commence PAS à monter quand le
    /// voile a fini de partir : les deux se recouvrent sur ces 200 ms, sinon
    /// l'enchaînement se lit comme deux animations successives — voile qui
    /// s'en va, puis, après un blanc, contenu qui arrive.
    static let revealOverlap: TimeInterval = 0.2

    /// Temps d'attente RÉEL avant de déclencher le retrait du voile, pour une
    /// durée nominale d'interlude donnée.
    ///
    /// `max(0, …)` n'est pas défensif par principe : `Task.sleep` sur une durée
    /// négative lève / se comporte de travers, et une durée totale inférieure au
    /// recouvrement (interlude volontairement très court) produirait exactement
    /// ça. On plafonne donc à « pas d'attente », c'est-à-dire révélation
    /// immédiate — le comportement correct dans ce cas.
    static func holdDuration(total: TimeInterval) -> TimeInterval {
        max(0, total - revealOverlap)
    }

    /// Animation de disparition de l'interlude, dictée par la transition
    /// d'OUVERTURE du slide qui va être révélé (directive user 2026-07-25 :
    /// « la manière dont l'interlude disparaît dépend de comment le premier
    /// slide a configuré son apparition »).
    ///
    /// L'interlude et le slide forment un seul mouvement : c'est le voile qui
    /// se retire selon la grammaire choisie par l'auteur, pas un fondu générique
    /// suivi d'une entrée sans rapport. Les durées reprennent celles documentées
    /// sur `StoryTransitionEffect`.
    static func dismissAnimation(for opening: StoryTransitionEffect?) -> Animation {
        switch opening {
        case .zoom, .slide:
            // Les deux entrées à ressort : la sortie doit avoir le même élan,
            // sinon le slide « rattrape » un voile encore en train de partir.
            return .spring(response: 0.38, dampingFraction: 0.82)
        case .reveal:
            return .easeOut(duration: 0.4)
        case .fade, .none:
            return .easeOut(duration: 0.3)
        }
    }
}

extension StoryViewerView {
    /// Présente l'interstitiel d'identité au CHANGEMENT de groupe (jamais à
    /// l'ouverture du viewer — directive 2026-08-20) : placeholder immédiat
    /// (username/avatar du groupe, déjà en main — cache-first), enrichi async
    /// (nom complet, bannière, mood) par `resolveGroupIntro` PENDANT
    /// l'affichage. Dismiss auto au bout de `groupIntroDuration` (500 ms
    /// nominales — le retrait, et l'apparition du slide qui l'accompagne,
    /// s'amorcent 200 ms plus tôt) ; le tap skippe. Le mode preview n'a pas
    /// d'interstitiel. Le gel de lecture passe par `shouldPauseTimer ||
    /// showGroupIntro` (timer + canvas + audio gelés en phase, reprise sans
    /// saut).
    func presentGroupIntroIfNeeded() {
        // AVANT la garde : l'interlude du groupe QUITTÉ n'a plus lieu d'être, que
        // le groupe atteint en mérite un ou non. Annulée seulement après le
        // `shouldPresent`, la Task précédente survivait à un switch vers un
        // groupe non qualifiant (mode preview, groupe sans story affichable) —
        // le voile de l'auteur précédent restait posé sur la story du nouvel
        // auteur, puis son `dismissGroupIntro()` marquait comme vue une story
        // qui n'est pas la sienne.
        groupIntroTask?.cancel()
        groupIntroTask = nil
        guard let group = currentGroup,
              StoryGroupIntroPolicy.shouldPresent(
                  isPreviewMode: isPreviewMode,
                  // Groupe sans story affichable (tout vu+expiré) → aucun
                  // interstitiel d'identité à montrer.
                  hasEntryStory: Self.entryStory(of: group) != nil
              ) else {
            // Sa Task venant d'être annulée, plus personne ne retirerait le voile
            // resté affiché : on le retire ici. `revealing: false` — la story du
            // nouveau groupe est déjà à l'écran (aucune grammaire d'entrée à
            // rejouer) et c'est l'appelant qui la marquera vue (`markCurrentViewed`
            // juste après ce chemin), jamais celle de l'auteur qu'on a quitté.
            if showGroupIntro { dismissGroupIntro(revealing: false) }
            return
        }
        // Identité COMPLÈTE dès la première frame quand le groupe a été
        // pré-résolu (`prefetchNeighborGroupIntros`) ; sinon placeholder
        // immédiat (username/avatar du payload) enrichi pendant l'affichage.
        groupIntroData = groupIntroCache[group.id]
            ?? StoryViewModel.StoryGroupIntro(userId: group.id, username: group.username)
        // Présentation INSTANTANÉE (pas de fade-in) : l'interstitiel OPAQUE
        // prend l'écran dans la MÊME transaction que le swap de groupe — le
        // slide du nouveau groupe n'est JAMAIS visible sous/derrière l'intro
        // (directive user 2026-07-10, IMG_0976 « Windie Nh ne devait pas
        // avoir son switcher s'afficher en overlay de ce slide »). Seule la
        // sortie est animée : c'est elle qui révèle le slide.
        showGroupIntro = true
        let userId = group.id
        groupIntroTask = Task { @MainActor in
            let enrich = Task { @MainActor in
                let intro = await viewModel.resolveGroupIntro(for: group)
                groupIntroCache[userId] = intro
                guard !Task.isCancelled, showGroupIntro, groupIntroData?.userId == userId else { return }
                groupIntroData = intro
            }
            // UN SEUL sommeil, écourté du recouvrement : le retrait du voile ET
            // l'apparition du slide partent ensemble à 300 ms. Surtout PAS deux
            // sommeils enchaînés (« armer, dormir 200 ms, animer ») — une
            // annulation entre les deux laisserait `contentOpacity` à 0, soit un
            // slide noir définitif.
            try? await Task.sleep(for: .seconds(
                StoryGroupIntroPolicy.holdDuration(total: Self.groupIntroDuration)
            ))
            enrich.cancel()
            guard !Task.isCancelled else { return }
            dismissGroupIntro()
        }
        prefetchNeighborGroupIntros()
    }

    /// Pré-résout l'identité (nom, bannière, mood) des groupes ADJACENTS
    /// pendant la lecture du groupe courant — même philosophie que le
    /// prefetch média inter-groupes : au switch, l'interstitiel est complet
    /// dès la première frame, présence comprise (payload feed + realtime).
    func prefetchNeighborGroupIntros() {
        guard !isPreviewMode else { return }
        let myId = AuthManager.shared.currentUser?.id
        for offset in [-1, 1] {
            let index = currentGroupIndex + offset
            guard index >= 0, index < groups.count else { continue }
            let neighbor = groups[index]
            guard neighbor.id != myId, groupIntroCache[neighbor.id] == nil else { continue }
            Task { @MainActor in
                let intro = await viewModel.resolveGroupIntro(for: neighbor)
                groupIntroCache[neighbor.id] = intro
            }
        }
    }

    func skipGroupIntro() {
        groupIntroTask?.cancel()
        groupIntroTask = nil
        dismissGroupIntro()
    }

    /// Tap zone gauche sur l'interstitiel d'identité — annule ce switch de
    /// groupe et revient au groupe précédent (directive user 2026-07-14).
    /// `currentGroupIndex` a déjà été incrémenté au moment où l'intro
    /// s'affiche (elle masque visuellement le nouveau groupe pendant
    /// `groupIntroDuration`), donc "revenir en arrière" ici signifie
    /// toujours "annule ce switch de groupe" — jamais "story précédente dans
    /// le nouveau groupe" (contrairement à `goToPrevious()`, sensible à
    /// `currentStoryIndex`). Sans groupe précédent, dismiss simplement.
    func goBackToPreviousGroupFromIntro() {
        groupIntroTask?.cancel()
        groupIntroTask = nil
        dismissGroupIntro(revealing: false)
        guard currentGroupIndex > 0 else { return }
        groupTransition(forward: false) {
            currentGroupIndex -= 1
            currentStoryIndex = max(0, groups[currentGroupIndex].stories.count - 1)
            progress = 0
        }
    }

    /// - Parameter revealing: `true` quand le retrait de l'interlude DÉVOILE la
    ///   story courante (fin du délai, tap skip) — c'est à cet instant qu'elle
    ///   devient réellement vue. `false` quand l'interlude se retire parce que
    ///   le switch de groupe est ANNULÉ (tap gauche) : la story quittée n'a
    ///   jamais été montrée, la compter gonflerait les vues de son auteur.
    private func dismissGroupIntro(revealing: Bool = true) {
        let opening = currentStory?.storyEffects?.opening
        // La sortie épouse l'ouverture configurée par l'auteur sur le slide qui
        // apparaît : l'interlude et le slide forment un seul geste visuel.
        //
        // Jusqu'au 2026-07-26 ce chemin ne faisait QUE retirer le voile : la
        // story entrante était déjà posée dessous, sans zoom, sans slide, sans
        // révélation. On arme donc ici sa grammaire d'apparition — la MÊME table
        // que `crossFadeStory` — avant de la ramener au repos dans la
        // transaction animée juste en dessous. Armement et animation dans le
        // même appel, sans le moindre `await` entre les deux : c'est ce qui rend
        // l'opération sûre à l'annulation (impossible de rester bloqué avec
        // `contentOpacity = 0`, donc un slide noir permanent).
        //
        // Uniquement quand on RÉVÈLE : si le switch de groupe est annulé (tap
        // gauche), il n'y a rien à faire apparaître — on n'arme rien du tout,
        // sinon le slide qu'on est en train de quitter jouerait son entrée juste
        // avant d'être remplacé.
        if revealing {
            let entrance = StoryOpeningEntrance.armed(for: opening)
            contentOpacity = entrance.contentOpacity
            openingScale = entrance.openingScale
            openingSlideFraction = entrance.openingSlideFraction
            textSlideOffset = entrance.textSlideOffset
            isRevealActive = entrance.isRevealActive
        }
        withAnimation(StoryGroupIntroPolicy.dismissAnimation(for: opening)) {
            showGroupIntro = false
            if revealing {
                contentOpacity = 1
                openingScale = 1.0
                openingSlideFraction = 0
                textSlideOffset = 0
                // `.reveal` est la seule grammaire dont l'état de repos est
                // « actif » : le cercle doit finir PLEIN écran. Pour les autres,
                // `false` est déjà l'état neutre côté `RevealCircleShape`.
                isRevealActive = (opening == .reveal)
            }
        }
        // `isIntroVisible: false` explicite : le flip ci-dessus est enveloppé
        // dans `withAnimation`, on ne dépend donc pas de l'instant où la
        // lecture de `showGroupIntro` se stabilise.
        if revealing { markCurrentViewed(isIntroVisible: false) }
    }
}

/// Interstitiel plein écran de l'interlude inter-groupes. Le RENDU d'identité
/// (bannière, voile, avatar/nom/présence/mood) est délégué à
/// `StoryAuthorIdentityCard` — vue partagée avec `NeighborGroupCubeFace`, la
/// face entrante du cube qui révèle ce même interlude AU DOIGT pendant le swipe
/// (directive user 2026-07-25). Cet overlay ne possède plus que ce qui lui est
/// propre : la base opaque, les gestes (double-tap = skip, tap gauche = retour
/// au groupe précédent) et le résumé VoiceOver.
private struct StoryGroupIntroOverlay: View {
    let intro: StoryViewModel.StoryGroupIntro
    let avatarURL: String?
    let avatarColor: String
    let presence: UserPresence?
    /// `true` quand l'auteur du groupe est un ami — gate le détail de
    /// présence (« En ligne » / « Actif·ve récemment » / « Absent·e ») dans
    /// `presenceBadge`. Directive user 2026-07-13 : le statut « en ligne »
    /// est une information réservée aux amis, pas affichée pour un auteur
    /// hors contacts.
    let isFriend: Bool
    /// Tap zone droite / double-tap n'importe où — passe directement au
    /// premier slide du nouveau groupe (dismiss immédiat, révèle le slide
    /// déjà courant).
    let onSkip: () -> Void
    /// Tap zone gauche — annule ce switch de groupe, retourne au groupe
    /// précédent (directive user 2026-07-14).
    let onBack: () -> Void
    /// Jeton de purge partagé avec `StoryGestureOverlayView` — bumpé par le
    /// viewer sur les chemins gestuels non nominaux. Sert ici de FILET au
    /// mouchard `didMoveDuringTouch`, qui est collant par construction.
    let gestureResetToken: Int

    /// `true` dès que le doigt a franchi `tapSlopPixels` pendant le toucher en
    /// cours. Le drag du lecteur (`unifiedDragGesture`) couvre désormais cet
    /// interlude — swipes actifs pendant l'écran d'identité — et il est monté en
    /// `simultaneousGesture` sur un ancêtre, donc nos `SpatialTapGesture`, qui se
    /// valident au touch-up QUEL QUE SOIT le déplacement, tireraient AUSSI sur un
    /// swipe : l'utilisateur changerait de groupe et sauterait l'interlude d'un
    /// seul geste. Ce drapeau réserve les taps aux touchers immobiles.
    ///
    /// COLLANT pour toute la durée du toucher, comme le `didExceedSlop` du
    /// lecteur : franchi une fois = franchi pour tout le toucher. Un swipe avorté
    /// (le doigt part à 100 pt puis revient à son origine avant de lever) ne doit
    /// pas se requalifier en tap et sauter l'interlude au moment précis où
    /// l'utilisateur annulait son geste. Il n'est remis à `false` QU'À
    /// L'OUVERTURE d'un nouveau toucher (cf. `trackedTouchOrigin`) ou par les
    /// filets de purge ci-dessous — jamais au relâchement, sous peine de
    /// rouvrir le double-déclenchement (le drag peut conclure AVANT les
    /// `SpatialTapGesture`, qui trouveraient alors le drapeau déjà nettoyé).
    @State private var didMoveDuringTouch: Bool = false

    /// Origine (`startLocation`) du toucher auquel `didMoveDuringTouch` se
    /// rapporte. Elle est FIXE pour toute la durée d'un toucher et distincte
    /// d'un toucher à l'autre : c'est le seul marqueur d'identité de toucher
    /// disponible dans un `DragGesture`.
    ///
    /// POURQUOI : la remise à zéro reposait sur le premier tick à translation
    /// STRICTEMENT nulle. Ce tick n'est pas garanti (événements coalescés d'un
    /// flick très rapide, recognizer reconstruit) ; sans lui, le drapeau restait
    /// collé à `true` et le toucher SUIVANT était avalé — tap de skip ou de
    /// retour-groupe silencieusement inerte pendant tout l'interlude. Comparer
    /// l'origine détecte le nouveau toucher même quand son premier tick porte
    /// déjà du déplacement.
    @State private var trackedTouchOrigin: CGPoint? = nil

    /// Tolérance de tap, alignée sur le `dragSlopPixels` de
    /// `StoryGestureOverlayView` : un même geste doit basculer de « tap » à
    /// « swipe » au même endroit sur les deux surfaces du lecteur.
    private let tapSlopPixels: CGFloat = 14

    var body: some View {
        GeometryReader { geo in
            ZStack {
                // Base OPAQUE obligatoire (directive 2026-07-10) : pendant que la
                // bannière charge, CachedAsyncImage peut rendre un placeholder
                // translucide — sans cette base, le slide et son chrome restaient
                // visibles SOUS l'interstitiel (IMG_0976). L'intro est un ÉCRAN,
                // pas un voile.
                Color.black
                StoryAuthorIdentityCard(
                    intro: intro,
                    avatarURL: avatarURL,
                    avatarColor: avatarColor,
                    presence: presence,
                    isFriend: isFriend
                )
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .contentShape(Rectangle())
            // Double-tap (n'importe où) prioritaire sur le tap simple — sinon le
            // simple tirerait toujours en premier et le double-tap ne fire jamais
            // (pattern standard SwiftUI : `.exclusively(before:)` sur deux
            // `SpatialTapGesture` de count différent, résolu via l'énum `Either`).
            // Les deux branches sont gardées par `didMoveDuringTouch` : le sens
            // reste identique au pixel près (moitié gauche = onBack, moitié
            // droite = onSkip, double tap = onSkip), seul le toucher QUI A BOUGÉ
            // est rendu au drag parent au lieu d'être compté deux fois.
            //
            // ORDRE DES DEUX MODIFICATEURS — les taps d'ABORD, le mouchard
            // ENSUITE : le dernier appliqué est l'ANCÊTRE des précédents, et un
            // `.gesture()` d'ancêtre est de priorité INFÉRIEURE à tout geste de
            // son sous-arbre (constat qui a déjà tué les swipes du lecteur, cf.
            // StoryViewerView+Canvas). Dans l'ordre inverse, le mouchard —
            // `DragGesture(minimumDistance: 0)` qui reconnaît dès le touch-down —
            // subordonnait les taps : soit ils devenaient inertes (plus de skip
            // ni de retour au groupe précédent), soit c'est le mouchard qui était
            // privé d'événements et `didMoveDuringTouch` restait faux, laissant
            // un swipe commiter tap ET changement de groupe. On reproduit donc
            // l'arrangement retenu au niveau du lecteur : recognizer de taps dans
            // le sous-arbre, `simultaneousGesture` du drag sur l'ancêtre.
            .gesture(
                SpatialTapGesture(count: 2)
                    .onEnded { _ in
                        guard !didMoveDuringTouch else { return }
                        onSkip()
                    }
                    .exclusively(before: SpatialTapGesture(count: 1)
                        .onEnded { value in
                            guard !didMoveDuringTouch else { return }
                            if value.location.x < geo.size.width / 2 {
                                onBack()
                            } else {
                                onSkip()
                            }
                        })
            )
            // Mouchard de déplacement. `SpatialTapGesture.Value` n'expose que
            // `location` : impossible d'y lire la distance parcourue, il faut la
            // mesurer soi-même. Ce `DragGesture(minimumDistance: 0)` reconnaît
            // dès le touch-down : c'est à l'OUVERTURE d'un toucher, et nulle part
            // ailleurs, qu'on repart d'un état propre — surtout pas au
            // relâchement, qui peut précéder les `SpatialTapGesture` et rouvrirait
            // le double-déclenchement (swipe comptant AUSSI comme tap).
            //
            // L'ouverture est reconnue à l'ORIGINE du toucher (`startLocation`,
            // fixe pour un toucher donné) et plus seulement au tick à translation
            // nulle : ce tick-là peut manquer (événements coalescés, recognizer
            // reconstruit), et le drapeau restait alors collé d'un toucher au
            // suivant, avalant un tap de skip ou de retour-groupe.
            .simultaneousGesture(
                DragGesture(minimumDistance: 0, coordinateSpace: .local)
                    .onChanged { value in
                        if trackedTouchOrigin != value.startLocation {
                            trackedTouchOrigin = value.startLocation
                            didMoveDuringTouch = false
                        }
                        if value.translation == .zero { return }
                        let moved = max(abs(value.translation.width),
                                        abs(value.translation.height))
                        // COLLANT, comme le `didExceedSlop` du lecteur : un swipe
                        // avorté (le doigt part à 100 pt puis revient à l'origine
                        // avant de lever) ne doit PAS redevenir un tap — sinon
                        // l'utilisateur saute l'interlude ou annule son switch de
                        // groupe au moment même où il annulait son geste.
                        if moved > tapSlopPixels { didMoveDuringTouch = true }
                    }
            )
        }
        .ignoresSafeArea()
        // FILETS DE PURGE DU MOUCHARD — deux signaux extérieurs au geste, parce
        // que le drapeau est collant par conception et que sa remise à zéro ne
        // peut pas vivre dans un `.onEnded` du mouchard (le drag conclut parfois
        // AVANT les `SpatialTapGesture` : purger là annulerait la garde et
        // ferait recommiter tap + swipe sur un même geste).
        //
        // 1. Apparition de l'interlude : chaque `showGroupIntro` qui repasse à
        //    `true` remonte cette vue avec un mouchard neuf, y compris si un
        //    toucher inachevé traînait sur l'interlude précédent.
        .onAppear { didMoveDuringTouch = false }
        // 2. Jeton de purge du viewer, bumpé sur les chemins gestuels non
        //    nominaux (snap-back d'axe indécis, transition de groupe, sortie du
        //    lecteur) — exactement les cas où SwiftUI n'a délivré aucune fin de
        //    geste et où un drapeau collé survivrait au toucher.
        .adaptiveOnChange(of: gestureResetToken) { _, _ in
            didMoveDuringTouch = false
            trackedTouchOrigin = nil
        }
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilitySummary)
        .accessibilityHint(String(localized: "story.groupIntro.skipHint",
                                  defaultValue: "Touchez pour passer à la story"))
    }

    private var accessibilitySummary: String {
        var parts = [intro.displayName ?? intro.username]
        // Même règle que le badge visuel : le statut de présence n'est
        // annoncé à VoiceOver que pour un ami ET quand un indicateur est
        // affiché (online/away/idle) — offline reste muet.
        let state = presence?.state ?? .offline
        if isFriend, state.showsIndicator {
            parts.append(StoryAuthorIdentityCard.presenceLabel(state))
        }
        if let message = intro.moodMessage { parts.append(message) }
        return parts.joined(separator: ", ")
    }
}
