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
    /// When `true`, bypasses `MediaDownloadPolicy` and always fetches over the
    /// network — mirrors `ProgressiveCachedImage.autoLoad`. A manual, explicit
    /// user action (opening the fullscreen viewer) overrides the ambient
    /// auto-download gate (contract §14.1: "un tap manuel outrepasse la
    /// politique réseau") — without this the fullscreen spinner never
    /// resolves in Low Data Mode / data-saver conditions. Defaults to `false`
    /// (existing gated behaviour for inline bubble thumbnails).
    public let autoLoad: Bool
    public let placeholder: () -> Placeholder

    @State private var image: UIImage?
    @State private var thumbHashImage: UIImage?
    @State private var isLoading = false
    @State private var hasFailed = false
    /// La politique de téléchargement a retenu la requête : rien ne charge
    /// tant qu'un geste ne la demande pas (#9869).
    @State private var isDeferred = false
    @State private var retryCount = 0

    public init(
        url urlString: String?,
        targetSize: CGSize? = nil,
        thumbHash: String? = nil,
        showsStatusOverlays: Bool = true,
        autoLoad: Bool = false,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.urlString = urlString
        self.targetSize = targetSize
        self.thumbHash = thumbHash
        self.showsStatusOverlays = showsStatusOverlays
        self.autoLoad = autoLoad
        self.placeholder = placeholder
        let cachedFull: UIImage?
        if let urlString, !urlString.isEmpty {
            let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
            // Variante dimensionnée d'abord : le slot rempli par un chargement
            // `targetSize` précédent (clé par bucket de pixels), sinon le slot
            // plein format. MÉMOIRE seule (#10354) : l'init n'est pas le lieu
            // d'un décodage disque — le `.task` le fait hors du fil principal.
            if let targetSize,
               let sized = DiskCacheStore.cachedImage(for: resolved, maxPixelSize: DecodeBudget.maxPixelWidth(for: .fitting(targetSize))) {
                cachedFull = sized
            } else {
                cachedFull = WarmImageProbe.residentImage(for: resolved)
            }
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
                            VStack(spacing: MeeshySpacing.xs) {
                                Image(systemName: "arrow.clockwise.circle.fill")
                                    .font(.system(size: MeeshyIconSize.xxl, weight: .medium))
                                    .foregroundStyle(.white.opacity(MeeshyOpacity.heavy))
                                Text(String(localized: "common.retry", defaultValue: "Réessayer", bundle: .module))
                                    .font(.system(size: MeeshyFont.captionSize, weight: .semibold))
                                    .foregroundStyle(.white.opacity(MeeshyOpacity.strong))
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
            isDeferred = false
            guard let newUrl, !newUrl.isEmpty else {
                image = nil
                thumbHashImage = nil
                return
            }
            let resolved = MeeshyConfig.resolveMediaURL(newUrl)?.absoluteString ?? newUrl
            // Idem qu'a l'init : variante dimensionnée d'abord, puis warm sync
            // (NSCache puis disque) pour que les cellules reutilisees au scroll
            // ne flashent pas leur thumbHash quand la nouvelle URL est deja sur
            // disque.
            let cached = targetSize.flatMap {
                DiskCacheStore.cachedImage(for: resolved, maxPixelSize: DecodeBudget.maxPixelWidth(for: .fitting($0)))
            } ?? WarmImageProbe.warmedImage(for: resolved)
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
                .loadingSheenPhase(placeholderPhase)
                .overlay { overlay() }
        }
    }

    /// Ce que le placeholder doit dire : seul un chargement réel fait balayer
    /// son reflet (#9869).
    private var placeholderPhase: LoadingSheenPhase {
        LoadingSheenLaw.phase(
            hasURL: !(urlString ?? "").isEmpty,
            fetchDeferredByPolicy: isDeferred,
            fetchFailed: hasFailed
        )
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
        if image != nil {
            let sizedResident = targetSize.map {
                DiskCacheStore.cachedImage(for: resolved, maxPixelSize: DecodeBudget.maxPixelWidth(for: .fitting($0))) != nil
            } ?? false
            if sizedResident || DiskCacheStore.cachedImage(for: resolved) != nil { return }
        }

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
        if MediaFetchGate.shouldSkipNetworkFetch(
            autoLoad: autoLoad,
            isLocalFileURL: Self.isLocalFileURL(resolved),
            hasLocalCacheHit: LocalImagePresence.isOnDevice(resolvedURL: resolved),
            policyAllowsAutoLoad: MediaDownloadPolicy.shouldAutoLoadImage()
        ) {
            isDeferred = true
            return
        }

        isLoading = true; hasFailed = false; isDeferred = false
        let loaded: UIImage?
        if let targetSize {
            let maxPixel = DecodeBudget.maxPixelWidth(for: .fitting(targetSize))
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

/// Pure, synchronous decision extracted from the network-fetch gate that used
/// to be copy-pasted 3× (`CachedAsyncImage.loadImage`,
/// `ProgressiveCachedImage.loadThumbnail`, `.loadFullImage`). Every signal is
/// a plain parameter — no singleton reads inside the gate itself — so the
/// "cache → policy → download" cascade is expressed in exactly one place and
/// is unit-testable without MainActor/SwiftUI hosting (SDK-purity: callers
/// still resolve `policyAllowsAutoLoad` via `MediaDownloadPolicy`, an already
/// SDK-legitimate composition of `MediaDownloadPolicyEngine` +
/// `NetworkConditionMonitor` + `MediaDownloadPreferencesStore`).
/// **Une image est sur l'appareil quand la lire ne coûte aucun octet réseau** :
/// fichier dans le cache image, ou plein format décodé en mémoire. C'est le
/// critère exact qui lève la politique de téléchargement des vues d'image —
/// un hôte qui choisit une URL « déjà là » la lit ici pour être sûr que la
/// vue la chargera sans attendre un geste.
public enum LocalImagePresence {
    nonisolated public static func isOnDevice(resolvedURL: String) -> Bool {
        CacheCoordinator.imageLocalFileURL(for: resolvedURL) != nil
            || DiskCacheStore.cachedImage(for: resolvedURL) != nil
    }
}

/// L'identité d'un chargement de `ProgressiveCachedImage` : son URL ET le
/// jeton de relance de l'hôte. Un chargement retenu par la politique ne
/// repartait que si l'URL changeait ; un média arrivé par un autre chemin
/// sous la MÊME URL laissait la vue sur son aperçu flou.
struct ProgressiveImageLoadID: Hashable {
    let url: String?
    let reloadToken: AnyHashable?
}

enum MediaFetchGate {
    nonisolated static func shouldSkipNetworkFetch(
        autoLoad: Bool,
        isLocalFileURL: Bool,
        hasLocalCacheHit: Bool,
        policyAllowsAutoLoad: Bool
    ) -> Bool {
        !autoLoad && !isLocalFileURL && !hasLocalCacheHit && !policyAllowsAutoLoad
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
            cachedFull = DiskCacheStore.cachedImage(for: resolved, maxPixelSize: DecodeBudget.maxPixelWidth(for: .fitting(CGSize(width: size, height: size))))
                ?? WarmImageProbe.warmedImage(for: resolved)
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
            image = DiskCacheStore.cachedImage(for: resolved, maxPixelSize: DecodeBudget.maxPixelWidth(for: .fitting(CGSize(width: size, height: size))))
                ?? WarmImageProbe.warmedImage(for: resolved)
        }
    }

    private var initialsFallback: some View {
        let initials = name.components(separatedBy: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
        let color = Color(hex: accentColor)
        return ZStack {
            LinearGradient(colors: [color, color.opacity(MeeshyOpacity.heavy)], startPoint: .topLeading, endPoint: .bottomTrailing)
            Text(initials.isEmpty ? "?" : initials)
                .font(.system(size: size * 0.38, weight: .semibold, design: .rounded))
                .foregroundStyle(Color.white)
        }
    }

    private func loadAvatar(for currentUrlString: String?) async {
        guard let currentUrlString, !currentUrlString.isEmpty else { return }
        let resolved = MeeshyConfig.resolveMediaURL(currentUrlString)?.absoluteString ?? currentUrlString
        if image != nil,
           DiskCacheStore.cachedImage(for: resolved, maxPixelSize: DecodeBudget.maxPixelWidth(for: .fitting(CGSize(width: size, height: size)))) != nil
            || DiskCacheStore.cachedImage(for: resolved) != nil { return }
        let maxPixel = DecodeBudget.maxPixelWidth(for: .fitting(CGSize(width: size, height: size)))
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
            cachedFull = WarmImageProbe.warmedImage(for: resolved)
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
                LinearGradient(colors: [color.opacity(MeeshyOpacity.intense), color.opacity(0.4)], startPoint: .topLeading, endPoint: .bottomTrailing)
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
            if let cached = WarmImageProbe.warmedImage(for: resolved) {
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
        let maxPixel = DecodeBudget.maxPixelWidth(for: .fullBleed(height: height))
        if let loaded = await CacheCoordinator.shared.images.image(for: resolved, maxPixelSize: maxPixel) {
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
    /// sous-échantillonnée au bucket de pixels couvrant `max(w,h) × scale` et
    /// résidente sous une clé NSCache dimensionnée (`fileKey#pxN`) — elle ne
    /// peut donc plus être servie à une surface plein format, ni l'inverse.
    /// Le vrai gain octets+pixels vient toujours de la sélection de variante
    /// en amont (URL plus petite passée en `fullUrl`).
    public let targetSize: CGSize?
    /// Appelé quand le plein format a été DEMANDÉ au réseau et n'est pas
    /// arrivé (404, 410, refus, panne) — jamais quand la politique de
    /// téléchargement a retenu la requête. Sans lui, un hôte n'a aucun moyen
    /// de distinguer « encore en chargement » de « n'arrivera pas » : le
    /// placeholder tournait pour toujours (#8141).
    public let onFullImageFailure: (@MainActor () -> Void)?
    /// Appelé quand le plein format est RÉSIDENT après sa résolution —
    /// téléchargé à l'instant ou déjà en cache. Ce composant télécharge par
    /// son propre chemin (le cache image), qu'aucun téléchargeur de l'hôte
    /// n'observe : sans ce signal, un hôte qui affiche « télécharger » tant que
    /// le média n'est pas sur l'appareil ne saurait jamais qu'il l'est
    /// devenu (#10370).
    public let onFullImageLoaded: (@MainActor () -> Void)?
    /// Jeton opaque de l'hôte : quand il change, les chargements repartent
    /// même si les URL n'ont pas changé — un média que la politique retenait
    /// et qu'un autre chemin vient de poser sur l'appareil.
    public let reloadToken: AnyHashable?
    public let placeholder: () -> Placeholder

    @State private var thumbHashImage: UIImage?
    @State private var thumbnailImage: UIImage?
    @State private var fullImage: UIImage?
    /// Temporise le placeholder : il ne s'affiche qu'après un court délai de
    /// grâce. Une image présente sur l'appareil (cache disque) est chargée
    /// avant ce délai, donc le placeholder — souvent un `ProgressView` — ne
    /// flashe jamais pour un média déjà vu.
    @State private var showPlaceholder = false
    /// Ce que fait réellement le plein format : le placeholder ne balaie que
    /// pendant un vrai chargement, jamais sur un échec ni sur une image que la
    /// politique de téléchargement retient en attendant un geste (#9869).
    @State private var fetchDeferredByPolicy = false
    @State private var fetchFailed = false
    /// Même état pour la vignette, qui ne décide que lorsqu'aucun plein
    /// format n'est demandé.
    @State private var thumbnailDeferredByPolicy = false
    @State private var thumbnailFailed = false
    public init(
        thumbHash: String? = nil,
        thumbnailUrl: String?,
        fullUrl: String?,
        autoLoad: Bool = false,
        targetSize: CGSize? = nil,
        onFullImageFailure: (@MainActor () -> Void)? = nil,
        onFullImageLoaded: (@MainActor () -> Void)? = nil,
        reloadToken: AnyHashable? = nil,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.reloadToken = reloadToken
        self.thumbHash = thumbHash
        self.thumbnailUrl = thumbnailUrl
        self.fullUrl = fullUrl
        self.autoLoad = autoLoad
        self.targetSize = targetSize
        self.onFullImageFailure = onFullImageFailure
        self.onFullImageLoaded = onFullImageLoaded
        self.placeholder = placeholder

        // Tier 2: le full image déjà en MÉMOIRE peuple l'état sync — pas de
        // transition thumbnail→full visible. Variante dimensionnée (slot par
        // bucket de pixels) d'abord quand un `targetSize` est fourni, sinon le
        // slot plein format. Jamais le disque (#10354) : le décodage d'un
        // fichier dans l'init figeait le geste des réels ; le `.task` le lit
        // hors du fil principal, et le préchargement des posters le met en
        // mémoire avant que la page ne monte.
        let cachedFull: UIImage?
        if let fullUrl, !fullUrl.isEmpty {
            let resolved = MeeshyConfig.resolveMediaURL(fullUrl)?.absoluteString ?? fullUrl
            cachedFull = targetSize.flatMap {
                DiskCacheStore.cachedImage(for: resolved, maxPixelSize: DecodeBudget.maxPixelWidth(for: .fitting($0)))
            } ?? WarmImageProbe.residentImage(for: resolved)
        } else {
            cachedFull = nil
        }
        _fullImage = State(initialValue: cachedFull)

        // Tier 1: idem pour le thumbnail si le full n'est pas encore disponible.
        if cachedFull == nil, let thumbnailUrl, !thumbnailUrl.isEmpty {
            let resolved = MeeshyConfig.resolveMediaURL(thumbnailUrl)?.absoluteString ?? thumbnailUrl
            _thumbnailImage = State(initialValue: WarmImageProbe.residentImage(for: resolved))
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
                    .loadingSheenPhase(placeholderPhase)
            } else {
                // Délai de grâce : pendant ~200 ms on n'affiche rien (transparent)
                // plutôt que le placeholder. Une image en cache disque charge
                // avant — aucun flash de loader pour un média déjà sur l'appareil.
                Color.clear
            }
        }
        .animation(.easeInOut(duration: 0.25), value: fullImage != nil)
        .animation(.easeInOut(duration: 0.15), value: thumbnailImage != nil)
        .task(id: ProgressiveImageLoadID(url: thumbnailUrl, reloadToken: reloadToken)) {
            guard fullImage == nil else { return }
            await loadThumbnail()
        }
        .task(id: ProgressiveImageLoadID(url: fullUrl, reloadToken: reloadToken)) {
            await loadFullImage()
        }
        .task(id: fullUrl) {
            showPlaceholder = false
            guard await cancellableSleep(for: .milliseconds(200)) else { return }
            showPlaceholder = true
        }
        .adaptiveOnChange(of: thumbnailUrl) { _, newUrl in
            guard fullImage == nil else { return }
            guard let newUrl, !newUrl.isEmpty else { thumbnailImage = nil; return }
            let resolved = MeeshyConfig.resolveMediaURL(newUrl)?.absoluteString ?? newUrl
            thumbnailImage = WarmImageProbe.warmedImage(for: resolved)
        }
        .adaptiveOnChange(of: fullUrl) { _, newUrl in
            guard let newUrl, !newUrl.isEmpty else { fullImage = nil; return }
            let resolved = MeeshyConfig.resolveMediaURL(newUrl)?.absoluteString ?? newUrl
            let cached = targetSize.flatMap {
                DiskCacheStore.cachedImage(for: resolved, maxPixelSize: DecodeBudget.maxPixelWidth(for: .fitting($0)))
            } ?? WarmImageProbe.warmedImage(for: resolved)
            if let cached {
                fullImage = cached
            } else {
                fullImage = nil
            }
        }
    }

    private var placeholderPhase: LoadingSheenPhase {
        guard (fullUrl ?? "").isEmpty else {
            return LoadingSheenLaw.phase(
                hasURL: true,
                fetchDeferredByPolicy: fetchDeferredByPolicy,
                fetchFailed: fetchFailed
            )
        }
        return LoadingSheenLaw.phase(
            hasURL: !(thumbnailUrl ?? "").isEmpty,
            fetchDeferredByPolicy: thumbnailDeferredByPolicy,
            fetchFailed: thumbnailFailed
        )
    }

    /// Returns `true` for `file://` URLs — local sandbox media that must never
    /// be subject to the network policy gate. Mirror of
    /// `CachedAsyncImage.isLocalFileURL` so the gate logic reads the same.
    nonisolated static func isLocalFileURL(_ urlString: String) -> Bool {
        urlString.hasPrefix("file://")
    }

    private func loadThumbnail() async {
        thumbnailDeferredByPolicy = false
        thumbnailFailed = false
        guard let thumbnailUrl, !thumbnailUrl.isEmpty, thumbnailImage == nil else { return }
        let resolved = MeeshyConfig.resolveMediaURL(thumbnailUrl)?.absoluteString ?? thumbnailUrl
        // Policy gate: skip network fetch when auto-download is disallowed
        // and the thumbnail isn't already on disk. The thumbHash + parent
        // placeholder remain visible — no spinner, no missing media. A
        // manual tap (fullscreen) bypasses this gate via the parent's own
        // download trigger. `file://` URLs and on-disk hits bypass the gate:
        // they are zero-network reads. `autoLoad` also bypasses the gate so
        // Feed/Posts/Stories don't leave the thumbHash visible indefinitely.
        if MediaFetchGate.shouldSkipNetworkFetch(
            autoLoad: autoLoad,
            isLocalFileURL: ProgressiveCachedImage.isLocalFileURL(resolved),
            hasLocalCacheHit: LocalImagePresence.isOnDevice(resolvedURL: resolved),
            policyAllowsAutoLoad: MediaDownloadPolicy.shouldAutoLoadImage()
        ) {
            thumbnailDeferredByPolicy = true
            return
        }
        let loaded = await CacheCoordinator.shared.images.image(for: resolved)
        guard !Task.isCancelled else { return }
        guard let loaded else {
            thumbnailFailed = true
            return
        }
        if fullImage == nil {
            withAnimation(.easeIn(duration: 0.15)) { thumbnailImage = loaded }
        }
    }

    private func loadFullImage() async {
        fetchDeferredByPolicy = false
        fetchFailed = false
        guard let fullUrl, !fullUrl.isEmpty else { return }
        let resolved = MeeshyConfig.resolveMediaURL(fullUrl)?.absoluteString ?? fullUrl
        if fullImage != nil {
            let sizedResident = targetSize.map {
                DiskCacheStore.cachedImage(for: resolved, maxPixelSize: DecodeBudget.maxPixelWidth(for: .fitting($0))) != nil
            } ?? false
            if sizedResident || DiskCacheStore.cachedImage(for: resolved) != nil {
                onFullImageLoaded?()
                return
            }
        }
        // Policy gate (full image): skip network fetch when auto-download is
        // disallowed. ThumbHash + thumbnail (if cached) keep the bubble
        // visually filled; the user can tap to open fullscreen which will
        // trigger an explicit download. `file://` URLs and on-disk hits
        // bypass the gate: they are zero-network reads. `autoLoad` also
        // bypasses the gate (Feed/Posts/Stories want eager display).
        if MediaFetchGate.shouldSkipNetworkFetch(
            autoLoad: autoLoad,
            isLocalFileURL: ProgressiveCachedImage.isLocalFileURL(resolved),
            hasLocalCacheHit: LocalImagePresence.isOnDevice(resolvedURL: resolved),
            policyAllowsAutoLoad: MediaDownloadPolicy.shouldAutoLoadImage()
        ) {
            fetchDeferredByPolicy = true
            return
        }
        let loaded: UIImage?
        if let targetSize {
            let maxPixel = DecodeBudget.maxPixelWidth(for: .fitting(targetSize))
            loaded = await CacheCoordinator.shared.images.image(for: resolved, maxPixelSize: maxPixel)
        } else {
            loaded = await CacheCoordinator.shared.images.image(for: resolved)
        }
        guard !Task.isCancelled else { return }
        guard let loaded else {
            fetchFailed = true
            onFullImageFailure?()
            return
        }
        withAnimation(.easeIn(duration: 0.25)) { fullImage = loaded }
        onFullImageLoaded?()
    }
}
