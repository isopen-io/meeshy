import SwiftUI
import PencilKit
import AVKit
import Combine
import QuartzCore
import os
import MeeshySDK

private let storyPlaybackLogger = Logger(subsystem: "me.meeshy.app", category: "story.playback")

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
    /// Chaine de langues preferees pour la resolution Prisme (systemLanguage →
    /// regionalLanguage → customDestinationLanguage). Si nil, on retombe sur
    /// `preferredLanguage` (1 element). Voir CLAUDE.md "Prisme Linguistique".
    public let preferredContentLanguages: [String]?
    /// Assets préchargés localement (mode preview — avant publication).
    /// En mode viewer normal, ces dicts sont vides et les URLs sont résolues depuis story.media.
    public let preloadedImages: [String: UIImage]
    public let preloadedVideoURLs: [String: URL]
    public let preloadedAudioURLs: [String: URL]
    /// When `true`, all audio (background + foreground audio + foreground video sound)
    /// is suppressed. Used by feed-cell embeds where the canvas renders silently as a
    /// thumbnail. Default `false` preserves the in-viewer behavior.
    public let mute: Bool

    // Mutable local state managed by a StateObject to support socket updates
    @StateObject private var state: ReaderState

    public init(story: StoryItem, preferredLanguage: String? = nil,
                preferredContentLanguages: [String]? = nil,
                preloadedImages: [String: UIImage] = [:],
                preloadedVideoURLs: [String: URL] = [:],
                preloadedAudioURLs: [String: URL] = [:],
                mute: Bool = false) {
        self.story = story
        self.preferredLanguage = preferredLanguage
        self.preferredContentLanguages = preferredContentLanguages
        self.preloadedImages = preloadedImages
        self.preloadedVideoURLs = preloadedVideoURLs
        self.preloadedAudioURLs = preloadedAudioURLs
        self.mute = mute
        self._state = StateObject(wrappedValue: ReaderState(story: story, mute: mute))
    }

    /// Alternate init for feed cells that have an `APIPost` (not a `StoryItem`).
    /// Reuses `[APIPost].toStoryGroups` for the canonical `APIPost -> StoryItem`
    /// conversion (single source of truth). Falls back to a synthetic minimal
    /// `StoryItem` if the post is not type=STORY (e.g., a STATUS post embedded
    /// for preview).
    public init(post: APIPost, preferredLanguage: String? = nil,
                preferredContentLanguages: [String]? = nil,
                preloadedImages: [String: UIImage] = [:],
                preloadedVideoURLs: [String: URL] = [:],
                preloadedAudioURLs: [String: URL] = [:],
                mute: Bool = false) {
        let story: StoryItem = {
            if let item = [post].toStoryGroups().first?.stories.first {
                return item
            }
            // Synthesize a minimal StoryItem from the post (used for non-STORY
            // posts rendered in a feed cell — e.g., audio status preview).
            let media: [FeedMedia] = (post.media ?? []).map { m in
                FeedMedia(
                    id: m.id, type: m.mediaType, url: m.fileUrl,
                    thumbnailColor: "4ECDC4",
                    width: m.width, height: m.height,
                    duration: m.duration.map { $0 / 1000 }
                )
            }
            return StoryItem(
                id: post.id,
                content: post.content,
                media: media,
                storyEffects: post.storyEffects,
                createdAt: post.createdAt,
                expiresAt: post.expiresAt,
                repostOfId: post.repostOf?.id,
                originalRepostOfId: post.originalRepostOfId,
                repostAuthorName: post.repostOf?.author.name,
                visibility: post.visibility,
                audioUrl: post.audioUrl,
                isViewed: post.isViewedByMe ?? false,
                translations: nil,
                reactionCount: post.reactionSummary?.values.reduce(0, +) ?? 0,
                commentCount: post.commentCount ?? 0
            )
        }()
        self.init(story: story,
                  preferredLanguage: preferredLanguage,
                  preferredContentLanguages: preferredContentLanguages,
                  preloadedImages: preloadedImages,
                  preloadedVideoURLs: preloadedVideoURLs,
                  preloadedAudioURLs: preloadedAudioURLs,
                  mute: mute)
    }

    /// Alternate init for feed cells that have a `RepostContent` (the embedded
    /// story snapshot exposed inside a `FeedPost.repost`). Synthesizes a
    /// `StoryItem` from the snapshot fields. Used by `StoryRepostEmbedCell`
    /// when a feed POST reposts a STORY (`type == "STORY"` on the snapshot).
    public init(repost: RepostContent, preferredLanguage: String? = nil,
                preferredContentLanguages: [String]? = nil,
                preloadedImages: [String: UIImage] = [:],
                preloadedVideoURLs: [String: URL] = [:],
                preloadedAudioURLs: [String: URL] = [:],
                mute: Bool = false) {
        let translations: [StoryTranslation]? = repost.translations.map { dict in
            dict.map { lang, entry in StoryTranslation(language: lang, content: entry.text) }
        }
        let story = StoryItem(
            id: repost.id,
            content: repost.content.isEmpty ? nil : repost.content,
            media: repost.media,
            storyEffects: repost.storyEffects,
            createdAt: repost.timestamp,
            expiresAt: repost.expiresAt,
            repostOfId: nil,
            originalRepostOfId: repost.originalRepostOfId,
            repostAuthorName: repost.author,
            visibility: repost.visibility,
            audioUrl: repost.audioUrl,
            isViewed: false,
            translations: translations,
            reactionCount: 0,
            commentCount: 0
        )
        self.init(story: story,
                  preferredLanguage: preferredLanguage,
                  preferredContentLanguages: preferredContentLanguages,
                  preloadedImages: preloadedImages,
                  preloadedVideoURLs: preloadedVideoURLs,
                  preloadedAudioURLs: preloadedAudioURLs,
                  mute: mute)
    }

    /// Chaine de resolution finale : array si fourni, sinon preferredLanguage en
    /// element unique, sinon vide. Le caller normal (StoryViewerView) injecte la
    /// chaine complete depuis `MeeshyUser.preferredContentLanguages`.
    private var resolvedLanguageChain: [String] {
        if let chain = preferredContentLanguages, !chain.isEmpty { return chain }
        if let lang = preferredLanguage { return [lang] }
        return []
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
                foregroundMediaLayer()
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
            // Pre-warm the background video FIRST so its preroll task starts
            // before the SwiftUI body even evaluates `backgroundMediaLayer`.
            // Without this, the player isn't created until the first render
            // pass, and the user sees the colored placeholder while AVPlayer
            // chews through `.readyToPlay`.
            state.startBackgroundVideoPreroll(story: story)
            state.startPlaybackTimer()
            state.startMuteObservers()
            state.startBackgroundAudio(
                effects: story.storyEffects,
                story: story,
                preferredLanguages: resolvedLanguageChain,
                preloadedAudioURLs: preloadedAudioURLs
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
        } else if let thumbImg = state.thumbHashImage {
            // ThumbHash bitmap (< 1ms decode) covers the entire surface so the
            // user never sees a blank frame while real media is loading. The
            // foreground media (video, image, audio waveform) renders ABOVE
            // this layer and replaces it the instant its asset is ready —
            // which means even at 20% network load the slide still looks
            // intentional rather than empty.
            Image(uiImage: thumbImg)
                .resizable()
                .interpolation(.low)
                .scaledToFill()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
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
    /// Falls through ANY media item that carries one — `media.first` may lack a
    /// thumbHash even when later items have it (the upload pipeline doesn't
    /// guarantee ordering of the thumbHash field across media slots).
    private var resolvedThumbHash: String? {
        if let direct = story.storyEffects?.thumbHash { return direct }
        if let fromMedia = story.media.compactMap(\.thumbHash).first { return fromMedia }
        return nil
    }

    @ViewBuilder
    private var backgroundMediaLayer: some View {
        if let bgMedia = story.storyEffects?.resolvedBackgroundMedia {
            if bgMedia.kind == .image {
                if let preloaded = preloadedImages[bgMedia.id] {
                    Image(uiImage: preloaded)
                        .resizable()
                        .scaledToFill()
                        .bgTransform(scale: bgTransformScale, offsetX: bgTransformOffsetX, offsetY: bgTransformOffsetY, rotation: bgTransformRotation)
                } else if let urlStr = mediaURL(for: bgMedia.postMediaId) {
                    let thumbHash = story.media.first(where: { $0.id == bgMedia.postMediaId })?.thumbHash ?? resolvedThumbHash
                    backgroundImageView(urlStr: urlStr, thumbHash: thumbHash)
                }
            } else if bgMedia.kind == .video {
                if let url = resolvedVideoURL(for: bgMedia) {
                    let player = state.ensureBackgroundVideoPlayer(url: url, muted: false)
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
            let intensity = story.storyEffects?.filterIntensity ?? 1.0
            StoryFilterOverlayView(filter: filter, intensity: intensity)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .allowsHitTesting(false)
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
        let time = state.currentTime
        ForEach(state.textObjects) { obj in
            let opacity = state.textObjectOpacity(for: obj, at: time)
            if opacity > 0 {
                let content = resolvedText(for: obj)
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
                let kfX: CGFloat? = obj.keyframes.flatMap { frames -> CGFloat? in
                    let xs: [(time: Float, value: CGFloat, easing: StoryEasing)] = frames.compactMap { kf in
                        kf.x.map { (time: kf.time, value: $0, easing: kf.easing ?? .linear) }
                    }
                    return KeyframeInterpolator.interpolate(keyframes: xs, at: Float(time))
                }
                let kfY: CGFloat? = obj.keyframes.flatMap { frames -> CGFloat? in
                    let ys: [(time: Float, value: CGFloat, easing: StoryEasing)] = frames.compactMap { kf in
                        kf.y.map { (time: kf.time, value: $0, easing: kf.easing ?? .linear) }
                    }
                    return KeyframeInterpolator.interpolate(keyframes: ys, at: Float(time))
                }
                let kfScale: CGFloat? = obj.keyframes.flatMap { frames -> CGFloat? in
                    let ss: [(time: Float, value: CGFloat, easing: StoryEasing)] = frames.compactMap { kf in
                        kf.scale.map { (time: kf.time, value: $0, easing: kf.easing ?? .linear) }
                    }
                    return KeyframeInterpolator.interpolate(keyframes: ss, at: Float(time))
                }
                let kfOpacity: CGFloat? = obj.keyframes.flatMap { frames -> CGFloat? in
                    let os: [(time: Float, value: CGFloat, easing: StoryEasing)] = frames.compactMap { kf in
                        kf.opacity.map { (time: kf.time, value: $0, easing: kf.easing ?? .linear) }
                    }
                    return KeyframeInterpolator.interpolate(keyframes: os, at: Float(time))
                }
                let renderX = (kfX ?? CGFloat(obj.x)) * size.width
                let renderY = (kfY ?? CGFloat(obj.y)) * size.height
                let renderScale = kfScale ?? CGFloat(obj.scale)
                let renderOpacity = Double(opacity) * Double(kfOpacity ?? 1.0)
                Text(content)
                    .font(storyFont(for: style, size: CGFloat(fontSize)))
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
                    .scaleEffect(renderScale)
                    .opacity(renderOpacity)
                    .rotationEffect(.degrees(obj.rotation))
                    .position(x: renderX, y: renderY)
                    .zIndex(Double(obj.zIndex))
                    .allowsHitTesting(false)
                    .animation(.easeInOut(duration: 0.15), value: renderOpacity)
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
                    .zIndex(Double(sticker.zIndex ?? 0))
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

    // MARK: - Positioned Media Layer (timing-aware visibility + volume fade, skips first = bg)

    /// Applies keyframe overrides (position, scale) to `media` at `time`, returning a mutated copy.
    private func applyKeyframeOverrides(to media: StoryMediaObject, at time: Float) -> StoryMediaObject {
        var overridden = media
        if let pos = ReaderKeyframeResolver.resolvedPosition(
            for: media, keyframes: media.keyframes, currentTime: time
        ) {
            overridden.x = Double(pos.x)
            overridden.y = Double(pos.y)
        }
        if let scale = ReaderKeyframeResolver.resolvedScale(
            keyframes: media.keyframes, currentTime: time
        ) {
            overridden.scale = Double(scale)
        }
        return overridden
    }

    @ViewBuilder
    private func foregroundMediaLayer() -> some View {
        let time = state.currentTime
        let foregroundMedia = story.storyEffects?.resolvedForegroundMediaObjects ?? []
        let transitions = story.storyEffects?.clipTransitions ?? []
        ForEach(foregroundMedia) { media in
            let visible = state.mediaObjectVisible(media, at: time)
            if visible {
                let overriddenMedia = applyKeyframeOverrides(to: media, at: Float(time))
                let kfOpacity = ReaderKeyframeResolver.resolvedOpacity(
                    keyframes: media.keyframes, currentTime: Float(time)
                )
                let combinedOpacity = Double(
                    Float(state.mediaObjectOpacity(for: media, at: time))
                    * ReaderTransitionResolver.opacity(
                        for: media, transitions: transitions, currentTime: Float(time)
                    )
                    * Float(kfOpacity ?? 1.0)
                )
                DraggableMediaView(
                    mediaObject: .constant(overriddenMedia),
                    image: state.loadedImages[media.id] ?? preloadedImages[media.id],
                    videoURL: media.kind == .video ? resolvedVideoURL(for: media) : nil,
                    externalPlayer: media.kind == .video ? state.foregroundVideoPlayers[media.id] : nil,
                    isEditing: false,
                    naturalAspectRatio: state.mediaAspectRatios[media.id],
                    onAspectRatioResolved: { resolved in
                        state.mediaAspectRatios[media.id] = resolved
                    }
                )
                .opacity(combinedOpacity)
                .zIndex(Double(media.zIndex))
                .animation(.easeInOut(duration: 0.15), value: combinedOpacity)
            }
        }
    }

    // MARK: - Audio Layer (timing-aware visibility, all audio players on top)

    @ViewBuilder
    private var foregroundAudioLayer: some View {
        let time = state.currentTime
        ForEach(story.storyEffects?.resolvedForegroundAudioPlayers ?? []) { audio in
            let visible = state.audioObjectVisible(audio, at: time)
            if visible {
                StoryAudioPlayerView(
                    audioObject: .constant(audio),
                    url: resolvedAudioURL(for: audio),
                    isEditing: false,
                    externalPlayer: state.foregroundAudioPlayers[audio.id],
                    parentManagesPlayback: true
                )
                .opacity(state.audioObjectOpacity(for: audio, at: time))
                .zIndex(Double(audio.zIndex ?? 0))
                .animation(.easeInOut(duration: 0.15), value: state.audioObjectOpacity(for: audio, at: time))
            }
        }
    }

    // MARK: - Helpers

    /// Resout le texte selon le Prisme : on essaie chaque langue de la chaine
    /// preferee dans l'ordre, sinon on retombe sur l'original. Pas de fallback
    /// implicite vers l'anglais — l'absence de traduction signifie que le contenu
    /// est deja dans la langue de l'utilisateur OU qu'aucune traduction n'a ete
    /// generee. Voir CLAUDE.md "Prisme Linguistique".
    private func resolvedText(for obj: StoryTextObject) -> String {
        guard let translations = obj.translations else { return obj.text }
        for lang in resolvedLanguageChain {
            if let translated = translations[lang] { return translated }
        }
        return obj.text
    }

    /// Résout l'URL d'un media par son postMediaId depuis les médias legacy du StoryItem.
    private func mediaURL(for postMediaId: String) -> String? {
        story.media.first { $0.id == postMediaId }?.url
    }

    /// Résout l'URL vidéo : preloaded (preview) > story.media (viewer normal).
    private func resolvedVideoURL(for media: StoryMediaObject) -> URL? {
        if let url = preloadedVideoURLs[media.id] { return url }
        guard let urlStr = story.media.first(where: { $0.id == media.postMediaId })?.url else { return nil }
        return MeeshyConfig.resolveMediaURL(urlStr)
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
    /// Aspect ratios (width/height) detected for foreground media — populated
    /// asynchronously for videos and synchronously from `UIImage.size` for images.
    @Published var mediaAspectRatios: [String: CGFloat] = [:]
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
    /// Players audio foreground — un par audio, demarres selon leur startTime.
    /// Exposes as @Published so `StoryAudioPlayerView` can bind to the parent-owned
    /// player instead of spawning its own (which would cause duplicate playback).
    @Published var foregroundAudioPlayers: [String: AVPlayer] = [:]
    private var foregroundAudioObservers: [String: NSObjectProtocol] = [:]
    private var foregroundAudioStopTimers: [String: Timer] = [:]
    /// KVO observers for player readyToPlay — must be stored to avoid premature dealloc
    private var readyObservers: [String: NSKeyValueObservation] = [:]
    private var cancellables = Set<AnyCancellable>()
    private var fadeTimer: Timer?
    /// Drives per-frame playback timing. Replaces the legacy 50ms `Timer` —
    /// CADisplayLink is synchronized with the display refresh rate (60 Hz on
    /// most iPhones, 120 Hz on ProMotion) so the gap between a clip's
    /// `startTime` and the moment we kick its player off is at most one frame
    /// (~16ms / ~8ms), versus 0-50ms with the old timer.
    private var displayLink: CADisplayLink?
    /// Clips already pre-rolled in advance of their `startTime`. Tracked so the
    /// per-frame check doesn't re-trigger preroll every refresh once we've
    /// initiated it for a given clip — preroll is async and idempotent on its
    /// own, but we'd rather not pile work onto the player cache for nothing.
    private var preRolledVideoIds: Set<String> = []
    private var preRolledAudioIds: Set<String> = []
    /// 100 ms — the lead time at which we begin warming an upcoming clip's
    /// player. Aligns with the user-visible slide-transition window so the
    /// transition itself masks any residual `play()` startup latency.
    private static let preRollLeadTime: TimeInterval = 0.1
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

    /// When `true`, all audio playback is suppressed (background audio activation
    /// is skipped, foreground video players start muted, foreground audios are
    /// not started). Set once at init from `StoryCanvasReaderView.mute`.
    let mute: Bool

    init(story: StoryItem, mute: Bool = false) {
        self.mute = mute
        // Migrate legacy text -> textObjects si necessaire
        var objects = story.storyEffects?.textObjects ?? []
        if objects.isEmpty, let content = story.content, !content.isEmpty {
            var effects = story.storyEffects ?? StoryEffects()
            effects.migrateLegacyText(content: content)
            objects = effects.textObjects
        }
        self.textObjects = objects

        // Pre-decode thumbHash for instant placeholder display.
        // Search story.media exhaustively for the first item that carries a
        // thumbHash — earlier code only looked at `media.first`, so if the
        // first media slot was an audio (which typically has no thumbHash)
        // the foreground video's thumbHash was missed and the user saw a
        // blank slide while the asset downloaded.
        let hash = story.storyEffects?.thumbHash ?? story.media.compactMap(\.thumbHash).first
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
        preRolledVideoIds.removeAll()
        preRolledAudioIds.removeAll()

        displayLink?.invalidate()
        let link = CADisplayLink(target: self, selector: #selector(displayLinkTick(_:)))
        // Request the device's max refresh rate (120 Hz on ProMotion, 60 Hz
        // elsewhere). A high preferred rate means we re-evaluate clip starts
        // every ~8ms instead of the legacy 50ms — the difference between a
        // perceptible "click off" delay and a frame-tight cut.
        if #available(iOS 15.0, *) {
            link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
        }
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    func stopPlaybackTimer() {
        displayLink?.invalidate()
        displayLink = nil
    }

    /// CADisplayLink callback (main thread). Mirrors the legacy timer body
    /// but fires per display refresh instead of every 50ms.
    @objc private func displayLinkTick(_ link: CADisplayLink) {
        guard let start = playbackStartDate else { return }
        currentTime = Date().timeIntervalSince(start)
        checkPendingVideoStarts()
        checkPendingAudioStarts()
    }

    // MARK: Text object timing

    func textObjectOpacity(for obj: StoryTextObject, at time: TimeInterval) -> Double {
        let start = TimeInterval(obj.startTime ?? 0)
        let fadeInDur = TimeInterval(obj.fadeIn ?? 0)
        let fadeOutDur = TimeInterval(obj.fadeOut ?? 0)

        // No timing fields at all -> always visible (backward compatible)
        guard obj.startTime != nil || obj.duration != nil else { return 1.0 }

        // Before start time -> invisible
        if time < start { return 0.0 }

        let elapsed = time - start

        // During fade-in
        if fadeInDur > 0, elapsed < fadeInDur {
            return min(1.0, elapsed / fadeInDur)
        }

        // Check display duration
        if let displayDur = obj.duration {
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
        // Foreground media plays exactly once — only `isBackground == true`
        // clips are allowed to loop (per spec). Background media is rendered
        // by `backgroundMediaLayer`, not this layer, so any media reaching
        // this method is foreground and we ignore `media.loop` entirely.
        if let dur = media.duration {
            if time >= start + TimeInterval(dur) { return false }
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
        // Foreground audio plays once — `audio.loop` is ignored. Background
        // audio uses the dedicated background-audio path which honours its
        // own loop flag.
        if let dur = audio.duration {
            if time >= start + TimeInterval(dur) { return false }
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
        // Charge les images foreground (exclut le media background résolu).
        let foregroundImages = (story.storyEffects?.resolvedForegroundMediaObjects ?? [])
            .filter { $0.kind == .image }

        // Phase 1: Synchronous — populate from preloaded + disk cache (instant)
        var needsNetworkLoad: [(id: String, resolved: String)] = []
        for media in foregroundImages {
            if let img = preloadedImages[media.id] {
                loadedImages[media.id] = await ReaderState.preDecoded(img)
                continue
            }
            guard let urlString = story.media.first(where: { $0.id == media.postMediaId })?.url,
                  let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString else { continue }
            if let cached = DiskCacheStore.cachedImage(for: resolved) {
                loadedImages[media.id] = await ReaderState.preDecoded(cached)
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
                    // Pre-decode off the main thread so the first SwiftUI
                    // render of the image doesn't pay the CGImage decode
                    // cost — that 2-50ms hitch hits at the worst possible
                    // time (the moment the slide transition completes).
                    guard let img else { return (item.id, nil) }
                    return (item.id, await ReaderState.preDecoded(img))
                }
            }
            for await (id, img) in group {
                if let img { loadedImages[id] = img }
            }
        }
    }

    /// Forces the underlying `CGImage` to be decoded NOW so the first SwiftUI
    /// `Image(uiImage:)` render hits a ready-to-paint bitmap. Uses Apple's
    /// `preparingForDisplay()` (iOS 15+) which decodes off the main thread
    /// and returns a new `UIImage` whose backing store is already in CPU
    /// memory at display gamma.
    ///
    /// Cost: 2-50ms per image (depending on size + format) on background
    /// queue. Saves the same cost on the main thread when rendering, which
    /// is the difference between a smooth transition and a janky frame at
    /// the exact moment the user expects the image to appear.
    nonisolated static func preDecoded(_ image: UIImage) async -> UIImage {
        if #available(iOS 15.0, *) {
            return await Task.detached(priority: .userInitiated) {
                image.preparingForDisplay() ?? image
            }.value
        }
        return image
    }

    // MARK: Background audio

    func startBackgroundAudio(effects: StoryEffects?, story: StoryItem, preferredLanguages: [String],
                              preloadedAudioURLs: [String: URL] = [:]) {
        guard !mute else { return }
        guard let effects, let bgAudio = effects.resolvedBackgroundAudio else { return }

        // Resolution Prisme : on essaie chaque langue de la chaine preferee dans
        // l'ordre, sinon on retombe sur la variante originale (postMediaId direct).
        let variants = bgAudio.backgroundAudioVariants ?? []
        let resolvedMediaId: String = preferredLanguages
            .lazy
            .compactMap { lang in variants.first { $0.language == lang }?.postMediaId }
            .first ?? bgAudio.postMediaId

        // Preview mode: check preloaded URLs first (keyed by object id or postMediaId)
        let url: URL
        if let preloaded = preloadedAudioURLs[bgAudio.id] ?? preloadedAudioURLs[resolvedMediaId] {
            url = preloaded
        } else if let urlString = story.media.first(where: { $0.id == resolvedMediaId })?.url,
                  let resolved = MeeshyConfig.resolveMediaURL(urlString) {
            url = resolved
        } else {
            return
        }

        // Publish for test introspection (see `StoryMediaCoordinator.backgroundAudioSourceId`).
        StoryMediaCoordinator.shared.backgroundAudioSourceId = resolvedMediaId

        let userVolume = bgAudio.volume
        targetBackgroundVolume = userVolume

        // Cache-first: use prerolled player or local disk file before network stream
        let player: AVPlayer
        let playerWasCached: Bool
        if let cached = StoryMediaLoader.shared.cachedPlayer(for: url) {
            player = cached
            playerWasCached = true
        } else if let localURL = CacheCoordinator.audioLocalFileURL(for: url.absoluteString) {
            player = AVPlayer(url: localURL)
            playerWasCached = false
        } else {
            player = AVPlayer(url: url)
            playerWasCached = false
        }
        if playerWasCached {
            player.automaticallyWaitsToMinimizeStalling = false
        }
        player.volume = userVolume * 0.2  // Demarrer a 20% du volume cible
        backgroundPlayer = player

        let startTime = bgAudio.startTime.map { TimeInterval($0) }
        if let startTime {
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
            if let startTime {
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
        // Démarre les videos foreground (exclut le media background résolu).
        let videoObjects = (story.storyEffects?.resolvedForegroundMediaObjects ?? [])
            .filter { $0.kind == .video }

        // Aggressive pre-warm: start filling StoryMediaLoader's player cache
        // for *every* video URL in this slide as soon as the reader appears.
        // The cache caps at 6 prerolled players, so this is bounded; entries
        // that arrive before their `startTime` are picked up via
        // `cachedPlayer(for:)` inside `createAndStartVideoPlayer`. Round-2
        // assumption: by the time the slide transition is 100ms from over,
        // every clip in the *current* slide already has a prerolled player
        // sitting in the cache.
        var preWarmURLs: [URL] = []
        for media in videoObjects {
            if let preloaded = preloadedVideoURLs[media.id] {
                registerPendingVideoStart(media: media, url: preloaded)
                preWarmURLs.append(preloaded)
            } else if let urlString = story.media.first(where: { $0.id == media.postMediaId })?.url,
                      let resolved = MeeshyConfig.resolveMediaURL(urlString) {
                // Use prerolled cached player if available (prefetched by StoryViewerView)
                if let cachedPlayer = StoryMediaLoader.shared.cachedPlayer(for: resolved) {
                    registerPendingVideoStartWithPlayer(media: media, player: cachedPlayer)
                } else {
                    // Stream directly — AVPlayer handles HTTP streaming natively with buffering
                    registerPendingVideoStart(media: media, url: resolved)
                }
                preWarmURLs.append(resolved)
            }
        }
        for url in preWarmURLs {
            Task { await StoryMediaLoader.shared.preloadAndCachePlayer(url: url) }
        }
        // Apply mute flag on any players already created synchronously by the
        // registration path (the rest will be created by the timing scheduler;
        // they pick up `mute` via `injectPrerolledVideoPlayer` / `createAndStartVideoPlayer`).
        if mute {
            for (_, player) in foregroundVideoPlayers {
                player.isMuted = true
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

        player.isMuted = mute
        let targetVolume = media.volume
        let hasFadeIn = (media.fadeIn ?? 0) > 0
        player.volume = hasFadeIn ? 0.0 : targetVolume
        foregroundVideoPlayers[media.id] = player

        // Foreground media plays exactly once. No AVPlayerLooper here.
        let obs = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: player.currentItem,
            queue: .main
        ) { [weak self] _ in
            self?.foregroundSoundDidStop()
        }
        foregroundLoopObservers[media.id] = obs

        player.play()
        foregroundSoundDidStart()

        let fadeInDuration = TimeInterval(media.fadeIn ?? 0)
        if fadeInDuration > 0 {
            fadeVolume(player: player, from: 0.0, to: targetVolume, duration: fadeInDuration)
        }

        if let dur = media.duration {
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

    /// Returns the latest effective end time among all foreground media — used
    /// by `effectiveStoryDuration` so the playback timer keeps ticking until
    /// the longest media has played all the way through. Foreground media is
    /// non-looping (per spec), so once the longest one ends the slide is
    /// effectively done.
    func maxForegroundMediaEndTime() -> Double {
        guard let effects = currentStoryRef?.storyEffects else { return 0 }
        var maxEnd: Double = 0
        for media in effects.resolvedForegroundMediaObjects {
            let start = Double(media.startTime ?? 0)
            let duration = Double(media.duration ?? 0)
            maxEnd = max(maxEnd, start + duration)
        }
        for audio in effects.resolvedForegroundAudioPlayers {
            let start = Double(audio.startTime ?? 0)
            let duration = Double(audio.duration ?? 0)
            maxEnd = max(maxEnd, start + duration)
        }
        for text in effects.textObjects {
            let start = text.startTime ?? 0
            let duration = text.duration ?? 0
            maxEnd = max(maxEnd, start + duration)
        }
        return maxEnd
    }

    private func checkPendingVideoStarts() {
        for (id, pending) in pendingVideoStarts {
            let startOffset = TimeInterval(pending.media.startTime ?? 0)
            // Lead-time preroll: kick StoryMediaLoader off the moment we're
            // within 100ms of startTime so the player is ready to render the
            // first frame the instant `play()` is called below. The cache the
            // loader fills is consumed by `createAndStartVideoPlayer` — same
            // path as the slide-load pre-warm, so this is a safety net for
            // late-arriving clips (URL resolved after slide onAppear).
            if currentTime + Self.preRollLeadTime >= startOffset,
               !preRolledVideoIds.contains(id),
               currentTime < startOffset {
                preRolledVideoIds.insert(id)
                let url = pending.url
                Task { await StoryMediaLoader.shared.preloadAndCachePlayer(url: url) }
            }
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
        let playerWasCached: Bool
        if let cached {
            player = cached
            playerWasCached = true
        } else {
            let item = AVPlayerItem(url: url)
            // 2s buffer when we DON'T own a prerolled player — gives
            // AVFoundation breathing room on a slow network. Cached players
            // were created via StoryMediaLoader.preloadVideoPlayer() which
            // already prerolled them, so they tolerate the lower buffer.
            item.preferredForwardBufferDuration = 2.0
            player = AVQueuePlayer(playerItem: item)
            playerWasCached = false
        }
        // Skip-stall optimization is ONLY safe for cached prerolled players.
        // For freshly-created players streaming over HTTP, leaving auto-wait
        // off causes silent failures: the player drains its (empty) buffer
        // and stops without retrying. The cache path was already configured
        // with `automaticallyWaitsToMinimizeStalling = false` inside
        // `preloadVideoPlayer`, so we don't reapply it here.
        if playerWasCached {
            player.automaticallyWaitsToMinimizeStalling = false
        }
        player.isMuted = mute
        let targetVolume = media.volume
        let hasFadeIn = (media.fadeIn ?? 0) > 0

        player.volume = hasFadeIn ? 0.0 : targetVolume
        foregroundVideoPlayers[media.id] = player

        // Foreground media plays exactly once per spec — no AVPlayerLooper.
        // Looping is reserved for the background video path which uses
        // `backgroundVideoLooper` in `ensureBackgroundVideoPlayer`.
        let obs = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: player.currentItem,
            queue: .main
        ) { [weak self] _ in
            self?.foregroundSoundDidStop()
        }
        foregroundLoopObservers[media.id] = obs

        // Wait for readyToPlay before playing to avoid blank frame
        let mediaId = media.id
        let scheduledStart = TimeInterval(media.startTime ?? 0)
        // Calibration logging — surface the gap between when the timeline
        // wanted the clip to start (currentTime, scheduledStart) and the
        // moment we actually fire play(). Filter via:
        //   xcrun simctl spawn booted log stream --predicate 'subsystem == "me.meeshy.app" && category == "story.playback"'
        let invokedAt = self.currentTime
        if player.currentItem?.status == .readyToPlay {
            player.play()
            foregroundSoundDidStart()
            storyPlaybackLogger.info("video play READY mediaId=\(mediaId, privacy: .public) wasCached=\(playerWasCached, privacy: .public) scheduledStart=\(scheduledStart, format: .fixed(precision: 3)) currentTime=\(invokedAt, format: .fixed(precision: 3)) latency=\((invokedAt - scheduledStart) * 1000, format: .fixed(precision: 1))ms")
        } else {
            storyPlaybackLogger.info("video play DEFERRED mediaId=\(mediaId, privacy: .public) wasCached=\(playerWasCached, privacy: .public) status=\(player.currentItem?.status.rawValue ?? -1) scheduledStart=\(scheduledStart, format: .fixed(precision: 3)) currentTime=\(invokedAt, format: .fixed(precision: 3))")
            readyObservers[mediaId]?.invalidate()
            readyObservers[mediaId] = player.currentItem?.observe(\.status, options: [.new]) { [weak self, weak player] item, _ in
                guard item.status == .readyToPlay || item.status == .failed else { return }
                DispatchQueue.main.async {
                    self?.readyObservers.removeValue(forKey: mediaId)?.invalidate()
                    if item.status == .readyToPlay {
                        player?.play()
                        self?.foregroundSoundDidStart()
                        if let nowTime = self?.currentTime {
                            storyPlaybackLogger.info("video play KVO-FIRED mediaId=\(mediaId, privacy: .public) currentTime=\(nowTime, format: .fixed(precision: 3)) latency=\((nowTime - scheduledStart) * 1000, format: .fixed(precision: 1))ms")
                        }
                    } else {
                        storyPlaybackLogger.error("video FAILED mediaId=\(mediaId, privacy: .public) status=\(item.status.rawValue)")
                    }
                }
            }
        }

        // Volume fade-in (only if explicitly configured)
        let fadeInDuration = TimeInterval(media.fadeIn ?? 0)
        if fadeInDuration > 0 {
            fadeVolume(player: player, from: 0.0, to: targetVolume, duration: fadeInDuration)
        }

        // Schedule stop + fade-out — foreground always plays once.
        if let dur = media.duration {
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
        guard !mute else { return }
        // Seuls les audios foreground sont démarrés ici — l'audio background (si présent)
        // est géré séparément par `startBackgroundAudio`.
        let foregroundAudios = story.storyEffects?.resolvedForegroundAudioPlayers ?? []
        var preWarmURLs: [URL] = []
        for audio in foregroundAudios {
            if let preloaded = preloadedAudioURLs[audio.id] {
                registerPendingAudioStart(audio: audio, url: preloaded)
                preWarmURLs.append(preloaded)
            } else if let urlStr = story.media.first(where: { $0.id == audio.postMediaId })?.url,
                      let resolved = MeeshyConfig.resolveMediaURL(urlStr) {
                registerPendingAudioStart(audio: audio, url: resolved)
                preWarmURLs.append(resolved)
            }
        }
        for url in preWarmURLs {
            Task { await StoryMediaLoader.shared.preloadAndCachePlayer(url: url) }
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
            if currentTime + Self.preRollLeadTime >= startOffset,
               !preRolledAudioIds.contains(id),
               currentTime < startOffset {
                preRolledAudioIds.insert(id)
                let url = pending.url
                Task { await StoryMediaLoader.shared.preloadAndCachePlayer(url: url) }
            }
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
        let playerWasCached: Bool
        if let cached {
            player = cached
            playerWasCached = true
        } else {
            let item = AVPlayerItem(url: url)
            item.preferredForwardBufferDuration = 2.0
            player = AVQueuePlayer(playerItem: item)
            playerWasCached = false
        }
        // See createAndStartVideoPlayer: only safe on prerolled cached players.
        if playerWasCached {
            player.automaticallyWaitsToMinimizeStalling = false
        }
        let targetVolume = audio.volume
        let hasFadeIn = (audio.fadeIn ?? 0) > 0

        player.volume = hasFadeIn ? 0.0 : targetVolume
        foregroundAudioPlayers[audio.id] = player

        // Foreground audio plays exactly once. No AVPlayerLooper.
        let obs = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: player.currentItem,
            queue: .main
        ) { [weak self] _ in
            self?.foregroundSoundDidStop()
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
                    // Removal returns the observer only on the first dispatch — subsequent
                    // KVO fires (e.g. status toggling) will find nil and exit, preventing
                    // a duplicate play() call.
                    guard let self, self.readyObservers.removeValue(forKey: audioId) != nil else { return }
                    if item.status == .readyToPlay {
                        player?.play()
                        self.foregroundSoundDidStart()
                    }
                }
            }
        }

        // Volume fade-in
        let fadeInDuration = TimeInterval(audio.fadeIn ?? 0)
        if fadeInDuration > 0 {
            fadeVolume(player: player, from: 0.0, to: targetVolume, duration: fadeInDuration)
        }

        // Schedule fade-out + stop — foreground audio always plays once.
        if let dur = audio.duration {
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

    /// Background videos must loop seamlessly to fill the slide duration —
    /// a 2s clip on a 4s (or longer) slide should play repeatedly, not stop
    /// after one playthrough. We try the prerolled cache first
    /// (StoryMediaLoader.preloadVideoPlayer always returns `AVQueuePlayer`,
    /// despite the function's `AVPlayer` return type), then fall back to a
    /// fresh `AVQueuePlayer`. Without this lookup the user sees the colored
    /// background placeholder for 1-6 seconds while a freshly-created
    /// AVPlayerItem fights for `.readyToPlay` — the bug surfaced as
    /// "fond coloré qui flashe pendant plusieurs secondes" on the J. Charles
    /// slide.
    func ensureBackgroundVideoPlayer(url: URL, muted: Bool = false) -> AVPlayer {
        if let existing = backgroundVideoPlayer {
            return existing
        }
        let queuePlayer: AVQueuePlayer
        let wasCached: Bool
        if let cached = StoryMediaLoader.shared.cachedPlayer(for: url) as? AVQueuePlayer {
            queuePlayer = cached
            wasCached = true
        } else {
            let item = AVPlayerItem(url: url)
            item.preferredForwardBufferDuration = 2.0
            queuePlayer = AVQueuePlayer(playerItem: item)
            wasCached = false
        }
        queuePlayer.isMuted = muted
        if let currentItem = queuePlayer.currentItem {
            backgroundVideoLooper = AVPlayerLooper(player: queuePlayer, templateItem: currentItem)
        }
        queuePlayer.play()
        backgroundVideoPlayer = queuePlayer
        storyPlaybackLogger.info("background video START url=\(url.absoluteString, privacy: .public) cached=\(wasCached, privacy: .public)")
        return queuePlayer
    }

    /// Triggers preroll for a background-video URL the moment the slide
    /// appears — without waiting for the SwiftUI body to evaluate
    /// `backgroundMediaLayer`. The cached prerolled player is consumed by
    /// `ensureBackgroundVideoPlayer` on the first render. This gives the
    /// background up to ~300 ms of head start vs the legacy lazy path.
    func startBackgroundVideoPreroll(story: StoryItem) {
        guard backgroundVideoPlayer == nil else { return }
        let candidateURLs = backgroundVideoCandidateURLs(for: story)
        for url in candidateURLs {
            Task { await StoryMediaLoader.shared.preloadAndCachePlayer(url: url) }
        }
    }

    private func backgroundVideoCandidateURLs(for story: StoryItem) -> [URL] {
        var urls: [URL] = []
        if let bgMedia = story.storyEffects?.resolvedBackgroundMedia, bgMedia.kind == .video,
           let urlStr = story.media.first(where: { $0.id == bgMedia.postMediaId })?.url,
           let resolved = MeeshyConfig.resolveMediaURL(urlStr) {
            urls.append(resolved)
        }
        // Legacy path: first media item itself is a video and the slide has
        // no explicit storyEffects.mediaObjects.
        if let legacy = story.media.first,
           legacy.type == .video,
           (story.storyEffects?.mediaObjects ?? []).isEmpty,
           let urlStr = legacy.url,
           let resolved = MeeshyConfig.resolveMediaURL(urlStr) {
            urls.append(resolved)
        }
        return urls
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
