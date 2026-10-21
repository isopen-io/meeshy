import SwiftUI
import Photos
import AVFoundation
import UIKit
import MeeshySDK
import MeeshyUI

// ============================================================================
// MARK: - RecentMediaPick
// ============================================================================

/// A media item the user tapped from the inline recent-media strip, resolved
/// to something a host can ingest. Photos arrive as a `UIImage`, videos as a
/// file URL in the temporary directory — mirroring the camera capture handlers.
enum RecentMediaPick {
    case image(UIImage)
    case video(URL)
}

/// Ferries a non-`Sendable` `UIImage` back across the PhotoKit completion
/// boundary (callbacks run off the main actor). The image is only read on the
/// main actor after the continuation resumes, so the unchecked conformance is
/// safe.
struct RecentMediaImageBox: @unchecked Sendable { let image: UIImage? }

/// Same boundary-crossing pattern as `RecentMediaImageBox`, for the `AVPlayerItem`
/// resolved for the long-press video preview.
private struct PlayerItemBox: @unchecked Sendable { let item: AVPlayerItem? }

/// Le gestionnaire PhotoKit, porté dans la fin d'un flux de vignettes pour
/// annuler sa requête. `cancelImageRequest` est sûr depuis n'importe quel fil.
private struct ImageManagerBox: @unchecked Sendable { let manager: PHImageManager }

// ============================================================================
// MARK: - RecentMediaSelection
// ============================================================================

/// Ordered multi-selection state for the strip. Pure value type so the
/// begin/toggle/clear semantics stay unit-testable outside SwiftUI.
/// `nonisolated` opts out of the target's MainActor default isolation —
/// without it the synchronous nonisolated tests can't touch the type (same
/// precedent as `MeeshyVideoPlayer.ControlSet`).
nonisolated struct RecentMediaSelection: Equatable {
    private(set) var isActive = false
    private(set) var ids: [String] = []

    var count: Int { ids.count }
    var isEmpty: Bool { ids.isEmpty }

    func index(of id: String) -> Int? { ids.firstIndex(of: id) }

    mutating func begin(with id: String) {
        isActive = true
        if !ids.contains(id) { ids.append(id) }
    }

    /// Le bouton « Sélectionner » de la grille : entrer en sélection sans
    /// rien choisir encore (#9683) — l'appui long n'est plus le seul chemin.
    mutating func activate() {
        isActive = true
    }

    /// Les assets qui ont rejoint la zone d'attachement (par le sélecteur
    /// système) quittent la sélection : ils ne se choisissent plus.
    mutating func discard(_ attached: Set<String>) {
        ids.removeAll { attached.contains($0) }
    }

    mutating func toggle(_ id: String) {
        guard isActive else { return }
        if let idx = ids.firstIndex(of: id) {
            ids.remove(at: idx)
        } else {
            ids.append(id)
        }
    }

    mutating func clear() {
        isActive = false
        ids = []
    }
}

// ============================================================================
// MARK: - RecentMediaStripModel
// ============================================================================

/// Fetches the most recent photos & videos from the photo library and resolves
/// thumbnails / full assets on demand. Pure photo-library plumbing — no Meeshy
/// state, so it stays app-side next to the composer that drives it.
///
/// `NSObject` subclass solely for `PHPhotoLibraryChangeObserver`: the strip
/// refreshes live when the library changes (new capture, limited-access
/// selection extended) instead of showing a stale grid.
@MainActor
final class RecentMediaStripModel: NSObject, ObservableObject, PHPhotoLibraryChangeObserver {
    @Published private(set) var assets: [PHAsset] = []
    @Published private(set) var status: PHAuthorizationStatus =
        PHPhotoLibrary.authorizationStatus(for: .readWrite)

    /// `PHCachingImageManager` (#9683) : les vignettes de la fenêtre qui va
    /// défiler sont préparées d'avance (`startCachingImages`) et relâchées à
    /// sa sortie — une cellule qui apparaît trouve son image déjà prête.
    private let imageManager = PHCachingImageManager()
    private var cachedIds: [String] = []
    private var cachedPixelSide: CGFloat = 0

    /// True once a fetch attempt has run, so the view never re-prompts.
    private var didLoad = false
    private var fetchLimit = RecentMediaStrip.headSampleCount
    private var isObservingLibrary = false

    deinit {
        if isObservingLibrary {
            PHPhotoLibrary.shared().unregisterChangeObserver(self)
        }
    }

    /// Charge la tête de photothèque SANS jamais déclencher de prompt.
    ///
    /// Le strip est monté dès l'ouverture du composer : demander ici revenait à
    /// réclamer l'accès aux photos avant la moindre intention de l'utilisateur —
    /// un prompt sans contexte, souvent refusé définitivement. Tant que l'accès
    /// n'est pas accordé, la vue affiche une tuile d'invitation dont le tap
    /// appelle `requestAccess()`.
    func load(limit: Int = RecentMediaStrip.headSampleCount) {
        guard !didLoad else { return }
        didLoad = true
        fetchLimit = limit
        guard status == .authorized || status == .limited else { return }
        fetch(limit: limit)
    }

    /// Demande déclenchée par un geste explicite (tap sur la tuile d'accès).
    /// `announcesRefusal: false` : la tuile explique déjà le refus sur place,
    /// un toast en plus ferait doublon sur le même geste.
    func requestAccess() async {
        let granted = await MediaPermissionCoordinator.ensurePhotoLibraryRead(announcesRefusal: false)
        status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard granted else { return }
        fetch(limit: fetchLimit)
    }

    /// `true` tant que le strip n'a rien à montrer faute d'autorisation.
    var needsAuthorization: Bool {
        status != .authorized && status != .limited
    }

    var isAuthorizationRefused: Bool {
        status == .denied || status == .restricted
    }

    private func fetch(limit: Int) {
        let options = PHFetchOptions()
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        options.fetchLimit = limit
        options.predicate = NSPredicate(
            format: "mediaType == %d OR mediaType == %d",
            PHAssetMediaType.image.rawValue, PHAssetMediaType.video.rawValue
        )
        let result = PHAsset.fetchAssets(with: options)
        var fetched: [PHAsset] = []
        fetched.reserveCapacity(result.count)
        result.enumerateObjects { asset, _, _ in fetched.append(asset) }
        imageManager.stopCachingImagesForAllAssets()
        cachedIds = []
        assets = fetched
        if !isObservingLibrary {
            isObservingLibrary = true
            PHPhotoLibrary.shared().register(self)
        }
    }

    /// Any library change re-runs the tiny head fetch (≤ `fetchLimit` assets).
    /// The `PHChange` payload is deliberately not diffed: it is non-Sendable
    /// (this callback arrives off the main actor) and an unconditional refetch
    /// of 40 records is cheaper than shipping change details across isolation.
    nonisolated func photoLibraryDidChange(_ changeInstance: PHChange) {
        Task { @MainActor [weak self] in
            guard let self, self.status == .authorized || self.status == .limited else { return }
            self.fetch(limit: self.fetchLimit)
        }
    }

    // MARK: - PhotoKit request seam
    //
    // Every completion below is declared as an explicitly `@Sendable`-typed
    // local instead of being written inline as a trailing closure. This is NOT
    // stylistic.
    //
    // The target compiles under MainActor default isolation, so a closure
    // literal written inside this `@MainActor` class inherits `@MainActor`.
    // Swift 6 then emits a dynamic isolation assertion in the closure's
    // PROLOGUE — `swift_task_isCurrentExecutor` — which traps the instant
    // PhotoKit invokes it from its own queue, before the body runs. Wrapping
    // the body in `Task { @MainActor in }` does not help: the trap happens at
    // entry, so the Task is never reached.
    //
    // `PHImageManager.h` documents the video handlers verbatim as "The result
    // handler is called on an arbitrary queue" — so `requestAVAsset` and
    // `requestPlayerItem` trapped every single time. That is the crash in
    // Meeshy-2026-07-11-131634.ips (thread `com.apple.photos.requestAVAsset`,
    // EXC_BREAKPOINT in `closure #1 in closure #1 in resolveVideo(_:)`), seen
    // 7× across builds 1201→1235: tapping any video in the strip killed the app.
    //
    // The image handlers are documented as main-thread, so they never trapped —
    // but they carry the same latent prologue, and one `.opportunistic`
    // delivery mode (which the header says may call back "synchronously on the
    // calling thread") would arm them. They go through the same seam so the
    // whole file is queue-agnostic by construction.
    //
    // Same fix, same reason as `CallTranscriptionService.requestPermission()`.

    /// Options des vignettes de la bande d'échantillons.
    ///
    /// `nonisolated static` pour être vérifiable telle quelle par un test, sans
    /// photothèque ni contexte d'acteur : c'est le comportement des réglages qui
    /// doit être verrouillé, pas leur présence dans le fichier.
    ///
    /// `.opportunistic` (#9683) : une version rapide d'abord — souvent tirée
    /// du cache préparé par `startCachingImages` —, puis la version nette.
    /// Jamais `.fastFormat`, qui livrait un rendu dégradé que PhotoKit ne
    /// remplace JAMAIS : la bande restait floue pour toujours.
    ///
    /// Le rappel MULTIPLE d'`.opportunistic` interdisait autrefois ce mode,
    /// parce que la vignette passait par `withCheckedContinuation`, qui plante
    /// si on la reprend deux fois. Elle passe désormais par un `AsyncStream`
    /// (`thumbnails(for:size:)`), fait pour recevoir plusieurs valeurs, et
    /// dont la fin annule la requête.
    ///
    /// `.exact` et non `.fast` : `.fast` rend une taille seulement « proche de »
    /// la cible, ce qui ajoute un rééchantillonnage par-dessus le rendu.
    nonisolated static func thumbnailRequestOptions() -> PHImageRequestOptions {
        let options = PHImageRequestOptions()
        options.deliveryMode = .opportunistic
        options.resizeMode = .exact
        options.isNetworkAccessAllowed = true
        options.isSynchronous = false
        return options
    }

    /// Square thumbnails for a cell — the fast version, then the sharp one.
    /// La taille demandée est déjà en PIXELS (`cell * displayScale`, côté
    /// `RecentMediaCell`) : demander des points rendrait une image au tiers de
    /// la résolution sur un écran 3x.
    ///
    /// Le flux se termine à la version définitive (non dégradée) ; s'il est
    /// abandonné avant — la cellule quitte l'écran, sa tâche est annulée —,
    /// sa fin annule la requête PhotoKit (`cancelImageRequest`).
    func thumbnails(for asset: PHAsset, size: CGSize) -> AsyncStream<RecentMediaImageBox> {
        let options = Self.thumbnailRequestOptions()
        let box = ImageManagerBox(manager: imageManager)
        return AsyncStream { continuation in
            let completion: @Sendable (UIImage?, [AnyHashable: Any]?) -> Void = { image, info in
                let isDegraded = (info?[PHImageResultIsDegradedKey] as? Bool) ?? false
                if let image { continuation.yield(RecentMediaImageBox(image: image)) }
                if !isDegraded { continuation.finish() }
            }
            let requestId = imageManager.requestImage(
                for: asset, targetSize: size, contentMode: .aspectFill, options: options,
                resultHandler: completion
            )
            let cancel: @Sendable (AsyncStream<RecentMediaImageBox>.Continuation.Termination) -> Void = { _ in
                box.manager.cancelImageRequest(requestId)
            }
            continuation.onTermination = cancel
        }
    }

    /// Fait glisser la fenêtre préparée autour de la cellule qui vient
    /// d'apparaître : ce qui y entre est mis en cache, ce qui en sort relâché.
    func cacheThumbnails(around assetId: String, pixelSide: CGFloat) {
        guard pixelSide > 0 else { return }
        if pixelSide != cachedPixelSide {
            imageManager.stopCachingImagesForAllAssets()
            cachedIds = []
            cachedPixelSide = pixelSide
        }
        let ids = assets.map(\.localIdentifier)
        let window = RecentMediaCachingWindow.ids(around: assetId, in: ids, columns: RecentMediaStrip.columnCount)
        let delta = RecentMediaCachingWindow.delta(from: cachedIds, to: window)
        cachedIds = window
        let byId = Dictionary(assets.map { ($0.localIdentifier, $0) }, uniquingKeysWith: { first, _ in first })
        let size = CGSize(width: pixelSide, height: pixelSide)
        let options = Self.thumbnailRequestOptions()
        let started = delta.start.compactMap { byId[$0] }
        let stopped = delta.stop.compactMap { byId[$0] }
        if !started.isEmpty {
            imageManager.startCachingImages(for: started, targetSize: size, contentMode: .aspectFill, options: options)
        }
        if !stopped.isEmpty {
            imageManager.stopCachingImages(for: stopped, targetSize: size, contentMode: .aspectFill, options: options)
        }
    }

    /// Larger aspect-fit image for the long-press quick-look preview. Reuses
    /// `.highQualityFormat`, which is single-callback, so the continuation
    /// resumes exactly once. Videos resolve to their poster frame.
    func preview(for asset: PHAsset) async -> UIImage? {
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .fast
        options.isNetworkAccessAllowed = true
        options.isSynchronous = false
        return await withCheckedContinuation { (continuation: CheckedContinuation<RecentMediaImageBox, Never>) in
            let completion: @Sendable (UIImage?, [AnyHashable: Any]?) -> Void = { image, _ in
                continuation.resume(returning: RecentMediaImageBox(image: image))
            }
            imageManager.requestImage(
                for: asset,
                targetSize: CGSize(width: 1024, height: 1024),
                contentMode: .aspectFit,
                options: options,
                resultHandler: completion
            )
        }.image
    }

    /// Streaming player item for the long-press preview of a video asset, so
    /// the quick look plays the video instead of freezing on its poster frame.
    /// `requestPlayerItem` is single-callback, so the continuation resumes once.
    func videoPlayerItem(for asset: PHAsset) async -> AVPlayerItem? {
        guard asset.mediaType == .video else { return nil }
        let options = PHVideoRequestOptions()
        options.deliveryMode = .automatic
        options.isNetworkAccessAllowed = true
        return await withCheckedContinuation { (continuation: CheckedContinuation<PlayerItemBox, Never>) in
            let completion: @Sendable (AVPlayerItem?, [AnyHashable: Any]?) -> Void = { item, _ in
                continuation.resume(returning: PlayerItemBox(item: item))
            }
            imageManager.requestPlayerItem(forVideo: asset, options: options, resultHandler: completion)
        }.item
    }

    /// Resolves a tapped asset to a `RecentMediaPick`. `.highQualityFormat` /
    /// `requestAVAsset` are single-callback, so each continuation resumes once.
    func resolve(_ asset: PHAsset) async -> RecentMediaPick? {
        if asset.mediaType == .video {
            return await resolveVideo(asset)
        }
        return await resolveImage(asset)
    }

    /// Résout un asset pour la zone d'attachement liée (#9683) : il garde son
    /// `localIdentifier`, et une photo part en OCTETS d'origine — aucune
    /// `UIImage` 2048 n'est décodée ici, la préparation compresse depuis les
    /// octets, comme pour le sélecteur système.
    func resolveForAttachment(_ asset: PHAsset) async -> RecentMediaAsset? {
        let assetId = asset.localIdentifier
        if asset.mediaType == .video {
            guard case .video(let url)? = await resolveVideo(asset) else { return nil }
            return RecentMediaAsset(assetId: assetId, payload: .video(url))
        }
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.version = .current
        options.isNetworkAccessAllowed = true
        options.isSynchronous = false
        let data: Data? = await withCheckedContinuation { (continuation: CheckedContinuation<Data?, Never>) in
            let completion: @Sendable (Data?, String?, CGImagePropertyOrientation, [AnyHashable: Any]?) -> Void = { data, _, _, _ in
                continuation.resume(returning: data)
            }
            imageManager.requestImageDataAndOrientation(for: asset, options: options, resultHandler: completion)
        }
        return data.map { RecentMediaAsset(assetId: assetId, payload: .imageData($0)) }
    }

    private func resolveImage(_ asset: PHAsset) async -> RecentMediaPick? {
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .exact
        options.isNetworkAccessAllowed = true
        options.isSynchronous = false
        let box = await withCheckedContinuation { (continuation: CheckedContinuation<RecentMediaImageBox, Never>) in
            let completion: @Sendable (UIImage?, [AnyHashable: Any]?) -> Void = { image, _ in
                continuation.resume(returning: RecentMediaImageBox(image: image))
            }
            imageManager.requestImage(
                for: asset,
                targetSize: CGSize(width: 2048, height: 2048),
                contentMode: .aspectFit,
                options: options,
                resultHandler: completion
            )
        }
        return box.image.map { .image($0) }
    }

    private func resolveVideo(_ asset: PHAsset) async -> RecentMediaPick? {
        let options = PHVideoRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.isNetworkAccessAllowed = true
        let url: URL? = await withCheckedContinuation { (continuation: CheckedContinuation<URL?, Never>) in
            let completion: @Sendable (AVAsset?, AVAudioMix?, [AnyHashable: Any]?) -> Void = { avAsset, _, _ in
                guard let urlAsset = avAsset as? AVURLAsset else {
                    continuation.resume(returning: nil)
                    return
                }
                let dest = FileManager.default.temporaryDirectory
                    .appendingPathComponent("recent_\(UUID().uuidString).mov")
                do {
                    try FileManager.default.copyItem(at: urlAsset.url, to: dest)
                    continuation.resume(returning: dest)
                } catch {
                    continuation.resume(returning: nil)
                }
            }
            imageManager.requestAVAsset(forVideo: asset, options: options, resultHandler: completion)
        }
        return url.map { .video($0) }
    }
}

// ============================================================================
// MARK: - RecentMediaStrip
// ============================================================================

/// Scrollable four-column grid of the most recent photos/videos, shown beneath
/// the attachment carousel and filling the rest of the panel. Tapping a
/// thumbnail hands the resolved media to `onSelect`.
///
/// La tuile « ouvrir la photothèque » (`onOpenLibrary`) est la PREMIÈRE cellule,
/// avant la première image : la sortie vers la photothèque complète doit être
/// atteignable sans faire défiler l'échantillon jusqu'au bout.
struct RecentMediaStrip: View {
    let accentColor: String
    /// Opens the full photo library. Receives the asset identifiers currently
    /// multi-selected in the strip (empty outside selection mode) so the host
    /// can preselect them in its PhotosPicker. The strip keeps its selection —
    /// a cancelled picker must not lose the user's picks.
    let onOpenLibrary: ([String]) -> Void
    let onSelect: (RecentMediaPick) -> Void
    /// When wired, the long-press menu offers "Éditer" — the resolved media is
    /// handed to the host, which opens its editor before staging the result.
    /// `nil` hides the action (hosts without an editor flow).
    var onEdit: ((RecentMediaPick) -> Void)? = nil
    /// Mirrors the multi-selection outwards so a host that offers its OWN
    /// shortcut to the full library (the panel grab handle) can preselect the
    /// same assets — same invariant as `onOpenLibrary`: leaving the strip for
    /// the picker must never lose the user's picks.
    var onSelectionChanged: (([String]) -> Void)? = nil
    /// Hôte à zone d'attachement LIÉE (#9683) : reçoit le média avec son
    /// `localIdentifier` (photo en octets d'origine) à la place d'`onSelect`.
    var onSelectAsset: ((RecentMediaAsset) -> Void)? = nil
    /// Les assets déjà dans la zone d'attachement, DÉRIVÉS d'elle par l'hôte
    /// (`RecentMediaAttachmentLink`) : leur tuile est marquée et refuse d'être
    /// reprise ; retirer la pièce de la zone libère la tuile.
    var attachedAssetIds: Set<String> = []

    @StateObject private var model = RecentMediaStripModel()
    @State private var resolvingId: String?
    @State private var selection = RecentMediaSelection()
    @State private var isBatchResolving = false

    nonisolated static let columnCount = 4
    private let columns = RecentMediaStrip.columnCount
    private let spacing: CGFloat = 8
    private let hPadding: CGFloat = 12

    /// Cells are sized from the REAL container width, never the window: the
    /// composer panel is inset from the window edges (and a comments sheet on
    /// iPad is far narrower), so window-sized cells overflowed the panel.
    private func cell(forContainerWidth width: CGFloat) -> CGFloat {
        max(40, ((width - hPadding * 2) - spacing * CGFloat(columns - 1)) / CGFloat(columns))
    }

    /// Échantillon de tête : TOUT ce que le modèle va chercher, 40 médias
    /// (#8869). Le plafond de 19 masquait 21 médias déjà chargés, et la bande
    /// horizontale de deux rangées n'en montrait que 7 sans défiler.
    ///
    /// `nonisolated static` pour être vérifiable telle quelle par un test, sans
    /// photothèque ni contexte d'acteur — même précédent que
    /// `RecentMediaStripModel.thumbnailRequestOptions()`.
    nonisolated static let headSampleCount = 40

    private var samples: [PHAsset] { Array(model.assets.prefix(Self.headSampleCount)) }

    var body: some View {
        VStack(spacing: 0) {
            if selection.isActive {
                selectionBar
                    .transition(.move(edge: .top).combined(with: .opacity))
            } else if !model.needsAuthorization && !model.assets.isEmpty {
                selectButtonRow
                    .transition(.opacity)
            }
            Group {
                if model.needsAuthorization {
                    authorizationTile
                } else {
                    grid
                }
            }
            .frame(maxHeight: .infinity, alignment: .top)
        }
        .task { model.load() }
        .adaptiveOnChange(of: selection.ids) { _, ids in onSelectionChanged?(ids) }
        .adaptiveOnChange(of: attachedAssetIds) { _, attached in selection.discard(attached) }
    }

    /// La sélection multiple se voit (#9683) : un « Sélectionner » à droite,
    /// au-dessus de la grille — l'appui long n'en est plus le seul chemin.
    private var selectButtonRow: some View {
        HStack {
            Spacer()
            Button {
                HapticFeedback.light()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { selection.activate() }
            } label: {
                Label(
                    String(localized: "composer.recent.select", defaultValue: "Sélectionner", bundle: .main),
                    systemImage: "checkmark.circle"
                )
                .font(.caption.weight(.semibold))
                .foregroundColor(Color(hex: accentColor))
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.vertical, MeeshySpacing.xsPlus)
                .frame(minHeight: 32)
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .adaptiveGlass(in: Capsule(), interactive: true)
        }
        .padding(.horizontal, hPadding)
        .padding(.top, MeeshySpacing.sm)
        .padding(.bottom, MeeshySpacing.xxs)
    }

    /// Remplace la grille tant que la photothèque n'est pas accessible.
    ///
    /// Deux états : jamais demandé (le tap déclenche le prompt, au moment où
    /// l'utilisateur montre son intérêt) et refus définitif (le tap ouvre les
    /// Réglages — auparavant le strip restait simplement vide, sans un mot).
    private var authorizationTile: some View {
        Button {
            HapticFeedback.light()
            if model.isAuthorizationRefused {
                MediaPermissionCoordinator.openSettings()
            } else {
                Task { await model.requestAccess() }
            }
        } label: {
            HStack(spacing: MeeshySpacing.smPlus) {
                Image(systemName: "photo.on.rectangle.angled")
                    .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .medium))
                    .foregroundColor(Color(hex: accentColor))
                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(model.isAuthorizationRefused
                         ? String(localized: "composer.recent.accessDenied", defaultValue: "Accès aux photos refusé", bundle: .main)
                         : String(localized: "composer.recent.grantAccess", defaultValue: "Autoriser l'accès aux photos", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundColor(.primary)
                    Text(model.isAuthorizationRefused
                         ? String(localized: "composer.recent.accessDenied.hint", defaultValue: "Toucher pour ouvrir les Réglages", bundle: .main)
                         : String(localized: "composer.recent.grantAccess.hint", defaultValue: "Pour retrouver vos médias récents ici", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                        .foregroundColor(.secondary)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, hPadding)
            .padding(.vertical, MeeshySpacing.mdPlus)
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Shown while multi-selecting: cancel on the left, a counting "Ajouter"
    /// confirm on the right that stages every selected item in tap order.
    /// iOS 26 renders both pills in native Liquid Glass (regular / tinted
    /// prominent) via the SDK Compatibility wrappers, grouped in a glass
    /// container so the adjacent shapes blend; earlier versions degrade to
    /// `.ultraThinMaterial` / solid accent — same layout, no behavior change.
    private var selectionBar: some View {
        AdaptiveGlassContainer(spacing: 12) {
            HStack(spacing: MeeshySpacing.smPlus) {
                Button {
                    HapticFeedback.light()
                    exitSelection()
                } label: {
                    Text(String(localized: "composer.recent.cancelSelection", defaultValue: "Annuler", bundle: .main))
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.secondary)
                        .padding(.horizontal, MeeshySpacing.md)
                        .padding(.vertical, MeeshySpacing.xsPlus)
                }
                .buttonStyle(.plain)
                .adaptiveGlass(in: Capsule(), interactive: true)
                .accessibilityLabel(String(localized: "composer.a11y.cancelSelection", defaultValue: "Annuler la sélection", bundle: .main))

                Spacer()

                Button {
                    confirmSelection()
                } label: {
                    HStack(spacing: MeeshySpacing.xsPlus) {
                        if isBatchResolving {
                            ProgressView()
                                .tint(.white)
                                .scaleEffect(0.7)
                        } else {
                            Image(systemName: "plus.circle.fill")
                                .font(.caption)
                        }
                        Text(String(localized: "composer.recent.addSelected", defaultValue: "Ajouter (\(selection.count))", bundle: .main))
                            .font(.caption.weight(.bold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, MeeshySpacing.mdPlus)
                    .padding(.vertical, MeeshySpacing.xsPlus)
                }
                .buttonStyle(.plain)
                .adaptiveGlassProminent(in: Capsule(), tint: Color(hex: accentColor))
                .disabled(selection.isEmpty || isBatchResolving)
                .opacity(selection.isEmpty ? 0.5 : 1)
                .accessibilityLabel(String(localized: "composer.a11y.addSelection", defaultValue: "Ajouter la sélection", bundle: .main))
            }
            .padding(.horizontal, hPadding)
            .padding(.top, MeeshySpacing.sm)
            .padding(.bottom, MeeshySpacing.xxs)
        }
    }

    /// One layout for every idiom (#8869): a four-column vertical grid sized to
    /// the REAL container width and scrolling inside the height the panel
    /// gives it. The former iPhone strip — two fixed rows scrolling sideways —
    /// sat mid-panel with a void above and below, and showed 7 media.
    private var grid: some View {
        GeometryReader { geo in
            let c = cell(forContainerWidth: geo.size.width)
            let cols = Array(repeating: GridItem(.fixed(c), spacing: spacing), count: columns)
            ScrollView(.vertical, showsIndicators: false) {
                LazyVGrid(columns: cols, alignment: .leading, spacing: spacing) {
                    openLibraryTile(c)
                    ForEach(samples, id: \.localIdentifier) { asset in
                        cellView(asset, size: c)
                    }
                }
                .padding(.horizontal, hPadding)
                .padding(.vertical, MeeshySpacing.smPlus)
            }
        }
    }

    private func cellView(_ asset: PHAsset, size: CGFloat) -> some View {
        RecentMediaCell(
            asset: asset,
            model: model,
            cell: size,
            accentColor: accentColor,
            isResolving: resolvingId == asset.localIdentifier,
            isAttached: attachedAssetIds.contains(asset.localIdentifier),
            isSelecting: selection.isActive,
            selectionIndex: selection.index(of: asset.localIdentifier),
            canEdit: onEdit != nil,
            onTap: { tap(asset) },
            onAdd: { addSingle(asset) },
            onToggleSelect: { toggleSelection(asset) },
            onEditTap: { edit(asset) }
        )
    }

    /// Plain tap: stages the media in normal mode, toggles membership while
    /// multi-selecting.
    private func tap(_ asset: PHAsset) {
        if attachedAssetIds.contains(asset.localIdentifier) {
            refuseAttached()
            return
        }
        if selection.isActive {
            HapticFeedback.light()
            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                selection.toggle(asset.localIdentifier)
            }
            return
        }
        addSingle(asset)
    }

    /// `resolve` renvoie `nil` quand PhotoKit ne peut pas matérialiser l'asset :
    /// vidéo iCloud non redescendue, ralenti/timelapse rendu en `AVComposition`
    /// plutôt qu'en fichier, ou copie temporaire en échec. Ces trois cas
    /// sortaient en silence : le spinner tournait puis le tap ne faisait RIEN,
    /// sans le moindre moyen pour l'utilisateur de comprendre pourquoi son média
    /// n'arrivait pas dans les pièces jointes. Le passage par la photothèque
    /// complète (`PHPicker`, hors-process) reste la porte de sortie.
    private func announceResolutionFailure(count: Int = 1) {
        FeedbackToastManager.shared.showError(
            count > 1
                ? String(localized: "recentMedia.resolveFailed.multiple",
                         defaultValue: "\(count) médias n'ont pas pu être préparés — passez par la photothèque complète",
                         bundle: .main)
                : String(localized: "recentMedia.resolveFailed",
                         defaultValue: "Ce média n'a pas pu être préparé — passez par la photothèque complète",
                         bundle: .main)
        )
    }

    /// Une tuile déjà jointe REFUSE d'être reprise, et ne retire rien (#9683) :
    /// la pièce de la zone peut avoir été retouchée, et un toucher sur la
    /// grille ne doit jamais défaire ce travail en silence. On la retire
    /// depuis la zone d'attachement — le geste qui existe déjà —, ce qui
    /// libère la tuile.
    private func refuseAttached() {
        HapticFeedback.warning()
    }

    /// Resolves the asset and hands it to the host. A linked host
    /// (`onSelectAsset`) receives it with its identifier, photo as original
    /// bytes; the others keep the decoded `RecentMediaPick`.
    private func deliver(_ asset: PHAsset) async -> Bool {
        if let onSelectAsset {
            guard let resolved = await model.resolveForAttachment(asset) else { return false }
            onSelectAsset(resolved)
            return true
        }
        guard let pick = await model.resolve(asset) else { return false }
        onSelect(pick)
        return true
    }

    /// The "Ajouter" path.
    private func addSingle(_ asset: PHAsset) {
        guard resolvingId == nil, !isBatchResolving,
              !attachedAssetIds.contains(asset.localIdentifier) else { return }
        HapticFeedback.light()
        resolvingId = asset.localIdentifier
        Task {
            let delivered = await deliver(asset)
            resolvingId = nil
            if !delivered { announceResolutionFailure() }
        }
    }

    /// "Sélectionner" from the context menu: enters (or extends) the
    /// multi-selection with this asset; toggles it off when already selected.
    private func toggleSelection(_ asset: PHAsset) {
        guard !attachedAssetIds.contains(asset.localIdentifier) else { return refuseAttached() }
        HapticFeedback.medium()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            if selection.isActive {
                selection.toggle(asset.localIdentifier)
            } else {
                selection.begin(with: asset.localIdentifier)
            }
        }
    }

    private func exitSelection() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            selection.clear()
        }
    }

    /// Stages every selected item in tap order, then leaves selection mode.
    /// Sequential resolution keeps `resolvingId` meaningful (the spinner walks
    /// through the cells as each one lands in the attachment tray).
    private func confirmSelection() {
        guard !selection.isEmpty, !isBatchResolving else { return }
        HapticFeedback.medium()
        isBatchResolving = true
        let ids = RecentMediaAttachmentLink.fresh(selection.ids, excluding: attachedAssetIds)
        Task {
            var failures = 0
            for id in ids {
                guard let asset = model.assets.first(where: { $0.localIdentifier == id }) else { continue }
                resolvingId = id
                let delivered = await deliver(asset)
                if !delivered { failures += 1 }
            }
            resolvingId = nil
            isBatchResolving = false
            exitSelection()
            // Un seul message pour le lot : un toast par échec noierait les
            // médias qui, eux, sont bien arrivés dans la barre de pièces jointes.
            if failures > 0 { announceResolutionFailure(count: failures) }
        }
    }

    /// "Éditer" from the context menu: resolves the asset then hands it to the
    /// host's editor flow (only reachable when `onEdit` is wired).
    private func edit(_ asset: PHAsset) {
        guard let onEdit, resolvingId == nil, !isBatchResolving else { return }
        HapticFeedback.light()
        resolvingId = asset.localIdentifier
        Task {
            let pick = await model.resolve(asset)
            resolvingId = nil
            if let pick { onEdit(pick) } else { announceResolutionFailure() }
        }
    }

    private func openLibraryTile(_ size: CGFloat) -> some View {
        Button {
            HapticFeedback.light()
            onOpenLibrary(selection.ids)
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                    .fill(Color(hex: accentColor).opacity(0.12))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                            .stroke(Color(hex: accentColor).opacity(0.3), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    )
                VStack(spacing: MeeshySpacing.xs) {
                    Image(systemName: "photo.on.rectangle.angled")
                        .font(.title3)
                    Image(systemName: "plus")
                        .font(.caption.weight(.bold))
                }
                .foregroundColor(Color(hex: accentColor))
            }
            .frame(width: size, height: size)
        }
        .accessibilityLabel(String(localized: "composer.a11y.openFullLibrary", defaultValue: "Ouvrir toute la photothèque", bundle: .main))
    }
}
