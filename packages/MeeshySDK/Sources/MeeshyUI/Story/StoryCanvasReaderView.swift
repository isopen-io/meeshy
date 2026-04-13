import SwiftUI
import PencilKit
import AVKit
import Combine
import MeeshySDK

/// Notification envoyée par le viewer pour déclencher le fade-out audio (2s avant la fin du slide).
public extension Notification.Name {
    static let storyAudioFadeOut = Notification.Name("storyAudioFadeOut")
    /// Envoyée par le composer pour muter/démuter les sons du canvas (ex: pendant la preview).
    static let storyComposerMuteCanvas = Notification.Name("storyComposerMuteCanvas")
    static let storyComposerUnmuteCanvas = Notification.Name("storyComposerUnmuteCanvas")
    /// Envoyée par la timeline quand le playback démarre/s'arrête dans le composer.
    static let timelineDidStartPlaying = Notification.Name("timelineDidStartPlaying")
    static let timelineDidStopPlaying = Notification.Name("timelineDidStopPlaying")
}

/// Reconstruit pixel-perfect le canvas d'une story (lecture seule).
/// Symétrique de StoryCanvasView (Composer) mais sans interactions.
/// Utilisé par StoryViewerView pour le rendu fidèle.
public struct StoryCanvasReaderView: View {
    public let story: StoryItem
    public let preferredLanguage: String?
    /// Assets préchargés localement (mode preview — avant publication).
    /// En mode viewer normal, ces dicts sont vides et les URLs sont résolues depuis story.media.
    public let preloadedImages: [String: UIImage]
    public let preloadedVideoURLs: [String: URL]
    public let preloadedAudioURLs: [String: URL]

    // Mutable local state managed by a StateObject to support socket updates
    @StateObject private var state: ReaderState

    public init(story: StoryItem, preferredLanguage: String? = nil,
                preloadedImages: [String: UIImage] = [:],
                preloadedVideoURLs: [String: URL] = [:],
                preloadedAudioURLs: [String: URL] = [:]) {
        self.story = story
        self.preferredLanguage = preferredLanguage
        self.preloadedImages = preloadedImages
        self.preloadedVideoURLs = preloadedVideoURLs
        self.preloadedAudioURLs = preloadedAudioURLs
        self._state = StateObject(wrappedValue: ReaderState(story: story))
    }

    /// Computes the largest 9:16 canvas that fits within the available space.
    public static func canvasSize(fitting available: CGSize) -> CGSize {
        let targetRatio: CGFloat = 9.0 / 16.0
        if available.width / available.height < targetRatio {
            return CGSize(width: available.width, height: available.width / targetRatio)
        } else {
            return CGSize(width: available.height * targetRatio, height: available.height)
        }
    }

    public var body: some View {
        GeometryReader { geo in
            let canvas = Self.canvasSize(fitting: geo.size)
            ZStack {
                backgroundLayer
                backgroundMediaLayer
                filterOverlay
                drawingLayer
                stickerLayer(size: canvas)
                textLayer(size: canvas)
                textObjectsLayer(size: canvas)
                foregroundMediaLayer
                foregroundAudioLayer
            }
            .frame(width: canvas.width, height: canvas.height)
            .clipped()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .task {
            await state.loadForegroundImages(story: story, preloadedImages: preloadedImages)
        }
        .onAppear {
            // StoryMediaCoordinator.activate() configures AVAudioSession
            StoryMediaCoordinator.shared.activate { [weak state] in
                state?.stopAllMedia()
            }
            state.startPlaybackTimer()
            state.startMuteObservers()
            state.startBackgroundAudio(
                effects: story.storyEffects,
                story: story,
                userLang: preferredLanguage ?? "fr"
            )
            state.startForegroundVideos(story: story, preloadedVideoURLs: preloadedVideoURLs)
            state.startForegroundAudios(story: story, preloadedAudioURLs: preloadedAudioURLs)
            state.subscribeToTranslationUpdates(postId: story.id)
        }
        .onDisappear {
            StoryMediaCoordinator.shared.deactivate()
            state.stopMuteObservers()
            state.stopAllMedia()
            // AVAudioSession deactivation handled by StoryMediaCoordinator.deactivate()
            // — not here, to avoid interrupting audio during story cross-transitions
        }
    }

    // MARK: - Background (gradient/color)

    @ViewBuilder
    private var backgroundLayer: some View {
        if let bg = story.storyEffects?.background {
            if bg.hasPrefix("gradient:") {
                let colors = bg.replacingOccurrences(of: "gradient:", with: "")
                    .split(separator: ",").map { Color(hex: String($0)) }
                LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                Color(hex: bg)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        } else if let avgColor = state.thumbHashAverageColor {
            Color(avgColor)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            LinearGradient(
                colors: [Color(hex: "1A1A2E"), Color(hex: "0F3460")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    // MARK: - Background Media (image/vidéo de fond depuis storyEffects.mediaObjects)

    private var bgTransformScale: CGFloat { story.storyEffects?.backgroundTransform?.scale ?? 1.0 }
    private var bgTransformOffsetX: CGFloat { story.storyEffects?.backgroundTransform?.offsetX ?? 0 }
    private var bgTransformOffsetY: CGFloat { story.storyEffects?.backgroundTransform?.offsetY ?? 0 }
    private var bgTransformRotation: Double { story.storyEffects?.backgroundTransform?.rotation ?? 0 }

    /// Resolves the best available thumbHash for this story's background media.
    private var resolvedThumbHash: String? {
        story.storyEffects?.thumbHash ?? story.media.first?.thumbHash
    }

    @ViewBuilder
    private var backgroundMediaLayer: some View {
        if let bgMedia = story.storyEffects?.mediaObjects?.first(where: { $0.placement == "background" }) {
            if bgMedia.mediaType == "image" {
                if let urlStr = mediaURL(for: bgMedia.postMediaId) {
                    let thumbHash = story.media.first(where: { $0.id == bgMedia.postMediaId })?.thumbHash ?? resolvedThumbHash
                    backgroundImageView(urlStr: urlStr, thumbHash: thumbHash)
                }
            } else if bgMedia.mediaType == "video" {
                if let urlStr = mediaURL(for: bgMedia.postMediaId),
                   let url = MeeshyConfig.resolveMediaURL(urlStr) {
                    let player = state.ensureBackgroundVideoPlayer(url: url, muted: true)
                    BareVideoLayer(player: player)
                        .bgTransform(scale: bgTransformScale, offsetX: bgTransformOffsetX, offsetY: bgTransformOffsetY, rotation: bgTransformRotation)
                }
            }
        } else if let preloadedBg = preloadedImages[story.id] {
            Image(uiImage: preloadedBg)
                .resizable()
                .scaledToFill()
                .bgTransform(scale: bgTransformScale, offsetX: bgTransformOffsetX, offsetY: bgTransformOffsetY, rotation: bgTransformRotation)
        } else if let legacyMedia = story.media.first,
                  let urlStr = legacyMedia.url,
                  (story.storyEffects?.mediaObjects ?? []).isEmpty {
            if legacyMedia.type == .video, let url = MeeshyConfig.resolveMediaURL(urlStr) {
                let player = state.ensureBackgroundVideoPlayer(url: url)
                BareVideoLayer(player: player)
                    .bgTransform(scale: bgTransformScale, offsetX: bgTransformOffsetX, offsetY: bgTransformOffsetY, rotation: bgTransformRotation)
            } else {
                backgroundImageView(urlStr: urlStr, thumbHash: legacyMedia.thumbHash ?? resolvedThumbHash)
            }
        }
    }

    /// Renders a background image with instant thumbHash placeholder fallback.
    /// Priority: L1/L2 cached image (instant) > ProgressiveCachedImage (thumbHash -> full).
    @ViewBuilder
    private func backgroundImageView(urlStr: String, thumbHash: String?) -> some View {
        // Resolve URL once — avoids double parsing in ProgressiveCachedImage init
        let resolved = MeeshyConfig.resolveMediaURL(urlStr)?.absoluteString ?? urlStr
        if let cached = DiskCacheStore.cachedImage(for: resolved) {
            Image(uiImage: cached)
                .resizable()
                .scaledToFill()
                .bgTransform(scale: bgTransformScale, offsetX: bgTransformOffsetX, offsetY: bgTransformOffsetY, rotation: bgTransformRotation)
        } else {
            ProgressiveCachedImage(thumbHash: thumbHash, thumbnailUrl: nil, fullUrl: resolved) {
                if let img = state.thumbHashImage {
                    Image(uiImage: img)
                        .resizable()
                        .interpolation(.low)
                } else {
                    Color.clear
                }
            }
            .scaledToFill()
            .bgTransform(scale: bgTransformScale, offsetX: bgTransformOffsetX, offsetY: bgTransformOffsetY, rotation: bgTransformRotation)
        }
    }

    // MARK: - Filter overlay

    @ViewBuilder
    private var filterOverlay: some View {
        if let filter = story.storyEffects?.parsedFilter {
            filterView(filter)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .allowsHitTesting(false)
        }
    }

    @ViewBuilder
    private func filterView(_ filter: StoryFilter) -> some View {
        switch filter {
        case .vintage:
            Color.orange.opacity(0.15).blendMode(.multiply)
        case .bw:
            Color.gray.opacity(0.001)
        case .warm:
            Color.orange.opacity(0.08).blendMode(.softLight)
        case .cool:
            Color.blue.opacity(0.08).blendMode(.softLight)
        case .dramatic:
            Color.black.opacity(0.2).blendMode(.multiply)
        }
    }

    // MARK: - Drawing overlay (readonly)

    @ViewBuilder
    private var drawingLayer: some View {
        if let drawingData = story.storyEffects?.drawingData {
            DrawingOverlayView(
                drawingData: .constant(drawingData),
                isActive: .constant(false),
                canvasView: .constant(state.canvas),
                toolColor: .constant(.white),
                toolWidth: .constant(5),
                toolType: .constant(.pen)
            )
            .allowsHitTesting(false)
        }
    }

    // MARK: - Legacy text (format pré-textObjects — affiché seulement si textObjects vide)

    @ViewBuilder
    private func textLayer(size: CGSize) -> some View {
        if state.textObjects.isEmpty {
            let resolvedContent = story.resolvedContent(preferredLanguage: preferredLanguage)
            if let content = resolvedContent, !content.isEmpty {
                let effects = story.storyEffects
                let pos = effects?.resolvedTextPosition ?? .center
                styledText(content: content, effects: effects, size: size)
                    .position(x: pos.x * size.width, y: pos.y * size.height)
            }
        }
    }

    private func styledText(content: String, effects: StoryEffects?, size: CGSize) -> some View {
        let fontSize = effects?.textSize ?? 28
        let colorHex = effects?.textColor ?? "FFFFFF"
        let alignment: TextAlignment = {
            switch effects?.textAlign {
            case "left":  return .leading
            case "right": return .trailing
            default:      return .center
            }
        }()
        let textStyle = effects?.parsedTextStyle

        return Text(content)
            .font(storyFont(for: textStyle, size: fontSize))
            .foregroundColor(Color(hex: colorHex))
            .multilineTextAlignment(alignment)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Group {
                    if effects?.textBg != nil {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.black.opacity(0.5))
                    }
                }
            )
            .shadow(color: textStyle == .neon ? Color(hex: colorHex).opacity(0.6) : .clear, radius: 10)
            .frame(maxWidth: size.width * 0.75)
    }

    // MARK: - Text Objects Layer (multi-texte avec styles per-objet + traductions + timing)

    @ViewBuilder
    private func textObjectsLayer(size: CGSize) -> some View {
        let lang = preferredLanguage ?? "fr"
        let time = state.currentTime
        ForEach(state.textObjects) { obj in
            let opacity = state.textObjectOpacity(for: obj, at: time)
            if opacity > 0 {
                let content = resolvedText(for: obj, userLang: lang)
                let style = obj.parsedTextStyle
                let colorHex = obj.textColor ?? "FFFFFF"
                let fontSize = obj.resolvedSize
                let alignment: TextAlignment = {
                    switch obj.textAlign {
                    case "left": return .leading
                    case "right": return .trailing
                    default: return .center
                    }
                }()
                Text(content)
                    .font(storyFont(for: style, size: fontSize))
                    .foregroundColor(Color(hex: colorHex))
                    .multilineTextAlignment(alignment)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        Group {
                            if obj.hasBg {
                                RoundedRectangle(cornerRadius: 8)
                                    .fill(Color.black.opacity(0.5))
                            }
                        }
                    )
                    .shadow(color: style == .neon ? Color(hex: colorHex).opacity(0.6) : .clear, radius: 10)
                    .frame(maxWidth: size.width * 0.75)
                    .scaleEffect(obj.scale)
                    .opacity(opacity)
                    .rotationEffect(.degrees(obj.rotation))
                    .position(x: obj.x * size.width, y: obj.y * size.height)
                    .allowsHitTesting(false)
                    .animation(.easeInOut(duration: 0.15), value: opacity)
            }
        }
    }

    // MARK: - Stickers (positions exactes normalisées)

    @ViewBuilder
    private func stickerLayer(size: CGSize) -> some View {
        if let stickers = story.storyEffects?.stickerObjects, !stickers.isEmpty {
            ForEach(stickers) { sticker in
                Text(sticker.emoji)
                    .font(.system(size: 50 * sticker.scale))
                    .rotationEffect(.degrees(sticker.rotation))
                    .position(
                        x: sticker.x * size.width,
                        y: sticker.y * size.height
                    )
                    .allowsHitTesting(false)
            }
        } else if let emojiStrings = story.storyEffects?.stickers, !emojiStrings.isEmpty {
            // Fallback: stickers stockés en tableau de strings (format legacy)
            HStack(spacing: 12) {
                ForEach(Array(emojiStrings.enumerated()), id: \.offset) { _, emoji in
                    Text(emoji).font(.system(size: 44))
                }
            }
            .position(x: size.width / 2, y: size.height * 0.75)
            .allowsHitTesting(false)
        }
    }

    // MARK: - Foreground Media Layer (timing-aware visibility + volume fade)

    @ViewBuilder
    private var foregroundMediaLayer: some View {
        let time = state.currentTime
        ForEach(story.storyEffects?.mediaObjects?.filter { $0.placement == "foreground" } ?? []) { media in
            let visible = state.mediaObjectVisible(media, at: time)
            if visible {
                DraggableMediaView(
                    mediaObject: .constant(media),
                    image: state.loadedImages[media.id],
                    videoURL: media.mediaType == "video"
                        ? mediaURL(for: media.postMediaId).flatMap { MeeshyConfig.resolveMediaURL($0) }
                        : nil,
                    externalPlayer: media.mediaType == "video" ? state.foregroundVideoPlayers[media.id] : nil,
                    isEditing: false
                )
                .opacity(state.mediaObjectOpacity(for: media, at: time))
                .animation(.easeInOut(duration: 0.15), value: state.mediaObjectOpacity(for: media, at: time))
            }
        }
    }

    // MARK: - Foreground Audio Layer (timing-aware visibility)

    @ViewBuilder
    private var foregroundAudioLayer: some View {
        let time = state.currentTime
        ForEach(story.storyEffects?.audioPlayerObjects?.filter { $0.placement == "foreground" } ?? []) { audio in
            let visible = state.audioObjectVisible(audio, at: time)
            if visible {
                StoryAudioPlayerView(
                    audioObject: .constant(audio),
                    url: resolvedAudioURL(for: audio),
                    isEditing: false
                )
                .opacity(state.audioObjectOpacity(for: audio, at: time))
                .animation(.easeInOut(duration: 0.15), value: state.audioObjectOpacity(for: audio, at: time))
            }
        }
    }

    // MARK: - Helpers

    private func resolvedText(for obj: StoryTextObject, userLang: String) -> String {
        obj.translations?[userLang]
            ?? obj.translations?["en"]
            ?? obj.content
    }

    /// Résout l'URL d'un media par son postMediaId depuis les médias legacy du StoryItem.
    private func mediaURL(for postMediaId: String) -> String? {
        story.media.first { $0.id == postMediaId }?.url
    }

    /// Résout l'URL audio foreground : preloaded (preview) > story.media (viewer normal).
    private func resolvedAudioURL(for audio: StoryAudioPlayerObject) -> URL? {
        if let url = preloadedAudioURLs[audio.id] { return url }
        guard let urlStr = story.media.first(where: { $0.id == audio.postMediaId })?.url else { return nil }
        return MeeshyConfig.resolveMediaURL(urlStr)
    }
}

// MARK: - ReaderState (gestion lifecycle, audio de fond, socket updates, timing)

// MARK: - Background Transform Modifier (eliminates 6x duplication)

private extension View {
    func bgTransform(scale: CGFloat, offsetX: CGFloat, offsetY: CGFloat, rotation: Double) -> some View {
        self
            .scaleEffect(scale)
            .offset(x: offsetX, y: offsetY)
            .rotationEffect(.degrees(rotation))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()
    }
}

@MainActor
private final class ReaderState: ObservableObject {
    @Published var textObjects: [StoryTextObject]
    @Published var loadedImages: [String: UIImage] = [:]
    /// Players vidéo foreground — un par média, démarrés selon leur startTime.
    @Published var foregroundVideoPlayers: [String: AVPlayer] = [:]
    /// Elapsed time since playback started (seconds). Drives timing-based visibility.
    @Published var currentTime: TimeInterval = 0
    let canvas = PKCanvasView()

    private var backgroundPlayer: AVPlayer?
    private var backgroundVideoPlayer: AVPlayer?
    private var backgroundVideoLooper: AVPlayerLooper?
    private var loopObserver: NSObjectProtocol?
    private var foregroundLoopers: [String: AVPlayerLooper] = [:]
    private var foregroundLoopObservers: [String: NSObjectProtocol] = [:]
    private var foregroundStopTimers: [String: Timer] = [:]
    private var foregroundAudioPlayers: [String: AVPlayer] = [:]
    private var foregroundAudioObservers: [String: NSObjectProtocol] = [:]
    private var foregroundAudioStopTimers: [String: Timer] = [:]
    /// KVO observers for player readyToPlay — must be stored to avoid premature dealloc
    private var readyObservers: [String: NSKeyValueObservation] = [:]
    private var cancellables = Set<AnyCancellable>()
    private var fadeTimer: Timer?
    private var playbackTimer: Timer?
    /// Volume cible défini par l'utilisateur pour l'audio de fond.
    private var targetBackgroundVolume: Float = 0.5
    /// Tracks which foreground videos have already been started (to avoid re-triggering).
    private var startedForegroundVideos: Set<String> = []
    /// Tracks which foreground audios have already been started.
    private var startedForegroundAudios: Set<String> = []
    /// Stores media objects for timing-based scheduling of foreground videos.
    private var pendingVideoStarts: [String: (url: URL, media: StoryMediaObject)] = [:]
    /// Stores audio objects for timing-based scheduling of foreground audios.
    private var pendingAudioStarts: [String: (url: URL, audio: StoryAudioPlayerObject)] = [:]
    /// Reference to the current story, used to compute audio-vs-video timing for looping.
    private var currentStoryRef: StoryItem?
    /// Active fade-volume timers (Issue 5: must be tracked to invalidate on cleanup).
    private var fadeTimers: [Timer] = []
    /// Observer token for storyAudioFadeOut notification (Issue 6: must be removed on cleanup).
    private var fadeOutObserver: NSObjectProtocol?

    // MARK: - Audio Ducking State
    /// Number of foreground audio/video players currently producing sound.
    /// When > 0, background audio is ducked to 30% of target volume.
    private var activeForegroundSoundCount = 0
    private var isDucked = false
    private let duckRatio: Float = 0.3
    private let duckFadeDuration: TimeInterval = 0.4

    /// Pre-decoded thumbHash placeholder (< 1ms decode). Available from the first frame.
    let thumbHashImage: UIImage?
    /// Average color extracted from thumbHash (< 0.01ms). Ultra-instant background tint.
    let thumbHashAverageColor: UIColor?

    init(story: StoryItem) {
        // Migrate legacy text -> textObjects si necessaire
        var objects = story.storyEffects?.textObjects ?? []
        if objects.isEmpty, let content = story.content, !content.isEmpty {
            var effects = story.storyEffects ?? StoryEffects()
            effects.migrateLegacyText(content: content)
            objects = effects.textObjects ?? []
        }
        self.textObjects = objects

        // Pre-decode thumbHash for instant placeholder display
        let hash = story.storyEffects?.thumbHash ?? story.media.first?.thumbHash
        self.thumbHashImage = hash.flatMap { UIImage.fromThumbHash($0) }
        self.thumbHashAverageColor = hash.flatMap { UIImage.thumbHashAverageColor($0) }

        fadeOutObserver = NotificationCenter.default.addObserver(forName: .storyAudioFadeOut, object: nil, queue: .main) { [weak self] _ in
            self?.fadeOutThenStop()
        }
    }

    // MARK: Playback timer (drives element timing)

    private var playbackStartDate: Date?

    func startPlaybackTimer() {
        currentTime = 0
        playbackStartDate = Date()
        playbackTimer?.invalidate()
        // Use wall-clock elapsed time instead of accumulating +0.05 per tick.
        // Timer.scheduledTimer is not guaranteed to fire at exact intervals —
        // accumulating 0.05 causes 0.5-1.5s drift over a 30s story.
        playbackTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, let start = self.playbackStartDate else { return }
                self.currentTime = Date().timeIntervalSince(start)
                self.checkPendingVideoStarts()
                self.checkPendingAudioStarts()
            }
        }
    }

    func stopPlaybackTimer() {
        playbackTimer?.invalidate()
        playbackTimer = nil
    }

    // MARK: Text object timing

    func textObjectOpacity(for obj: StoryTextObject, at time: TimeInterval) -> Double {
        let start = TimeInterval(obj.startTime ?? 0)
        let fadeInDur = TimeInterval(obj.fadeIn ?? 0)
        let fadeOutDur = TimeInterval(obj.fadeOut ?? 0)

        // No timing fields at all -> always visible (backward compatible)
        guard obj.startTime != nil || obj.displayDuration != nil else { return 1.0 }

        // Before start time -> invisible
        if time < start { return 0.0 }

        let elapsed = time - start

        // During fade-in
        if fadeInDur > 0, elapsed < fadeInDur {
            return min(1.0, elapsed / fadeInDur)
        }

        // Check display duration
        if let displayDur = obj.displayDuration {
            let endTime = start + TimeInterval(displayDur)
            // After end -> invisible
            if time >= endTime { return 0.0 }

            // During fade-out (before end)
            if fadeOutDur > 0 {
                let fadeOutStart = endTime - TimeInterval(fadeOutDur)
                if time >= fadeOutStart {
                    let remaining = endTime - time
                    return max(0.0, remaining / TimeInterval(fadeOutDur))
                }
            }
        }

        // Fully visible
        return 1.0
    }

    // MARK: Media object timing

    func mediaObjectVisible(_ media: StoryMediaObject, at time: TimeInterval) -> Bool {
        let start = TimeInterval(media.startTime ?? 0)
        guard time >= start else { return false }
        if let dur = media.duration {
            let shouldLoop = media.loop ?? false
            if !shouldLoop, time >= start + TimeInterval(dur) { return false }
        }
        return true
    }

    func mediaObjectOpacity(for media: StoryMediaObject, at time: TimeInterval) -> Double {
        let start = TimeInterval(media.startTime ?? 0)
        let fadeInDur = TimeInterval(media.fadeIn ?? 0)
        let fadeOutDur = TimeInterval(media.fadeOut ?? 0)

        // No timing fields -> fully visible (backward compatible)
        guard media.startTime != nil || media.duration != nil else { return 1.0 }

        let elapsed = time - start
        guard elapsed >= 0 else { return 0.0 }

        // Fade-in
        if fadeInDur > 0, elapsed < fadeInDur {
            return min(1.0, elapsed / fadeInDur)
        }

        // Fade-out before end
        if let dur = media.duration, fadeOutDur > 0 {
            let endTime = start + TimeInterval(dur)
            let fadeOutStart = endTime - TimeInterval(fadeOutDur)
            if time >= fadeOutStart, time < endTime {
                return max(0.0, (endTime - time) / TimeInterval(fadeOutDur))
            }
        }

        return 1.0
    }

    // MARK: Audio object timing

    func audioObjectVisible(_ audio: StoryAudioPlayerObject, at time: TimeInterval) -> Bool {
        let start = TimeInterval(audio.startTime ?? 0)
        guard time >= start else { return false }
        if let dur = audio.duration {
            let shouldLoop = audio.loop ?? false
            if !shouldLoop, time >= start + TimeInterval(dur) { return false }
        }
        return true
    }

    func audioObjectOpacity(for audio: StoryAudioPlayerObject, at time: TimeInterval) -> Double {
        let start = TimeInterval(audio.startTime ?? 0)
        let fadeInDur = TimeInterval(audio.fadeIn ?? 0)
        let fadeOutDur = TimeInterval(audio.fadeOut ?? 0)

        guard audio.startTime != nil || audio.duration != nil else { return 1.0 }

        let elapsed = time - start
        guard elapsed >= 0 else { return 0.0 }

        if fadeInDur > 0, elapsed < fadeInDur {
            return min(1.0, elapsed / fadeInDur)
        }

        if let dur = audio.duration, fadeOutDur > 0 {
            let endTime = start + TimeInterval(dur)
            let fadeOutStart = endTime - TimeInterval(fadeOutDur)
            if time >= fadeOutStart, time < endTime {
                return max(0.0, (endTime - time) / TimeInterval(fadeOutDur))
            }
        }

        return 1.0
    }

    // MARK: Foreground image loading

    func loadForegroundImages(story: StoryItem, preloadedImages: [String: UIImage] = [:]) async {
        guard let mediaObjects = story.storyEffects?.mediaObjects else { return }
        let foregroundImages = mediaObjects.filter { $0.placement == "foreground" && $0.mediaType == "image" }

        // Phase 1: Synchronous — populate from preloaded + disk cache (instant)
        var needsNetworkLoad: [(id: String, resolved: String)] = []
        for media in foregroundImages {
            if let img = preloadedImages[media.id] {
                loadedImages[media.id] = img
                continue
            }
            guard let urlString = story.media.first(where: { $0.id == media.postMediaId })?.url,
                  let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString else { continue }
            if let cached = DiskCacheStore.cachedImage(for: resolved) {
                loadedImages[media.id] = cached
            } else {
                needsNetworkLoad.append((id: media.id, resolved: resolved))
            }
        }

        // Phase 2: Parallel network loads for images not in cache
        guard !needsNetworkLoad.isEmpty else { return }
        await withTaskGroup(of: (String, UIImage?).self) { group in
            for item in needsNetworkLoad {
                group.addTask {
                    let img = await CacheCoordinator.shared.images.image(for: item.resolved)
                    return (item.id, img)
                }
            }
            for await (id, img) in group {
                if let img { loadedImages[id] = img }
            }
        }
    }

    // MARK: Background audio

    func startBackgroundAudio(effects: StoryEffects?, story: StoryItem, userLang: String) {
        guard let effects else { return }
        let postMediaId = resolvedBackgroundAudioPostMediaId(effects: effects, userLang: userLang)
        guard let mediaId = postMediaId ?? effects.backgroundAudioId else { return }

        guard let urlString = story.media.first(where: { $0.id == mediaId })?.url,
              let url = MeeshyConfig.resolveMediaURL(urlString) else { return }

        let userVolume = effects.backgroundAudioVolume ?? 0.5
        targetBackgroundVolume = userVolume

        // Cache-first: use prerolled player or local disk file before network stream
        let player: AVPlayer
        if let cached = StoryMediaLoader.shared.cachedPlayer(for: url) {
            player = cached
        } else if let localURL = CacheCoordinator.audioLocalFileURL(for: url.absoluteString) {
            player = AVPlayer(url: localURL)
        } else {
            player = AVPlayer(url: url)
        }
        player.volume = userVolume * 0.2  // Demarrer a 20% du volume cible
        backgroundPlayer = player

        if let startTime = effects.backgroundAudioStart {
            player.seek(to: CMTime(seconds: startTime, preferredTimescale: 600))
        }

        player.play()
        fadeVolume(player: player, from: userVolume * 0.2, to: userVolume, duration: 1.0)

        loopObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: player.currentItem,
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            let seekTime: CMTime
            if let startTime = effects.backgroundAudioStart {
                seekTime = CMTime(seconds: startTime, preferredTimescale: 600)
            } else {
                seekTime = .zero
            }
            self.backgroundPlayer?.seek(to: seekTime)
            self.backgroundPlayer?.play()
        }
    }

    // MARK: - Mute/Unmute All Media

    private var muteObserver: Any?
    private var unmuteObserver: Any?

    func startMuteObservers() {
        muteObserver = NotificationCenter.default.addObserver(
            forName: .storyComposerMuteCanvas, object: nil, queue: .main
        ) { [weak self] _ in Task { @MainActor in self?.muteAllMedia() } }
        unmuteObserver = NotificationCenter.default.addObserver(
            forName: .storyComposerUnmuteCanvas, object: nil, queue: .main
        ) { [weak self] _ in Task { @MainActor in self?.unmuteAllMedia() } }
    }

    func stopMuteObservers() {
        if let obs = muteObserver { NotificationCenter.default.removeObserver(obs) }
        if let obs = unmuteObserver { NotificationCenter.default.removeObserver(obs) }
        muteObserver = nil
        unmuteObserver = nil
    }

    private func muteAllMedia() {
        backgroundPlayer?.isMuted = true
        backgroundVideoPlayer?.isMuted = true
        for (_, player) in foregroundVideoPlayers { player.isMuted = true }
        for (_, player) in foregroundAudioPlayers { player.isMuted = true }
    }

    private func unmuteAllMedia() {
        backgroundPlayer?.isMuted = false
        backgroundVideoPlayer?.isMuted = false
        for (_, player) in foregroundVideoPlayers { player.isMuted = false }
        for (_, player) in foregroundAudioPlayers { player.isMuted = false }
    }

    func stopAllMedia() {
        stopPlaybackTimer()
        fadeTimer?.invalidate()
        fadeTimer = nil
        fadeTimers.forEach { $0.invalidate() }
        fadeTimers.removeAll()
        if let obs = fadeOutObserver {
            NotificationCenter.default.removeObserver(obs)
            fadeOutObserver = nil
        }
        backgroundPlayer?.pause()
        backgroundPlayer = nil
        backgroundVideoPlayer?.pause()
        backgroundVideoPlayer = nil
        backgroundVideoLooper?.disableLooping()
        backgroundVideoLooper = nil
        if let observer = loopObserver {
            NotificationCenter.default.removeObserver(observer)
            loopObserver = nil
        }
        for (id, player) in foregroundVideoPlayers {
            player.pause()
            if let obs = foregroundLoopObservers[id] {
                NotificationCenter.default.removeObserver(obs)
            }
        }
        foregroundVideoPlayers = [:]
        foregroundLoopObservers = [:]
        for (_, looper) in foregroundLoopers { looper.disableLooping() }
        foregroundLoopers = [:]
        currentStoryRef = nil
        for (_, obs) in readyObservers { obs.invalidate() }
        readyObservers = [:]
        for (_, timer) in foregroundStopTimers { timer.invalidate() }
        foregroundStopTimers = [:]
        for (id, player) in foregroundAudioPlayers {
            player.pause()
            if let obs = foregroundAudioObservers[id] {
                NotificationCenter.default.removeObserver(obs)
            }
        }
        foregroundAudioPlayers = [:]
        foregroundAudioObservers = [:]
        for (_, timer) in foregroundAudioStopTimers { timer.invalidate() }
        foregroundAudioStopTimers = [:]
        startedForegroundVideos = []
        startedForegroundAudios = []
        pendingVideoStarts = [:]
        pendingAudioStarts = [:]
        activeForegroundSoundCount = 0
        isDucked = false
    }

    /// Fade-out progressif (2s) puis arret complet de tous les medias.
    func fadeOutThenStop(completion: (() -> Void)? = nil) {
        let fadeDuration: TimeInterval = 2.0
        let steps = 40
        let interval = fadeDuration / Double(steps)
        var currentStep = 0

        // Capturer les volumes actuels
        let bgStartVol = backgroundPlayer?.volume ?? 0
        let fgStartVols = foregroundVideoPlayers.mapValues { $0.volume }
        let fgAudioStartVols = foregroundAudioPlayers.mapValues { $0.volume }

        fadeTimer?.invalidate()
        fadeTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] timer in
            guard let self else { timer.invalidate(); return }
            currentStep += 1
            let progress = Float(currentStep) / Float(steps)
            let targetRatio: Float = 0.1  // 10% du volume

            // Interpoler vers 10%
            self.backgroundPlayer?.volume = bgStartVol * (1.0 - progress) + (bgStartVol * targetRatio) * progress
            for (id, player) in self.foregroundVideoPlayers {
                let startVol = fgStartVols[id] ?? 1.0
                player.volume = startVol * (1.0 - progress) + (startVol * targetRatio) * progress
            }
            for (id, player) in self.foregroundAudioPlayers {
                let startVol = fgAudioStartVols[id] ?? 1.0
                player.volume = startVol * (1.0 - progress) + (startVol * targetRatio) * progress
            }

            if currentStep >= steps {
                timer.invalidate()
                self.fadeTimer = nil
                self.stopAllMedia()
                completion?()
            }
        }
    }

    // MARK: Volume fade utility

    private func fadeVolume(player: AVPlayer, from startVol: Float, to endVol: Float, duration: TimeInterval) {
        let steps = 20
        let interval = duration / Double(steps)
        var currentStep = 0

        let timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak player] timer in
            guard let player else { timer.invalidate(); return }
            currentStep += 1
            let progress = Float(currentStep) / Float(steps)
            player.volume = startVol + (endVol - startVol) * progress
            if currentStep >= steps {
                timer.invalidate()
                player.volume = endVol
            }
        }
        fadeTimers.append(timer)
    }

    // MARK: Audio Ducking

    /// Called when a foreground audio/video player starts producing sound.
    /// Ducks background audio to 30% of target volume with a smooth fade.
    private func foregroundSoundDidStart() {
        activeForegroundSoundCount += 1
        guard !isDucked, let bg = backgroundPlayer else { return }
        isDucked = true
        let duckedVolume = targetBackgroundVolume * duckRatio
        fadeVolume(player: bg, from: bg.volume, to: duckedVolume, duration: duckFadeDuration)
    }

    /// Called when a foreground audio/video player stops producing sound.
    /// Restores background audio to full target volume when all foreground sound stops.
    private func foregroundSoundDidStop() {
        activeForegroundSoundCount = max(0, activeForegroundSoundCount - 1)
        guard activeForegroundSoundCount == 0, isDucked, let bg = backgroundPlayer else { return }
        isDucked = false
        fadeVolume(player: bg, from: bg.volume, to: targetBackgroundVolume, duration: duckFadeDuration)
    }

    // MARK: Foreground video players (timing-aware start)

    func startForegroundVideos(story: StoryItem, preloadedVideoURLs: [String: URL] = [:]) {
        currentStoryRef = story
        guard let mediaObjects = story.storyEffects?.mediaObjects else { return }
        let videoObjects = mediaObjects.filter { $0.placement == "foreground" && $0.mediaType == "video" }
        for media in videoObjects {
            if let preloaded = preloadedVideoURLs[media.id] {
                registerPendingVideoStart(media: media, url: preloaded)
            } else if let urlString = story.media.first(where: { $0.id == media.postMediaId })?.url,
                      let resolved = MeeshyConfig.resolveMediaURL(urlString) {
                // Use prerolled cached player if available (prefetched by StoryViewerView)
                if let cachedPlayer = StoryMediaLoader.shared.cachedPlayer(for: resolved) {
                    registerPendingVideoStartWithPlayer(media: media, player: cachedPlayer)
                } else {
                    // Stream directly — AVPlayer handles HTTP streaming natively with buffering
                    registerPendingVideoStart(media: media, url: resolved)
                }
            }
        }
    }

    private func registerPendingVideoStart(media: StoryMediaObject, url: URL) {
        let startOffset = TimeInterval(media.startTime ?? 0)
        if currentTime >= startOffset {
            createAndStartVideoPlayer(for: media, url: url)
        } else {
            pendingVideoStarts[media.id] = (url: url, media: media)
        }
    }

    private func registerPendingVideoStartWithPlayer(media: StoryMediaObject, player: AVPlayer) {
        let startOffset = TimeInterval(media.startTime ?? 0)
        if currentTime >= startOffset {
            injectPrerolledVideoPlayer(for: media, player: player)
        } else {
            // For deferred starts with prerolled players, store the URL and start fresh when needed
            if let urlAsset = player.currentItem?.asset as? AVURLAsset {
                pendingVideoStarts[media.id] = (url: urlAsset.url, media: media)
            }
        }
    }

    private func injectPrerolledVideoPlayer(for media: StoryMediaObject, player: AVPlayer) {
        guard !startedForegroundVideos.contains(media.id) else { return }
        startedForegroundVideos.insert(media.id)

        player.isMuted = false
        let targetVolume = media.volume
        let hasFadeIn = (media.fadeIn ?? 0) > 0
        player.volume = hasFadeIn ? 0.0 : targetVolume
        foregroundVideoPlayers[media.id] = player

        let shouldLoop = (media.loop ?? true) || shouldLoopVideoForAudio(media: media)
        // Use AVPlayerLooper for seamless looping (Apple recommended, no gap)
        if shouldLoop, let queuePlayer = player as? AVQueuePlayer, let item = queuePlayer.currentItem {
            foregroundLoopers[media.id] = AVPlayerLooper(player: queuePlayer, templateItem: item)
        }
        let obs = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: player.currentItem,
            queue: .main
        ) { [weak self] _ in
            if !shouldLoop {
                self?.foregroundSoundDidStop()
            }
        }
        foregroundLoopObservers[media.id] = obs

        player.play()
        foregroundSoundDidStart()

        let fadeInDuration = TimeInterval(media.fadeIn ?? 0)
        if fadeInDuration > 0 {
            fadeVolume(player: player, from: 0.0, to: targetVolume, duration: fadeInDuration)
        }

        if let dur = media.duration, !shouldLoop {
            let stopDelay = TimeInterval(dur)
            let fadeOutDur = TimeInterval(media.fadeOut ?? 0)
            let fadeOutStart = max(0, stopDelay - fadeOutDur)
            if fadeOutDur > 0 {
                foregroundStopTimers[media.id]?.invalidate()
                foregroundStopTimers[media.id] = Timer.scheduledTimer(withTimeInterval: fadeOutStart, repeats: false) { [weak self, weak player] _ in
                    guard let player else { return }
                    self?.fadeVolume(player: player, from: player.volume, to: 0.0, duration: fadeOutDur)
                }
            }
        }
    }

    /// Returns the latest effective end time among all foreground audio elements.
    /// Used to determine if a video should loop because audio outlasts it.
    private func maxForegroundAudioEndTime() -> Double {
        guard let audioObjects = currentStoryRef?.storyEffects?.audioPlayerObjects?
            .filter({ $0.placement == "foreground" }) else { return 0 }
        var maxEnd: Double = 0
        for audio in audioObjects {
            let start = Double(audio.startTime ?? 0)
            let duration = Double(audio.duration ?? 0)
            maxEnd = max(maxEnd, start + duration)
        }
        return maxEnd
    }

    /// Determines whether a video element should loop because foreground audio extends beyond its end time.
    private func shouldLoopVideoForAudio(media: StoryMediaObject) -> Bool {
        guard let videoDuration = media.duration else { return false }
        let videoEnd = Double(media.startTime ?? 0) + Double(videoDuration)
        let audioEnd = maxForegroundAudioEndTime()
        return audioEnd > videoEnd
    }

    private func checkPendingVideoStarts() {
        for (id, pending) in pendingVideoStarts {
            let startOffset = TimeInterval(pending.media.startTime ?? 0)
            if currentTime >= startOffset {
                pendingVideoStarts.removeValue(forKey: id)
                createAndStartVideoPlayer(for: pending.media, url: pending.url)
            }
        }
    }

    private func createAndStartVideoPlayer(for media: StoryMediaObject, url: URL) {
        guard !startedForegroundVideos.contains(media.id) else { return }
        startedForegroundVideos.insert(media.id)

        // Use cached prerolled player if available, otherwise create fresh
        let cached = StoryMediaLoader.shared.cachedPlayer(for: url)
        let player: AVPlayer
        if let cached {
            player = cached
        } else {
            let item = AVPlayerItem(url: url)
            item.preferredForwardBufferDuration = 2.0
            player = AVQueuePlayer(playerItem: item)
        }
        player.isMuted = false
        let targetVolume = media.volume
        let hasFadeIn = (media.fadeIn ?? 0) > 0

        player.volume = hasFadeIn ? 0.0 : targetVolume
        foregroundVideoPlayers[media.id] = player

        let shouldLoop = (media.loop ?? true) || shouldLoopVideoForAudio(media: media)
        // Use AVPlayerLooper for seamless looping (Apple recommended, no gap)
        if shouldLoop, let queuePlayer = player as? AVQueuePlayer, let item = queuePlayer.currentItem {
            foregroundLoopers[media.id] = AVPlayerLooper(player: queuePlayer, templateItem: item)
        }
        let obs = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: player.currentItem,
            queue: .main
        ) { [weak self] _ in
            if !shouldLoop { self?.foregroundSoundDidStop() }
        }
        foregroundLoopObservers[media.id] = obs

        // Wait for readyToPlay before playing to avoid blank frame
        let mediaId = media.id
        if player.currentItem?.status == .readyToPlay {
            player.play()
            foregroundSoundDidStart()
        } else {
            readyObservers[mediaId]?.invalidate()
            readyObservers[mediaId] = player.currentItem?.observe(\.status, options: [.new]) { [weak self, weak player] item, _ in
                guard item.status == .readyToPlay || item.status == .failed else { return }
                DispatchQueue.main.async {
                    self?.readyObservers.removeValue(forKey: mediaId)?.invalidate()
                    if item.status == .readyToPlay {
                        player?.play()
                        self?.foregroundSoundDidStart()
                    }
                }
            }
        }

        // Volume fade-in (only if explicitly configured)
        let fadeInDuration = TimeInterval(media.fadeIn ?? 0)
        if fadeInDuration > 0 {
            fadeVolume(player: player, from: 0.0, to: targetVolume, duration: fadeInDuration)
        }

        // Schedule stop + fade-out if duration is set and not looping
        if let dur = media.duration, !shouldLoop {
            let stopDelay = TimeInterval(dur)
            let fadeOutDur = TimeInterval(media.fadeOut ?? 0)
            let fadeOutStart = max(0, stopDelay - fadeOutDur)

            if fadeOutDur > 0 {
                foregroundStopTimers[media.id]?.invalidate()
                foregroundStopTimers[media.id] = Timer.scheduledTimer(withTimeInterval: fadeOutStart, repeats: false) { [weak self, weak player] _ in
                    guard let player else { return }
                    self?.fadeVolume(player: player, from: player.volume, to: 0.0, duration: fadeOutDur)
                }
            }
        }
    }

    // MARK: Foreground audio players (timing-aware start)

    func startForegroundAudios(story: StoryItem, preloadedAudioURLs: [String: URL] = [:]) {
        guard let audioObjects = story.storyEffects?.audioPlayerObjects else { return }
        let foregroundAudios = audioObjects.filter { $0.placement == "foreground" }
        for audio in foregroundAudios {
            if let preloaded = preloadedAudioURLs[audio.id] {
                registerPendingAudioStart(audio: audio, url: preloaded)
            } else if let urlStr = story.media.first(where: { $0.id == audio.postMediaId })?.url,
                      let resolved = MeeshyConfig.resolveMediaURL(urlStr) {
                registerPendingAudioStart(audio: audio, url: resolved)
            }
        }
    }

    private func registerPendingAudioStart(audio: StoryAudioPlayerObject, url: URL) {
        let startOffset = TimeInterval(audio.startTime ?? 0)
        if currentTime >= startOffset {
            createAndStartAudioPlayer(for: audio, url: url)
        } else {
            pendingAudioStarts[audio.id] = (url: url, audio: audio)
        }
    }

    private func checkPendingAudioStarts() {
        for (id, pending) in pendingAudioStarts {
            let startOffset = TimeInterval(pending.audio.startTime ?? 0)
            if currentTime >= startOffset {
                pendingAudioStarts.removeValue(forKey: id)
                createAndStartAudioPlayer(for: pending.audio, url: pending.url)
            }
        }
    }

    private func createAndStartAudioPlayer(for audio: StoryAudioPlayerObject, url: URL) {
        guard !startedForegroundAudios.contains(audio.id) else { return }
        startedForegroundAudios.insert(audio.id)

        // Use cached prerolled player if available, otherwise create fresh
        let cached = StoryMediaLoader.shared.cachedPlayer(for: url)
        let player: AVPlayer
        if let cached {
            player = cached
        } else {
            let item = AVPlayerItem(url: url)
            item.preferredForwardBufferDuration = 2.0
            player = AVQueuePlayer(playerItem: item)
        }
        let targetVolume = audio.volume
        let hasFadeIn = (audio.fadeIn ?? 0) > 0

        player.volume = hasFadeIn ? 0.0 : targetVolume
        foregroundAudioPlayers[audio.id] = player

        let shouldLoop = audio.loop ?? false
        // Use AVPlayerLooper for seamless looping (Apple recommended)
        if shouldLoop, let queuePlayer = player as? AVQueuePlayer, let item = queuePlayer.currentItem {
            foregroundLoopers[audio.id] = AVPlayerLooper(player: queuePlayer, templateItem: item)
        }
        let obs = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: player.currentItem,
            queue: .main
        ) { [weak self] _ in
            if !shouldLoop { self?.foregroundSoundDidStop() }
        }
        foregroundAudioObservers[audio.id] = obs

        // Wait for readyToPlay before playing
        let audioId = audio.id
        if player.currentItem?.status == .readyToPlay {
            player.play()
            foregroundSoundDidStart()
        } else {
            readyObservers[audioId]?.invalidate()
            readyObservers[audioId] = player.currentItem?.observe(\.status, options: [.new]) { [weak self, weak player] item, _ in
                guard item.status == .readyToPlay || item.status == .failed else { return }
                DispatchQueue.main.async {
                    self?.readyObservers.removeValue(forKey: audioId)?.invalidate()
                    if item.status == .readyToPlay {
                        player?.play()
                        self?.foregroundSoundDidStart()
                    }
                }
            }
        }

        // Volume fade-in
        let fadeInDuration = TimeInterval(audio.fadeIn ?? 0)
        if fadeInDuration > 0 {
            fadeVolume(player: player, from: 0.0, to: targetVolume, duration: fadeInDuration)
        }

        // Schedule fade-out + stop if duration is set and not looping
        if let dur = audio.duration, !shouldLoop {
            let stopDelay = TimeInterval(dur)
            let fadeOutDur = TimeInterval(audio.fadeOut ?? 0)
            let fadeOutStart = max(0, stopDelay - fadeOutDur)

            if fadeOutDur > 0 {
                foregroundAudioStopTimers[audio.id]?.invalidate()
                foregroundAudioStopTimers[audio.id] = Timer.scheduledTimer(withTimeInterval: fadeOutStart, repeats: false) { [weak self, weak player] _ in
                    guard let player else { return }
                    self?.fadeVolume(player: player, from: player.volume, to: 0.0, duration: fadeOutDur)
                }
            }
        }
    }

    // MARK: Background video (stored to avoid re-creation on every render)

    func ensureBackgroundVideoPlayer(url: URL, muted: Bool = false) -> AVPlayer {
        if let existing = backgroundVideoPlayer {
            return existing
        }
        // Try prerolled cached player first for instant playback
        let player: AVPlayer
        if let cached = StoryMediaLoader.shared.cachedPlayer(for: url) {
            player = cached
        } else {
            player = AVPlayer(url: url)
        }
        player.isMuted = muted
        player.play()
        backgroundVideoPlayer = player
        return player
    }

    // MARK: Langue audio de fond

    private func resolvedBackgroundAudioPostMediaId(effects: StoryEffects, userLang: String) -> String? {
        let variant = effects.backgroundAudioVariants?.first { $0.language == userLang }
        return variant?.postMediaId ?? effects.backgroundAudioId
    }

    // MARK: Socket — post:story-translation-updated

    func subscribeToTranslationUpdates(postId: String) {
        SocialSocketManager.shared.storyTranslationUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] update in
                guard update.postId == postId else { return }
                self?.applyTranslationUpdate(index: update.textObjectIndex, translations: update.translations)
            }
            .store(in: &cancellables)
    }

    private func applyTranslationUpdate(index: Int, translations: [String: String]) {
        guard index < textObjects.count else { return }
        let existing = textObjects[index].translations ?? [:]
        textObjects[index].translations = existing.merging(translations) { _, new in new }
    }
}

// MARK: - Font helper (identique StoryCanvasView)

private func storyFont(for style: StoryTextStyle?, size: CGFloat) -> Font {
    switch style {
    case .bold:        return .system(size: size, weight: .black)
    case .neon:        return .system(size: size, weight: .semibold)
    case .typewriter:  return .custom("Courier", size: size)
    case .handwriting: return .custom("SnellRoundhand", size: size)
    case .classic:     return .custom("Georgia", size: size)
    case .none:        return .system(size: size, weight: .semibold)
    }
}

// MARK: - Bare AVPlayerLayer view (no controls, no chrome — for background videos)

private struct BareVideoLayer: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> BarePlayerView {
        let view = BarePlayerView()
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: BarePlayerView, context: Context) {
        uiView.playerLayer.player = player
    }
}

private class BarePlayerView: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}
