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
    /// When `false`, the loading spinner and the failure retry button are
    /// never rendered — the view silently stays on the thumbHash blur or the
    /// caller's placeholder. Use for decorative surfaces (fullscreen
    /// backdrops, interstitials) where a centered spinner/retry control would
    /// read as UI chrome bleeding through the content. Defaults to `true`
    /// (existing behaviour).
    public let showsStatusOverlays: Bool
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
        showsStatusOverlays: Bool = true,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.urlString = urlString
        self.targetSize = targetSize
        self.thumbHash = thumbHash
        self.showsStatusOverlays = showsStatusOverlays
        self.placeholder = placeholder
        let cachedFull: UIImage?
        if let urlString, !urlString.isEmpty {
            let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
            // `warmedImage` retourne le NSCache hit s'il existe, sinon va
            // synchroniquement decoder depuis le disque (zero IO reseau).
            // C'est la cle pour que le cold start d'une conversation affiche
            // les images directement, sans transitionner via le thumbHash.
            cachedFull = CacheCoordinator.warmedImage(for: resolved)
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
                    if showsStatusOverlays {
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
                }
            } else {
                thumbHashBackdrop {
                    if isLoading && showsStatusOverlays { ProgressView().tint(.white.opacity(0.6)) }
                }
            }
        }
        .task(id: "\(urlString ?? "")_\(retryCount)") { await loadImage(for: urlString) }
        .adaptiveOnChange(of: urlString) { _, newUrl in
            hasFailed = false
            guard let newUrl, !newUrl.isEmpty else {
                image = nil
                thumbHashImage = nil
                return
            }
            let resolved = MeeshyConfig.resolveMediaURL(newUrl)?.absoluteString ?? newUrl
            // Idem qu'a l'init : on tente le warm sync (NSCache puis disque)
            // pour que les cellules reutilisees au scroll ne flashent pas leur
            // thumbHash quand la nouvelle URL est deja sur disque.
            let cached = CacheCoordinator.warmedImage(for: resolved)
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

    /// Returns `true` for `file://` URLs — local sandbox media that must never
    /// be subject to the network policy gate. The bytes are already on device;
    /// no download can ever happen.
    nonisolated static func isLocalFileURL(_ urlString: String) -> Bool {
        urlString.hasPrefix("file://")
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
        //
        // BYPASSES (zero-network reads):
        //  - `file://` URLs : local sandbox media (optimistic capture / picked
        //    file). No download possible — gating these would freeze the bubble
        //    on its placeholder even though the bytes are right there.
        //  - On-disk cache hit : an already-adopted media (post-ACK or seeded
        //    by `cacheImageForPreview`) is just a disk read. Gating would force
        //    the user to wait until network conditions improve to see media
        //    they already have on device.
        if !Self.isLocalFileURL(resolved),
           CacheCoordinator.imageLocalFileURL(for: resolved) == nil,
           DiskCacheStore.cachedImage(for: resolved) == nil,
           !MediaDownloadPolicy.shouldAutoLoadImage() { return }

        isLoading = true; hasFailed = false
        let loaded: UIImage?
        if let targetSize {
            let maxPixel = Self.pixelSize(for: targetSize)
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
            cachedFull = CacheCoordinator.warmedImage(for: resolved)
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
        .adaptiveOnChange(of: urlString) { _, newUrl in
            guard let newUrl, !newUrl.isEmpty else { image = nil; return }
            let resolved = MeeshyConfig.resolveMediaURL(newUrl)?.absoluteString ?? newUrl
            image = CacheCoordinator.warmedImage(for: resolved)
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
        let maxPixel = Self.pixelSize(for: size)
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
            cachedFull = CacheCoordinator.warmedImage(for: resolved)
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
        .adaptiveOnChange(of: urlString) { _, newUrl in
            guard let newUrl, !newUrl.isEmpty else {
                image = nil
                return
            }
            let resolved = MeeshyConfig.resolveMediaURL(newUrl)?.absoluteString ?? newUrl
            if let cached = CacheCoordinator.warmedImage(for: resolved) {
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
    /// When `true`, bypasses `MediaDownloadPolicy` and always downloads.
    /// Use for surfaces (Feed, Posts, Stories tray) where the thumbHash is
    /// only meant as a placeholder during the network fetch — the user
    /// expects the actual image to appear automatically. Conversation media
    /// keeps the default `false`: the policy gate honours the user's
    /// per-network auto-download preference.
    public let autoLoad: Bool
    /// Taille d'affichage en points. Quand non-nil, l'image full est
    /// sous-échantillonnée à `max(w,h) × scale` px lors d'un cold read disque
    /// (cap mémoire). Filet SECONDAIRE : un bitmap déjà résident l'ignore (clé
    /// cache = URL seule, cf. spec 5.2 §4.4). Le vrai gain octets+pixels vient
    /// de la sélection de variante en amont (URL plus petite passée en `fullUrl`).
    public let targetSize: CGSize?
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
        autoLoad: Bool = false,
        targetSize: CGSize? = nil,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.thumbHash = thumbHash
        self.thumbnailUrl = thumbnailUrl
        self.fullUrl = fullUrl
        self.autoLoad = autoLoad
        self.targetSize = targetSize
        self.placeholder = placeholder

        // Tier 2: warm le full image depuis le disque vers la NSCache puis
        // peuple l'etat sync — pas de transition thumbnail→full visible.
        let cachedFull: UIImage?
        if let fullUrl, !fullUrl.isEmpty {
            let resolved = MeeshyConfig.resolveMediaURL(fullUrl)?.absoluteString ?? fullUrl
            cachedFull = CacheCoordinator.warmedImage(for: resolved)
        } else {
            cachedFull = nil
        }
        _fullImage = State(initialValue: cachedFull)

        // Tier 1: idem pour le thumbnail si le full n'est pas encore disponible.
        if cachedFull == nil, let thumbnailUrl, !thumbnailUrl.isEmpty {
            let resolved = MeeshyConfig.resolveMediaURL(thumbnailUrl)?.absoluteString ?? thumbnailUrl
            _thumbnailImage = State(initialValue: CacheCoordinator.warmedImage(for: resolved))
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
        .adaptiveOnChange(of: thumbnailUrl) { _, newUrl in
            guard fullImage == nil else { return }
            guard let newUrl, !newUrl.isEmpty else { thumbnailImage = nil; return }
            let resolved = MeeshyConfig.resolveMediaURL(newUrl)?.absoluteString ?? newUrl
            thumbnailImage = CacheCoordinator.warmedImage(for: resolved)
        }
        .adaptiveOnChange(of: fullUrl) { _, newUrl in
            guard let newUrl, !newUrl.isEmpty else { fullImage = nil; return }
            let resolved = MeeshyConfig.resolveMediaURL(newUrl)?.absoluteString ?? newUrl
            if let cached = CacheCoordinator.warmedImage(for: resolved) {
                fullImage = cached
            } else {
                fullImage = nil
            }
        }
    }

    /// Returns `true` for `file://` URLs — local sandbox media that must never
    /// be subject to the network policy gate. Mirror of
    /// `CachedAsyncImage.isLocalFileURL` so the gate logic reads the same.
    nonisolated static func isLocalFileURL(_ urlString: String) -> Bool {
        urlString.hasPrefix("file://")
    }

    @MainActor private static func pixelSize(for points: CGSize) -> CGFloat {
        max(points.width, points.height) * UIScreen.main.scale
    }

    private func loadThumbnail() async {
        guard let thumbnailUrl, !thumbnailUrl.isEmpty, thumbnailImage == nil else { return }
        let resolved = MeeshyConfig.resolveMediaURL(thumbnailUrl)?.absoluteString ?? thumbnailUrl
        // Policy gate: skip network fetch when auto-download is disallowed
        // and the thumbnail isn't already on disk. The thumbHash + parent
        // placeholder remain visible — no spinner, no missing media. A
        // manual tap (fullscreen) bypasses this gate via the parent's own
        // download trigger. `file://` URLs and on-disk hits bypass the gate:
        // they are zero-network reads. `autoLoad` also bypasses the gate so
        // Feed/Posts/Stories don't leave the thumbHash visible indefinitely.
        if !autoLoad,
           !ProgressiveCachedImage.isLocalFileURL(resolved),
           CacheCoordinator.imageLocalFileURL(for: resolved) == nil,
           DiskCacheStore.cachedImage(for: resolved) == nil,
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
        // trigger an explicit download. `file://` URLs and on-disk hits
        // bypass the gate: they are zero-network reads. `autoLoad` also
        // bypasses the gate (Feed/Posts/Stories want eager display).
        if !autoLoad,
           !ProgressiveCachedImage.isLocalFileURL(resolved),
           CacheCoordinator.imageLocalFileURL(for: resolved) == nil,
           DiskCacheStore.cachedImage(for: resolved) == nil,
           !MediaDownloadPolicy.shouldAutoLoadImage() {
            return
        }
        let loaded: UIImage?
        if let targetSize {
            let maxPixel = Self.pixelSize(for: targetSize)
            loaded = await CacheCoordinator.shared.images.image(for: resolved, maxPixelSize: maxPixel)
        } else {
            loaded = await CacheCoordinator.shared.images.image(for: resolved)
        }
        if let loaded {
            if !Task.isCancelled {
                withAnimation(.easeIn(duration: 0.25)) { fullImage = loaded }
            }
        }
    }
}
