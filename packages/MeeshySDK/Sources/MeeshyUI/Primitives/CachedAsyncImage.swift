import SwiftUI
import MeeshySDK

public struct CachedAsyncImage<Placeholder: View>: View {
    public let urlString: String?
    /// Optional rendered size (in SwiftUI points) used for downsampling.
    /// When provided the image is decoded at `max(width, height) × screenScale`
    /// pixels instead of the pipeline's default 1200 px cap, keeping small
    /// thumbnails (avatars, covers) from allocating full-resolution bitmaps.
    /// Pass `nil` (default) to keep the existing behaviour unchanged.
    public let targetSize: CGSize?
    /// Optional base64 ThumbHash. When provided and the full image is not yet
    /// resident, its decoded ~32 px blur is shown instead of the bare
    /// placeholder — the bubble fills in instantly with a recognisable preview
    /// rather than an empty shimmer while the network fetch runs.
    public let thumbHash: String?
    public let placeholder: () -> Placeholder

    @State private var image: UIImage?
    @State private var thumbHashImage: UIImage?
    @State private var isLoading = false
    @State private var hasFailed = false
    @State private var retryCount = 0

    public init(
        url urlString: String?,
        targetSize: CGSize? = nil,
        thumbHash: String? = nil,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.urlString = urlString
        self.targetSize = targetSize
        self.thumbHash = thumbHash
        self.placeholder = placeholder
        let cachedFull: UIImage?
        if let urlString, !urlString.isEmpty {
            let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
            cachedFull = DiskCacheStore.cachedImage(for: resolved)
        } else {
            cachedFull = nil
        }
        _image = State(initialValue: cachedFull)
        if cachedFull == nil, let thumbHash, !thumbHash.isEmpty {
            _thumbHashImage = State(initialValue: UIImage.fromThumbHash(thumbHash))
        }
    }

    public var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable()
            } else if hasFailed {
                thumbHashBackdrop {
                    Button {
                        hasFailed = false
                        retryCount += 1
                    } label: {
                        VStack(spacing: 4) {
                            Image(systemName: "arrow.clockwise.circle.fill")
                                .font(.system(size: 22, weight: .medium))
                                .foregroundStyle(.white.opacity(0.7))
                            Text(String(localized: "common.retry", defaultValue: "Retry", bundle: .module))
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.5))
                        }
                    }
                }
            } else {
                thumbHashBackdrop {
                    if isLoading { ProgressView().tint(.white.opacity(0.6)) }
                }
            }
        }
        .task(id: "\(urlString ?? "")_\(retryCount)") { await loadImage(for: urlString) }
        .onChange(of: urlString) { _, newUrl in
            hasFailed = false
            guard let newUrl, !newUrl.isEmpty else {
                image = nil
                thumbHashImage = nil
                return
            }
            let resolved = MeeshyConfig.resolveMediaURL(newUrl)?.absoluteString ?? newUrl
            let cached = DiskCacheStore.cachedImage(for: resolved)
            image = cached
            // Refresh the ThumbHash blur for the new url — cells are reused, so
            // stale @State from the previous message must not bleed through.
            thumbHashImage = (cached == nil)
                ? thumbHash.flatMap { $0.isEmpty ? nil : UIImage.fromThumbHash($0) }
                : nil
        }
    }

    /// While the full image loads, render the decoded ThumbHash blur when one
    /// is available; otherwise fall back to the caller's placeholder. The
    /// supplied `overlay` (spinner / retry button) is layered on top.
    @ViewBuilder
    private func thumbHashBackdrop<Overlay: View>(@ViewBuilder overlay: () -> Overlay) -> some View {
        if let thumbHashImage {
            Image(uiImage: thumbHashImage)
                .resizable()
                .interpolation(.low)
                .overlay { overlay() }
        } else {
            placeholder()
                .overlay { overlay() }
        }
    }

    @MainActor private static func pixelSize(for points: CGSize) -> CGFloat {
        max(points.width, points.height) * UIScreen.main.scale
    }

    private func loadImage(for currentUrlString: String?) async {
        guard let currentUrlString, !currentUrlString.isEmpty else { return }

        let resolved = MeeshyConfig.resolveMediaURL(currentUrlString)?.absoluteString ?? currentUrlString
        if image != nil && DiskCacheStore.cachedImage(for: resolved) != nil { return }

        // Policy gate: when the image isn't already on disk and the user's
        // preference + current network condition disallow auto-download for
        // images, leave the thumbHash / placeholder in place. A manual tap
        // (e.g. fullscreen open) overrides this and forces a fetch — that's
        // handled at the parent (spec §14.1). Cached avatars and banners
        // bypass this check (they go through CachedAvatarImage /
        // CachedBannerImage which intentionally remain ungated).
        if DiskCacheStore.cachedImage(for: resolved) == nil,
           !MediaDownloadPolicy.shouldAutoLoadImage() { return }

        isLoading = true; hasFailed = false
        let loaded: UIImage?
        if let targetSize {
            let maxPixel = await Self.pixelSize(for: targetSize)
            loaded = await CacheCoordinator.shared.images.image(for: resolved, maxPixelSize: maxPixel)
        } else {
            loaded = await CacheCoordinator.shared.images.image(for: resolved)
        }
        if !Task.isCancelled {
            if let loaded, self.urlString == currentUrlString {
                withAnimation(.easeIn(duration: 0.15)) { self.image = loaded }
            } else if loaded == nil {
                hasFailed = true
            }
        }
        if !Task.isCancelled { isLoading = false }
    }
}

/// Internal helper that hides the singleton plumbing for the image policy
/// gate. Both `CachedAsyncImage` and `ProgressiveCachedImage` call this
/// before issuing a network fetch — when it returns `false`, the view stays
/// on the thumbHash / thumbnail / placeholder and the bytes are saved.
@MainActor
enum MediaDownloadPolicy {
    static func shouldAutoLoadImage() -> Bool {
        MediaDownloadPolicyEngine.shouldAutoDownload(
            kind: .image,
            condition: NetworkConditionMonitor.shared.condition,
            prefs: MediaDownloadPreferencesStore.shared.preferences
        )
    }
}

extension CachedAsyncImage where Placeholder == Color {
    public init(url urlString: String?, targetSize: CGSize? = nil, thumbHash: String? = nil) {
        self.init(url: urlString, targetSize: targetSize, thumbHash: thumbHash) { Color.gray.opacity(0.2) }
    }
}

public struct CachedAvatarImage: View {
    public let urlString: String?
    public let thumbHash: String?
    public let name: String
    public let size: CGFloat
    public let accentColor: String

    @State private var image: UIImage?
    @State private var thumbHashImage: UIImage?

    public init(urlString: String?, thumbHash: String? = nil, name: String, size: CGFloat, accentColor: String) {
        self.urlString = urlString; self.thumbHash = thumbHash; self.name = name; self.size = size; self.accentColor = accentColor
        
        let cachedFull: UIImage?
        if let urlString, !urlString.isEmpty {
            let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
            cachedFull = DiskCacheStore.cachedImage(for: resolved)
        } else {
            cachedFull = nil
        }
        _image = State(initialValue: cachedFull)
        
        if cachedFull == nil, let thumbHash, !thumbHash.isEmpty {
            _thumbHashImage = State(initialValue: UIImage.fromThumbHash(thumbHash))
        }
    }

    public var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().aspectRatio(contentMode: .fill)
            } else if let thumbHashImage {
                Image(uiImage: thumbHashImage).resizable().aspectRatio(contentMode: .fill)
            } else { initialsFallback }
        }
        .frame(width: size, height: size).clipShape(Circle())
        .task(id: urlString) { await loadAvatar(for: urlString) }
        .onChange(of: urlString) { _, newUrl in
            guard let newUrl, !newUrl.isEmpty else { image = nil; return }
            let resolved = MeeshyConfig.resolveMediaURL(newUrl)?.absoluteString ?? newUrl
            image = DiskCacheStore.cachedImage(for: resolved)
        }
    }

    private var initialsFallback: some View {
        let initials = name.components(separatedBy: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
        let color = Color(hex: accentColor)
        return ZStack {
            LinearGradient(colors: [color, color.opacity(0.7)], startPoint: .topLeading, endPoint: .bottomTrailing)
            Text(initials.isEmpty ? "?" : initials)
                .font(.system(size: size * 0.38, weight: .semibold, design: .rounded))
                .foregroundColor(.white)
        }
    }

    @MainActor private static func pixelSize(for points: CGFloat) -> CGFloat {
        points * UIScreen.main.scale
    }

    private func loadAvatar(for currentUrlString: String?) async {
        guard let currentUrlString, !currentUrlString.isEmpty else { return }
        let resolved = MeeshyConfig.resolveMediaURL(currentUrlString)?.absoluteString ?? currentUrlString
        if image != nil && DiskCacheStore.cachedImage(for: resolved) != nil { return }
        let maxPixel = await Self.pixelSize(for: size)
        if let loaded = await CacheCoordinator.shared.images.image(for: resolved, maxPixelSize: maxPixel) {
            if self.urlString == currentUrlString {
                withAnimation(.easeIn(duration: 0.15)) { self.image = loaded }
            }
        }
    }
}

public struct CachedBannerImage: View {
    public let urlString: String?
    public let thumbHash: String?
    public let fallbackColor: String
    public let height: CGFloat

    @State private var image: UIImage?
    @State private var thumbHashImage: UIImage?

    public init(urlString: String?, thumbHash: String? = nil, fallbackColor: String, height: CGFloat) {
        self.urlString = urlString; self.thumbHash = thumbHash; self.fallbackColor = fallbackColor; self.height = height
        
        let cachedFull: UIImage?
        if let urlString, !urlString.isEmpty {
            let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
            cachedFull = DiskCacheStore.cachedImage(for: resolved)
        } else {
            cachedFull = nil
        }
        _image = State(initialValue: cachedFull)
        
        if cachedFull == nil, let thumbHash, !thumbHash.isEmpty {
            _thumbHashImage = State(initialValue: UIImage.fromThumbHash(thumbHash))
        }
    }

    public var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().aspectRatio(contentMode: .fill)
            } else if let thumbHashImage {
                Image(uiImage: thumbHashImage).resizable().aspectRatio(contentMode: .fill)
            } else {
                let color = Color(hex: fallbackColor)
                LinearGradient(colors: [color.opacity(0.8), color.opacity(0.4)], startPoint: .topLeading, endPoint: .bottomTrailing)
            }
        }
        .frame(height: height).clipped()
        .task(id: urlString) { await loadBanner(for: urlString) }
        .onChange(of: urlString) { _, newUrl in
            guard let newUrl, !newUrl.isEmpty else {
                image = nil
                return
            }
            let resolved = MeeshyConfig.resolveMediaURL(newUrl)?.absoluteString ?? newUrl
            if let cached = DiskCacheStore.cachedImage(for: resolved) {
                image = cached
            } else {
                image = nil
            }
        }
    }

    private func loadBanner(for currentUrlString: String?) async {
        guard let currentUrlString, !currentUrlString.isEmpty else { return }
        let resolved = MeeshyConfig.resolveMediaURL(currentUrlString)?.absoluteString ?? currentUrlString
        if image != nil && DiskCacheStore.cachedImage(for: resolved) != nil { return }
        if let loaded = await CacheCoordinator.shared.images.image(for: resolved) {
            if self.urlString == currentUrlString {
                withAnimation(.easeIn(duration: 0.15)) {
                    self.image = loaded
                }
            }
        }
    }
}

public struct ProgressiveCachedImage<Placeholder: View>: View {
    public let thumbHash: String?
    public let thumbnailUrl: String?
    public let fullUrl: String?
    public let placeholder: () -> Placeholder

    @State private var thumbHashImage: UIImage?
    @State private var thumbnailImage: UIImage?
    @State private var fullImage: UIImage?
    /// Temporise le placeholder : il ne s'affiche qu'après un court délai de
    /// grâce. Une image présente sur l'appareil (cache disque) est chargée
    /// avant ce délai, donc le placeholder — souvent un `ProgressView` — ne
    /// flashe jamais pour un média déjà vu.
    @State private var showPlaceholder = false
    public init(
        thumbHash: String? = nil,
        thumbnailUrl: String?,
        fullUrl: String?,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.thumbHash = thumbHash
        self.thumbnailUrl = thumbnailUrl
        self.fullUrl = fullUrl
        self.placeholder = placeholder

        // Tier 2: check disk cache for full image (sync, instant)
        let cachedFull: UIImage?
        if let fullUrl, !fullUrl.isEmpty {
            let resolved = MeeshyConfig.resolveMediaURL(fullUrl)?.absoluteString ?? fullUrl
            cachedFull = DiskCacheStore.cachedImage(for: resolved)
        } else {
            cachedFull = nil
        }
        _fullImage = State(initialValue: cachedFull)

        // Tier 1: check disk cache for thumbnail (only if full not cached)
        if cachedFull == nil, let thumbnailUrl, !thumbnailUrl.isEmpty {
            let resolved = MeeshyConfig.resolveMediaURL(thumbnailUrl)?.absoluteString ?? thumbnailUrl
            _thumbnailImage = State(initialValue: DiskCacheStore.cachedImage(for: resolved))
        }

        // Tier 0: decode ThumbHash instantly (< 0.1ms, always available if provided)
        if cachedFull == nil, let thumbHash, !thumbHash.isEmpty {
            _thumbHashImage = State(initialValue: UIImage.fromThumbHash(thumbHash))
        }
    }

    public var body: some View {
        ZStack {
            if let fullImage {
                Image(uiImage: fullImage)
                    .resizable()
                    .transition(.opacity)
            } else if let thumbnailImage {
                Image(uiImage: thumbnailImage)
                    .resizable()
                    .transition(.opacity)
            } else if let thumbHashImage {
                Image(uiImage: thumbHashImage)
                    .resizable()
                    .interpolation(.low)
                    .transition(.opacity)
            } else if showPlaceholder {
                placeholder()
            } else {
                // Délai de grâce : pendant ~200 ms on n'affiche rien (transparent)
                // plutôt que le placeholder. Une image en cache disque charge
                // avant — aucun flash de loader pour un média déjà sur l'appareil.
                Color.clear
            }
        }
        .animation(.easeInOut(duration: 0.25), value: fullImage != nil)
        .animation(.easeInOut(duration: 0.15), value: thumbnailImage != nil)
        .task(id: thumbnailUrl) {
            guard fullImage == nil else { return }
            await loadThumbnail()
        }
        .task(id: fullUrl) {
            await loadFullImage()
        }
        .task(id: fullUrl) {
            showPlaceholder = false
            try? await Task.sleep(for: .milliseconds(200))
            if !Task.isCancelled { showPlaceholder = true }
        }
        .onChange(of: thumbnailUrl) { _, newUrl in
            guard fullImage == nil else { return }
            guard let newUrl, !newUrl.isEmpty else { thumbnailImage = nil; return }
            let resolved = MeeshyConfig.resolveMediaURL(newUrl)?.absoluteString ?? newUrl
            thumbnailImage = DiskCacheStore.cachedImage(for: resolved)
        }
        .onChange(of: fullUrl) { _, newUrl in
            guard let newUrl, !newUrl.isEmpty else { fullImage = nil; return }
            let resolved = MeeshyConfig.resolveMediaURL(newUrl)?.absoluteString ?? newUrl
            if let cached = DiskCacheStore.cachedImage(for: resolved) {
                fullImage = cached
            } else {
                fullImage = nil
            }
        }
    }

    private func loadThumbnail() async {
        guard let thumbnailUrl, !thumbnailUrl.isEmpty, thumbnailImage == nil else { return }
        let resolved = MeeshyConfig.resolveMediaURL(thumbnailUrl)?.absoluteString ?? thumbnailUrl
        // Policy gate: skip network fetch when auto-download is disallowed
        // and the thumbnail isn't already on disk. The thumbHash + parent
        // placeholder remain visible — no spinner, no missing media. A
        // manual tap (fullscreen) bypasses this gate via the parent's own
        // download trigger.
        if DiskCacheStore.cachedImage(for: resolved) == nil,
           !MediaDownloadPolicy.shouldAutoLoadImage() {
            return
        }
        if let loaded = await CacheCoordinator.shared.images.image(for: resolved) {
            if !Task.isCancelled, fullImage == nil {
                withAnimation(.easeIn(duration: 0.15)) { thumbnailImage = loaded }
            }
        }
    }

    private func loadFullImage() async {
        guard let fullUrl, !fullUrl.isEmpty else { return }
        let resolved = MeeshyConfig.resolveMediaURL(fullUrl)?.absoluteString ?? fullUrl
        if fullImage != nil && DiskCacheStore.cachedImage(for: resolved) != nil { return }
        // Policy gate (full image): skip network fetch when auto-download is
        // disallowed. ThumbHash + thumbnail (if cached) keep the bubble
        // visually filled; the user can tap to open fullscreen which will
        // trigger an explicit download.
        if DiskCacheStore.cachedImage(for: resolved) == nil,
           !MediaDownloadPolicy.shouldAutoLoadImage() {
            return
        }
        if let loaded = await CacheCoordinator.shared.images.image(for: resolved) {
            if !Task.isCancelled {
                withAnimation(.easeIn(duration: 0.25)) { fullImage = loaded }
            }
        }
    }
}
