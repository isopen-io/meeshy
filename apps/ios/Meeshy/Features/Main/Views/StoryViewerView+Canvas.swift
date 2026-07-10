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

// MARK: - Story Gesture Overlay

/// Tap-left / tap-right navigation overlay plus the long-press pause gesture.
/// Extracted from `StoryViewerView.gestureOverlay(geometry:)` so its subtree
/// is its own type-metadata unit.
///
/// ## Sémantique gestuelle (source de vérité unique : `isPaused`)
/// - **Tap court (< 200 ms) sur story en lecture** : navigation prev/next
///   selon le côté tappé (gauche/droite).
/// - **Long-press ≥ 200 ms** : pause la story (`isPaused = true`). Le timer
///   de progression et le player de background vidéo s'arrêtent ensemble.
///   Le chrome bascule en mode immersif. **Le relâchement ne reprend
///   PAS** — la story reste en pause.
/// - **Tap court sur story en pause** : reprend la lecture (`isPaused =
///   false`), rétablit le chrome. Pas de navigation.
/// - **Drag horizontal/vertical au-delà du `dragSlopPixels`** : geste annulé
///   et laissé au drag gesture parent (swipe-down pour dismiss).
struct StoryGestureOverlayView: View {
    let geometry: GeometryProxy
    let isComposerEngaged: Bool
    /// **Source de vérité du toggle long-press**. Le hold confirmé le pose
    /// à `true`, le tap suivant le remet à `false`. Le parent observe ce
    /// drapeau pour gater le timer (`shouldPauseTimer`) ET poster les
    /// notifications canvas (`.storyPlayerPause` / `.storyPlayerResume`).
    @Binding var isLongPressPaused: Bool
    let onDismissComposer: () -> Void
    let onPrevious: () -> Void
    let onNext: () -> Void
    /// Callback de basculement du chrome — invoqué quand le seuil 200 ms est
    /// franchi (touch-and-hold confirmé) et quand le tap de reprise remet la
    /// story en lecture, avec `visible: Bool` qui suit la sémantique :
    /// - en mode normal (`isFullscreenStorySession == false`) : `false` à la
    ///   pause (cache pour immersion), `true` à la reprise (rétablit chrome).
    /// - en mode plein écran (`isFullscreenStorySession == true`) : inverse.
    /// Le parent applique l'animation et coupe le clavier au besoin.
    let onChromeVisibilityChange: (Bool) -> Void
    /// État de session « plein écran » lu depuis le parent. Détermine le
    /// sens du toggle du chrome (voir doc ci-dessus).
    let isFullscreenStorySession: Bool

    /// Seuil au-delà duquel un touch sur l'écran cesse d'être un tap de
    /// navigation prev/next et devient un hold (toggle pause + hide chrome).
    private let holdThresholdSeconds: TimeInterval = 0.2
    /// Marge horizontale/verticale autorisée avant qu'un drag soit considéré
    /// comme un swipe (et donc ignoré par cet overlay — laissé au drag
    /// gesture parent qui gère le dismiss).
    private let dragSlopPixels: CGFloat = 14

    @State private var touchStartTime: Date? = nil
    @State private var touchStartLocation: CGPoint = .zero
    /// `true` dès que le seuil 200 ms est franchi : la story est passée en
    /// pause via long-press, le release ne doit ni naviguer ni reprendre.
    @State private var holdActive: Bool = false
    /// `Task` armée au touchDown pour fire le hold à `holdThresholdSeconds`.
    /// Annulée si le doigt bouge trop, est relâché tôt, ou si le composer
    /// devient engaged en cours de geste.
    @State private var holdArmingTask: Task<Void, Never>? = nil
    /// `true` si le touch courant est le tap de reprise : `isLongPressPaused`
    /// était `true` au touch-down, on l'a remis à `false`, et le release
    /// doit être consommé (pas de nav, pas de hold).
    @State private var isResumingTap: Bool = false

    /// Surveille les transitions d'état de la scène pour annuler un hold
    /// armé si l'app passe inactive (incoming call, lock, app-switcher) —
    /// sinon `Task.sleep(200ms)` continue à courir et au retour foreground
    /// la Task fire, posant `isLongPressPaused = true` sans cause visible
    /// pour l'utilisateur.
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Color.clear
            .contentShape(Rectangle())
            .accessibilityElement()
            .accessibilityLabel(String(localized: "story.viewer.label", defaultValue: "Stories viewer", bundle: .main))
            .accessibilityHint("Toucher à gauche pour la story précédente, à droite pour la suivante, maintenir pour mettre en pause")
            // `DragGesture(minimumDistance: 0)` capture LE PREMIER touch-down
            // ainsi que le release. C'est le seul moyen fiable en SwiftUI de
            // distinguer un tap court d'un hold long sur la même hit-area —
            // `simultaneousGesture(LongPressGesture)` perdait toujours la
            // course contre `onTapGesture` car le tap fire au release tant
            // qu'aucun mouvement significatif n'a eu lieu, et le release
            // arrive bien avant la fin du holdThreshold.
            // `simultaneousGesture` plutôt que `gesture` pour cohabiter avec
            // le `unifiedDragGesture` parent (swipe down pour dismiss,
            // minimumDistance: 15). Sans ça, notre DragGesture(minimumDistance:0)
            // capturait l'évènement touchDown et le parent ne voyait plus
            // jamais les swipes verticaux.
            .simultaneousGesture(
                DragGesture(minimumDistance: 0, coordinateSpace: .local)
                    .onChanged { value in
                        guard !isComposerEngaged else { return }

                        if touchStartTime == nil {
                            // ===== TOUCH DOWN =====
                            touchStartTime = Date()
                            touchStartLocation = value.startLocation
                            holdActive = false
                            holdArmingTask?.cancel()

                            let ctx = StoryGestureContext(
                                holdActive: false,
                                isPaused: isLongPressPaused,
                                isResumingTap: false,
                                isComposerEngaged: isComposerEngaged
                            )
                            switch StoryGestureDecisions.decideTouchDown(context: ctx) {
                            case .resumeFromPause:
                                // Story en pause via long-press précédent.
                                // Ce tap REPREND la lecture — pas de hold,
                                // pas de nav au release.
                                isResumingTap = true
                                isLongPressPaused = false
                                onChromeVisibilityChange(!isFullscreenStorySession)
                                HapticFeedback.light()
                            case .none:
                                // Story en lecture : arme le long-press.
                                isResumingTap = false
                                holdArmingTask = Task { @MainActor in
                                    try? await Task.sleep(for: .milliseconds(Int(holdThresholdSeconds * 1000)))
                                    if Task.isCancelled { return }
                                    if isComposerEngaged { return }
                                    // Garde contre le wake-up Task après un
                                    // backgrounding : si l'app est sortie
                                    // de foreground pendant l'attente, on
                                    // ne déclenche pas un freeze invisible.
                                    guard UIApplication.shared.applicationState == .active else { return }
                                    holdActive = true
                                    isLongPressPaused = true
                                    onChromeVisibilityChange(isFullscreenStorySession)
                                }
                            default:
                                break  // touchDown ne produit pas d'autres actions
                            }
                        } else {
                            // ===== DRAG IN PROGRESS =====
                            // Le doigt bouge : si on dépasse le slop, on
                            // annule le geste (laissé au drag parent).
                            let dx = value.location.x - touchStartLocation.x
                            let dy = value.location.y - touchStartLocation.y
                            if abs(dx) > dragSlopPixels || abs(dy) > dragSlopPixels {
                                holdArmingTask?.cancel()
                                if holdActive {
                                    // Hold confirmé puis drag : on **annule
                                    // la pause** — l'utilisateur swipe, on
                                    // rend la main au drag parent.
                                    holdActive = false
                                    isLongPressPaused = false
                                    onChromeVisibilityChange(!isFullscreenStorySession)
                                }
                                // Drag pendant un tap de reprise : la
                                // reprise est déjà actée, on garde
                                // `isResumingTap` pour neutraliser le release.
                            }
                        }
                    }
                    .onEnded { value in
                        defer {
                            touchStartTime = nil
                            holdArmingTask?.cancel()
                            holdArmingTask = nil
                        }
                        let elapsed = touchStartTime.map { Date().timeIntervalSince($0) } ?? 0
                        let ctx = StoryGestureContext(
                            holdActive: holdActive,
                            isPaused: isLongPressPaused,
                            isResumingTap: isResumingTap,
                            isComposerEngaged: isComposerEngaged
                        )
                        switch StoryGestureDecisions.decideTouchUp(
                            context: ctx,
                            touchStartX: value.startLocation.x,
                            halfWidth: geometry.size.width / 2,
                            elapsed: elapsed,
                            holdThreshold: holdThresholdSeconds
                        ) {
                        case .dismissComposer:
                            onDismissComposer()
                        case .none:
                            // Tap de reprise OU race rare seuil-franchi-sans-hold.
                            // Dans les deux cas, on consomme les flags transients
                            // et on ne navigue pas.
                            isResumingTap = false
                        case .confirmLongPressPause:
                            // Hold confirmé : la story reste en pause
                            // (`isLongPressPaused = true` déjà posé par
                            // la Task). Pas de nav, pas de reprise auto.
                            holdActive = false
                            HapticFeedback.medium()
                        case .navigatePrevious:
                            onPrevious()
                        case .navigateNext:
                            onNext()
                        case .resumeFromPause:
                            break  // décidé au touchDown, pas au touchUp
                        }
                    }
            )
            // Annule un hold armé si la scène devient inactive — évite que
            // `Task.sleep(200ms)` continue à courir en background et fire au
            // retour foreground, paus​ant la story sans cause visible.
            .adaptiveOnChange(of: scenePhase) { _, newPhase in
                if newPhase != .active {
                    holdArmingTask?.cancel()
                    holdArmingTask = nil
                    if holdActive {
                        holdActive = false
                        isLongPressPaused = false
                    }
                }
            }
            // Exclude the bottom composer zone from tap targets
            .padding(.bottom, 120 + geometry.safeAreaInsets.bottom)
    }
}

// MARK: - Story Gesture Decisions (pure, testable)

/// État d'un toucher en cours sur l'overlay story — capture le minimum
/// nécessaire pour décider quoi faire au touch-down et au touch-up sans
/// avoir besoin du contexte SwiftUI (`@State`, `View`).
///
/// Utilisé par `StoryGestureOverlayView` à travers `StoryGestureDecisions`
/// pour rendre le comportement testable en XCTest.
struct StoryGestureContext: Equatable {
    /// `true` si le toucher en cours est un long-press confirmé (≥ 200 ms).
    var holdActive: Bool
    /// `true` si la story est en pause (source de vérité : long-press
    /// posé `true`, tap suivant pose `false`).
    var isPaused: Bool
    /// `true` si le tap en cours est le tap de reprise (touch-down a remis
    /// `isPaused = false`) — son release doit être consommé sans nav.
    var isResumingTap: Bool
    /// `true` si le composer est focused / engaged — toutes les actions
    /// gestuelles sont court-circuitées dans ce cas.
    var isComposerEngaged: Bool
}

/// Action à appliquer suite à un événement gestuel sur l'overlay story.
/// Pure value type — pas d'effet de bord ; le caller (la View) traduit
/// l'action en appels aux callbacks.
enum StoryGestureAction: Equatable {
    /// Rien à faire (no-op de cohérence : seuil franchi sans suite, etc.).
    case none
    /// Le composer était engagé : on délègue à `onDismissComposer`.
    case dismissComposer
    /// Touch-down sur story en pause → reprend la lecture (pose `isPaused
    /// = false`) et arme `isResumingTap = true` pour neutraliser le release.
    case resumeFromPause
    /// Touch-up d'un long-press confirmé : la story reste en pause
    /// (`isPaused` est resté `true`), pas de nav.
    case confirmLongPressPause
    /// Tap court → navigation slide précédente (côté gauche).
    case navigatePrevious
    /// Tap court → navigation slide suivante (côté droit ou centre).
    case navigateNext
}

/// Namespace de fonctions pures qui décident des transitions de l'overlay
/// gestuel story. Découplé de SwiftUI pour être unit-testable.
///
/// **Sémantique** : `isPaused` est l'unique source de vérité du toggle
/// long-press. La story est en pause ⇔ `isPaused == true` ⇔ timer arrêté
/// + tout média (bg vidéo, audios, effets) en pause.
enum StoryGestureDecisions {

    /// Décide quoi faire au TOUCH-DOWN d'un nouveau geste sur l'overlay.
    /// - `.resumeFromPause` si `isPaused` était `true` (tap qui reprend).
    /// - `.none` sinon (le caller arme alors la détection du long-press).
    static func decideTouchDown(context: StoryGestureContext) -> StoryGestureAction {
        if context.isComposerEngaged { return .none }
        if context.isPaused { return .resumeFromPause }
        return .none
    }

    /// Décide quoi faire au TOUCH-UP (.onEnded) d'un geste.
    ///
    /// - Parameters:
    ///   - context: état courant du toucher.
    ///   - touchStartX: coordonnée X du touch-down (pour décider prev/next).
    ///   - halfWidth: largeur / 2 du viewport.
    ///   - elapsed: durée écoulée depuis le touch-down (s).
    ///   - holdThreshold: seuil long-press en secondes.
    static func decideTouchUp(
        context: StoryGestureContext,
        touchStartX: CGFloat,
        halfWidth: CGFloat,
        elapsed: TimeInterval,
        holdThreshold: TimeInterval
    ) -> StoryGestureAction {
        if context.isComposerEngaged { return .dismissComposer }
        if context.isResumingTap { return .none }
        if context.holdActive { return .confirmLongPressPause }
        // Race rare : seuil franchi mais le tick `onChanged` n'a pas posé
        // `holdActive = true` à temps. On évite la nav surprise.
        if elapsed >= holdThreshold { return .none }
        return touchStartX < halfWidth ? .navigatePrevious : .navigateNext
    }
}

// MARK: - Story Composer Bar

/// **UNIQUE composer** du story viewer (réutilisé en mode story-reply ET
/// en mode comment-reply). Extrait de `StoryViewerView.storyComposerBar`
/// pour que le wiring `UniversalComposerBar` soit son propre type-metadata
/// unit.
///
/// Spec user 2026-05-28 : « Il faut avoir qu'une seule zone de saisie de
/// commentaire ». L'overlay commentaires affiche uniquement la LISTE +
/// actions reply/like ; le composer reste celui-ci, toujours présent en bas
/// de l'écran. Quand l'utilisateur tape « Répondre » sur un commentaire,
/// `replyingToStoryComment` est set → une banner « Réponse à X » apparaît
/// au-dessus de la rangée de saisie de CE composer (pas dans un second
/// composer).
struct StoryComposerBarView: View {
    let accentColor: String
    let storyId: String?

    @Binding var composerLanguage: String
    @Binding var commentEffects: MessageEffects
    @Binding var commentBlurEnabled: Bool
    @Binding var isComposerEngaged: Bool
    @Binding var showTextEmojiPicker: Bool
    @Binding var hasComposerContent: Bool
    @Binding var emojiToInject: String
    @Binding var composerFocusTrigger: Bool
    @Binding var storyDrafts: [String: StoryDraft]
    @Binding var replyingToStoryComment: FeedComment?

    /// `parentId` non-nil quand l'utilisateur répond à un commentaire (via
    /// `replyingToStoryComment` set par l'overlay). Sinon nil → commentaire
    /// top-level sur la story. `pendingMedia` non-nil = commentaire avec UN média.
    let sendComment: (_ text: String, _ effectFlags: Int?, _ parentId: String?, _ pendingMedia: PendingCommentMedia?) -> Void

    // Comment attachments + real voice capture (parity with feed/reels composer).
    @State private var commentAttachments: [ComposerAttachment] = []
    @State private var showCommentPhotoPicker: Bool = false
    @State private var commentPhotoItems: [PhotosPickerItem] = []
    @State private var showCommentFilePicker: Bool = false
    @StateObject private var audioRecorder = AudioRecorderManager()

    var body: some View {
        UniversalComposerBar(
            style: .dark,
            mode: .comment,
            accentColor: replyingToStoryComment?.authorColor ?? accentColor,
            forceShowAttachment: true,
            forceShowVoice: true,
            selectedLanguage: composerLanguage,
            onLanguageChange: { composerLanguage = $0 },
            onFocusChange: { focused in
                if focused {
                    isComposerEngaged = true
                    // Keyboard opening → dismiss emoji panel
                    if showTextEmojiPicker {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showTextEmojiPicker = false
                        }
                    }
                } else {
                    // Only disengage if emoji panel isn't showing
                    if !showTextEmojiPicker {
                        isComposerEngaged = false
                    }
                }
            },
            onSendMessage: { text, attachments, _ in submitStoryComment(text: text, attachments: attachments) },
            replyBanner: replyingToStoryComment.map { reply in
                AnyView(
                    HStack(spacing: 8) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color(hex: reply.authorColor))
                            .frame(width: 3, height: 30)

                        VStack(alignment: .leading, spacing: 1) {
                            HStack(spacing: 4) {
                                Image(systemName: "arrowshape.turn.up.left.fill")
                                    .font(MeeshyFont.relative(9, weight: .semibold))
                                    .foregroundColor(Color(hex: reply.authorColor))
                                Text(String(localized: "story.viewer.replyTo", defaultValue: "R\u{00E9}ponse \u{00E0} \(reply.author)", bundle: .main))
                                    .font(MeeshyFont.relative(11, weight: .semibold))
                                    .foregroundColor(Color(hex: reply.authorColor))
                            }
                            Text(reply.displayContent)
                                .font(MeeshyFont.relative(11))
                                .foregroundColor(.white.opacity(0.6))
                                .lineLimit(1)
                        }

                        Spacer()

                        Button {
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                                replyingToStoryComment = nil
                            }
                        } label: {
                            Image(systemName: "xmark")
                                .font(MeeshyFont.relative(9, weight: .bold))
                                .foregroundColor(.white.opacity(0.6))
                                .frame(width: 22, height: 22)
                                .background(Circle().fill(Color.white.opacity(0.12)))
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(hex: reply.authorColor).opacity(0.18))
                    .overlay(
                        Rectangle()
                            .fill(Color(hex: reply.authorColor).opacity(0.35))
                            .frame(height: 0.5),
                        alignment: .bottom
                    )
                )
            },
            customAttachmentsPreview: commentAttachments.isEmpty
                ? nil
                : AnyView(CommentAttachmentsTray(attachments: commentAttachments) { id in
                    commentAttachments.removeAll { $0.id == id }
                  }),
            onStartRecording: { audioRecorder.startRecording(); HapticFeedback.medium() },
            onStopRecordingToAttachment: { stopRecordingToAttachment() },
            onSendRecording: { if stopRecordingToAttachment() { submitStoryComment(text: "", attachments: commentAttachments) } },
            onCancelRecording: { audioRecorder.cancelRecording() },
            externalIsRecording: audioRecorder.isRecording,
            externalRecordingDuration: audioRecorder.duration,
            externalAudioLevels: audioRecorder.audioLevels,
            externalHasContent: !commentAttachments.isEmpty || audioRecorder.isRecording,
            onPhotoLibrary: { showCommentPhotoPicker = true },
            onFilePicker: { showCommentFilePicker = true },
            onShowAttachments: {
                // Attachment carousel opening → dismiss the emoji panel so the
                // two bottom surfaces never stack.
                if showTextEmojiPicker {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showTextEmojiPicker = false
                    }
                }
            },
            onRequestTextEmoji: {
                isComposerEngaged = true
                // Dismiss keyboard first, then show emoji panel
                UIApplication.shared.sendAction(
                    #selector(UIResponder.resignFirstResponder),
                    to: nil, from: nil, for: nil
                )
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                        showTextEmojiPicker = true
                    }
                }
            },
            injectedEmoji: $emojiToInject,
            isBlurEnabled: $commentBlurEnabled,
            pendingEffects: $commentEffects,
            storyId: storyId,
            onSaveDraft: { storyId, text, attachments in
                if text.isEmpty && attachments.isEmpty {
                    storyDrafts.removeValue(forKey: storyId)
                } else {
                    storyDrafts[storyId] = StoryDraft(text: text, attachments: attachments)
                }
            },
            getDraft: { storyId in
                guard let draft = storyDrafts[storyId] else { return nil }
                return (text: draft.text, attachments: draft.attachments)
            },
            onAnyInteraction: {
                // No-op: shouldPauseTimer handles all pause logic based on UI state
            },
            focusTrigger: $composerFocusTrigger,
            onRecordingChange: { recording in
                isComposerEngaged = recording
            },
            onHasContentChange: { hasContent in
                hasComposerContent = hasContent
            }
        )
        .photosPicker(
            isPresented: $showCommentPhotoPicker,
            selection: $commentPhotoItems,
            maxSelectionCount: 1,
            matching: .any(of: [.images, .videos])
        )
        .fileImporter(
            isPresented: $showCommentFilePicker,
            allowedContentTypes: [.item],
            allowsMultipleSelection: false
        ) { result in
            if case .success(let urls) = result {
                commentAttachments = CommentComposerStaging.fileAttachments(from: urls)
            }
        }
        .adaptiveOnChange(of: commentPhotoItems) { _, items in
            Task {
                commentAttachments = await CommentComposerStaging.photoAttachments(from: items)
                await MainActor.run { commentPhotoItems = [] }
            }
        }
    }

    /// Construit le média éventuel (un seul) + appelle le `sendComment` injecté avec
    /// le pendingMedia. Capture `parentId` AVANT de clear le reply context.
    private func submitStoryComment(text: String, attachments: [ComposerAttachment]) {
        let media = CommentComposerStaging.firstPendingMedia(in: attachments)
        commentAttachments.removeAll()
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty || media != nil else { return }
        let effects = commentEffects
        let blur = commentBlurEnabled
        commentEffects = .none
        commentBlurEnabled = false
        let flags = effects.flags.rawValue | (blur ? MessageEffectFlags.blurred.rawValue : 0)
        let effectFlags = flags > 0 ? Int(flags) : nil
        // Réponse plate à 2 niveaux : répondre à une réponse rattache au MÊME parent
        // racine (sinon la réponse-de-réponse atterrissait dans un bucket jamais rendu
        // → commentaire invisible). L'auteur ciblé est notifié via la @mention injectée
        // à l'ouverture de la réponse (cf. makeStoryCommentRow).
        let parentId = replyingToStoryComment?.parentId ?? replyingToStoryComment?.id
        replyingToStoryComment = nil
        sendComment(trimmed, effectFlags, parentId, media)
    }

    @discardableResult
    private func stopRecordingToAttachment() -> Bool {
        guard audioRecorder.duration > 0.5 else {
            audioRecorder.cancelRecording()
            return false
        }
        let duration = audioRecorder.duration
        guard let url = audioRecorder.stopRecording() else { return false }
        commentAttachments.append(CommentComposerStaging.voiceAttachment(duration: duration, url: url))
        return true
    }
}

// MARK: - Story Card

/// Cache à 1 entrée du `StorySlide` renderable de la slide courante.
/// `toRenderableSlide` résout les traductions (Prisme) et hydrate les durées
/// média — l'appeler 3× par évaluation de body (representable + check fond
/// média + backdrop), à chaque tick de barre pendant la lecture, recompose
/// l'intégralité du slide pour rien. Classe boxée en `@State` : survit aux
/// re-créations de la struct ; invalidée par fingerprint (id + chaîne de
/// langues + counts de traductions par textObject — couvre les merges de
/// traductions temps réel `story:translation-updated`).
@MainActor
final class RenderableSlideCache {
    private var key: String = ""
    private var cached: StorySlide?

    func slide(for story: StoryItem, chain: [String]) -> StorySlide {
        let translationCounts = (story.storyEffects?.textObjects ?? [])
            .map { String($0.translations?.count ?? 0) }
            .joined(separator: ".")
        let newKey = "\(story.id)|\(chain.joined(separator: ","))|\(translationCounts)"
        if newKey == key, let cached { return cached }
        let slide = story.toRenderableSlide(preferredLanguages: chain)
        key = newKey
        cached = slide
        return slide
    }
}

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
    let isContentTranslated: Bool
    let isOwnStory: Bool
    let quickEmojis: [String]

    // Animation drivers (written by parent transition funcs)
    let progress: CGFloat
    let currentSlideDuration: TimeInterval
    let outgoingOpacity: Double
    let closingScale: CGFloat
    let contentOpacity: Double
    let textSlideOffset: CGFloat
    let openingScale: CGFloat
    let isRevealActive: Bool
    let bigReactionEmoji: String?
    let bigReactionPhase: Int
    let heartBouncePulse: Int

    // Sidebar inputs
    let storyReactionCount: Int
    let storyCurrentUserHasReacted: Bool
    let storyCommentCount: Int
    let storyShareCount: Int
    let storyViewCount: Int
    let storyRepostCount: Int
    let isStoryCommentsEmpty: Bool
    let storyHasAudibleSound: Bool
    let storyHasTranslatableContent: Bool
    let isGlobalMuted: Bool
    let availableTranslationLanguages: [TranslationLanguage]
    let onReplyToStory: ((ReplyContext) -> Void)?
    /// Prisme « Exploration » : appelé quand l'utilisateur choisit une langue dans le
    /// picker/strip pour afficher le contenu dans cette langue (override éphémère).
    let onSelectLanguageOverride: (String) -> Void

    // Header inputs
    let composerAccentColor: String

    // Comments overlay inputs
    let storyComments: [FeedComment]
    let storyCommentRepliesMap: [String: [FeedComment]]
    let storyCommentExpandedThreads: Set<String>
    let storyCommentLoadingReplies: Set<String>
    let isLoadingComments: Bool
    let commentsUserLang: String

    // Bindings — UI state owned by the viewer
    @Binding var isContentReady: Bool
    @Binding var showEmojiStrip: Bool
    @Binding var showFullEmojiPicker: Bool
    @Binding var showCommentsOverlay: Bool
    @Binding var showLanguageOptions: Bool
    @Binding var showFullLanguagePicker: Bool
    @Binding var showViewersSheet: Bool
    @Binding var showExportShareSheet: Bool
    @Binding var isGlobalMutedBinding: Bool
    @Binding var showTextEmojiPicker: Bool
    @Binding var isComposerEngaged: Bool
    @Binding var hasComposerContent: Bool
    @Binding var sharedContentWrapper: SharedContentWrapper?
    @Binding var repostStoryComposerSource: RepostStorySourceWrapper?
    @Binding var editAndRepostAsPostSource: RepostPostSourceWrapper?
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

    /// Reflète `shouldPauseTimer` du parent (aggrégation des pauses UI : sheets,
    /// composer, drag, long-press, transition). Propagée au canvas via
    /// `StoryReaderRepresentable.isPaused` pour que la timeline canvas (vidéo,
    /// audio, displayLink) gèle EN PHASE avec la progress bar du viewer.
    let isCanvasPlaybackPaused: Bool

    @ObservedObject var keyboard: KeyboardObserver

    /// Fraction `[0, 1]` de contenu de la slide active disponible localement.
    /// Pilote `StoryReaderLoadingOverlay` (ThumbHash bg + spinner + %) — seul
    /// loader actif (l'ancien `ProgressView` blanc redondant a été retiré).
    /// Cf. spec stories-video-layers-text-sprint § 3.D.
    @State private var slideContentProgress: Double = 0

    /// Gate d'affichage du spinner + % à l'intérieur de l'overlay. La
    /// backdrop ThumbHash, elle, est rendue immédiatement (cache-first).
    /// Activé seulement après 200 ms si la slide n'a pas progressé — évite
    /// que l'utilisateur voie spinner+% flasher sur un cache hit qui se
    /// rend instantanément.
    @State private var showProgressOverlay: Bool = false

    // Closures — actions on the parent view
    let triggerStoryReaction: (String) -> Void
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
    let sendComment: (_ text: String, _ effectFlags: Int?, _ parentId: String?, _ pendingMedia: PendingCommentMedia?) -> Void
    let makeStoryCommentRow: (FeedComment, String) -> StoryCommentRowView
    let toggleStoryCommentThread: (String) async -> Void
    let makeStoryExternalShareURL: (String) -> URL?
    let storyTimeRemaining: (Date) -> String
    let deleteCurrentStory: () -> Void
    let repostAsPostDirect: () -> Void
    let dismissViewer: () -> Void
    let reportStory: (_ storyId: String, _ reportType: String, _ reason: String?) async throws -> Void
    let composerBottomPadding: (GeometryProxy) -> CGFloat

    /// Builds the Instagram-style floating comments overlay. Conditional on
    /// `showCommentsOverlay`. Placed in the ZStack BEFORE the controls
    /// (sidebar / header / composer) so it renders BEHIND them — user can
    /// still tap React / Reply / Settings even with comments visible
    /// (user spec 2026-05-28 « le layer de commentaire doit apparaitre en
    /// dessous des layer des controles de la story »).
    let makeCommentsOverlay: () -> StoryCommentsOverlayView

    private var topInset: CGFloat {
        max(geometry.safeAreaInsets.top, 59)
    }

    /// Dimensions strictes 9:16 du canvas dans la géométrie courante.
    /// `.aspectRatio(.fit) + .frame(maxWidth/Height)` ne contraint pas
    /// correctement le `StoryReaderRepresentable` (UIViewRepresentable) sur
    /// iPhone 16 Pro (402×874pt) — le canvas se retrouvait à 491×754pt
    /// (height-fit avec width qui déborde) au lieu de 402×715pt (width-fit
    /// attendu). La sidebar droite tombait alors hors écran à x=389+w=46
    /// → out of 402 (bug 2026-05-27). On force ici les dimensions explicites
    /// par calcul direct du fit ratio.
    private var canvasFitSize: CGSize {
        // Source de vérité partagée avec le composer (`CanvasGeometry.aspectFitSize`)
        // pour garantir la parité 9:16 composer ↔ reader. Math identique à
        // l'ancien calcul inline `min(w, h * 9/16)`.
        CanvasGeometry.aspectFitSize(in: geometry.size)
    }

    /// Cadrage « carte → plein écran » du canvas reader, MUTUALISÉ avec le composer
    /// via `StoryCanvasFraming` (même solveur, même rendu). Au repos (mode normal) le
    /// canvas est une carte arrondie (coins 22) SOUS le chrome auteur (progress + ligne
    /// auteur) et AU-DESSUS du footer (actions + champ répondre), avec marges latérales
    /// nettes (distinguée du viewport). En plein écran (`isFullscreenStorySession`) →
    /// `.free` = identité (canvas 9:16 plein bord, coins 0 ; le chrome se masque par
    /// ailleurs via `chromeVisible`). Un seul ressort anime taille/coins/position au
    /// toggle — design user 2026-06-02. (it.33 : insets relevés pour une carte nette —
    /// la tentative it.32 cadrait déjà mais à 0.94 ≈ plein bord, donc invisible.)
    /// Présentation du canvas : `.free` (plein bord) quand le chrome est masqué
    /// (long-press immersif) OU en session plein écran ; `.carded` (carte arrondie
    /// marginée) au repos. Source de vérité : `StoryCanvasFraming.readerPresentation`
    /// (truth-table SDK pure, testée). Le long-press qui cache les contrôleurs
    /// agrandit ainsi le canvas pour épouser le viewport (user 2026-06-03).
    private var canvasPresentation: StoryCanvasFraming.Presentation {
        StoryCanvasFraming.readerPresentation(
            isFullscreenSession: isFullscreenStorySession,
            chromeVisible: chromeVisible)
    }

    /// `true` quand le canvas est étendu plein bord (`.free`) — pilote le voile,
    /// l'ombre et l'animation de la carte en phase avec le cadrage.
    private var canvasIsExpanded: Bool { canvasPresentation == .free }

    private var readerCanvasFraming: StoryCanvasFraming.Result {
        StoryCanvasFraming.resolve(.init(
            viewport: geometry.size,
            headerInset: topInset + 72,   // barres progress (~8) + ligne auteur (~48) + gap — clairance chrome, flush sans occlusion
            bottomInset: 64,              // marge basse ÷2 (it.48) — carte plus proche du bord bas
            sideInset: 8,                 // marges latérales ÷2 (it.48) — carte plus proche des bords L/R
            state: canvasPresentation,
            cardedCornerRadius: 22))
    }

    var body: some View {
        ZStack {
            // === Layer 1: Background ===
            // Color/gradient fallback (always present)
            storyBackground

            // === Layer 1.5: Blurred backdrop derived from the slide ThumbHash ===
            // Le canvas réel est contraint à 9:16 (fidélité au design composer).
            // Sur un iPhone "plus haut que 9:16" (iPhone 16 Pro = 0.461 vs 9/16 = 0.5625),
            // ~150pt restent libres au-dessus et en dessous ; on les habille
            // d'un blur du contenu story (ThumbHash upscaled + flou + scale) pour
            // une transition douce entre les letterbox et le canvas net.
            //
            // SINGLE BACKDROP : un seul `storyBlurredBackdrop(for: currentStory)`
            // avec une `.id(currentStory?.id)` pour que SwiftUI swap natif
            // (transition.opacity de defaut, gérée par `withAnimation` du
            // `crossFadeStory`). Le pattern précédent (deux backdrops avec
            // `outgoingOpacity` ET `contentOpacity` additifs) produisait un pic
            // de luminosité au milieu de la transition car les deux blurs
            // semi-transparents s'additionnaient dans le ZStack.
            storyBlurredBackdrop(for: currentStory)
                .id(currentStory?.id ?? "no-story")
                .transition(.opacity)
                .ignoresSafeArea()
                .allowsHitTesting(false)
                .accessibilityHidden(true)

            // Voile LÉGER sur le backdrop ThumbHash flou : on GARDE le ThumbHash visible
            // en fond (demande user 2026-06-02 « mettre en fond le ThumbHash »), juste un
            // soupçon d'assombrissement pour séparer. La carte se distingue surtout par ses
            // coins arrondis + son ombre (voir le canvas cardé). En plein écran → 0 (le
            // backdrop habille les letterbox immersifs). Animé par le ressort de la carte.
            Color.black
                .opacity(canvasIsExpanded ? 0 : 0.18)
                .ignoresSafeArea()
                .allowsHitTesting(false)
                .accessibilityHidden(true)
                .animation(.spring(response: 0.42, dampingFraction: 0.84), value: canvasIsExpanded)

            // === Outgoing canvas (cross-dissolve pixel-perfect) ===
            if let outgoing = outgoingStory, outgoingOpacity > 0 {
                // `isOutgoing: true` force le canvas en `.edit` mode dès
                // makeUIView — ses bg/FG AVPlayer + audio mixer ne démarrent
                // PAS, supprimant le bleed audio/vidéo 350-400 ms pendant le
                // cross-fade (bug user 2026-05-28 « médias jouent en double »).
                // Visuellement, le slide reste rendu (image bg + textes), seule
                // l'animation vidéo est gelée — invisible à l'œil pendant une
                // sortie en opacity sur 350 ms.
                StoryReaderRepresentable(story: outgoing, preferredLanguage: resolvedViewerLanguage,
                                      preferredContentLanguages: resolvedViewerLanguageChain,
                                      preloadedImages: preloadedImages,
                                      preloadedVideoURLs: preloadedVideoURLs,
                                      preloadedAudioURLs: preloadedAudioURLs,
                                      isOutgoing: true)
                    .id("out-\(outgoing.id)")
                    // Strict 9:16-fit (parité avec UnifiedPostComposer:324).
                    // Sans contrainte, le reader s'étirait à la hauteur écran et
                    // la projection design→render (scaleFactor = width/1080)
                    // décalait visuellement les textes/stickers de ~77pt vers le
                    // haut sur iPhone 16 Pro (bug audit 2026-05-27).
                    // Dimensions explicites 9:16 — cf. `canvasFitSize`. Le
                    // duo `.aspectRatio(.fit) + .frame(maxWidth/Height)`
                    // ne contraint pas correctement le UIViewRepresentable
                    // sur iPhone 16 Pro et le canvas débordait en largeur
                    // (sidebar droite hors écran).
                    .frame(width: canvasFitSize.width,
                           height: canvasFitSize.height)
                    .clipped()
                    .opacity(outgoingOpacity)
                    .scaleEffect(closingScale)
                    // Canvas sortant suit la carte (même cadrage) pendant le cross-fade.
                    .scaleEffect(readerCanvasFraming.scale)
                    .offset(y: readerCanvasFraming.offset.height)
                    .clipShape(RoundedRectangle(cornerRadius: readerCanvasFraming.cornerRadius, style: .continuous))
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }

            // === Layers 2–4: Canvas pixel-perfect (media + filter + text + stickers) ===
            if let story = currentStory {
                StoryReaderRepresentable(story: story, preferredLanguage: resolvedViewerLanguage,
                                      preferredContentLanguages: resolvedViewerLanguageChain,
                                      preloadedImages: preloadedImages,
                                      preloadedVideoURLs: preloadedVideoURLs,
                                      preloadedAudioURLs: preloadedAudioURLs,
                                      // Le mute est une préférence VIEWER persistante (`isGlobalMuted`,
                                      // @State qui survit aux avances). Le canvas est recréé à chaque
                                      // story (`.id(story.id)`) → sans passer l'état ici, chaque
                                      // nouvelle story repartait à `mute: false` (bug : on remute
                                      // chaque story). On sème donc l'état persistant à l'init.
                                      mute: isGlobalMuted,
                                      isPaused: isCanvasPlaybackPaused,
                                      onContentReady: { isContentReady = true },
                                      onContentProgress: { p in
                                          // Latch monotone : une fois le contenu prêt
                                          // (≥ 0.95), on ne redescend JAMAIS. Sans ça
                                          // chaque `scheduleContentReadyEvaluation`
                                          // (déclenché par les didSet slide cumulés)
                                          // remettait `contentReadyFired=false` →
                                          // `recomputeContentProgress` émettait 0 →
                                          // loader overlay réapparaissait → scintillement
                                          // (user-reporté 2026-05-27 « la story scintille
                                          // seulement »). Le reset à 0 se fait UNIQUEMENT
                                          // sur slide-change (cf. `.task(id:)` plus bas).
                                          if slideContentProgress >= 0.95 && p < slideContentProgress {
                                              return
                                          }
                                          slideContentProgress = p
                                      },
                                      // Timeline unifiée : la progress bar + l'auto-advance
                                      // (pilotés par `slideTimer`) gèlent EN PHASE quand la
                                      // lecture du média primaire stalle (buffer), et reprennent
                                      // sans saut dès qu'elle rejoue. Input INDÉPENDANT de
                                      // `setPaused` (long-press / sheets) — ils ne se clobberent
                                      // jamais. No-op pour les slides sans vidéo (le canvas
                                      // n'émet alors jamais). Décision produit câblée app-side ;
                                      // le SDK n'expose que le signal `onPlaybackProgressing`.
                                      onPlaybackProgressing: { progressing in
                                          onPlaybackProgressing(progressing)
                                      })
                    .id(story.id)
                    // Strict 9:16-fit (parité avec UnifiedPostComposer:324).
                    // Sans contrainte, `geometry.size.height` étirait le canvas
                    // hors ratio design et décalait visuellement le contenu.
                    // Le letterbox au-dessus/en dessous est habillé par le
                    // `storyBlurredBackdrop` (Layer 1.5).
                    // Dimensions explicites 9:16 — cf. `canvasFitSize`. Le
                    // duo `.aspectRatio(.fit) + .frame(maxWidth/Height)`
                    // ne contraint pas correctement le UIViewRepresentable
                    // sur iPhone 16 Pro et le canvas débordait en largeur
                    // (sidebar droite hors écran).
                    .frame(width: canvasFitSize.width,
                           height: canvasFitSize.height)
                    .clipped()
                    .opacity(contentOpacity)
                    .offset(y: textSlideOffset)
                    .scaleEffect(openingScale)
                    .clipShape(
                        RevealCircleShape(progress: isRevealActive ? 1.0 : (currentStory?.storyEffects?.opening == .reveal ? 0.001 : 1.0))
                    )
                    // Carte → plein écran (mutualisé composer). Visuel pur (la frame
                    // reste `canvasFitSize` → projection design→render intacte).
                    .scaleEffect(readerCanvasFraming.scale)
                    .offset(y: readerCanvasFraming.offset.height)
                    .clipShape(RoundedRectangle(cornerRadius: readerCanvasFraming.cornerRadius, style: .continuous))
                    // Ombre portée : la carte se détache du backdrop ThumbHash flou (même
                    // contenu) par son BORD arrondi + son ombre, pas par un voile sombre
                    // (demande user 2026-06-02 « bords arrondis + ThumbHash en fond »).
                    // Coupée en plein écran (carte = plein bord, pas d'ombre).
                    .shadow(color: .black.opacity(canvasIsExpanded ? 0 : 0.4),
                            radius: 20, y: 8)
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
                    // recouvrir le `storyBlurredBackdrop` en bandes letterbox.
                    // Dimensions explicites 9:16 — cf. `canvasFitSize`. Le
                    // duo `.aspectRatio(.fit) + .frame(maxWidth/Height)`
                    // ne contraint pas correctement le UIViewRepresentable
                    // sur iPhone 16 Pro et le canvas débordait en largeur
                    // (sidebar droite hors écran).
                    .frame(width: canvasFitSize.width,
                           height: canvasFitSize.height)
                    .clipped()
                    // Le loader suit la carte (même cadrage) → pas de saut entre le
                    // placeholder ThumbHash carté et le canvas carté.
                    .scaleEffect(readerCanvasFraming.scale)
                    .offset(y: readerCanvasFraming.offset.height)
                    .clipShape(RoundedRectangle(cornerRadius: readerCanvasFraming.cornerRadius, style: .continuous))
                    .animation(.spring(response: 0.42, dampingFraction: 0.84), value: canvasIsExpanded)
                    .allowsHitTesting(false)
                    .transition(.opacity)
                }
            }

            // === Voice caption overlay (transcription voix) ===
            if let transcription = currentVoiceCaption {
                VStack {
                    Spacer()
                    Text(transcription)
                        .font(MeeshyFont.relative(14, weight: .medium))
                        .foregroundColor(.white)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 8)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(Color.black.opacity(0.55))
                        )
                        .padding(.horizontal, 20)
                        .padding(.bottom, topInset + 130)
                }
                .allowsHitTesting(false)
                .transition(.opacity)
            }

            // === Background audio badge ===
            if let audio = currentStory?.backgroundAudio {
                VStack {
                    Spacer()
                    backgroundAudioBadge(audio: audio)
                        .padding(.bottom, topInset + 165)
                }
                .frame(maxWidth: .infinity, alignment: .center)
                .allowsHitTesting(false)
            }

            // === Translation indicator (Prisme Linguistique — discret) ===
            if isContentTranslated {
                translationBadge
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    .padding(.trailing, 16)
                    .padding(.bottom, topInset + 175)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }

            // === Layer 5: Gradient scrims for readability over photos ===
            VStack {
                LinearGradient(
                    stops: [
                        .init(color: .black.opacity(0.7), location: 0),
                        .init(color: .black.opacity(0.4), location: 0.5),
                        .init(color: .black.opacity(0.0), location: 1)
                    ],
                    startPoint: .top, endPoint: .bottom
                )
                .frame(height: topInset + 110)
                Spacer()
                // Scrim bottom plus opaque + plus haut — assure que le caption
                // texte d'une slide (rendu par le canvas à y≈0.95 en design
                // coords) ne déborde plus visuellement sur la zone composer
                // « Commenter... ». Le canvas du reader est positionné au
                // centre du geometry (9:16 fit-to-width), donc un text
                // positioné bas du slide tombe juste au-dessus du composer.
                // Sans ce scrim fort, les deux se superposent — symptôme
                // user-reporté 2026-05-27.
                LinearGradient(
                    stops: [
                        .init(color: .black.opacity(0.0), location: 0),
                        .init(color: .black.opacity(0.55), location: 0.45),
                        .init(color: .black.opacity(0.92), location: 1)
                    ],
                    startPoint: .top, endPoint: .bottom
                )
                .frame(height: 240)
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .accessibilityHidden(true)

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
                isFullscreenStorySession: isFullscreenStorySession
            )

            // === Layer 6.5: Foreground audio chips ===
            // Au-dessus du gesture overlay : le tap d'un chip est consommé
            // avant d'atteindre la nav gauche/droite des slides. Masqué hors
            // de la fenêtre `startTime..startTime+duration` de chaque audio.
            // Le tap toggle le mute *per-piste* via la registry partagée
            // (`StoryReaderAudioMuteRegistry`) — la canvas applique au mixer.
            if let story = currentStory,
               let audios = story.storyEffects?.audioPlayerObjects,
               !audios.isEmpty {
                AudioForegroundReaderOverlay(
                    foregroundAudios: audios,
                    slideDuration: currentSlideDuration,
                    fallbackElapsedTime: progress > 0 ? TimeInterval(progress) * currentSlideDuration : nil
                )
                .allowsHitTesting(!isComposerEngaged)
            }

            // === Layer 7: Top UI (progress bars + header) — ABOVE gesture overlay for hit testing ===
            // min 59pt accounts for Dynamic Island when .statusBarHidden() zeroes safeAreaInsets
            VStack(spacing: 0) {
                StoryProgressBarsView(
                    group: currentGroup,
                    currentIndex: currentStoryIndex,
                    progress: progress
                )
                    .padding(.horizontal, 12)
                    .padding(.top, topInset + 4)

                StoryHeaderView(
                    currentGroup: currentGroup,
                    currentStory: currentStory,
                    isOwnStory: isOwnStory,
                    selectedProfileUser: $selectedProfileUser,
                    editAndRepostAsPostSource: $editAndRepostAsPostSource,
                    showReportSheet: $showReportSheet,
                    makeStoryExternalShareURL: makeStoryExternalShareURL,
                    storyTimeRemaining: storyTimeRemaining,
                    deleteCurrentStory: deleteCurrentStory,
                    repostAsPostDirect: repostAsPostDirect,
                    pauseTimer: pauseTimer,
                    dismissViewer: dismissViewer,
                    reportStory: reportStory,
                    isFullscreenStorySession: $isFullscreenStorySession,
                    chromeVisible: $chromeVisible
                )
                    .padding(.horizontal, 16)
                    .padding(.top, 10)

                Spacer()
            }
            // Width strict — même rationale que le sidebar Layer 8 : le
            // UIViewRepresentable du canvas expanse le ZStack parent ce qui
            // fait sortir le bouton « Fermer » (xmark) du header hors écran
            // (mesuré x=391 r=427 sur viewport 402pt avant ce fix, 2026-05-27).
            .frame(width: geometry.size.width, height: geometry.size.height, alignment: .top)
            .clipped()
            // Glissement vers le HAUT à la disparition + fondu. Le `.offset`
            // négatif fait sortir progress bars + header de l'écran ; on
            // ajoute une opacity 0 pour que l'élément reste totalement
            // invisible lorsqu'il est positionné juste en dehors du safe area
            // (sinon un sliver pixelé peut traîner sur certaines tailles).
            .offset(y: chromeVisible ? 0 : -(topInset + 120))
            .opacity(chromeVisible ? 1 : 0)
            .allowsHitTesting(chromeVisible)
            .animation(.spring(response: 0.32, dampingFraction: 0.78), value: chromeVisible)

            // === Layer 7.5: Floating comments overlay (Instagram-style) ===
            // Rendered BEFORE the sidebar / composer / bigReaction blocks so
            // SwiftUI ZStack z-orders it BENEATH the story controls — user
            // can still tap React / Reply / mute / settings while comments
            // are visible. Background story stays interactable (tap to pause,
            // long-press) through the overlay's transparent surface.
            if showCommentsOverlay {
                makeCommentsOverlay()
                    // Le UIViewRepresentable du canvas expanse le ZStack parent
                    // au-delà du viewport (même cause que Layer 7 header et
                    // Layer 8 sidebar, cf. note ligne ~1024). Sans contrainte de
                    // largeur, l'overlay hérite de cette largeur trop grande et,
                    // le ZStack étant centré, ses rows (padding leading 28)
                    // démarrent à un x négatif → la ligne de commentaire sort du
                    // viewport à gauche (bug user 2026-06-08). On le borne à
                    // geometry.size.width + clipped comme ses voisins.
                    .frame(width: geometry.size.width, height: geometry.size.height, alignment: .bottom)
                    .clipped()
                    .transition(.opacity)
            }

            // === Layer 8: Right action sidebar — centered vertically, right side ===
            // The sidebar is bounded between the header strip (top) and the
            // composer strip (bottom) so its action buttons never slide
            // off-screen on small iPhones (SE, mini). The sidebar itself
            // ships a `ViewThatFits` fallback that switches to a vertical
            // scroller when the bounded height is still too small for the
            // full button stack.
            let topReserved: CGFloat = topInset + 100   // progress bars + header
            let bottomReserved: CGFloat = geometry.safeAreaInsets.bottom + (isOwnStory ? 56 : 96)
            let sidebarMaxHeight = max(180, geometry.size.height - topReserved - bottomReserved)
            HStack {
                Spacer()
                StoryActionSidebarView(
                    isOwnStory: isOwnStory,
                    storyReactionCount: storyReactionCount,
                    storyCurrentUserHasReacted: storyCurrentUserHasReacted,
                    heartBouncePulse: heartBouncePulse,
                    quickEmojis: quickEmojis,
                    onReplyToStory: onReplyToStory,
                    currentStory: currentStory,
                    currentGroup: currentGroup,
                    storyCommentCount: storyCommentCount,
                    storyShareCount: storyShareCount,
                    storyViewCount: storyViewCount,
                    storyRepostCount: storyRepostCount,
                    isStoryCommentsEmpty: isStoryCommentsEmpty,
                    storyHasAudibleSound: storyHasAudibleSound,
                    storyHasTranslatableContent: storyHasTranslatableContent,
                    isGlobalMuted: isGlobalMuted,
                    availableTranslationLanguages: availableTranslationLanguages,
                    onSelectLanguageOverride: onSelectLanguageOverride,
                    showEmojiStrip: $showEmojiStrip,
                    showFullEmojiPicker: $showFullEmojiPicker,
                    showCommentsOverlay: $showCommentsOverlay,
                    showLanguageOptions: $showLanguageOptions,
                    showFullLanguagePicker: $showFullLanguagePicker,
                    showViewersSheet: $showViewersSheet,
                    showExportShareSheet: $showExportShareSheet,
                    isGlobalMutedBinding: $isGlobalMutedBinding,
                    sharedContentWrapper: $sharedContentWrapper,
                    repostStoryComposerSource: $repostStoryComposerSource,
                    isPresented: $isPresented,
                    triggerStoryReaction: triggerStoryReaction,
                    pauseTimer: pauseTimer,
                    loadStoryComments: loadStoryComments
                )
                    .frame(maxHeight: sidebarMaxHeight)
                    // 16pt clears the iPhone Pro rounded-corner radius at the
                    // sidebar's vertical position (mid-screen). 6pt was
                    // visibly too tight — button labels « React », « Répondre »,
                    // « Envoyer », « Son » were clipped on the right
                    // (bug user 2026-05-28 « les elements sortent du viewport »).
                    .padding(.trailing, 16)
            }
            .padding(.top, topReserved)
            .padding(.bottom, bottomReserved)
            // Width strict + clipped — sur iPhone 16 Pro le UIViewRepresentable
            // du canvas expanse le ZStack parent à ~491pt (cf. canvasFitSize
            // doc). Le sidebar à right edge tombait alors hors écran. Cap
            // dur du HStack à `geometry.size.width` + clip pour empêcher
            // tout débordement (bug 2026-05-27). Le Spacer + l'alignement
            // .trailing dans le HStack interne suffisent pour pousser le
            // sidebar VStack au bord droit visible.
            .frame(width: geometry.size.width, height: geometry.size.height, alignment: .trailing)
            .clipped()
            // Glissement vers la DROITE à la disparition + fondu. L'offset
            // de 110pt couvre largement la largeur du chip (max 48pt) + son
            // padding-trailing (6pt) + un peu de marge pour les écrans sans
            // bord arrondi. Hit-testing désactivé en plus de l'opacité 0 pour
            // éviter qu'un tap fantôme atterrisse sur un bouton invisible.
            .offset(x: chromeVisible ? 0 : 110)
            .opacity(chromeVisible ? 1 : 0)
            .allowsHitTesting(chromeVisible)

            // === Layer 9: Big reaction emoji overlay (dramatic burst + float) ===
            if let emoji = bigReactionEmoji {
                Text(emoji)
                    .font(MeeshyFont.relative(100))
                    .scaleEffect(bigReactionPhase == 1 ? 1.5 : (bigReactionPhase == 2 ? 0.5 : 0.05))
                    .opacity(bigReactionPhase == 2 ? 0 : (bigReactionPhase == 1 ? 1 : 0))
                    .offset(y: bigReactionPhase == 2 ? -280 : 0)
                    .rotationEffect(.degrees(bigReactionPhase == 1 ? -6 : (bigReactionPhase == 2 ? 12 : 0)))
                    .shadow(color: .black.opacity(0.3), radius: 20, y: 10)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }

            // NOTE: Live comments overlay (Instagram-style) is rendered by
            // `StoryViewerContentView` as a sibling of the card transform
            // stack — see this file's `StoryViewerContentView.body`.
            // Keeping it inside the card meant it inherited the card's
            // `.offset(x: totalSlideX)`, scale and rotation3D, and shifted
            // left during drag / scale / 3D transitions (bug 2026-05-28).

            // Bottom area: composer + emoji panel / keyboard space
            VStack(spacing: 0) {
                Spacer()

                // **Toujours visible** quand l'utilisateur n'est pas l'auteur
                // de la story (un seul composer pour la story-reply ET la
                // comment-reply — spec user 2026-05-28). Quand l'overlay
                // commentaires est ouvert et qu'on tape « Répondre » sur un
                // commentaire, la reply banner apparaît au-dessus de CETTE
                // rangée de saisie via le binding `replyingToStoryComment`.
                //
                // **Auteur de sa propre story** : pas de composer permanent (on
                // ne répond pas à sa propre story), MAIS il doit pouvoir
                // répondre aux commentaires reçus. Le composer apparaît donc
                // dès que `replyingToStoryComment` est posé (tap « Répondre »
                // dans l'overlay), avec la reply banner, puis se referme à
                // l'envoi (`sendComment` remet le binding à nil) ou à la
                // fermeture de la banner (spec user 2026-06-25).
                if !isOwnStory || replyingToStoryComment != nil {
                    StoryComposerBarView(
                        accentColor: currentGroup?.avatarColor ?? "6366F1",
                        storyId: currentStory?.id,
                        composerLanguage: $composerLanguage,
                        commentEffects: $commentEffects,
                        commentBlurEnabled: $commentBlurEnabled,
                        isComposerEngaged: $isComposerEngaged,
                        showTextEmojiPicker: $showTextEmojiPicker,
                        hasComposerContent: $hasComposerContent,
                        emojiToInject: $emojiToInject,
                        composerFocusTrigger: $composerFocusTrigger,
                        storyDrafts: $storyDrafts,
                        replyingToStoryComment: $replyingToStoryComment,
                        sendComment: sendComment
                    )
                        // Marge latérale 16pt, alignée sur le `sideInset` (16) de
                        // la carte reader (`readerCanvasFraming`) et le
                        // `.padding(.trailing, 16)` du sidebar — même rythme 16pt
                        // pour les trois colonnes de chrome.
                        // (Historique 14 → 20 → 28 : tentatives de rattraper un
                        // bouton d'envoi rogné à droite. La cause réelle n'était
                        // pas la courbure des coins — le composer est ~54pt au-dessus
                        // du bas, où l'arc des coins a déjà reculé — mais le
                        // `maxWidth: .infinity` du bloc, corrigé par le pin de
                        // largeur sur le viewport ci-dessous.)
                        .padding(.horizontal, 16)
                        .simultaneousGesture(
                            DragGesture(minimumDistance: 20, coordinateSpace: .local)
                                .onEnded { value in
                                    // Swipe down on composer → dismiss keyboard & disengage
                                    if value.translation.height > 40 && abs(value.translation.width) < value.translation.height {
                                        dismissComposer()
                                    }
                                }
                        )

                    // Inline emoji keyboard panel (replaces system keyboard)
                    if showTextEmojiPicker {
                        EmojiKeyboardPanel(
                            style: .dark,
                            onSelect: { emoji in
                                emojiToInject = emoji
                            }
                        )
                        .frame(height: max(keyboard.lastKnownHeight - geometry.safeAreaInsets.bottom, 260))
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
            }
            // **CRITIQUE (hauteur)** : `maxHeight: .infinity, alignment: .bottom`
            // force la VStack à remplir la hauteur du canvas ZStack. Sans cela, le
            // `Spacer()` au top collapse à minLength: 0 et la VStack prend sa
            // hauteur intrinsèque (~150pt = composer + emoji panel). Le canvas
            // ZStack parent utilisant `alignment: .center`, une VStack courte se
            // faisait CENTRER verticalement dans le canvas 874pt → composer
            // apparaissait à y≈360pt au lieu de y≈760pt en bas (bug user
            // 2026-05-28 « le composeur est rogné au lieu d'être bien aligné »).
            //
            // **CRITIQUE (largeur)** : `maxWidth: geometry.size.width` (et NON
            // `.infinity`) borne la proposition de largeur du bloc au viewport réel.
            // Le canvas UIViewRepresentable gonfle la largeur intrinsèque du ZStack
            // parent au-delà de l'écran (~480pt vs 402pt sur iPhone 16 Pro) ; avec
            // `.infinity` le composer remplissait ces ~480pt et son bouton d'envoi
            // sortait à droite de l'écran (bug user 2026-06-03). Borné au viewport,
            // le bloc se cadre sur l'écran réel et reste centré — même principe que
            // le pin `.frame(width: geometry.size.width)` du header (L1013) et du
            // sidebar (L1099).
            .frame(maxWidth: geometry.size.width, maxHeight: .infinity, alignment: .bottom)
            .padding(.bottom, composerBottomPadding(geometry))
            .animation(.easeInOut(duration: 0.25), value: keyboard.height)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showTextEmojiPicker)
            // Glissement vers le BAS à la disparition + fondu. L'offset 240pt
            // couvre l'ensemble composer + picker emoji + safe area inférieure
            // pour les iPhones les plus grands ; le composant étant ancré
            // bottom via `Spacer()`, c'est suffisant pour le sortir totalement
            // du viewport. Hit-testing OFF en plus pour ne pas intercepter
            // les taps même invisible.
            .offset(y: chromeVisible ? 0 : 240)
            .opacity(chromeVisible ? 1 : 0)
            .allowsHitTesting(chromeVisible)

            // Full emoji picker — REACTIONS ONLY (sends via API)
            if showFullEmojiPicker {
                EmojiFullPickerSheet(
                    style: .dark,
                    onReact: { emoji in
                        triggerStoryReaction(emoji)
                    },
                    onDismiss: {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showFullEmojiPicker = false
                        }
                    }
                )
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .zIndex(100)
            }

            // === Layer 10: Full Language Picker overlay (transparent — story stays visible) ===
            if showFullLanguagePicker {
                LanguagePickerSheet(style: .dark) { lang in
                    LanguageUsageTracker.recordUsage(languageId: lang.id)
                    // Prisme « Exploration » : affiche immédiatement dans la langue choisie
                    // (override prépendu à la chaine) ; la traduction est demandée si absente
                    // et le reader se re-rend dès son arrivée.
                    onSelectLanguageOverride(lang.id)
                    guard let story = currentStory else { return }
                    Task {
                        await StoryInteractionService().requestTranslation(
                            storyId: story.id,
                            targetLanguage: lang.id
                        )
                    }
                } onDismiss: {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showFullLanguagePicker = false
                    }
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .zIndex(150)
            }
        }
        // Lock the entire story canvas (background + reader + overlays +
        // sidebar + composer) to EXACTLY the viewport size we were handed
        // in `geometry`. Without this, any child with an intrinsic size
        // bigger than the proposed size — a long translated text line, a
        // foreground media at natural pixel size, a 100pt big-reaction
        // emoji during animation — silently grows the enclosing ZStack
        // and pushes the right-side action sidebar (and bottom composer)
        // off-screen, making them untappable. `.clipped()` discards
        // anything that still tries to draw past the bounds rather than
        // letting it leak into adjacent UI.
        .frame(width: geometry.size.width, height: geometry.size.height, alignment: .center)
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
            try? await Task.sleep(for: .milliseconds(200))
            guard !Task.isCancelled else { return }
            if slideContentProgress < 0.20 {
                withAnimation(.easeIn(duration: 0.2)) {
                    showProgressOverlay = true
                }
            }
        }
    }

    // MARK: - Story Background

    /// `true` quand la slide courante a un vrai fond média (image/vidéo) : le canvas
    /// peint alors ce média plein cadre et le `storyBlurredBackdrop` (Layer 1.5) habille
    /// les letterbox d'un flou DÉRIVÉ du média. Dans ce cas le fond de canvas couleur/gradient
    /// (`storyBackground`, Layer 1) est redondant — pire, il bleed (~15 %) derrière le backdrop
    /// semi-transparent, teintant le média d'un voile indigo parasite. On le neutralise en noir
    /// (user 2026-06-03 : « le reader/preview ne doit pas afficher de fond de canvas quand le fond
    /// est déjà une image/vidéo »).
    private var currentSlideHasMediaBackground: Bool {
        guard let story = currentStory else { return false }
        return renderableSlideCache.slide(for: story, chain: resolvedViewerLanguageChain)
            .effects.hasVisualBackgroundMedia
    }

    private var storyBackground: some View {
        Group {
            if currentSlideHasMediaBackground {
                // Fond média (image/vidéo) : aucun fond de canvas synthétique. Noir immersif
                // sous le backdrop flou dérivé du média (pas de bleed couleur/gradient).
                Color.black
            } else if let bg = currentStory?.storyEffects?.background {
                if bg.hasPrefix("gradient:") {
                    let colors = bg.replacingOccurrences(of: "gradient:", with: "").split(separator: ",").map { String($0) }
                    LinearGradient(
                        colors: colors.map { Color(hex: $0) },
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                } else {
                    Color(hex: bg)
                }
            } else {
                LinearGradient(
                    colors: [MeeshyColors.indigo950, MeeshyColors.indigo900, Color(hex: "24243E")],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }

    // MARK: - Blurred backdrop (letterbox au-dessus/en dessous du canvas 9:16)

    /// Habille les bandes letterbox d'un blur du contenu story.
    /// Cascade de sources (priorité descendante) :
    ///   1. `slide.effects.thumbHash` — thumbHash explicite côté slide
    ///   2. `media[backgroundId].thumbHash` — thumbHash du média de fond
    ///      (couvre les vidéos uploadées qui portent leur thumbHash côté
    ///      `FeedMedia` plutôt que sur le slide composite)
    ///   3. Color.clear → le `storyBackground` gradient indigo se voit dans
    ///      les bandes (fallback graceful, jamais de rectangle noir)
    ///
    /// Décodage ThumbHash < 0.5 ms (16×16 → upscaled), blur GPU SwiftUI < 1 ms.
    @ViewBuilder
    private func storyBlurredBackdrop(for story: StoryItem?) -> some View {
        if let img = resolvedBackdropImage(for: story) {
            Image(uiImage: img)
                .resizable()
                .scaledToFill()
                .blur(radius: 60)
                .scaleEffect(1.18)
                .opacity(0.85)
        } else {
            Color.clear
        }
    }

    /// Résout l'image-source du backdrop selon la cascade documentée plus haut.
    /// Retourne `nil` si aucune source exploitable n'existe (Color.clear path).
    private func resolvedBackdropImage(for story: StoryItem?) -> UIImage? {
        guard let story else { return nil }
        let slide = renderableSlideCache.slide(for: story, chain: resolvedViewerLanguageChain)
        // (1) thumbHash slide-level
        if let hash = slide.effects.thumbHash,
           !hash.isEmpty,
           let img = UIImage.fromThumbHash(hash) {
            return img
        }
        // (2) thumbHash du media de fond — typique pour vidéo uploadée
        let bgMediaId: String? = {
            if let bg = slide.effects.resolvedBackgroundMedia {
                return bg.postMediaId
            }
            // Fallback historique : premier média si pas de canvas mediaObjects
            if (slide.effects.mediaObjects ?? []).isEmpty {
                return story.media.first?.id
            }
            return nil
        }()
        if let bgMediaId,
           let media = story.media.first(where: { $0.id == bgMediaId }),
           let mediaHash = media.thumbHash,
           !mediaHash.isEmpty,
           let img = UIImage.fromThumbHash(mediaHash) {
            return img
        }
        return nil
    }

    // MARK: - Background Audio Badge

    private func backgroundAudioBadge(audio: StoryBackgroundAudioEntry) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "music.note")
                .font(MeeshyFont.relative(11, weight: .semibold))
            Text(audio.title)
                .font(MeeshyFont.relative(12, weight: .medium))
                .lineLimit(1)
                .truncationMode(.tail)
            if let uploader = audio.uploaderName {
                Text("· \(uploader)")
                    .font(MeeshyFont.relative(11))
                    .opacity(0.7)
                    .lineLimit(1)
            }
        }
        .foregroundColor(.white)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay(Capsule().fill(Color.black.opacity(0.35)))
        )
    }

    // MARK: - Translation Badge

    private var translationBadge: some View {
        HStack(spacing: 4) {
            Image(systemName: "translate")
                .font(MeeshyFont.relative(10, weight: .semibold))
            if let lang = resolvedViewerLanguage {
                Text(lang.uppercased())
                    .font(MeeshyFont.relative(9, weight: .bold, design: .monospaced))
            }
        }
        .foregroundColor(.white.opacity(0.8))
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay(Capsule().fill(Color.black.opacity(0.3)))
        )
    }
}

// MARK: - Story Viewer Content

/// Root canvas of the story viewer: opaque black base, offscreen prefetcher
/// host, and the geometry-wrapped story card with its transform stack and
/// lifecycle modifiers. Extracted from `StoryViewerView.viewerContent`
/// (formerly an `AnyView`) so the whole subtree is its own type-metadata
/// unit instead of inflating `StoryViewerView.body`'s opaque type.
struct StoryViewerContentView: View {
    let prefetcher: StoryReaderPrefetcher
    let isPreviewMode: Bool

    // Card transform inputs
    let cardScale: CGFloat
    let cardCornerRadius: CGFloat
    let cardOpacity: Double
    let cardOffsetY: CGFloat
    let totalSlideX: CGFloat
    let slideProgress: CGFloat
    let dragProgress: CGFloat

    // Cube inter-groupes (Lot 3) : aperçu statique léger du groupe voisin
    // rendu comme seconde face pendant le drag horizontal / le commit.
    let neighborGroup: StoryGroup?
    let neighborEntryStory: StoryItem?
    let neighborDirection: Int

    @Binding var isPresented: Bool

    /// Builds the story card for the supplied geometry. The closure is owned by
    /// `StoryViewerView` so the card receives the view's `@State` bindings.
    let makeStoryCard: (GeometryProxy) -> StoryCardView

    var body: some View {
        ZStack {
            // Opaque black base — prevents any white frame bleed
            Color.black.ignoresSafeArea()

            // === P3 wire-up : offscreen prefetcher host ===
            PrefetcherHostView(prefetcher: prefetcher)
                .frame(width: 1, height: 1)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
                .zIndex(-1000)

            GeometryReader { geometry in
                ZStack {
                    // The story card with all transforms layered.
                    // Pin to geometry size BEFORE applying scale/clip — the
                    // story canvas itself (`StoryCardView`) hard-frames its
                    // body, and we double-down here so neither the
                    // `scaleEffect` nor any unexpected intrinsic content
                    // size can leak beyond the viewport's actual bounds.
                    // Vrai cube inter-groupes (Lot 3) : angle proportionnel à
                    // la position écran, anchor sur l'arête intérieure — les
                    // deux faces (carte sortante + aperçu voisin) tournent
                    // autour de l'arête commune. À 90° la face est de profil :
                    // le swap de contenu au commit y est invisible.
                    let cubeWidth = max(geometry.size.width, 1)
                    makeStoryCard(geometry)
                        .frame(width: geometry.size.width, height: geometry.size.height)
                        .scaleEffect(cardScale * (1.0 - slideProgress * 0.08))
                        .clipShape(RoundedRectangle(cornerRadius: cardCornerRadius + slideProgress * 16, style: .continuous))
                        .opacity(cardOpacity)
                        .offset(x: totalSlideX, y: cardOffsetY)
                        .rotation3DEffect(
                            .degrees(Double(totalSlideX / cubeWidth) * 90.0),
                            axis: (x: 0, y: 1, z: 0),
                            anchor: totalSlideX > 0 ? .leading : .trailing,
                            perspective: 0.5
                        )
                        .shadow(
                            color: .black.opacity(dragProgress > 0.05 || slideProgress > 0.02 ? 0.5 : 0),
                            radius: 40, y: 15
                        )

                    if let neighbor = neighborGroup, neighborDirection != 0 {
                        let incomingX = totalSlideX + (neighborDirection == 1 ? cubeWidth : -cubeWidth)
                        NeighborGroupCubeFace(group: neighbor, entryStory: neighborEntryStory)
                            .frame(width: geometry.size.width, height: geometry.size.height)
                            .clipShape(RoundedRectangle(cornerRadius: cardCornerRadius + slideProgress * 16, style: .continuous))
                            .offset(x: incomingX, y: cardOffsetY)
                            .rotation3DEffect(
                                .degrees(Double(incomingX / cubeWidth) * 90.0),
                                axis: (x: 0, y: 1, z: 0),
                                anchor: incomingX > 0 ? .leading : .trailing,
                                perspective: 0.5
                            )
                            .allowsHitTesting(false)
                            .accessibilityHidden(true)
                    }

                    // Bouton ✕ uniquement en preview mode
                    if isPreviewMode {
                        VStack {
                            HStack {
                                Button {
                                    isPresented = false
                                } label: {
                                    Image(systemName: "xmark")
                                        .font(MeeshyFont.relative(16, weight: .semibold))
                                        .foregroundColor(.white)
                                        .frame(width: 36, height: 36)
                                        .background(Circle().fill(Color.black.opacity(0.5)))
                                }
                                .accessibilityLabel(String(localized: "story.viewer.close", defaultValue: "Close story", bundle: .main))
                                .padding(.leading, 16)
                                .padding(.top, max(geometry.safeAreaInsets.top, 59) + 4)
                                Spacer()
                            }
                            Spacer()
                        }
                    }

                }
            }
        }
    }
}

// MARK: - Neighbor Group Cube Face (Lot 3)

/// Face entrante du cube inter-groupes : aperçu statique LÉGER du groupe
/// voisin (thumbHash flouté du slide d'entrée + avatar + nom) — jamais une
/// seconde `StoryCardView` interactive (les états du viewer sont mono-slide,
/// et rendre deux piles complètes pendant un geste 60-120 Hz coûterait un
/// frame budget entier). Parité reels : la face entrante est un rendu du
/// média, le swap vers la vraie carte se fait au commit, masqué par l'arête
/// à 90°. Le vrai canvas du voisin est déjà chaud (prefetch inter-groupes),
/// donc la première frame réelle suit instantanément.
struct NeighborGroupCubeFace: View {
    let group: StoryGroup
    let entryStory: StoryItem?

    private var backdrop: UIImage? {
        guard let story = entryStory else { return nil }
        if let hash = story.storyEffects?.thumbHash, !hash.isEmpty,
           let img = UIImage.fromThumbHash(hash) {
            return img
        }
        if let hash = story.media.first(where: { $0.thumbHash?.isEmpty == false })?.thumbHash,
           let img = UIImage.fromThumbHash(hash) {
            return img
        }
        return nil
    }

    var body: some View {
        ZStack {
            if let img = backdrop {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
                    .blur(radius: 24)
                    .scaleEffect(1.1)
            } else {
                LinearGradient(
                    colors: [MeeshyColors.indigo950, MeeshyColors.indigo900],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
            Color.black.opacity(0.35)
            VStack(spacing: 12) {
                MeeshyAvatar(
                    name: group.username,
                    context: .storyTray,
                    accentColor: group.avatarColor,
                    avatarURL: group.avatarURL,
                    storyState: group.hasUnviewed ? .unread : .read
                )
                Text(group.username)
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundColor(.white)
            }
        }
        .clipped()
        .accessibilityHidden(true)
    }
}
