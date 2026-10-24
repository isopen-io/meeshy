import SwiftUI
import UIKit
import PhotosUI
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// MARK: - StoryViewerView canvas components
//
// Dedicated View structs extracted from StoryViewerView so the deeply nested
// story canvas (viewer content + story card) no longer composes into
// StoryViewerView.body's opaque type. That monolithic type exceeded the Swift
// type-checker budget and triggered a type-metadata instantiation crash on
// low-memory devices. Real structs (vs AnyView) break the type while
// preserving SwiftUI structural identity.

// MARK: - Story Card

/// The full story canvas: background, pixel-perfect reader, voice caption,
/// audio badge, translation badge, scrims, gesture overlay, progress bars,
/// header, action sidebar, big-reaction overlay, comments overlay, composer
/// and the full emoji / language pickers.
///
/// Extracted from `StoryViewerView.storyCard(geometry:)` (formerly an
/// `AnyView`) so its ~10-layer `ZStack` is its own type-metadata unit.
struct StoryCardView: View {
    let geometry: GeometryProxy

    /// Cf. doc de `RenderableSlideCache` — partagé par les 3 lecteurs du
    /// slide renderable dans ce body (representable, fond média, backdrop).
    @State private var renderableSlideCache = RenderableSlideCache()

    // Story content
    let currentStory: StoryItem?
    let outgoingStory: StoryItem?
    let currentGroup: StoryGroup?
    let currentStoryIndex: Int
    let resolvedViewerLanguage: String?
    let resolvedViewerLanguageChain: [String]
    let preloadedImages: [String: UIImage]
    let preloadedVideoURLs: [String: URL]
    let preloadedAudioURLs: [String: URL]
    let currentVoiceCaption: String?
    /// La légende est-elle dépliée ? **L'état vit chez le PARENT**, pas ici :
    /// déplier doit SUSPENDRE la story — sinon elle avance pendant qu'on lit —
    /// et une carte de contenu n'a pas à décider de l'horloge de lecture.
    let isCaptionExpanded: Bool
    let onCaptionExpansionToggled: () -> Void
    let isContentTranslated: Bool
    let isOwnStory: Bool
    let quickEmojis: [String]

    // Animation drivers (written by parent transition funcs)
    let progressClock: StoryPlaybackProgressClock
    let currentSlideDuration: TimeInterval
    let outgoingOpacity: Double
    let closingScale: CGFloat
    let contentOpacity: Double
    let textSlideOffset: CGFloat
    let openingScale: CGFloat
    /// Fraction de la LARGEUR du canvas dont l'ouverture `.slide` décale
    /// horizontalement — même unité et même sens que
    /// `StoryRenderer.slideTransitionTravelFraction`.
    let openingSlideFraction: CGFloat
    let isRevealActive: Bool
    /// Réaction en vol tuile → cœur (remplace la big reaction 100 pt) — écrit
    /// par cette vue (Layer 9 : arrivée, fin de vol) et lu (préférence du
    /// cœur → `heartFrame`), d'où le `@Binding`.
    @Binding var reactionFlight: StoryReactionFlight?
    /// Cadre du bouton cœur dans `StoryScrubSpace`, publié par le Sidebar via
    /// `StoryHeartFrameKey` et capté ici (`.onPreferenceChange`) — cible du vol.
    @Binding var heartFrame: CGRect
    /// Tique à l'arrivée du vol (Layer 9 `onArrived`) — d'où le `@Binding`.
    @Binding var heartBouncePulse: Int

    // Sidebar inputs
    let storyReactionCount: Int
    let storyCurrentUserHasReacted: Bool
    let storyCommentCount: Int
    /// Voir `StoryViewerView.storyCommentCountReconciledPulse` — forwarded
    /// verbatim, ne tique QUE sur la réconciliation d'ouverture, jamais sur
    /// une activité temps réel.
    let storyCommentCountReconciledPulse: Int
    let storyShareCount: Int
    let storyViewCount: Int
    let storyRepostCount: Int
    let isStoryCommentsEmpty: Bool
    let storyHasAudibleSound: Bool
    let storyHasTranslatableContent: Bool
    /// Annonce du fond (B3.3-5) — résolveur unique partagé avec la carte de
    /// post et le plein écran réel (E1). Remplace `storyHasBackgroundAudio` +
    /// `headerBackgroundAudioDisplay` : primitive Equatable descendue en
    /// `let` depuis `StoryViewerView.backgroundSoundAnnouncement`, même
    /// règle que `storyHasAudibleSound` juste au-dessus.
    let backgroundSoundAnnouncement: BackgroundAudioAnnouncement
    /// Présence d'une transcription affichable — pilote l'entrée « Transcription »
    /// du menu « … ». Même règle de descente en primitive que ci-dessus.
    let storyHasAudioTranscript: Bool
    let isGlobalMuted: Bool
    let availableTranslationLanguages: [TranslationLanguage]
    /// Langue d'exploration active (`nil` = chaine préférée). Descendue en `let`
    /// jusqu'au strip pour y marquer le drapeau lu.
    let activeLanguageCode: String?
    /// `true` quand une surface du reader est ouverte — le prochain toucher la
    /// referme au lieu de naviguer.
    let hasActiveReaderFeature: Bool
    let onDismissActiveReaderFeature: () -> Void
    let onReplyToStory: ((ReplyContext) -> Void)?
    /// Prisme « Exploration » : appelé quand l'utilisateur choisit une langue dans le
    /// picker/strip pour afficher le contenu dans cette langue (override éphémère).
    /// `nil` revient à la chaîne préférée (#12646).
    let onSelectLanguageOverride: (String?) -> Void

    // Header inputs
    let composerAccentColor: String

    // Comments overlay inputs
    let storyComments: [FeedComment]
    let storyCommentRepliesMap: [String: [FeedComment]]
    let storyCommentExpandedThreads: Set<String>
    let storyCommentLoadingReplies: Set<String>
    let isLoadingComments: Bool
    let commentsReaderLanguages: [String]

    // Bindings — UI state owned by the viewer
    @Binding var isContentReady: Bool
    @Binding var showEmojiStrip: Bool
    @Binding var showFullEmojiPicker: Bool
    @Binding var showCommentsOverlay: Bool
    @Binding var showAudioTranscript: Bool
    @Binding var showLanguageOptions: Bool
    @Binding var showFullLanguagePicker: Bool
    @Binding var showViewersSheet: Bool
    @Binding var showExportShareSheet: Bool
    @Binding var isGlobalMutedBinding: Bool
    @Binding var showTextEmojiPicker: Bool
    @Binding var isComposerEngaged: Bool
    @Binding var hasComposerContent: Bool
    @Binding var sharedContentWrapper: SharedContentWrapper?
    /// Lieu ouvert plein écran au tap d'une pastille de position (Layer 6.6).
    @Binding var readerFullscreenPlace: StoryReaderPlaceWrapper?
    @Binding var isPresented: Bool
    @Binding var selectedProfileUser: ProfileSheetUser?
    @Binding var showReportSheet: Bool
    @Binding var replyingToStoryComment: FeedComment?
    @Binding var composerLanguage: String
    @Binding var commentEffects: MessageEffects
    @Binding var commentBlurEnabled: Bool
    @Binding var emojiToInject: String
    @Binding var composerFocusTrigger: Bool
    @Binding var storyDrafts: [String: StoryDraft]
    /// Visibilité du chrome (header + sidebar + composer). Drivé par le parent
    /// `StoryViewerView` selon les gestes (touch-and-hold) et l'état session
    /// (mode plein écran via hamburger). Le `Binding` est nécessaire car le
    /// touch-and-hold interne au canvas mute la valeur en temps réel.
    @Binding var chromeVisible: Bool
    /// Mode session « plein écran » toggleable depuis le menu hamburger « … »
    /// du header. Quand actif, le chrome est caché par défaut pour TOUTE la
    /// session story ; un touch-and-hold le révèle temporairement (sémantique
    /// inversée par rapport au mode normal). Binding car le toggle vit dans
    /// le hamburger menu, qui est rendu par le header — qui le mute donc.
    @Binding var isFullscreenStorySession: Bool
    /// État de pause **long-press uniquement**. Bascule à `true` quand le
    /// hold ≥ 200 ms est confirmé, à `false` au prochain tap. Distinct de
    /// `isPaused` (qui couvre toutes les pauses du timer — sheets, drag,
    /// composer engaged). Le parent observe ce drapeau et poste les
    /// notifications canvas (`.storyPlayerPause` / `.storyPlayerResume`)
    /// uniquement sur ses transitions — pas sur celles de `isPaused`.
    @Binding var isLongPressPaused: Bool

    /// `shouldPauseTimer` du parent : le canvas gèle EN PHASE avec la barre, et
    /// joue pendant une boucle.
    let isCanvasPlaybackPaused: Bool
    /// Tour de boucle de la story courante : chaque tour rembobine le canvas.
    let loopPass: Int

    /// Jeton de purge de l'état gestuel transient, relayé tel quel à
    /// `StoryGestureOverlayView` (cf. sa doc). Bumpé par le viewer sur les
    /// chemins où SwiftUI a sauté le `onEnded` du recognizer de l'overlay.
    let gestureResetToken: Int
    /// Relayé tel quel à `StoryGestureOverlayView` (cf. sa doc) : l'overlay
    /// gestuel y signale au viewer qu'il a consommé une surface AU TOUCH-DOWN
    /// du toucher courant, information que le drag parent ne peut pas observer
    /// lui-même (il ne s'éveille qu'à 15 pt de déplacement).
    @Binding var readerFeatureConsumedByTouch: Bool
    /// Relayé tel quel au rail : la barre de réactions y revendique le glissé
    /// horizontal (cf. `StoryReactionStripGesture`), le drag parent y cède.
    @Binding var reactionStripOwnsDrag: Bool
    /// Le composeur revendique le glissé vertical né sur lui.
    @Binding var composerOwnsDrag: Bool

    @ObservedObject var keyboard: KeyboardObserver

    /// Fraction `[0, 1]` de contenu de la slide active disponible localement.
    /// Pilote `StoryReaderLoadingOverlay` (ThumbHash bg + spinner + %) — seul
    /// loader actif.
    /// Cf. spec stories-video-layers-text-sprint § 3.D.
    /// **Le token de retour en tête du corpus.** État d'INTERACTION, donc local : contrairement à `isCaptionExpanded` — qui
    /// suspend l'horloge de lecture et appartient donc au parent — remonter une
    /// fenêtre de défilement ne regarde personne d'autre que cette carte.
    @State var captionScrollToTopToken: Int = 0 // internal for cross-file extension access
    /// Repli du composeur, hauteur mesurée de son bloc, prise vocale en cours.
    @State var isComposerFolded: Bool = false // internal for cross-file extension access
    @State var composerBlockHeight: CGFloat? // internal for cross-file extension access
    @State var isComposerRecording: Bool = false // internal for cross-file extension access
    @State private var slideContentProgress: Double = 0
    /// Le pont du parcours au doigt : la barre le pilote, le canvas de
    /// la story COURANTE s'y attache au montage.
    @State var sceneScrubber = ScenePlaybackScrubber() // internal : `+Canvas+Layers`

    /// Gate d'affichage du spinner + % à l'intérieur de l'overlay. La
    /// backdrop ThumbHash, elle, est rendue immédiatement (cache-first).
    /// Activé seulement après 200 ms si la slide n'a pas progressé — évite
    /// que l'utilisateur voie spinner+% flasher sur un cache hit qui se
    /// rend instantanément.
    @State private var showProgressOverlay: Bool = false

    /// R3 — indicateur discret de buffering MID-SLIDE : visible quand la
    /// timeline est gelée par le stall gate (vidéo qui bufferise, audio/image
    /// en cours de cache — R1/R2) APRÈS le chargement initial. Le gel était
    /// jusqu'ici une frame figée muette, indistinguable d'un freeze.
    @State private var showStallIndicator: Bool = false

    /// Délai de grâce avant d'afficher l'indicateur : un micro-stall (< 350 ms,
    /// fréquent sur un seek/loop vidéo) ne doit pas faire flasher un spinner.
    /// La DISPARITION, elle, est immédiate à la reprise. Miroir du pattern
    /// `showProgressOverlay` (200 ms) du loader initial.
    @State private var stallIndicatorGraceTask: Task<Void, Never>?

    // Closures — actions on the parent view
    /// Envoie la réaction ; le CGRect est le cadre (dans StoryScrubSpace) de la
    /// tuile d'origine du vol — nil = pop sur place depuis le cœur (tap direct).
    let triggerStoryReaction: (String, CGRect?) -> Void
    /// Vrai pendant un scrub longpress→drag sur le rail (pause le timer,
    /// neutralise la navigation du canvas).
    let onScrubStateChanged: (Bool) -> Void
    /// Recale le compte à rebours à la fraction choisie sur la barre.
    let seekTimer: (Double) -> Void
    let pauseTimer: () -> Void
    let resumeTimer: () -> Void
    /// Unified-timeline gate : the canvas reports whether its PRIMARY video is
    /// actually progressing (`true`) or stalled/buffering (`false`). The parent
    /// owns `slideTimer` and forwards this to `setPlaybackStalled(!progressing)`
    /// — the stall decision stays app-side (the SDK only emits the raw signal).
    let onPlaybackProgressing: (Bool) -> Void
    let loadStoryComments: () -> Void
    let dismissComposer: () -> Void
    let goToPrevious: () -> Void
    let goToNext: () -> Void
    let sendComment: (_ text: String, _ effectFlags: Int?, _ parentId: String?, _ pendingMedia: PendingCommentMedia?, _ place: SharedPlace?) -> Void
    let makeStoryCommentRow: (FeedComment, [String]) -> StoryCommentRowView
    let toggleStoryCommentThread: @MainActor (String) async -> Void
    let storyWithdrawal: StoryWithdrawalActions
    let dismissViewer: () -> Void
    let reportStory: @MainActor (_ storyId: String, _ reportType: String, _ reason: String?) async throws -> Void
    let composerBottomPadding: (GeometryProxy) -> CGFloat
    /// L'encart bas MESURÉ par le lecteur (`measuringBottomSafeArea`) — jamais lu sur la fenêtre pendant un `body`.
    let windowBottomInset: CGFloat

    /// Builds the Instagram-style floating comments overlay. Conditional on
    /// `showCommentsOverlay`. Placed in the ZStack BEFORE the controls
    /// (sidebar / header / composer) so it renders BEHIND them — user can
    /// still tap React / Reply / Settings even with comments visible
    /// (le layer de commentaire doit apparaître en dessous des layers des
    /// contrôles de la story).
    let makeCommentsOverlay: () -> StoryCommentsOverlayHost

    var topInset: CGFloat { // internal for cross-file extension access
        max(geometry.safeAreaInsets.top, 59)
    }

    /// **La description de la story, affichée PAR-DESSUS le canvas composé.**
    ///
    /// Le composer unifié garde UN seul contenu (`documentText` → `slide.content`
    /// → `story.content`) et le publie ; le viewer le rend au-dessus du média,
    /// comme la légende d'un réel (`ReelsPlayerView.reelDescriptionText`) —
    /// c'est la face lecture de la section description repliable du composer.
    ///
    /// **Résolu par le Prisme** : `resolvedContent(preferredLanguages:)` descend
    /// la chaîne complète (systemLanguage > regionalLanguage > customDestination
    /// > deviceLocale) et retombe sur l'ORIGINAL, jamais `translations.first`.
    /// `nil` sur contenu vide — un contrôle sans matière est absent (loi 4).
    ///
    /// **Et il ne rend une légende que s'il y en a une.** Le `content`
    /// d'une story a DEUX natures pour un seul nom : la légende de l'auteur, ou
    /// l'index de recherche que la passerelle fabrique en concaténant les
    /// objets texte d'une story qui n'en a pas. Rendu tel quel, cet index
    /// afficherait le texte du canvas une SECONDE fois, en légende, juste
    /// dessous.
    ///
    /// La décision est prise sur l'ORIGINAL et le RÉSOLU est rendu — décider
    /// sur le résolu ramènerait le doublon pour les seuls lecteurs d'une autre
    /// langue, la passerelle composant aussi l'index dans chaque langue. Toute
    /// la règle, son fail-safe compris, vit dans `StoryDerivedContent` (SDK) :
    /// ce corps ne fait que lui poser la question.
    var currentStoryDescription: String? { // internal for cross-file extension access
        guard let story = currentStory else { return nil }
        return StoryDerivedContent.caption(
            original: story.content,
            resolved: story.resolvedContent(preferredLanguages: resolvedViewerLanguageChain),
            // `\.text` est la BONNE clé : le décodeur du SDK normalise déjà
            // l'alias legacy `content` vers `text` (`StoryTextObject.init(from:)`,
            // « prefer new key, fall back to legacy »). Lire la mauvaise viderait
            // la comparaison — donc rendu « vraie légende » et doublon intact, sans
            // que rien ne rougisse.
            overlayTexts: story.storyEffects?.textObjects.map(\.text) ?? []
        )
    }

    /// Ratio (largeur / hauteur) du canvas — TOUJOURS 9:16 (cf. `StoryReaderCanvasLayout`).
    var readerCanvasRatio: CGFloat { canvasLayout.readerCanvasRatio } // internal for cross-file extension access

    /// La PORTE du lecteur de scènes — écrite une fois, partagée par les DEUX
    /// canvas. `nil` = cette story n'a pas de document v3 natif, et se peint par
    /// l'hôte canvas direct.
    ///
    /// Le fil sert du v3 : le décodeur de `StoryEffects` pose alors `canvasV3`,
    /// snapshot de LECTURE du document reçu, et rend le runtime v1 depuis lui —
    /// servir ce snapshot au player est l'identité, pas une conversion.
    ///
    /// **Pourquoi une porte, et non un montage inconditionnel.** `X-Canvas-Caps`
    /// est posé (`ClientInfoProvider.swift`) et le gateway sert du v3 natif ;
    /// l'aller-retour n'est pas lossy, la scène logeant son `carrierAspect` et
    /// le retour appliquant le remap inverse (`CanvasV3MigrationTests`
    /// `.v1RoundTripThroughV3_isFAITHFUL_nowThatTheSceneCarriesItsAspect`).
    ///
    /// Ce qui MAINTIENT la porte est la prudence : la retirer change ce que le
    /// lecteur peint pour toute l'archive v1 restante. Ce changement de rendu se
    /// mesure et se livre pour lui-même.
    ///
    /// La porte rend les deux branches SELF-COHÉRENTES : l'archive v1 se peint
    /// dans son propre cadre.
    ///
    /// **Une story v3-native ne se peint PAS dans le cadre RÉEL de son fond** :
    /// `readerCanvasRatio` est TOUJOURS `SceneShape.aspect` (9:16), que la scène
    /// ait ou non logé un `carrierAspect`. `carrierAspect` reste lu par
    /// `StoryEffects(rendering:)` pour l'archive v1 (mémoire d'ÉDITION, contrat
    /// S8), mais aucun lecteur ne s'en sert pour choisir un cadre.
    private func nativeSceneDocument(of story: StoryItem) -> CanvasV3? {
        story.storyEffects?.canvasV3
    }

    /// Couche contenu du canvas SORTANT du cross-fade, derrière la porte v3.
    ///
    /// `isOutgoing: true` des deux côtés : le sortant naît en `.edit` dès
    /// `makeUIView`, ses AVPlayer bg/FG et son mixer audio ne démarrent JAMAIS —
    /// sans quoi les deux canvas jouent en double 350-400 ms à chaque avance.
    /// Visuellement le slide reste rendu (image bg +
    /// textes), seule l'animation vidéo est gelée — invisible à l'œil pendant
    /// une sortie en opacity sur 350 ms.
    ///
    /// `carrier: outgoing` — le document dit QUOI peindre, jamais où vivent les
    /// pixels : c'est le porteur qui indexe les médias. Le canvas sortant rend le
    /// MÊME slide que celui qu'on quitte ; sans porteur il repartirait d'une
    /// coquille (`media == []`) le temps du fondu.
    ///
    /// `isPlaying: .constant(false)` : le sortant ne joue jamais.
    @ViewBuilder
    private func outgoingContentHost(_ outgoing: StoryItem) -> some View {
        if let document = nativeSceneDocument(of: outgoing) {
            MeeshyScenePlayer(document: document,
                              mode: .reader,
                              sceneIndex: .constant(0),
                              isPlaying: .constant(false),
                              accentColorHex: composerAccentColor,
                              carrier: outgoing,
                              preferredContentLanguages: resolvedViewerLanguageChain,
                              isOutgoing: true,
                              servesLetterboxFill: false, stagesSoundChips: false,
                              preloadedImages: preloadedImages,
                              preloadedVideoURLs: preloadedVideoURLs,
                              preloadedAudioURLs: preloadedAudioURLs)
        } else {
            StoryReaderRepresentable(story: outgoing,
                                     preferredLanguage: resolvedViewerLanguage,
                                     preferredContentLanguages: resolvedViewerLanguageChain,
                                     preloadedImages: preloadedImages,
                                     preloadedVideoURLs: preloadedVideoURLs,
                                     preloadedAudioURLs: preloadedAudioURLs,
                                     isOutgoing: true,
                                     servesLetterboxFill: false)
        }
    }

    /// Couche contenu de la story COURANTE, derrière la porte v3. Les deux hôtes
    /// portent les mêmes fils du viewer — une porte qui en couperait un d'un seul
    /// côté le couperait pour la moitié du parc, en silence.
    ///
    /// `carrier: story` — sans le porteur, `toRenderableSlide` perd son
    /// hydratation read-time : `aspectRatio` d'abord (source de dimensionnement
    /// PRIMAIRE, le composer stampant toujours la sentinelle 1.0 — tout média non
    /// carré s'afficherait squishé), puis `duration`, l'adresse d'un clip audio et
    /// le backdrop legacy ; le résolveur de `makeUIView` perdrait en plus son
    /// repli distant par `postMediaId`.
    ///
    /// La pause du viewer (long-press, feuilles, drag) gèle la timeline canvas EN
    /// PHASE avec la barre de progression : `isPaused:` pour l'hôte direct,
    /// `isPlaying:` nié pour le lecteur. Le player ne réécrit jamais cette valeur
    /// — la commande de lecture appartient au viewer, d'où la liaison constante.
    /// Le mode `.reader` naît en pause et n'honore la commande qu'À PARTIR de
    /// l'apparition : le rail est ainsi figé à l'entrée du slide.
    ///
    /// Le muet est une préférence VIEWER persistante (`isGlobalMuted`, `@State`
    /// qui survit aux avances). Le canvas est recréé à chaque story
    /// (`.id(story.id)`) : sans cet état à l'init, chaque nouvelle story repartait
    /// non-muette. Le mode `.reader` ne VERROUILLE pas le muet (seule la carte de
    /// fil le fait) — la demande de l'hôte gouverne.
    ///
    /// `onPlaybackProgressing` — timeline unifiée : la barre de progression et
    /// l'auto-advance (pilotés par `slideTimer`) gèlent EN PHASE quand la lecture
    /// du média primaire stalle (buffer), et reprennent sans saut dès qu'elle
    /// rejoue. Entrée INDÉPENDANTE de `setPaused` (long-press / feuilles) — elles
    /// ne se clobberent jamais. No-op pour les slides sans vidéo (le canvas n'émet
    /// alors jamais). Décision produit câblée app-side ; le SDK n'expose que le
    /// signal.
    @ViewBuilder
    private func currentContentHost(_ story: StoryItem) -> some View {
        if let document = nativeSceneDocument(of: story) {
            MeeshyScenePlayer(document: document,
                              mode: .reader,
                              sceneIndex: .constant(0),
                              isPlaying: .constant(!isCanvasPlaybackPaused),
                              accentColorHex: composerAccentColor,
                              carrier: story,
                              preferredContentLanguages: resolvedViewerLanguageChain,
                              isMuted: isGlobalMuted,
                              servesLetterboxFill: false,
                              scrubber: sceneScrubber, stagesSoundChips: false,
                              preloadedImages: preloadedImages,
                              preloadedVideoURLs: preloadedVideoURLs,
                              preloadedAudioURLs: preloadedAudioURLs,
                              onContentReady: { isContentReady = true },
                              onContentProgress: { p in slideContentProgress = latchedContentProgress(p) },
                              onPlaybackProgressing: { progressing in
                                  onPlaybackProgressing(progressing)
                                  handleStallIndicatorSignal(progressing: progressing)
                              })
        } else {
            StoryReaderRepresentable(story: story,
                                     preferredLanguage: resolvedViewerLanguage,
                                     preferredContentLanguages: resolvedViewerLanguageChain,
                                     preloadedImages: preloadedImages,
                                     preloadedVideoURLs: preloadedVideoURLs,
                                     preloadedAudioURLs: preloadedAudioURLs,
                                     mute: isGlobalMuted,
                                     isPaused: isCanvasPlaybackPaused,
                                     servesLetterboxFill: false,
                                     scrubber: sceneScrubber,
                                     onContentReady: { isContentReady = true },
                                     onContentProgress: { p in slideContentProgress = latchedContentProgress(p) },
                                     onPlaybackProgressing: { progressing in
                                         onPlaybackProgressing(progressing)
                                         handleStallIndicatorSignal(progressing: progressing)
                                     })
        }
    }

    /// Latch monotone de la fraction de contenu lue : la valeur à écrire, jamais
    /// l'écriture elle-même — c'est le MONTAGE qui doit montrer le fil qu'il
    /// alimente.
    ///
    /// Une fois le contenu prêt (≥ 0.95), on ne redescend JAMAIS : sans ça chaque
    /// `scheduleContentReadyEvaluation` (déclenché par les didSet slide cumulés)
    /// remettrait `contentReadyFired = false` → `recomputeContentProgress` émettrait
    /// 0 → l'overlay de chargement réapparaîtrait → scintillement. Le reset à 0 se fait
    /// UNIQUEMENT sur slide-change (cf. le `.task(id:)` plus bas).
    private func latchedContentProgress(_ progress: Double) -> Double {
        (slideContentProgress >= 0.95 && progress < slideContentProgress)
            ? slideContentProgress
            : progress
    }

    /// Le cadrage du canvas dans ce viewport — présentation, cotes de la scène,
    /// cadrage « carte → plein écran » (cf. `StoryReaderCanvasLayout`).
    private var canvasLayout: StoryReaderCanvasLayout {
        StoryReaderCanvasLayout(viewport: geometry.size,
                                topInset: topInset,
                                isFullscreenSession: isFullscreenStorySession,
                                chromeVisible: chromeVisible)
    }

    /// **La FORME que la loi donne à la scène du lecteur** (cf.
    /// `StoryReaderCanvasLayout.sceneLayout`).
    var readerSceneLayout: SceneShape.Layout { // internal : lu par la carte
        canvasLayout.sceneLayout(expanded: canvasIsExpanded)
    }

    var canvasFitSize: CGSize { // internal : lu par `StoryViewerView+Sentinel`
        readerSceneLayout.sceneFrame.size
    }

    /// `true` quand le canvas est étendu plein bord — pilote le voile, l'ombre et
    /// l'animation de la carte en phase avec le cadrage
    /// (cf. `StoryReaderCanvasLayout.isExpanded`).
    var canvasIsExpanded: Bool { canvasLayout.isExpanded(lifted: composingSceneReserve != nil) } // internal : idem

    func readerFraming(reserve: CGFloat?) -> StoryCanvasFraming.Result { // internal : idem
        canvasLayout.framing(reserve: reserve)
    }

    var body: some View {
        ZStack {
            // === Layer 1: Background ===
            // Color/gradient fallback (always present)
            StoryReaderBackground(hasMediaBackground: currentSlideHasMediaBackground,
                                  background: currentStory?.storyEffects?.background)

            // === Layer 1.5 : LE SOL — le même que la galerie de post et le réel ===
            //
            // **`SceneFloorView` (MeeshyUI) est la recette du sol**, partagée avec la
            // galerie de post et le réel : empreinte décodée, flou 60, échelle 1,18,
            // opacité 0,85, voile. Un sol noir pur autour de la MÊME carte ferait
            // deux fonds pour une scène : une convergence mesurée DANS la carte ne
            // dirait rien de ce qui se peint à côté d'elle.
            //
            // Ce qui reste ici est de l'ORCHESTRATION, et rien d'autre :
            //
            // - `.id(currentStory?.id)` + `.transition(.opacity)` — SINGLE
            //   BACKDROP : un seul sol, que SwiftUI échange nativement sur
            //   changement d'identité (fusion gérée par le `withAnimation` du
            //   `crossFadeStory`). Deux sols dont les opacités s'ADDITIONNERAIENT
            //   dans le ZStack produiraient un pic de luminosité au milieu de la
            //   transition ;
            // - le VOILE, dont la valeur suit l'état de la carte (0,18 cardé,
            //   0 au plein bord) et dont le ressort est celui de la carte : une
            //   décision de « quand », donc de l'hôte ;
            // - `storyBackground` reste SOUS ce sol, inchangé : pour une story
            //   sans média de fond, c'est le dégradé de l'auteur qu'on voit à
            //   travers un sol sans empreinte (`SceneFloorView` ne peint aucun
            //   noir inconditionnel, précisément pour cela).
            SceneFloorView(thumbHash: currentStory?.sceneBackdropHash,
                           veil: canvasIsExpanded ? SceneFloorView.fullVeil
                                                  : SceneFloorView.cardedVeil)
                .id(currentStory?.id ?? "no-story")
                .transition(.opacity)
                .ignoresSafeArea()
                .allowsHitTesting(false)
                .accessibilityHidden(true)
                .animation(.spring(response: 0.42, dampingFraction: 0.84), value: canvasIsExpanded)

            // === Outgoing canvas (cross-dissolve pixel-perfect) ===
            if let outgoing = outgoingStory, outgoingOpacity > 0 {
                // La porte v3, la naissance en `.edit` et les fils du viewer
                // vivent dans `outgoingContentHost(_:)`.
                outgoingContentHost(outgoing)
                    .id("out-\(outgoing.id)")
                    // Strict 9:16-fit (parité avec UnifiedPostComposer:324).
                    // Sans contrainte, le reader s'étirerait à la hauteur écran et
                    // la projection design→render (scaleFactor = width/1080)
                    // décalerait visuellement les textes/stickers de ~77pt vers le
                    // haut sur iPhone 16 Pro.
                    // Dimensions explicites 9:16 — cf. `canvasFitSize`. Le
                    // duo `.aspectRatio(.fit) + .frame(maxWidth/Height)`
                    // ne contraint pas correctement le UIViewRepresentable
                    // sur iPhone 16 Pro et le canvas débordait en largeur
                    // (sidebar droite hors écran).
                    .clipped()
                    .opacity(outgoingOpacity)
                    .scaleEffect(closingScale)
                    // Canvas sortant suit la carte : MÊME composant, donc même
                    // cadre, même fond et même coins que la couche courante —
                    // et que le plein écran cadré d'un post.
                    .readerCard(layout: readerSceneLayout,
                                framing: readerCanvasFraming, resting: readerRestingFraming,
                                thumbHash: readerBackdropHash(of: outgoing))
                    .storyCommentsReadingBlur(showCommentsOverlay)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }

            // === Layers 2–4: Canvas pixel-perfect (media + filter + text + stickers) ===
            // La SENTINELLE prend la place de la scène quand ce build ne sait pas
            // la peindre. La bifurcation est ICI, au-dessus de la chaîne
            // d'accessibilité du canvas : plus bas, `children: .ignore` aplatirait
            // ses deux boutons — le seul geste utile deviendrait inatteignable.
            if currentStoryIsUnpaintable {
                sentinelLayer
            } else if let story = currentStory {
                // La porte v3 et les fils du viewer : `currentContentHost(_:)`.
                currentContentHost(story)
                    .id(story.id)
                    .storyLoopRestart(pass: loopPass, scrubber: sceneScrubber)
                    // U6 inc.2 — la navigation prev/next est une gesture
                    // SPATIALE (position x du tap dans le canvas) que VoiceOver
                    // ne peut pas produire : on l'expose en actions custom du
                    // rotor. Le label donne une identité au canvas (le contenu
                    // visuel est du CALayer, invisible d'UIAccessibility).
                    .accessibilityElement(children: .ignore)
                    // Le label PORTE le contenu, il ne se contente pas de
                    // nommer le contenant : le canvas étant du CALayer, c'est
                    // la seule voie par laquelle un utilisateur VoiceOver peut
                    // savoir ce que la story dit. Résolu via le Prisme pour que
                    // l'oral et le visuel racontent la même chose.
                    .accessibilityLabel(StoryCanvasAccessibility.label(
                        index: currentStoryIndex,
                        total: currentGroup?.stories.count ?? 0,
                        authorName: currentGroup?.username,
                        textObjects: story.storyEffects?.textObjects ?? [],
                        preferredLanguages: resolvedViewerLanguageChain,
                        voiceTranscript: currentVoiceCaption,
                        stickerDescriptions: (story.storyEffects?.stickerObjects ?? []).map { StoryStickerAccessibility.description(for: $0) }))
                    .accessibilityAction(named: String(
                        localized: "story.viewer.a11y.next",
                        defaultValue: "Story suivante"
                    )) {
                        // Rotor VoiceOver = navigation MANUELLE au même titre
                        // qu'un tap — sans ce tick, un utilisateur VoiceOver
                        // perdrait tout retour haptique de navigation (seuls les deux gestes
                        // tactiles seraient raccordés au tick unique).
                        HapticFeedback.light()
                        goToNext()
                    }
                    .accessibilityAction(named: String(
                        localized: "story.viewer.a11y.previous",
                        defaultValue: "Story précédente"
                    )) {
                        HapticFeedback.light()
                        goToPrevious()
                    }
                    // Strict 9:16-fit (parité avec UnifiedPostComposer:324).
                    // Sans contrainte, `geometry.size.height` étirait le canvas
                    // hors ratio design et décalait visuellement le contenu.
                    // Le hors-champ au-dessus/en dessous est habillé par le
                    // SOL (`SceneFloorView`, Layer 1.5).
                    // Dimensions explicites 9:16 — cf. `canvasFitSize`. Le
                    // duo `.aspectRatio(.fit) + .frame(maxWidth/Height)`
                    // ne contraint pas correctement le UIViewRepresentable
                    // sur iPhone 16 Pro et le canvas débordait en largeur
                    // (sidebar droite hors écran).
                    .clipped()
                    // Déplier la légende EFFACE la scène pour laisser remonter
                    // le fond ThumbHash déjà monté sous elle (Layer 1.5) — ou,
                    // sans média, la couleur de fond de la story. Multiplié
                    // avec `contentOpacity` : les deux répondent à « combien de
                    // cette scène voit-on ? » et se cumulent.
                    .opacity(contentOpacity
                             * CaptionExpansionSpace.storySceneOpacity(captionExpanded: isCaptionExpanded))
                    .animation(.easeInOut(duration: 0.22), value: isCaptionExpanded)
                    .offset(x: openingSlideFraction * canvasFitSize.width,
                            y: textSlideOffset)
                    .scaleEffect(openingScale)
                    .clipShape(
                        RevealCircleShape(progress: isRevealActive ? 1.0 : (currentStory?.storyEffects?.opening == .reveal ? 0.001 : 1.0))
                    )
                    // Carte → plein écran. La carte POSE elle-même le cadre
                    // `canvasFitSize` (projection design→render intacte), peint
                    // le fond dedans et rogne aux coins de la loi ; le lecteur
                    // ne lui donne que sa PLACE et son ANIMATION.
                    .readerCard(layout: readerSceneLayout,
                                framing: readerCanvasFraming, resting: readerRestingFraming,
                                thumbHash: readerBackdropHash(of: story))
                    // Ombre portée : la carte se détache du backdrop ThumbHash flou (même
                    // contenu) par son BORD arrondi + son ombre, pas par un voile sombre.
                    // Coupée en plein écran (carte = plein bord, pas d'ombre).
                    .shadow(color: .black.opacity(canvasIsExpanded ? 0 : 0.4),
                            radius: 20, y: 8)
                    // **Déplier la légende FLOUTE la scène** : pour les story pas besoin de
                    // cacher quoi que ce soit, quand on déplie, on floute juste la story et
                    // on affiche le texte déplié.
                    //
                    // La story n'a rien à sacrifier — pas de carte d'auteur en
                    // bas, pas de pellicule : sa scène OCCUPE déjà tout. Elle
                    // recule donc au lieu de céder la place, et le texte passe
                    // devant. C'est l'inverse de la galerie plein écran, où
                    // c'est l'auteur qui s'efface (`ConversationMediaGalleryView`)
                    // — deux réponses à la même question, « où trouver la
                    // place ? », parce que les deux surfaces n'ont pas le même
                    // voisinage.
                    //
                    // Le flou est posé APRÈS l'ombre et le cadrage : il porte
                    // sur la carte telle qu'elle est rendue, coins compris, et
                    // ne déborde donc pas de son clip.
                    .storyCommentsReadingBlur(showCommentsOverlay)
                    .animation(.spring(response: 0.42, dampingFraction: 0.84), value: canvasIsExpanded)

                // Overlay loader granulaire — ThumbHash bg flouté + (spinner+%).
                // Le backdrop ThumbHash est monté DÈS qu'une slide est active
                // pour servir de placeholder instantané (Cache-First : pas de
                // gradient/canvas vide pendant que le média télécharge). Le
                // spinner + le pourcentage, eux, restent gated par le délai
                // de grâce 200ms via `showProgressOverlay` afin de ne pas
                // flasher sur un cache hit immédiat. L'overlay entier fade
                // out quand la slide a chargé à 95 % — au-dessus, le canvas
                // média est révélé.
                if slideContentProgress < 0.95 {
                    StoryReaderLoadingOverlay(
                        slide: renderableSlideCache.slide(for: story, chain: resolvedViewerLanguageChain),
                        progress: slideContentProgress,
                        threshold: 0.95,
                        showSpinner: showProgressOverlay,
                        // Miniature serveur du fond (brute, sans overlays —
                        // surtout PAS le cover composite local qui bake les
                        // textes : ils seraient doublés par les layers live).
                        // La tray vient de l'afficher → warm cache → rendue
                        // nette par-dessus le ThumbHash dès le frame 0.
                        coverThumbnailURL: story.media.first?.thumbnailUrl
                    )
                    .id("loader-\(story.id)")
                    // Hard-frame the overlay to the canvas dimensions and clip
                    // it: the loader hosts a thumbhash Image + .blur() whose
                    // intrinsic/halo size could otherwise inflate the parent
                    // ZStack and push the sidebar/composer beyond the viewport.
                    // Aligné sur le canvas 9:16 (et non plein écran) pour ne pas
                    // recouvrir le SOL (`SceneFloorView`) en bandes letterbox.
                    // Dimensions explicites 9:16 — cf. `canvasFitSize`. Le
                    // duo `.aspectRatio(.fit) + .frame(maxWidth/Height)`
                    // ne contraint pas correctement le UIViewRepresentable
                    // sur iPhone 16 Pro et le canvas débordait en largeur
                    // (sidebar droite hors écran).
                    .clipped()
                    // Le loader suit la carte (même composant, donc même cadrage
                    // et même forme) → pas de saut entre le placeholder
                    // ThumbHash et le canvas.
                    .readerCard(layout: readerSceneLayout,
                                framing: readerCanvasFraming, resting: readerRestingFraming,
                                thumbHash: readerBackdropHash(of: story))
                    .storyCommentsReadingBlur(showCommentsOverlay)
                    .animation(.spring(response: 0.42, dampingFraction: 0.84), value: canvasIsExpanded)
                    .allowsHitTesting(false)
                    .transition(.opacity)
                }

                // R3 — buffering MID-SLIDE : spinner discret centré sur la
                // carte, UNIQUEMENT après le chargement initial (le loader
                // ThumbHash ci-dessus couvre `slideContentProgress < 0.95`).
                // Apparition différée (grâce 350 ms), disparition immédiate à
                // la reprise — cf. `handleStallIndicatorSignal`.
                if showStallIndicator && slideContentProgress >= 0.95 {
                    StoryPlaybackStallIndicator()
                        .frame(width: canvasFitSize.width,
                               height: canvasFitSize.height)
                        .scaleEffect(readerCanvasFraming.scale)
                        .offset(y: readerCanvasFraming.offset.height)
                        .allowsHitTesting(false)
                        .transition(.opacity)
                }
            }

            voiceCaptionLayer

            captionLayer(geometry: geometry)

            backgroundAudioLayer

            // === Translation indicator (Prisme Linguistique — discret) ===
            // Le badge de langue courante n'est pas dans le coin bas-gauche : il est
            // accolé au bouton « Abc » du
            // rail (`StoryActionSidebarView`, via `displayedLanguageCode`), au
            // point d'entrée des traductions. Plus de badge flottant ici.

            // === Layer 5: voiles de lisibilité — ils suivent le chrome ===
            StoryReaderScrims(topInset: topInset, chromeVisible: readerChromeShown)

            // === Layer 6: Gesture overlay (tap left/right, long press) ===
            StoryGestureOverlayView(
                geometry: geometry,
                isComposerEngaged: isComposerEngaged,
                isLongPressPaused: $isLongPressPaused,
                onDismissComposer: dismissComposer,
                onPrevious: goToPrevious,
                onNext: goToNext,
                onChromeVisibilityChange: { newValue in
                    // Animation spring rapide (lecture immersive) avec un
                    // léger overshoot pour donner du caractère au reveal et au
                    // hide. Sortie clavier en parallèle si le composer était
                    // engagé — le keyboard.hide() ne déclenche pas re-render
                    // du composer s'il est déjà non-focused.
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.78)) {
                        chromeVisible = newValue
                    }
                    if !newValue {
                        UIApplication.shared.sendAction(
                            #selector(UIResponder.resignFirstResponder),
                            to: nil, from: nil, for: nil
                        )
                    }
                },
                onTogglePause: {
                    // `isLongPressPaused` est la source de vérité unique de la
                    // pause : le double tap la bascule, donc timer, vidéo de
                    // fond, audios et effets gèlent et repartent ensemble.
                    //
                    // Le double tap NE TOUCHE PAS au chrome : c'est une pause, pas une
                    // mise en immersion.
                    // Seuls le long-press (immersion pendant le maintien) et le
                    // swipe vertical (plein écran) changent le cadrage.
                    isLongPressPaused.toggle()
                },
                hasActiveFeature: hasActiveReaderFeature,
                onDismissActiveFeature: onDismissActiveReaderFeature,
                isFullscreenStorySession: isFullscreenStorySession,
                gestureResetToken: gestureResetToken,
                readerFeatureConsumedByTouch: $readerFeatureConsumedByTouch
            )

            foregroundAudioLayer

            locationTapLayer

            topChromeLayer

            commentsOverlayLayer

            actionRailLayer

            reactionFlightLayer

            // NOTE: Live comments overlay (Instagram-style) is rendered by
            // `StoryViewerContentView` as a sibling of the card transform
            // stack — see this file's `StoryViewerContentView.body`.
            // Keeping it inside the card would make it inherit the card's
            // `.offset(x: totalSlideX)`, scale and rotation3D, and shift
            // left during drag / scale / 3D transitions.

            // Bottom area — le composeur, son repli et la mesure qui sert
            // de sol au texte de la story (`+CanvasComposerLayer`).
            composerLayer(geometry: geometry)

            fullEmojiPickerLayer

            fullLanguagePickerLayer
        }
        // Lock the entire story canvas (background + reader + overlays +
        // sidebar + composer) to EXACTLY the viewport size we were handed
        // in `geometry`. Without this, any child with an intrinsic size
        // bigger than the proposed size — a long translated text line, a
        // foreground media at natural pixel size, a reaction flight emoji
        // during its tuile→cœur animation — silently grows the enclosing ZStack
        // and pushes the right-side action sidebar (and bottom composer)
        // off-screen, making them untappable. `.clipped()` discards
        // anything that still tries to draw past the bounds rather than
        // letting it leak into adjacent UI.
        .frame(width: geometry.size.width, height: geometry.size.height, alignment: .center)
        // Espace de coordonnées commun du système scrub (cœur + tuiles des
        // barres réaction/langues), posé APRÈS le pin de taille ci-dessus —
        // pas avant : le ZStack racine peut gonfler à ~480pt (canvas
        // UIViewRepresentable) avant d'être ramené aux 402pt du viewport, et
        // un `.coordinateSpace` posé sur le ZStack non-pinné aurait une
        // origine décalée d'environ (480-402)/2 ≈ 44pt vers la gauche par
        // rapport à Layer 9 (rendu, lui, à l'intérieur du `.frame` pinné) —
        // tuiles, position du doigt et cible du vol partageraient alors des
        // repères désalignés.
        .coordinateSpace(name: StoryScrubSpace.name)
        .onPreferenceChange(StoryHeartFrameKey.self) { heartFrame = $0 }
        .clipped()
        // Délai de grâce du spinner+% : on n'arme `showProgressOverlay` qu'au
        // bout de 200 ms si la slide est sous 20 % de progression. La backdrop
        // ThumbHash, elle, est rendue immédiatement par
        // `StoryReaderLoadingOverlay` quand `slideContentProgress < 0.95` —
        // garantit un placeholder cache-first sans flasher d'indicateur de
        // chargement sur les slides qui se rendent instantanément.
        .task(id: currentStory?.id) {
            showProgressOverlay = false
            slideContentProgress = 0
            // R3 — nouvelle slide = état neuf : le canvas repart « progressant »
            // SANS émettre (resetPlaybackHealthState n'émet pas) ; sans ce reset
            // un indicateur de stall de la slide précédente resterait affiché.
            stallIndicatorGraceTask?.cancel()
            stallIndicatorGraceTask = nil
            showStallIndicator = false
            try? await Task.sleep(for: .milliseconds(200))
            guard !Task.isCancelled else { return }
            if slideContentProgress < 0.20 {
                withAnimation(.easeIn(duration: 0.2)) {
                    showProgressOverlay = true
                }
            }
        }
    }

    /// R3 — pilote l'indicateur de stall mid-slide depuis le signal
    /// `onPlaybackProgressing` du canvas : apparition DIFFÉRÉE (grâce 350 ms —
    /// un micro-stall de seek/loop ne flashe pas de spinner), disparition
    /// IMMÉDIATE à la reprise. Indépendant du forward vers `slideTimer`
    /// (le gel de la barre, lui, est toujours instantané et en phase).
    private func handleStallIndicatorSignal(progressing: Bool) {
        stallIndicatorGraceTask?.cancel()
        stallIndicatorGraceTask = nil
        if progressing {
            withAnimation(.easeOut(duration: 0.15)) { showStallIndicator = false }
            return
        }
        stallIndicatorGraceTask = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            // Signal VISUEL uniquement : les haptics de stall/reprise
            // s'empileraient sur celle de navigation et hacheraient la lecture —
            // le spinner suffit.
            withAnimation(.easeIn(duration: 0.2)) { showStallIndicator = true }
        }
    }

    // MARK: - Story Background

    /// `true` quand la slide courante a un vrai fond média (image/vidéo) : le canvas
    /// peint alors ce média plein cadre et le SOL (`SceneFloorView`, Layer 1.5) habille
    /// les letterbox d'un flou DÉRIVÉ du média. Dans ce cas le fond de canvas couleur/gradient
    /// (`storyBackground`, Layer 1) est redondant — pire, il bleed (~15 %) derrière le backdrop
    /// semi-transparent, teintant le média d'un voile indigo parasite. On le neutralise en noir
    /// : le reader/preview n'affiche pas de fond de canvas quand le fond
    /// est déjà une image/vidéo.
    private var currentSlideHasMediaBackground: Bool {
        guard let story = currentStory else { return false }
        return renderableSlideCache.slide(for: story, chain: resolvedViewerLanguageChain)
            .effects.hasVisualBackgroundMedia
    }

    /// Scheme épinglé sur le chrome du reader (header + sidebar) : suit la
    /// luminance du FOND de la slide affichée, pas le thème de l'app — même
    /// règle que le composer (`CanvasChromeScheme`) : sans cela, les icônes
    /// glass seraient illisibles selon la couleur de fond.
    var readerChromeScheme: ColorScheme { // internal : `+Canvas+Layers`
        CanvasChromeScheme.scheme(
            background: currentStory?.storyEffects?.background,
            hasMediaBackground: currentSlideHasMediaBackground
        )
    }

    // MARK: - Le SOL du lecteur : plus aucune recette ici

    // **La recette du sol vit dans `SceneFloorView` (MeeshyUI), et son empreinte
    // dans `StoryItem.sceneBackdropHash`.**
    //
    // La CARTE lit `story.sceneBackdropHash` (`readerBackdropHash`) et le sol
    // la même empreinte : le fond DANS la carte et le sol AUTOUR parlent du
    // même contenu. Deux cascades d'empreinte (slide, puis média de fond, puis
    // premier média) pourraient diverger lorsqu'un média de fond n'est pas le
    // PREMIER média porteur d'empreinte, et une story à plusieurs médias
    // peindrait son sol avec une empreinte et sa carte avec une autre.

    // MARK: - Background Audio Badge


    // Le chip « note + onde » d'une piste de fond ENREGISTRÉE/IMPORTÉE n'est pas
    // dans le canvas : le header du reader porte
    // ce même signal — note musicale puis onde animée — juste après
    // l'heure de publication. Une piste de fond sans entrée bibliothèque n'a
    // donc rien à afficher au milieu de l'image.

    // Le badge de langue courante vit dans le rail (accolé à « Abc »),
    // pas dans le canvas — voir `StoryActionSidebarView.displayedLanguageCode`.
}
