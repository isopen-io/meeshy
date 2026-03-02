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

    public var body: some View {
        GeometryReader { geo in
            ZStack {
                backgroundLayer
                backgroundMediaLayer
                filterOverlay
                drawingLayer
                stickerLayer(size: geo.size)
                textLayer(size: geo.size)
                textObjectsLayer(size: geo.size)
                foregroundMediaLayer
                foregroundAudioLayer
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()
        }
        .task {
            await state.loadForegroundImages(story: story, preloadedImages: preloadedImages)
        }
        .onAppear {
            state.startPlaybackTimer()
            state.startBackgroundAudio(
                effects: story.storyEffects,
                story: story,
                userLang: preferredLanguage ?? Locale.current.language.languageCode?.identifier ?? "en"
            )
            state.startForegroundVideos(story: story, preloadedVideoURLs: preloadedVideoURLs)
            state.startForegroundAudios(story: story, preloadedAudioURLs: preloadedAudioURLs)
            state.subscribeToTranslationUpdates(postId: story.id)
        }
        .onDisappear {
            state.stopAllMedia()
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
        } else {
            LinearGradient(
                colors: [Color(hex: "1A1A2E"), Color(hex: "0F3460")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    // MARK: - Background Media (image/vidéo de fond depuis storyEffects.mediaObjects)

    @ViewBuilder
    private var backgroundMediaLayer: some View {
        if let bgMedia = story.storyEffects?.mediaObjects?.first(where: { $0.placement == "background" }) {
            if bgMedia.mediaType == "image" {
                // TODO: charger depuis MediaCacheManager si disponible
                if let urlStr = mediaURL(for: bgMedia.postMediaId) {
                    CachedAsyncImage(url: urlStr) {
                        Color.clear
                    }
                    .scaledToFill()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipped()
                }
            } else if bgMedia.mediaType == "video" {
                if let urlStr = mediaURL(for: bgMedia.postMediaId),
                   let url = MeeshyConfig.resolveMediaURL(urlStr) {
                    let player = state.ensureBackgroundVideoPlayer(url: url)
                    VideoPlayer(player: player)
                        .disabled(true)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .clipped()
                }
            }
        } else if let preloadedBg = preloadedImages[story.id] {
            // Image de fond préchargée (mode preview — pas encore uploadée)
            Image(uiImage: preloadedBg)
                .resizable()
                .scaledToFill()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
        } else if let legacyMedia = story.media.first,
                  let urlStr = legacyMedia.url {
            // Fallback : média legacy de StoryItem.media (format pré-composer V2)
            if legacyMedia.type == .video, let url = MeeshyConfig.resolveMediaURL(urlStr) {
                let player = state.ensureBackgroundVideoPlayer(url: url)
                VideoPlayer(player: player)
                    .disabled(true)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipped()
            } else {
                CachedAsyncImage(url: urlStr) {
                    Color.clear
                }
                .scaledToFill()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
            }
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
                styledText(content: content, effects: effects)
                    .position(x: pos.x * size.width, y: pos.y * size.height)
            }
        }
    }

    private func styledText(content: String, effects: StoryEffects?) -> some View {
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
            .frame(maxWidth: 280)
    }

    // MARK: - Text Objects Layer (multi-texte avec styles per-objet + traductions + timing)

    @ViewBuilder
    private func textObjectsLayer(size: CGSize) -> some View {
        let lang = preferredLanguage ?? Locale.current.language.languageCode?.identifier ?? "en"
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
                    .font(storyFont(for: style, size: fontSize * obj.scale))
                    .foregroundColor(Color(hex: colorHex))
                    .multilineTextAlignment(alignment)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        Group {
                            if obj.hasBg {
                                RoundedRectangle(cornerRadius: 8)
                                    .fill(Color.black.opacity(0.4))
                            }
                        }
                    )
                    .shadow(color: style == .neon ? Color(hex: colorHex).opacity(0.6) : .clear, radius: 10)
                    .frame(maxWidth: 280)
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
                .onAppear {
                    NSLog("[Bug3][ReaderView] storyId=%@ mediaId=%@ x=%f y=%f scale=%f rotation=%f postMediaId=%@", story.id, media.id, media.x, media.y, media.scale, media.rotation, media.postMediaId)
                }
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
    private var loopObserver: NSObjectProtocol?
    private var foregroundLoopObservers: [String: NSObjectProtocol] = [:]
    private var foregroundStopTimers: [String: Timer] = [:]
    private var foregroundAudioPlayers: [String: AVPlayer] = [:]
    private var foregroundAudioObservers: [String: NSObjectProtocol] = [:]
    private var foregroundAudioStopTimers: [String: Timer] = [:]
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
    /// Active fade-volume timers (Issue 5: must be tracked to invalidate on cleanup).
    private var fadeTimers: [Timer] = []
    /// Observer token for storyAudioFadeOut notification (Issue 6: must be removed on cleanup).
    private var fadeOutObserver: NSObjectProtocol?

    init(story: StoryItem) {
        // Migrate legacy text -> textObjects si necessaire
        var objects = story.storyEffects?.textObjects ?? []
        if objects.isEmpty, let content = story.content, !content.isEmpty {
            var effects = story.storyEffects ?? StoryEffects()
            effects.migrateLegacyText(content: content)
            objects = effects.textObjects ?? []
        }
        self.textObjects = objects
        fadeOutObserver = NotificationCenter.default.addObserver(forName: .storyAudioFadeOut, object: nil, queue: .main) { [weak self] _ in
            self?.fadeOutThenStop()
        }
    }

    // MARK: Playback timer (drives element timing)

    func startPlaybackTimer() {
        currentTime = 0
        playbackTimer?.invalidate()
        playbackTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.currentTime += 0.05
            self.checkPendingVideoStarts()
            self.checkPendingAudioStarts()
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
        for media in foregroundImages {
            // Asset precharge localement (mode preview) -- priorite sur le reseau.
            if let img = preloadedImages[media.id] {
                loadedImages[media.id] = img
                continue
            }
            guard let urlString = story.media.first(where: { $0.id == media.postMediaId })?.url else { continue }
            guard let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString else { continue }
            if let img = try? await MediaCacheManager.shared.image(for: resolved) {
                loadedImages[media.id] = img
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

        let player = AVPlayer(url: url)
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

    // MARK: Foreground video players (timing-aware start)

    func startForegroundVideos(story: StoryItem, preloadedVideoURLs: [String: URL] = [:]) {
        guard let mediaObjects = story.storyEffects?.mediaObjects else { return }
        let videoObjects = mediaObjects.filter { $0.placement == "foreground" && $0.mediaType == "video" }
        for media in videoObjects {
            // Asset precharge localement (mode preview) -- priorite sur le reseau.
            if let preloaded = preloadedVideoURLs[media.id] {
                registerPendingVideoStart(media: media, url: preloaded)
            } else if let urlString = story.media.first(where: { $0.id == media.postMediaId })?.url,
                      let resolved = MeeshyConfig.resolveMediaURL(urlString) {
                // Telecharger via MediaCacheManager pour contourner les erreurs de Content-Type serveur,
                // puis jouer depuis un fichier local temporaire.
                Task {
                    do {
                        let data = try await MediaCacheManager.shared.data(for: resolved.absoluteString)
                        let ext = resolved.pathExtension.isEmpty ? "mov" : resolved.pathExtension
                        let tempURL = FileManager.default.temporaryDirectory
                            .appendingPathComponent("story_video_\(media.id).\(ext)")
                        try data.write(to: tempURL, options: .atomic)
                        await MainActor.run {
                            self.registerPendingVideoStart(media: media, url: tempURL)
                        }
                    } catch {
                        NSLog("[StoryReader] Failed to download video for %@: %@", media.id, error.localizedDescription)
                        // Fallback : essayer directement avec l'URL reseau
                        await MainActor.run {
                            self.registerPendingVideoStart(media: media, url: resolved)
                        }
                    }
                }
            }
        }
    }

    private func registerPendingVideoStart(media: StoryMediaObject, url: URL) {
        let startOffset = TimeInterval(media.startTime ?? 0)
        if currentTime >= startOffset {
            // Already past start time, start immediately
            createAndStartVideoPlayer(for: media, url: url)
        } else {
            // Register for deferred start via playback timer
            pendingVideoStarts[media.id] = (url: url, media: media)
        }
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

        let player = AVPlayer(url: url)
        player.isMuted = false
        let targetVolume = media.volume
        let hasFadeIn = (media.fadeIn ?? 0) > 0

        // Start at reduced volume if fade-in configured, otherwise start low for smooth ramp
        player.volume = hasFadeIn ? 0.0 : 0.2
        foregroundVideoPlayers[media.id] = player

        let shouldLoop = media.loop ?? true
        let obs = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: player.currentItem,
            queue: .main
        ) { [weak player] _ in
            guard shouldLoop else { return }
            player?.seek(to: .zero)
            player?.play()
        }
        foregroundLoopObservers[media.id] = obs

        player.play()

        // Volume fade-in
        let fadeInDuration = TimeInterval(media.fadeIn ?? 0)
        if fadeInDuration > 0 {
            fadeVolume(player: player, from: 0.0, to: targetVolume, duration: fadeInDuration)
        } else {
            fadeVolume(player: player, from: 0.2, to: targetVolume, duration: 1.0)
        }

        // Schedule stop + fade-out if duration is set and not looping
        if let dur = media.duration, !(media.loop ?? false) {
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

        let player = AVPlayer(url: url)
        let targetVolume = audio.volume
        let hasFadeIn = (audio.fadeIn ?? 0) > 0

        player.volume = hasFadeIn ? 0.0 : targetVolume
        foregroundAudioPlayers[audio.id] = player

        let shouldLoop = audio.loop ?? false
        let obs = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: player.currentItem,
            queue: .main
        ) { [weak player] _ in
            guard shouldLoop else { return }
            player?.seek(to: .zero)
            player?.play()
        }
        foregroundAudioObservers[audio.id] = obs

        player.play()

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

    func ensureBackgroundVideoPlayer(url: URL) -> AVPlayer {
        if let existing = backgroundVideoPlayer {
            return existing
        }
        let player = AVPlayer(url: url)
        player.isMuted = true
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
