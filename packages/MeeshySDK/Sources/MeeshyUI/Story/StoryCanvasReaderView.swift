import SwiftUI
import PencilKit
import AVKit
import Combine
import MeeshySDK

/// Reconstruit pixel-perfect le canvas d'une story (lecture seule).
/// Symétrique de StoryCanvasView (Composer) mais sans interactions.
/// Utilisé par StoryViewerView pour le rendu fidèle.
public struct StoryCanvasReaderView: View {
    public let story: StoryItem
    public let preferredLanguage: String?

    // Mutable local state managed by a StateObject to support socket updates
    @StateObject private var state: ReaderState

    public init(story: StoryItem, preferredLanguage: String? = nil) {
        self.story = story
        self.preferredLanguage = preferredLanguage
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
            await state.loadForegroundImages(story: story)
        }
        .onAppear {
            state.startBackgroundAudio(
                effects: story.storyEffects,
                story: story,
                userLang: preferredLanguage ?? Locale.current.language.languageCode?.identifier ?? "en"
            )
            state.startForegroundVideos(story: story)
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
                   let url = URL(string: urlStr) {
                    let player = state.ensureBackgroundVideoPlayer(url: url)
                    VideoPlayer(player: player)
                        .disabled(true)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .clipped()
                }
            }
        } else if let legacyMedia = story.media.first,
                  let urlStr = legacyMedia.url {
            // Fallback : média legacy de StoryItem.media (format pré-composer V2)
            CachedAsyncImage(url: urlStr) {
                Color.clear
            }
            .scaledToFill()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()
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

    // MARK: - Legacy text (position exacte normalisée, format pré-textObjects)

    @ViewBuilder
    private func textLayer(size: CGSize) -> some View {
        let resolvedContent = story.resolvedContent(preferredLanguage: preferredLanguage)
        if let content = resolvedContent, !content.isEmpty {
            let effects = story.storyEffects
            let pos = effects?.resolvedTextPosition ?? .center
            styledText(content: content, effects: effects)
                .position(x: pos.x * size.width, y: pos.y * size.height)
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

    // MARK: - Text Objects Layer (Composer V2 — multi-texte avec traductions)

    @ViewBuilder
    private func textObjectsLayer(size: CGSize) -> some View {
        let lang = preferredLanguage ?? Locale.current.language.languageCode?.identifier ?? "en"
        ForEach(state.textObjects) { obj in
            Text(resolvedText(for: obj, userLang: lang))
                .font(.system(size: 22 * obj.scale, weight: .semibold))
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.black.opacity(0.4))
                )
                .rotationEffect(.degrees(obj.rotation))
                .position(x: obj.x * size.width, y: obj.y * size.height)
                .allowsHitTesting(false)
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

    // MARK: - Foreground Media Layer

    @ViewBuilder
    private var foregroundMediaLayer: some View {
        ForEach(story.storyEffects?.mediaObjects?.filter { $0.placement == "foreground" } ?? []) { media in
            DraggableMediaView(
                mediaObject: .constant(media),
                image: state.loadedImages[media.id],
                videoURL: media.mediaType == "video"
                    ? mediaURL(for: media.postMediaId).flatMap { MeeshyConfig.resolveMediaURL($0) }
                    : nil,
                externalPlayer: media.mediaType == "video" ? state.foregroundVideoPlayers[media.id] : nil,
                isEditing: false
            )
        }
    }

    // MARK: - Foreground Audio Layer

    @ViewBuilder
    private var foregroundAudioLayer: some View {
        ForEach(story.storyEffects?.audioPlayerObjects?.filter { $0.placement == "foreground" } ?? []) { audio in
            StoryAudioPlayerView(audioObject: .constant(audio), isEditing: false)
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
}

// MARK: - ReaderState (gestion lifecycle, audio de fond, socket updates)

@MainActor
private final class ReaderState: ObservableObject {
    @Published var textObjects: [StoryTextObject]
    @Published var loadedImages: [String: UIImage] = [:]
    /// Players vidéo foreground — un par média, tous démarrés simultanément à onAppear.
    @Published var foregroundVideoPlayers: [String: AVPlayer] = [:]
    let canvas = PKCanvasView()

    private var backgroundPlayer: AVPlayer?
    private var backgroundVideoPlayer: AVPlayer?
    private var loopObserver: NSObjectProtocol?
    private var foregroundLoopObservers: [String: NSObjectProtocol] = [:]
    private var cancellables = Set<AnyCancellable>()

    init(story: StoryItem) {
        self.textObjects = story.storyEffects?.textObjects ?? []
    }

    // MARK: Foreground image loading

    func loadForegroundImages(story: StoryItem) async {
        guard let mediaObjects = story.storyEffects?.mediaObjects else { return }
        let foregroundImages = mediaObjects.filter { $0.placement == "foreground" && $0.mediaType == "image" }
        for media in foregroundImages {
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

        let player = AVPlayer(url: url)
        player.volume = effects.backgroundAudioVolume ?? 0.5
        backgroundPlayer = player

        if let startTime = effects.backgroundAudioStart {
            player.seek(to: CMTime(seconds: startTime, preferredTimescale: 600))
        }

        player.play()

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
    }

    // MARK: Foreground video players (tous démarrés simultanément)

    func startForegroundVideos(story: StoryItem) {
        guard let mediaObjects = story.storyEffects?.mediaObjects else { return }
        let videoObjects = mediaObjects.filter { $0.placement == "foreground" && $0.mediaType == "video" }
        for media in videoObjects {
            guard let urlString = story.media.first(where: { $0.id == media.postMediaId })?.url,
                  let url = MeeshyConfig.resolveMediaURL(urlString) else { continue }

            let player = AVPlayer(url: url)
            player.isMuted = false
            foregroundVideoPlayers[media.id] = player

            let obs = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: player.currentItem,
                queue: .main
            ) { [weak player] _ in
                player?.seek(to: .zero)
                player?.play()
            }
            foregroundLoopObservers[media.id] = obs
            player.play()
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
        let merged = existing.merging(translations) { _, new in new }
        textObjects[index] = StoryTextObject(
            id: textObjects[index].id,
            content: textObjects[index].content,
            x: textObjects[index].x,
            y: textObjects[index].y,
            scale: textObjects[index].scale,
            rotation: textObjects[index].rotation,
            translations: merged
        )
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
