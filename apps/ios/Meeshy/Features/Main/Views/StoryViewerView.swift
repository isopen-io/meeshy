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
/// repost-as-story composer launched from the bottom-bar Partager button (C.1).
/// Carrying both the source `StoryItem` and the original author's handle keeps
/// the cover identifiable + supplies what `StoryComposerViewModel(reposting:authorHandle:)`
/// needs without leaking optionals through the binding.
struct RepostStorySourceWrapper: Identifiable {
    let id = UUID()
    let story: StoryItem
    let authorHandle: String
}

/// Wrapper used by `StoryViewerView.fullScreenCover(item:)` to drive the
/// repost-as-post composer launched from the kebab menu's "Editer et republier
/// en post" action (C.2). Mirrors `RepostStorySourceWrapper` but feeds the
/// `UnifiedPostComposer(repostingStory:authorHandle:onPublishRepost:onDismiss:)`
/// init introduced in B.7.
struct RepostPostSourceWrapper: Identifiable {
    let id = UUID()
    let story: StoryItem
    let authorHandle: String
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
    static let groupIntroDuration: TimeInterval = 2.2
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
    @StateObject private var keyboard = KeyboardObserver()
    @Environment(\.scenePhase) private var scenePhase

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
    @State var isLoadingComments = false
    @State var storyCommentCount: Int = 0
    @State var replyingToStoryComment: FeedComment? = nil
    @State var storyCommentRepliesMap: [String: [FeedComment]] = [:]
    @State var storyCommentExpandedThreads: Set<String> = []
    @State var storyCommentLoadingReplies: Set<String> = []
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
    private var windowSize: CGSize {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first(where: { $0.activationState == .foregroundActive })?
            .windows.first(where: { $0.isKeyWindow })?
            .bounds.size ?? UIScreen.main.bounds.size
    }

    /// Bas du safe area lu directement sur la keyWindow. Necessaire parce que
    /// le `GeometryReader` interne au viewer est rendu dans un contexte
    /// `.ignoresSafeArea()` (cf. `viewerContent`), ce qui aplatit
    /// `geometry.safeAreaInsets.bottom` a 0 — le composer et la liste de
    /// commentaires se retrouvaient alors plaques sur le bord physique et
    /// chevauchaient le home indicator + les coins arrondis (bug 2026-05-28).
    var windowBottomInset: CGFloat { // internal for cross-file extension access
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first(where: { $0.activationState == .foregroundActive })?
            .windows.first(where: { $0.isKeyWindow })?
            .safeAreaInsets.bottom ?? 0
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
    /// non-expirée.
    func entryStory(of group: StoryGroup) -> StoryItem? {
        let now = Date()
        return group.stories.first(where: { !$0.isViewed && !$0.isExpired(at: now) })
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
        return groups[idx]
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
            isPreviewMode: isPreviewMode,
            cardScale: cardScale,
            cardCornerRadius: cardCornerRadius,
            cardOpacity: cardOpacity,
            cardOffsetY: cardOffsetY,
            totalSlideX: totalSlideX,
            slideProgress: slideProgress,
            dragProgress: dragProgress,
            neighborGroup: neighborCubeGroup,
            neighborEntryStory: neighborCubeGroup.flatMap { entryStory(of: $0) },
            neighborDirection: neighborPreviewDirection,
            isPresented: $isPresented,
            makeStoryCard: { geometry in storyCard(geometry: geometry) }
        )
        .background(Color.black)
        .preferredColorScheme(.dark)
        .ignoresSafeArea()
        .statusBarHidden()
        .gesture(unifiedDragGesture)
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
            skipExpiredStoriesIfNeeded()
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
            markCurrentViewed()
            prefetchCurrentGroup()
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
            // U2 — tick haptique léger au passage de slide (parité Instagram).
            HapticFeedback.light()
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
            skipExpiredStoriesIfNeeded()
            isContentReady = false
            refreshPrefetchWindowAndTimer()
            let previousStory = currentGroup.flatMap { group in
                group.stories.indices.contains(oldValue) ? group.stories[oldValue] : nil
            }
            transitionPostRoom(from: previousStory, to: currentStory)
            transitionEngagement(to: currentStory)
        }
        // Interstitiel d'identité inter-groupes — au-dessus du canvas ET des
        // contrôles (identité pleine pendant 2,2 s, tap = skip).
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
                    onSkip: { skipGroupIntro() }
                )
                .transition(.opacity)
                .zIndex(30)
            }
        }
        .adaptiveOnChange(of: currentGroupIndex) { oldValue, _ in
            skipExpiredStoriesIfNeeded()
            isContentReady = false
            refreshPrefetchWindowAndTimer()
            let previousStory: StoryItem? = (oldValue >= 0 && oldValue < groups.count &&
                groups[oldValue].stories.indices.contains(currentStoryIndex))
                ? groups[oldValue].stories[currentStoryIndex]
                : nil
            transitionPostRoom(from: previousStory, to: currentStory)
            transitionEngagement(to: currentStory)
            presentGroupIntroIfNeeded()
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
    }

    var body: some View {
        viewerContent
        // Prisme « Exploration » : l'override de langue est éphémère — il se réinitialise
        // dès qu'on change de story (slide ou groupe), de sorte que chaque story s'affiche
        // d'abord dans la langue préférée de base. `adaptiveOnChange` = wrapper iOS 16.
        .adaptiveOnChange(of: currentStory?.id) { _, _ in
            if sessionLanguageOverride != nil { sessionLanguageOverride = nil }
        }
        .sheet(isPresented: $showViewersSheet, onDismiss: { resumeTimer() }) {
            if let story = currentStory {
                StoryViewersSheet(story: story, accentColor: Color(hex: currentGroup?.avatarColor ?? MeeshyColors.brandPrimaryHex))
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
        .fullScreenCover(item: $repostStoryComposerSource, onDismiss: { resumeTimer() }) { wrapper in
            StoryComposerView(
                viewModel: StoryComposerViewModel(
                    reposting: wrapper.story,
                    authorHandle: wrapper.authorHandle
                ),
                onPublishSlide: { _, _, _, _, _ in },
                onPublishAllInBackground: { slides, slideImages, loadedImages, loadedVideoURLs, loadedAudioURLs, originalLanguage, visibility, visibilityUserIds in
                    viewModel.publishStoryInBackground(
                        slides: slides,
                        slideImages: slideImages,
                        loadedImages: loadedImages,
                        loadedVideoURLs: loadedVideoURLs,
                        loadedAudioURLs: loadedAudioURLs,
                        originalLanguage: originalLanguage,
                        visibility: visibility,
                        visibilityUserIds: visibilityUserIds
                    )
                    repostStoryComposerSource = nil
                },
                onDismiss: { repostStoryComposerSource = nil }
            )
        }
        .fullScreenCover(item: $editAndRepostAsPostSource, onDismiss: { resumeTimer() }) { wrapper in
            UnifiedPostComposer(
                repostingStory: wrapper.story,
                authorHandle: wrapper.authorHandle,
                onPublishRepost: { content, sourceStory in
                    do {
                        _ = try await PostService.shared.repost(
                            postId: sourceStory.id,
                            targetType: .post,
                            content: content.isEmpty ? nil : content,
                            isQuote: !content.isEmpty
                        )
                        editAndRepostAsPostSource = nil
                        FeedbackToastManager.shared.show("Publié")
                    } catch {
                        FeedbackToastManager.shared.showError("Échec de la publication")
                        throw error
                    }
                },
                onStoryImported: { result in
                    Logger.stories.info(
                        "repost.import slide=\(result.targetSize.width, privacy: .public)x\(result.targetSize.height, privacy: .public) texts=\(result.texts.count, privacy: .public) media=\(result.media.count, privacy: .public) stickers=\(result.stickers.count, privacy: .public) drawing=\(result.drawingData != nil, privacy: .public) audios=\(result.audios.count, privacy: .public) clamped=\(result.warnings.count, privacy: .public)"
                    )
                },
                onDismiss: { editAndRepostAsPostSource = nil }
            )
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
    func refreshPrefetchWindowAndTimer(
        prefetcher: StoryReaderPrefetcher? = nil,
        timer: StoryReaderTimerController? = nil
    ) {
        let p = prefetcher ?? self.prefetcher
        let t = timer ?? self.slideTimer
        let stories = currentGroupStories
        guard !stories.isEmpty,
              stories.indices.contains(currentStoryIndex) else {
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
                       currentIndex: currentStoryIndex,
                       context: context,
                       preferredLanguages: chain,
                       extraWarmItems: extraWarmItems)

        let current = stories[currentStoryIndex]
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

    /// Direct repost-as-post action wired to the kebab menu's "Republier en
    /// post" item. Mirrors the share-button repost UX (C.1) but skips the
    /// A5 — advance past stories whose 24h visibility window has elapsed.
    ///
    /// The cache TTL is intentionally longer than 24h (avoids redownloading
    /// avatars + metadata on cold start), so the viewer may receive expired
    /// stories from the local store. We skip them here rather than filter
    /// at the tray level — the tray must keep showing the user's ring for
    /// UX continuity, but rendering an expired story (deleted server-side
    /// by the GC job) would 404 on reactions and confuse the user.
    ///
    /// Behavior:
    /// - advance `currentStoryIndex` to the first non-expired story in the
    ///   current group (forward only — never go back to an unexpired one);
    /// - if every remaining story in the group is expired, dismiss the
    ///   viewer (the user is opening an empty ring).
    private func skipExpiredStoriesIfNeeded() {
        let now = Date()
        guard currentGroupIndex < groups.count else { return }
        let group = groups[currentGroupIndex]
        guard !group.stories.isEmpty else { return }

        // The author may revisit their OWN expired stories to review engagement
        // (reactions / comments). Don't skip or auto-close their own ring — an
        // expiry banner in the comments overlay marks the state instead
        // (spec 2026-06-23: comments/reactions on expired stories stay visible).
        if group.id == AuthManager.shared.currentUser?.id { return }

        var idx = currentStoryIndex
        while idx < group.stories.count, group.stories[idx].isExpired(at: now) {
            idx += 1
        }
        if idx >= group.stories.count {
            // Whole tail of the group is expired — close.
            isPresented = false
            return
        }
        if idx != currentStoryIndex {
            currentStoryIndex = idx
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

    /// `isQuote: false`. Surfaces user-facing toasts on success / known error
    /// codes (404 = source story gone, 403 = repost forbidden) and a generic
    /// failure otherwise. Errors are mapped against `APIError.serverError`'s
    /// status-code payload since that's the shape `APIClient` throws.
    private func repostAsPostDirect() {
        guard let story = currentStory else { return }
        HapticFeedback.light()
        Task {
            do {
                _ = try await PostService.shared.repost(
                    postId: story.id,
                    targetType: .post,
                    content: nil,
                    isQuote: false
                )
                await MainActor.run {
                    HapticFeedback.success()
                    FeedbackToastManager.shared.show("Republié dans ton feed")
                }
            } catch APIError.serverError(404, _) {
                await MainActor.run {
                    FeedbackToastManager.shared.showError("La story n'est plus disponible")
                }
            } catch APIError.serverError(403, _) {
                await MainActor.run {
                    FeedbackToastManager.shared.showError("Cette story ne peut pas être repartagée")
                }
            } catch {
                await MainActor.run {
                    FeedbackToastManager.shared.showError("Échec de la republication")
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
        if isDismissing { return -screenH * 0.35 }
        return dragOffset * 0.5
    }

    @State var showEmojiStrip = false // internal for cross-file extension access
    @State private var bigReactionEmoji: String?
    @State private var bigReactionPhase: Int = 0
    /// Ticks on every reaction sent, through any path (quick strip or the
    /// full-screen picker). Drives the heart-button bounce in the sidebar.
    @State private var heartBouncePulse: Int = 0
    @State private var sharedContentWrapper: SharedContentWrapper?
    @State private var repostStoryComposerSource: RepostStorySourceWrapper?
    @State private var editAndRepostAsPostSource: RepostPostSourceWrapper?

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
            isLoadingComments: isLoadingComments,
            userLang: AuthManager.shared.currentUser?.preferredContentLanguages.first ?? "fr",
            isStoryExpired: currentStory?.isExpired() ?? false,
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
            isRevealActive: isRevealActive,
            bigReactionEmoji: bigReactionEmoji,
            bigReactionPhase: bigReactionPhase,
            heartBouncePulse: heartBouncePulse,
            storyReactionCount: storyReactionCount,
            storyCurrentUserHasReacted: !storyCurrentUserReactions.isEmpty,
            storyCommentCount: storyCommentCount,
            storyShareCount: currentStory?.shareCount ?? 0,
            storyViewCount: currentStory?.viewCount ?? 0,
            storyRepostCount: currentStory?.repostCount ?? 0,
            isStoryCommentsEmpty: storyComments.isEmpty,
            storyHasAudibleSound: storyHasAudibleSound,
            storyHasTranslatableContent: storyHasTranslatableContent,
            isGlobalMuted: isGlobalMuted,
            availableTranslationLanguages: availableTranslationLanguages,
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
            showLanguageOptions: $showLanguageOptions,
            showFullLanguagePicker: $showFullLanguagePicker,
            showViewersSheet: $showViewersSheet,
            showExportShareSheet: $showExportShareSheet,
            isGlobalMutedBinding: $isGlobalMuted,
            showTextEmojiPicker: $showTextEmojiPicker,
            isComposerEngaged: $isComposerEngaged,
            hasComposerContent: $hasComposerContent,
            sharedContentWrapper: $sharedContentWrapper,
            repostStoryComposerSource: $repostStoryComposerSource,
            editAndRepostAsPostSource: $editAndRepostAsPostSource,
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
            keyboard: keyboard,
            triggerStoryReaction: { triggerStoryReaction($0) },
            pauseTimer: { pauseTimer() },
            resumeTimer: { resumeTimer() },
            onPlaybackProgressing: { progressing in slideTimer.setPlaybackStalled(!progressing) },
            loadStoryComments: { loadStoryComments() },
            dismissComposer: { dismissComposer() },
            goToPrevious: { goToPrevious() },
            goToNext: { goToNext() },
            sendComment: { text, effectFlags, parentId, pendingMedia in
                sendComment(text: text, effectFlags: effectFlags, parentId: parentId, pendingMedia: pendingMedia)
            },
            makeStoryCommentRow: { comment, userLang in
                makeStoryCommentRow(comment, userLang: userLang)
            },
            toggleStoryCommentThread: { await toggleStoryCommentThread($0) },
            makeStoryExternalShareURL: { makeStoryExternalShareURL($0) },
            storyTimeRemaining: { storyTimeRemaining($0) },
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

    // MARK: - Available Translation Languages

    private var availableTranslationLanguages: [TranslationLanguage] {
        guard let translations = currentStory?.translations, !translations.isEmpty else { return [] }
        let availableCodes = Set(translations.map(\.language))
        return TranslationLanguage.all.filter { availableCodes.contains($0.id) }
    }

    // MARK: - Story Reactions

    private func triggerStoryReaction(_ emoji: String) {
        HapticFeedback.medium()

        // Full picker covers ENTIRE screen → must dismiss immediately so the
        // big-reaction animation (`bigReactionEmoji`) is visible. Strip is a
        // partial overlay → keep its 0.5s dismissal delay below (deliberate
        // visual echo of the chosen emoji before the strip disappears).
        if showFullEmojiPicker {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                showFullEmojiPicker = false
            }
        }

        // Big floating emoji — dramatic 3-phase animation
        bigReactionEmoji = emoji
        bigReactionPhase = 0
        // Phase 1: burst in with overshoot
        withAnimation(.spring(response: 0.25, dampingFraction: 0.4)) {
            bigReactionPhase = 1
        }
        // Phase 1.5: subtle pulse at peak (secondary haptic)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            HapticFeedback.light()
        }
        // Phase 2: float up and dissolve
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
            withAnimation(.easeOut(duration: 0.6)) { bigReactionPhase = 2 }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
            bigReactionEmoji = nil
            bigReactionPhase = 0
        }

        // Collapse strip after reaction (timer auto-resumes when showEmojiStrip=false)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                showEmojiStrip = false
            }
        }

        // N'incrémenter le compteur QUE pour une réaction réellement nouvelle :
        // re-taper le même emoji ne crée pas une nouvelle réaction côté serveur
        // (l'array `storyCurrentUserReactions` est dédupliqué), donc l'ancien
        // `+= 1` inconditionnel gonflait le compteur visible à chaque tap
        // (incohérent jusqu'au refresh serveur). Bug 2026-06-01.
        if !storyCurrentUserReactions.contains(emoji) {
            storyCurrentUserReactions.append(emoji)
            storyReactionCount += 1
        }
        heartBouncePulse += 1
        sendReaction(emoji: emoji)
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
    private var resolvedViewerLanguageChain: [String] {
        Self.viewerLanguageChain(
            base: AuthManager.shared.currentUser?.preferredContentLanguages ?? [],
            override: sessionLanguageOverride
        )
    }

    /// Helper pur (testable) : prépend l'override langue à la chaine préférée, dédupliqué.
    /// `nil`/vide → chaine de base inchangée. Sinon l'override passe en tête et est retiré
    /// de sa position d'origine (jamais de doublon).
    static func viewerLanguageChain(base: [String], override: String?) -> [String] {
        guard let override, !override.isEmpty else { return base }
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
            guard let url = resolveVideoURL(for: video, in: story) else {
                videoAudioTrackPresence[video.id] = false
                continue
            }
            let tracks = try? await AVURLAsset(url: url).loadTracks(withMediaType: .audio)
            if Task.isCancelled { return }
            videoAudioTrackPresence[video.id] = (tracks?.isEmpty == false)
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
            guard let url = resolveVideoURL(for: video, in: story) else {
                videoAudioTrackPresence[video.id] = false
                continue
            }
            let tracks = try? await AVURLAsset(url: url).loadTracks(withMediaType: .audio)
            if Task.isCancelled { return }
            videoAudioTrackPresence[video.id] = (tracks?.isEmpty == false)
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
        if let text = story.content, !text.isEmpty { return true }
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
        guard let effects = currentStory?.storyEffects,
              effects.voiceAttachmentId != nil,
              let transcriptions = effects.voiceTranscriptions,
              !transcriptions.isEmpty else { return nil }
        // Prisme Linguistique : on essaie la CHAÎNE complète des langues préférées
        // (systemLanguage > regionalLanguage > customDestination > deviceLocale),
        // pas seulement la première + défaut "en". Sans ça, un viewer dont la
        // langue SECONDAIRE (ex. regionalLanguage) a une transcription mais pas
        // la primaire voyait une langue arbitraire (la 1ʳᵉ entrée, souvent
        // l'original parlé) au lieu de sa secondaire — violation du Prisme
        // (bug 2026-06-01).
        for lang in resolvedViewerLanguageChain {
            if let t = transcriptions.first(where: { $0.language == lang })?.content { return t }
        }
        // Aucune langue préférée ne matche → transcription ORIGINALE (1ʳᵉ entrée =
        // langue parlée d'origine par convention gateway). On ne choisit JAMAIS
        // une traduction arbitraire d'une autre langue (règle Prisme).
        return transcriptions.first?.content
    }


    // MARK: - Header state

    /// Used by `StoryHeaderView`'s report sheet — owned here so the sheet
    /// presentation survives header re-renders.
    @State private var showReportSheet = false

    // MARK: - Content, Gestures, Navigation, Timer & Actions (see StoryViewerView+Content.swift)
}

// MARK: - Group intro (interstitiel d'identité inter-groupes)

extension StoryViewerView {
    /// Présente l'interstitiel d'identité au passage au groupe d'une AUTRE
    /// personne : placeholder immédiat (username/avatar du groupe, déjà en
    /// main — cache-first), enrichi async (nom complet, bannière, mood) par
    /// `resolveGroupIntro` PENDANT l'affichage. Dismiss auto à 2,2 s ; le tap
    /// skippe. Mes propres stories et le mode preview n'ont pas d'interstitiel.
    /// Le gel de lecture passe par `shouldPauseTimer || showGroupIntro`
    /// (timer + canvas + audio gelés en phase, reprise sans saut).
    func presentGroupIntroIfNeeded() {
        guard !isPreviewMode,
              let group = currentGroup,
              group.id != AuthManager.shared.currentUser?.id else { return }
        groupIntroTask?.cancel()
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
            try? await Task.sleep(for: .seconds(Self.groupIntroDuration))
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

    private func dismissGroupIntro() {
        withAnimation(.easeOut(duration: 0.25)) { showGroupIntro = false }
    }
}

/// Interstitiel plein écran : bannière du profil en FOND (ThumbHash placeholder,
/// fallback gradient couleur avatar → noir), voile de lisibilité, et au centre
/// l'identité : avatar, nom, @username, présence en ligne, mood (emoji + message).
/// Tap n'importe où = passer directement au slide.
private struct StoryGroupIntroOverlay: View {
    let intro: StoryViewModel.StoryGroupIntro
    let avatarURL: String?
    let avatarColor: String
    let presence: UserPresence?
    let onSkip: () -> Void

    var body: some View {
        ZStack {
            // Base OPAQUE obligatoire (directive 2026-07-10) : pendant que la
            // bannière charge, CachedAsyncImage peut rendre un placeholder
            // translucide — sans cette base, le slide et son chrome restaient
            // visibles SOUS l'interstitiel (IMG_0976). L'intro est un ÉCRAN,
            // pas un voile.
            Color.black
            bannerBackground
            LinearGradient(
                colors: [.black.opacity(0.62), .black.opacity(0.28), .black.opacity(0.72)],
                startPoint: .top, endPoint: .bottom
            )
            identityContent
        }
        .ignoresSafeArea()
        .contentShape(Rectangle())
        .onTapGesture { onSkip() }
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilitySummary)
        .accessibilityHint(String(localized: "story.groupIntro.skipHint",
                                  defaultValue: "Touchez pour passer à la story"))
    }

    private var bannerBackground: some View {
        Group {
            if let banner = intro.bannerURL, !banner.isEmpty {
                CachedAsyncImage(url: banner, thumbHash: intro.bannerThumbHash)
                    .scaledToFill()
            } else {
                LinearGradient(
                    colors: [Color(hex: avatarColor), .black],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            }
        }
    }

    private var identityContent: some View {
        VStack(spacing: 14) {
            // `storyTray` = 88 pt, le plus grand context avatar — l'identité
            // est le sujet de l'écran. Présence + mood délégués au badge/capsule
            // dédiés ci-dessous (plus lisibles qu'un dot 10 pt sur l'avatar).
            MeeshyAvatar(
                name: intro.displayName ?? intro.username,
                context: .storyTray,
                accentColor: avatarColor,
                avatarURL: avatarURL
            )
            VStack(spacing: 4) {
                Text(intro.displayName ?? intro.username)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.white)
                if intro.displayName != nil {
                    Text("@\(intro.username)")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.75))
                }
            }
            presenceBadge
            if let emoji = intro.moodEmoji {
                HStack(spacing: 8) {
                    Text(emoji).font(.title3)
                    if let message = intro.moodMessage, !message.isEmpty {
                        Text(message)
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.9))
                            .lineLimit(2)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial, in: Capsule())
            }
        }
        .padding(.horizontal, 32)
    }

    @ViewBuilder
    private var presenceBadge: some View {
        let state = presence?.state ?? .offline
        HStack(spacing: 6) {
            Circle()
                .fill(state.dotColor)
                .frame(width: 9, height: 9)
            Text(presenceLabel(state))
                .font(.caption.weight(.medium))
                .foregroundStyle(.white.opacity(0.85))
        }
    }

    private func presenceLabel(_ state: PresenceState) -> String {
        switch state {
        case .online:
            return String(localized: "story.groupIntro.online", defaultValue: "En ligne")
        case .recent:
            return String(localized: "story.groupIntro.recent", defaultValue: "Actif·ve récemment")
        case .away:
            return String(localized: "story.groupIntro.away", defaultValue: "Absent·e")
        case .offline:
            return String(localized: "story.groupIntro.offline", defaultValue: "Hors ligne")
        }
    }

    private var accessibilitySummary: String {
        var parts = [intro.displayName ?? intro.username]
        parts.append(presenceLabel(presence?.state ?? .offline))
        if let message = intro.moodMessage { parts.append(message) }
        return parts.joined(separator: ", ")
    }
}
