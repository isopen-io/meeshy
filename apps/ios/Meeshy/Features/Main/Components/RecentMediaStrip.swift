import SwiftUI
import Photos
import AVFoundation
import UIKit
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
private struct ImageBox: @unchecked Sendable { let image: UIImage? }

/// Same boundary-crossing pattern as `ImageBox`, for the `AVPlayerItem`
/// resolved for the long-press video preview.
private struct PlayerItemBox: @unchecked Sendable { let item: AVPlayerItem? }

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

    private let imageManager = PHImageManager.default()

    /// True once a fetch attempt has run, so the view never re-prompts.
    private var didLoad = false
    private var fetchLimit = 40
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
    func load(limit: Int = 40) {
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

    /// Square thumbnail for a cell. `.fastFormat` guarantees a single callback,
    /// which keeps the continuation safe (multi-callback modes would resume it
    /// more than once).
    func thumbnail(for asset: PHAsset, size: CGSize) async -> UIImage? {
        let options = PHImageRequestOptions()
        options.deliveryMode = .fastFormat
        options.resizeMode = .fast
        options.isNetworkAccessAllowed = true
        options.isSynchronous = false
        return await withCheckedContinuation { (continuation: CheckedContinuation<ImageBox, Never>) in
            let completion: @Sendable (UIImage?, [AnyHashable: Any]?) -> Void = { image, _ in
                continuation.resume(returning: ImageBox(image: image))
            }
            imageManager.requestImage(
                for: asset, targetSize: size, contentMode: .aspectFill, options: options,
                resultHandler: completion
            )
        }.image
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
        return await withCheckedContinuation { (continuation: CheckedContinuation<ImageBox, Never>) in
            let completion: @Sendable (UIImage?, [AnyHashable: Any]?) -> Void = { image, _ in
                continuation.resume(returning: ImageBox(image: image))
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

    private func resolveImage(_ asset: PHAsset) async -> RecentMediaPick? {
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .exact
        options.isNetworkAccessAllowed = true
        options.isSynchronous = false
        let box = await withCheckedContinuation { (continuation: CheckedContinuation<ImageBox, Never>) in
            let completion: @Sendable (UIImage?, [AnyHashable: Any]?) -> Void = { image, _ in
                continuation.resume(returning: ImageBox(image: image))
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

/// Two-row grid (four per row) of recent photos/videos shown beneath the
/// attachment carousel. Tapping a thumbnail hands the resolved media to
/// `onSelect`; the trailing 8th tile opens the full photo library via
/// `onOpenLibrary`.
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

    @StateObject private var model = RecentMediaStripModel()
    @State private var resolvingId: String?
    @State private var selection = RecentMediaSelection()
    @State private var isBatchResolving = false

    private let columns = 4
    private let spacing: CGFloat = 8
    private let hPadding: CGFloat = 12

    /// iPad / macOS use the roomy vertical grid; iPhone keeps the horizontal
    /// strip. Keyed on the device idiom (NOT horizontalSizeClass) because a sheet
    /// on iPad can report a `.compact` width even with ample room — and the
    /// screen-width cell sizing only misfires on iPad/macOS where the sheet is far
    /// narrower than the screen.
    private var usesGridLayout: Bool { DeviceLayout.isPad }

    /// Compact (iPhone): the composer fills the screen width, so the screen is a
    /// faithful proxy for the container. Regular (iPad / macOS) MUST size from the
    /// real container width — the comments sheet is far narrower than the screen,
    /// and sizing four cells off the full screen is exactly what made the old
    /// strip overflow into the unstructured mess.
    private var compactCell: CGFloat { cell(forContainerWidth: UIScreen.main.bounds.width) }

    private func cell(forContainerWidth width: CGFloat) -> CGFloat {
        max(40, ((width - hPadding * 2) - spacing * CGFloat(columns - 1)) / CGFloat(columns))
    }

    /// Compact reads as two rows of four (seven thumbnails + the trailing library
    /// tile). Regular shows a fuller, scrollable grid.
    private var compactSamples: [PHAsset] { Array(model.assets.prefix((columns * 2) - 1)) }
    private var regularSamples: [PHAsset] { Array(model.assets.prefix((columns * 6) - 1)) }

    var body: some View {
        VStack(spacing: 0) {
            if selection.isActive {
                selectionBar
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
            Group {
                if model.needsAuthorization {
                    authorizationTile
                } else if usesGridLayout {
                    regularGrid
                } else {
                    compactStrip
                        .frame(maxHeight: .infinity, alignment: .top)
                }
            }
        }
        .task { model.load() }
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
            HStack(spacing: 10) {
                Image(systemName: "photo.on.rectangle.angled")
                    .font(MeeshyFont.relative(18, weight: .medium))
                    .foregroundColor(Color(hex: accentColor))
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.isAuthorizationRefused
                         ? String(localized: "composer.recent.accessDenied", defaultValue: "Accès aux photos refusé", bundle: .main)
                         : String(localized: "composer.recent.grantAccess", defaultValue: "Autoriser l'accès aux photos", bundle: .main))
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(.primary)
                    Text(model.isAuthorizationRefused
                         ? String(localized: "composer.recent.accessDenied.hint", defaultValue: "Toucher pour ouvrir les Réglages", bundle: .main)
                         : String(localized: "composer.recent.grantAccess.hint", defaultValue: "Pour retrouver vos médias récents ici", bundle: .main))
                        .font(MeeshyFont.relative(11))
                        .foregroundColor(.secondary)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, hPadding)
            .padding(.vertical, 14)
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
            HStack(spacing: 10) {
                Button {
                    HapticFeedback.light()
                    exitSelection()
                } label: {
                    Text(String(localized: "composer.recent.cancelSelection", defaultValue: "Annuler", bundle: .main))
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                }
                .buttonStyle(.plain)
                .adaptiveGlass(in: Capsule(), interactive: true)
                .accessibilityLabel(String(localized: "composer.a11y.cancelSelection", defaultValue: "Annuler la s\u{00E9}lection", bundle: .main))

                Spacer()

                Button {
                    confirmSelection()
                } label: {
                    HStack(spacing: 6) {
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
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)
                }
                .buttonStyle(.plain)
                .adaptiveGlassProminent(in: Capsule(), tint: Color(hex: accentColor))
                .disabled(selection.isEmpty || isBatchResolving)
                .opacity(selection.isEmpty ? 0.5 : 1)
                .accessibilityLabel(String(localized: "composer.a11y.addSelection", defaultValue: "Ajouter la s\u{00E9}lection", bundle: .main))
            }
            .padding(.horizontal, hPadding)
            .padding(.top, 8)
            .padding(.bottom, 2)
        }
    }

    /// iPad / macOS — a roomy four-column vertical grid sized to the REAL
    /// container width, scrollable so every recent item is reachable.
    private var regularGrid: some View {
        GeometryReader { geo in
            let c = cell(forContainerWidth: geo.size.width)
            let cols = Array(repeating: GridItem(.fixed(c), spacing: spacing), count: columns)
            ScrollView(.vertical, showsIndicators: false) {
                LazyVGrid(columns: cols, alignment: .leading, spacing: spacing) {
                    ForEach(regularSamples, id: \.localIdentifier) { asset in
                        cellView(asset, size: c)
                    }
                    openLibraryTile(c)
                }
                .padding(.horizontal, hPadding)
                .padding(.vertical, 10)
            }
        }
    }

    /// iPhone — the original two-row horizontal strip.
    private var compactStrip: some View {
        let c = compactCell
        let rows = [
            GridItem(.fixed(c), spacing: spacing),
            GridItem(.fixed(c), spacing: spacing)
        ]
        return ScrollView(.horizontal, showsIndicators: false) {
            LazyHGrid(rows: rows, spacing: spacing) {
                ForEach(compactSamples, id: \.localIdentifier) { asset in
                    cellView(asset, size: c)
                }
                openLibraryTile(c)
            }
            .padding(.horizontal, hPadding)
            .padding(.vertical, 6)
        }
    }

    private func cellView(_ asset: PHAsset, size: CGFloat) -> some View {
        RecentMediaCell(
            asset: asset,
            model: model,
            cell: size,
            accentColor: accentColor,
            isResolving: resolvingId == asset.localIdentifier,
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

    /// Resolves the asset and hands it to the host — the "Ajouter" path.
    private func addSingle(_ asset: PHAsset) {
        guard resolvingId == nil, !isBatchResolving else { return }
        HapticFeedback.light()
        resolvingId = asset.localIdentifier
        Task {
            let pick = await model.resolve(asset)
            resolvingId = nil
            if let pick { onSelect(pick) } else { announceResolutionFailure() }
        }
    }

    /// "Sélectionner" from the context menu: enters (or extends) the
    /// multi-selection with this asset; toggles it off when already selected.
    private func toggleSelection(_ asset: PHAsset) {
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
        let ids = selection.ids
        Task {
            var failures = 0
            for id in ids {
                guard let asset = model.assets.first(where: { $0.localIdentifier == id }) else { continue }
                resolvingId = id
                if let pick = await model.resolve(asset) { onSelect(pick) } else { failures += 1 }
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
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(hex: accentColor).opacity(0.12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color(hex: accentColor).opacity(0.3), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    )
                VStack(spacing: 4) {
                    Image(systemName: "photo.on.rectangle.angled")
                        .font(.title3)
                    Image(systemName: "plus")
                        .font(.caption.weight(.bold))
                }
                .foregroundColor(Color(hex: accentColor))
            }
            .frame(width: size, height: size)
        }
        .accessibilityLabel(String(localized: "composer.a11y.openFullLibrary", defaultValue: "Ouvrir toute la phototh\u{00E8}que", bundle: .main))
    }
}

// ============================================================================
// MARK: - RecentMediaCell
// ============================================================================

private struct RecentMediaCell: View {
    let asset: PHAsset
    let model: RecentMediaStripModel
    let cell: CGFloat
    let accentColor: String
    let isResolving: Bool
    let isSelecting: Bool
    let selectionIndex: Int?
    let canEdit: Bool
    let onTap: () -> Void
    let onAdd: () -> Void
    let onToggleSelect: () -> Void
    let onEditTap: () -> Void

    @State private var thumbnail: UIImage?
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        Button(action: onTap) {
            ZStack {
                if let thumbnail {
                    Image(uiImage: thumbnail)
                        .resizable()
                        .scaledToFill()
                        .frame(width: cell, height: cell)
                        .clipped()
                } else {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.gray.opacity(0.18))
                        .frame(width: cell, height: cell)
                        .overlay(ProgressView().scaleEffect(0.7))
                }

                if asset.mediaType == .video {
                    VStack {
                        Spacer()
                        HStack {
                            Image(systemName: "video.fill")
                                .font(.caption2)
                            Text(formatDuration(asset.duration))
                                .font(.caption2.weight(.semibold))
                            Spacer()
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 3)
                        .background(LinearGradient(colors: [.black.opacity(0.5), .clear], startPoint: .bottom, endPoint: .top))
                    }
                }

                if isSelecting {
                    selectionBadge
                }

                if isResolving {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.black.opacity(0.35))
                    ProgressView().tint(.white)
                }
            }
            .frame(width: cell, height: cell)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color(hex: accentColor), lineWidth: selectionIndex != nil ? 2 : 0)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(asset.mediaType == .video
            ? String(localized: "composer.a11y.recentVideo", defaultValue: "Vid\u{00E9}o r\u{00E9}cente", bundle: .main)
            : String(localized: "composer.a11y.recentPhoto", defaultValue: "Photo r\u{00E9}cente", bundle: .main))
        .accessibilityValue(selectionIndex != nil
            ? String(localized: "composer.a11y.selectedState", defaultValue: "S\u{00E9}lectionn\u{00E9}", bundle: .main)
            : "")
        .contextMenu {
            // `.compactMenu` (iOS 16.4+) renders the three actions as the
            // system horizontal medium-size row (the Messages/Photos pattern);
            // 16.0–16.3 falls back to a plain ControlGroup (stacked items).
            if #available(iOS 16.4, *) {
                ControlGroup { contextActionButtons }
                    .controlGroupStyle(.compactMenu)
            } else {
                ControlGroup { contextActionButtons }
            }
        } preview: {
            RecentMediaPreview(asset: asset, model: model)
        }
        .task(id: asset.localIdentifier) {
            let px = cell * displayScale
            thumbnail = await model.thumbnail(for: asset, size: CGSize(width: px, height: px))
        }
    }

    /// The three context-menu actions: Ajouter / Sélectionner / Éditer.
    /// Éditer only appears when the host wired an editor flow.
    @ViewBuilder private var contextActionButtons: some View {
        Button(action: onAdd) {
            Label(
                String(localized: "composer.recent.add", defaultValue: "Ajouter", bundle: .main),
                systemImage: "plus.circle"
            )
        }
        Button(action: onToggleSelect) {
            Label(
                String(localized: "composer.recent.select", defaultValue: "S\u{00E9}lectionner", bundle: .main),
                systemImage: selectionIndex != nil ? "checkmark.circle.fill" : "checkmark.circle"
            )
        }
        if canEdit {
            Button(action: onEditTap) {
                Label(
                    String(localized: "composer.recent.edit", defaultValue: "\u{00C9}diter", bundle: .main),
                    systemImage: "pencil"
                )
            }
        }
    }

    /// Top-trailing selection indicator: hollow circle when unselected, an
    /// accent-filled badge carrying the 1-based pick order when selected.
    private var selectionBadge: some View {
        VStack {
            HStack {
                Spacer()
                ZStack {
                    Circle()
                        .fill(selectionIndex != nil ? Color(hex: accentColor) : Color.black.opacity(0.25))
                        .overlay(Circle().stroke(Color.white, lineWidth: 1.5))
                        .frame(width: 22, height: 22)
                    if let selectionIndex {
                        Text("\(selectionIndex + 1)")
                            .font(.caption2.weight(.bold))
                            .foregroundColor(.white)
                    }
                }
                .padding(4)
            }
            Spacer()
        }
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

// ============================================================================
// MARK: - RecentMediaPreview (long-press quick look)
// ============================================================================

/// Preview shown on long-press of a recent-media cell, via the system
/// context-menu preview, sized to the asset's real aspect ratio. Photos render
/// full quality; videos show their poster frame instantly, then start looping
/// muted playback as soon as the player item resolves.
private struct RecentMediaPreview: View {
    let asset: PHAsset
    let model: RecentMediaStripModel

    @State private var image: UIImage?
    @State private var player: AVQueuePlayer?
    @State private var looper: AVPlayerLooper?

    private var previewSize: CGSize {
        let width = CGFloat(max(asset.pixelWidth, 1))
        let height = CGFloat(max(asset.pixelHeight, 1))
        let maxSide: CGFloat = 320
        let scale = min(maxSide / width, maxSide / height)
        return CGSize(width: width * scale, height: height * scale)
    }

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
            } else {
                Color.black.opacity(0.05)
                ProgressView()
            }
            if let player {
                PreviewVideoSurface(player: player)
            }
        }
        .frame(width: previewSize.width, height: previewSize.height)
        .task {
            image = await model.preview(for: asset)
            guard asset.mediaType == .video,
                  let item = await model.videoPlayerItem(for: asset) else { return }
            let queue = AVQueuePlayer()
            queue.isMuted = true
            queue.allowsExternalPlayback = false
            queue.preventsDisplaySleepDuringVideoPlayback = false
            looper = AVPlayerLooper(player: queue, templateItem: item)
            player = queue
            queue.play()
        }
        .onDisappear {
            player?.pause()
            player = nil
            looper = nil
        }
    }
}

/// Chrome-less `AVPlayerLayer` host for the context-menu video preview.
/// AVKit's `VideoPlayer` is the wrong tool here: it draws transport controls
/// (unusable inside a context-menu preview) over a black backdrop that hides
/// the poster frame while the stream buffers. A bare player layer stays
/// transparent until the first frame renders, so the poster shows through.
private struct PreviewVideoSurface: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> PlayerLayerView {
        let view = PlayerLayerView()
        view.playerLayer.videoGravity = .resizeAspect
        view.playerLayer.player = player
        return view
    }

    func updateUIView(_ uiView: PlayerLayerView, context: Context) {
        if uiView.playerLayer.player !== player {
            uiView.playerLayer.player = player
        }
    }

    final class PlayerLayerView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer {
            guard let layer = layer as? AVPlayerLayer else {
                preconditionFailure("PlayerLayerView layer must be AVPlayerLayer")
            }
            return layer
        }
    }
}
