import SwiftUI
import UIKit
import AVFoundation
import Combine
import os
import MeeshySDK
import MeeshyUI

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

    /// Projection de `MeeshyQuickReactions.heart` — le détail d'un post et le
    /// lecteur de réels l'empruntaient à CETTE surface, si bien que leur cœur
    /// dépendait du fichier du lecteur de story. Le nom reste (les deux
    /// surfaces le citent), la valeur vient d'ailleurs.
    static let heartEmoji = MeeshyQuickReactions.heart

    @State var currentStoryIndex = 0 // internal for cross-file extension access
    @State var reanchoredStoryId: String? // `reanchorPosition` (+Navigation)
    @State var engagement = StoryViewerEngagement() // internal : `+Lifecycle`
    /// La progression vit dans une horloge que SEULE la barre observe (#9859) :
    /// tenue par référence, jamais observée ici, elle ne réévalue pas le lecteur.
    @State var progressClock = StoryPlaybackProgressClock() // internal for cross-file extension access
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
    @State var storyLoopPass = 0 // tours de boucle de la story courante (#9821)
    @State var isCallInterrupting = false // un appel sonne ou se tient (#9821)
    @State var isGameMomentShown = false // un événement du jeu passe devant (#9821)
    @State var optionsMenuWatch = StoryOptionsMenuWatch() // le menu « … » ouvert fait boucler la story (#9821, #9949)
    /// Légende dépliée. Vit ici parce que déplier SUSPEND la lecture : la carte
    /// de contenu porte la vue, le lecteur porte l'horloge.
    @State var isCaptionExpanded = false // internal for cross-file extension access
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

    /// Durée dynamique du slide courant — max(6, durée max des médias vidéo/audio).
    /// Static text/image slides default to 6s (parité Instagram/Snapchat) — la
    /// transition n'interrompt JAMAIS un média en cours : `updateStoryDuration`
    /// retient `max(6, durée vidéo BG, durée vidéo FG, durée audio, words/6)` puis
    /// arrondit à `ceil(base / loopPeriod) × loopPeriod` pour que chaque loop bg
    /// termine son cycle avant l'avance.
    @State var computedStoryDuration: Double = 6.0 // internal for cross-file extension access
    @State var hasFiredNextPrefetch = false // filet du premier tic d'horloge : les voisines N±1, N±2 se préparent au plus tard quand la slide commence à compter (#10348).
    @State var neighborPrefetch = StoryNeighborPrefetchQueue()

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
    @State var prefetcher = StoryReaderPrefetcher() // internal : `+PrefetchPipeline` et `+Lifecycle`
    @State var slideTimer = StoryReaderTimerController() // internal for cross-file extension access
    /// Handles des tasks de prefetch média (`prefetchAllMedia`, +Content) —
    /// annulés à l'onDisappear pour ne pas continuer downloads + prerolls
    /// AVPlayer après la fermeture du viewer. internal for cross-file
    /// extension access.
    @State var prefetchTasks: [Task<Void, Never>] = []
    /// Latched once `attach(to:)` has been wired via the host
    /// representable — guards against re-firing every onAppear cycle
    /// (scene phase changes / parent re-renders).
    @State var hasInstalledPrefetchPipeline = false // internal : `+PrefetchPipeline` et `+Lifecycle`

    @State var showFullEmojiPicker = false // internal for cross-file extension access
    @State var showTextEmojiPicker = false // internal for cross-file extension access
    @State var selectedProfileUser: ProfileSheetUser? // internal : cause de boucle (#9821)
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

    // Les feuilles créent leur propre hiérarchie de présentation : les
    // EnvironmentObject du fullScreenCover parent n'y sont PAS hérités. Ceux
    // dont elles ont besoin (`Router`, `StatusViewModel`) sont lus là où elles
    // sont déclarées — `StoryViewerSheets` ; le modèle de liste, lui, passe par
    // la valeur d'environnement (#7714).
    @Environment(\.meeshyConversationList) private var conversationListViewModel

    // === Transition states ===

    // Appear — start visible to avoid blank screen if animation doesn't fire
    @State var appear = StoryViewerAppearance() // internal : `+Lifecycle`

    // Dismiss
    @State var isDismissing = false // internal for cross-file extension access
    @State var dragOffset: CGFloat = 0 // internal for cross-file extension access

    // Group slide (group ↔ group)
    @State var groupSlide: CGFloat = 0 // internal for cross-file extension access

    // Content cross-fade (story ↔ story within group)
    @State var contentOpacity: Double = 1 // internal for cross-file extension access

    // Outgoing layer for true cross-dissolve (old stays visible while new fades in)
    // `Indirect` tient la vue sous 8 192 octets ; valeur de l'état car `@State`, macro depuis iOS 27, ne se compose plus avec `@Indirect`.
    @State private var outgoingStoryCell = Indirect<StoryItem?>(wrappedValue: nil)
    var outgoingStory: StoryItem? { get { outgoingStoryCell.wrappedValue } nonmutating set { outgoingStoryCell = Indirect(wrappedValue: newValue) } }
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
    /// **La barre de réactions a revendiqué le glissé en cours** — posé par elle
    /// selon `StoryReactionStripGesture`, lu par `unifiedDragGesture`, purgé par
    /// `resetGestureTracking()` et à la fermeture de la barre.
    @State var reactionStripOwnsDrag: Bool = false // internal for cross-file extension access
    /// Cadre `.global` de la barre ouverte (`StoryReactionStripFrameKey`, #9062).
    @State var reactionStripFrame: CGRect? // internal for cross-file extension access
    @State var composerOwnsDrag: Bool = false // #8431 — le glissé né sur le composeur
    /// Cadres `.global` des composants posés sur la scène (`StoryReaderChromeFramesKey`, #11045).
    @State var readerChromeFrames: [CGRect] = [] // internal for cross-file extension access
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

    // La fenêtre qui PORTE le viewer (publiée par sa racine), pas la fenêtre clé : Stage Manager, Split View, fenêtre
    // détachée. Seuils du glisser-fermer et normalisation du glissement horizontal.
    @Environment(\.sceneWindowSize) private var sceneWindowSize
    private var windowSize: CGSize { SceneWindowSize.resolve(sceneWindowSize, fallback: DeviceLayout.windowSize) }

    /// Encart bas MESURÉ par la mise en page (`measuringBottomSafeArea`), jamais
    /// lu sur la fenêtre pendant `body` (#10566) : le `GeometryReader` interne,
    /// sous `.ignoresSafeArea()`, rend 0.
    @State var windowBottomInset: CGFloat = 0 // internal for cross-file extension access

    private var screenH: CGFloat { windowSize.height }

    var screenW: CGFloat { windowSize.width } // internal for cross-file extension access

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

    /// Le cadre de la carte sous les glissés (cf. `StoryViewerCardTransform`).
    private var cardTransform: StoryViewerCardTransform {
        StoryViewerCardTransform(
            isDismissing: isDismissing,
            appear: appear,
            dragOffset: dragOffset,
            groupSlide: groupSlide,
            horizontalDrag: horizontalDrag,
            screenWidth: screenW,
            screenHeight: screenH
        )
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
            cardScale: cardTransform.scale,
            cardCornerRadius: cardTransform.cornerRadius,
            cardOpacity: cardTransform.opacity,
            cardOffsetY: cardTransform.offsetY,
            totalSlideX: cardTransform.totalSlideX,
            slideProgress: cardTransform.slideProgress,
            dragProgress: cardTransform.dragProgress,
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
                PresenceManager.shared.servedPresence(for: $0.id, fallback: $0.authorPresence)
            },
            neighborIsFriend: neighborCubeGroup.map { FriendshipCache.shared.isFriend($0.id) } ?? false,
            isPresented: $isPresented,
            makeStoryCard: { geometry in storyCard(geometry: geometry) }
        )
        .background(Color.black)
        .preferredColorScheme(.dark)
        .ignoresSafeArea()
        .measuringBottomSafeArea(into: $windowBottomInset)
        .statusBarHidden()
        .onAppear { viewerDidAppear() }
        .task(id: currentStory?.id) {
            await refreshVideoAudioTrackPresence()
        }
        .onDisappear { viewerWillDisappear() }
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
        // Si on postait `.storyPlayerPause` sur les autres causes, chaque
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
        // Seule une PAUSE arrête le timer gated ; une boucle le laisse courir (#9821).
        .modifier(StoryPlaybackInterruptions(interrupting: $isCallInterrupting, gameMomentShown: $isGameMomentShown, explicitPause: $isLongPressPaused, storyIsPlaying: !shouldPauseTimer))
        .storyOptionsMenuPresence(optionsMenuWatch)
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
            prepareNeighborWindow()
        }
        .adaptiveOnChange(of: StoryViewerPosition.shapes(of: groups)) { old, new in reanchorPosition(from: old, to: new) }
        .adaptiveOnChange(of: currentStoryIndex) { oldValue, _ in
            guard !isReanchoringSameStory else { return }
            // **La légende se replie à CHAQUE changement de story.** Laissée
            // dépliée, elle garde `shouldPauseTimer` vrai sur la story SUIVANTE
            // — qui ne repart alors jamais. Une pause dont la cause a disparu
            // de l'écran est un gel, pas une pause (#4474).
            isCaptionExpanded = false
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
            engagement.holdPostRoom(of: currentStory)
            engagement.transition(to: currentStory)
        }
        // Interstitiel d'identité inter-groupes — au-dessus du canvas ET des
        // contrôles (identité pleine pendant ~500 ms, tap droite/double-tap =
        // skip, tap gauche = retour au groupe précédent).
        // Interstitiel d'identité inter-groupes (`groupIntroLayer`, +GroupIntro).
        .overlay { groupIntroLayer }
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
        .modifier(StoryReaderDragStateTracking(
            scrollableSurfaceTopY: $scrollableSurfaceTopY,
            reactionStripFrame: $reactionStripFrame,
            readerChromeFrames: $readerChromeFrames,
            reactionStripOwnsDrag: $reactionStripOwnsDrag,
            hasScrollableSurface: hasScrollableReaderSurface,
            showEmojiStrip: showEmojiStrip
        ))
        .adaptiveOnChange(of: currentGroupIndex) { oldValue, _ in
            guard !isReanchoringSameStory else { return }
            // **La légende se replie à CHAQUE changement de story.** Laissée
            // dépliée, elle garde `shouldPauseTimer` vrai sur la story SUIVANTE
            // — qui ne repart alors jamais. Une pause dont la cause a disparu
            // de l'écran est un gel, pas une pause (#4474).
            isCaptionExpanded = false
            skipUnplayableStoriesIfNeeded()
            isContentReady = false
            refreshPrefetchWindowAndTimer()
            engagement.holdPostRoom(of: currentStory)
            engagement.transition(to: currentStory)
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
        .modifier(StoryViewerSheets(
            currentStory: currentStory,
            currentGroup: currentGroup,
            exportShareViewModel: exportShareViewModel,
            showViewersSheet: $showViewersSheet,
            showExportShareSheet: $showExportShareSheet,
            sharedContentWrapper: $sharedContentWrapper,
            readerFullscreenPlace: $readerFullscreenPlace,
            selectedProfileUser: $selectedProfileUser,
            resumeTimer: { resumeTimer() }
        ))
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
    @State var delays = DelayedActions() // internal : extensions cross-fichiers
    @State var sharedContentWrapper: SharedContentWrapper? // internal : cause de boucle (#9821)
    /// Lieu de la story ouvert plein écran (tap sur une pastille de position).
    @State private var readerFullscreenPlace: StoryReaderPlaceWrapper?

    /// La liste vit au SDK (`MeeshyQuickReactions.standard`) : elle était
    /// écrite ici ET dans le composer, avec quatre émojis communs sur six et
    /// un ordre différent. Le post et le réel la servent désormais aussi —
    /// une troisième copie aurait divergé de même.
    private let quickEmojis = MeeshyQuickReactions.standard

    // MARK: - Story Card

    /// Builds the story canvas for the supplied geometry. Extracted into the
    /// nominal `StoryCardView` struct (see StoryViewerView+Canvas.swift) so
    /// Déplier / replier la légende posée sur le canvas.
    ///
    /// La pause suit toute seule : `shouldPauseTimer` agrège `isCaptionExpanded`
    /// comme il agrège l'appui long ou les commentaires ouverts. Rien à
    /// suspendre ni à reprendre ici — c'est ce qui rend la bascule sûre quand
    /// deux causes de pause se chevauchent.
    func toggleCaptionExpansion() {
        withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) {
            isCaptionExpanded.toggle()
        }
        HapticFeedback.light()
    }

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
            isCaptionExpanded: isCaptionExpanded,
            onCaptionExpansionToggled: toggleCaptionExpansion,
            isContentTranslated: isContentTranslated,
            isOwnStory: isOwnStory,
            quickEmojis: quickEmojis,
            progressClock: progressClock,
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
            commentsReaderLanguages: ReaderPrism.resolve(for: AuthManager.shared.currentUser),
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
            isCanvasPlaybackPaused: shouldPauseTimer, loopPass: storyLoopPass,
            gestureResetToken: gestureResetToken,
            readerFeatureConsumedByTouch: $readerFeatureConsumedByTouch,
            reactionStripOwnsDrag: $reactionStripOwnsDrag,
            composerOwnsDrag: $composerOwnsDrag,
            keyboard: keyboard,
            triggerStoryReaction: { emoji, frame in
                triggerStoryReaction(emoji, from: frame)
            },
            onScrubStateChanged: { isScrubbingRail = $0 },
            seekTimer: { slideTimer.seek(toFraction: $0) },
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
            makeStoryCommentRow: { comment, readerLanguages in
                makeStoryCommentRow(comment, readerLanguages: readerLanguages)
            },
            toggleStoryCommentThread: { await toggleStoryCommentThread($0) },
            storyWithdrawal: StoryWithdrawalActions(delete: { deleteCurrentStory(reason: $0) }, makePrivate: { StoryPrivatization.makePrivate(currentStory, of: currentGroup, reason: $0, viewModel: viewModel, dismiss: dismissViewer) }),
            dismissViewer: { dismissViewer() },
            reportStory: { storyId, reportType, reason in
                try await ReportService.shared.reportStory(storyId: storyId, reportType: reportType, reason: reason)
            },
            composerBottomPadding: { composerBottomPadding(geometry: $0) },
            windowBottomInset: windowBottomInset,
            makeCommentsOverlay: { storyCommentsOverlayHost() }
        )
    }

    // MARK: - Right Action Sidebar

    private var isOwnStory: Bool {
        currentGroup?.id == AuthManager.shared.currentUser?.id
    }

    // MARK: - Computed Bottom Padding

    private func composerBottomPadding(geometry: GeometryProxy) -> CGFloat {
        // `geometry.safeAreaInsets.bottom` vaut 0 sous `.ignoresSafeArea()` : l'encart mesuré tient le
        // composer au-dessus du home indicator (bug 2026-05-28).
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

    /// Chaine complete : systemLanguage → regionalLanguage → customDestinationLanguage → locale appareil,
    /// sans repli « fr » (`ReaderPrism.resolve(for:)`, #11832). Utilisee par le reader pour resoudre
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
            base: ReaderPrism.resolve(for: AuthManager.shared.currentUser),
            override: sessionLanguageOverride
        )
    }

    /// Sentinelle « Original » de la feuille des langues — voir
    /// `StoryReaderContentRules.originalLanguageOverride`.
    nonisolated static let originalLanguageOverride = StoryReaderContentRules.originalLanguageOverride

    /// Helper pur (testable) : prépend l'override langue à la chaine préférée, dédupliqué
    /// (cf. `StoryReaderContentRules.viewerLanguageChain`).
    static func viewerLanguageChain(base: [String], override: String?) -> [String] {
        StoryReaderContentRules.viewerLanguageChain(base: base, override: override)
    }

    /// Drives the sidebar sound/mute button. A silent video (muted by the author
    /// or shot without an audio track) keeps the button hidden — the video-track
    /// presence is resolved asynchronously by `refreshVideoAudioTrackPresence()`.
    var storyHasAudibleSound: Bool { // internal for cross-file extension access
        StoryAudioAvailability.needsSoundButton(
            effects: currentStory?.storyEffects, videoAudioTracks: videoAudioTrackPresence,
            backgroundSoundIsAnnounced: BackgroundSoundBadge.showsMuteButton(for: backgroundSoundAnnouncement)
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
            let count = await StoryVideoAudioProbe.trackCount(
                for: video, in: story, preloadedVideoURLs: preloadedVideoURLs)
            if Task.isCancelled { return }
            videoAudioTrackPresence = StoryAudioAvailability.merging(
                videoAudioTrackPresence, id: video.id, probedTrackCount: count)
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
            let count = await StoryVideoAudioProbe.trackCount(
                for: video, in: story, preloadedVideoURLs: preloadedVideoURLs)
            if Task.isCancelled { return }
            videoAudioTrackPresence = StoryAudioAvailability.merging(
                videoAudioTrackPresence, id: video.id, probedTrackCount: count)
        }
    }



    // MARK: - Header state

    /// Used by `StoryHeaderView`'s report sheet — owned here so the sheet
    /// presentation survives header re-renders.
    @State var showReportSheet = false // internal : cause de boucle (#9821)

    // MARK: - Content, Gestures, Navigation, Timer & Actions (see StoryViewerView+Content.swift)
}

