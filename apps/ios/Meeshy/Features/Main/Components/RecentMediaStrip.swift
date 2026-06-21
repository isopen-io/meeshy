import SwiftUI
import Photos
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

// ============================================================================
// MARK: - RecentMediaStripModel
// ============================================================================

/// Fetches the most recent photos & videos from the photo library and resolves
/// thumbnails / full assets on demand. Pure photo-library plumbing — no Meeshy
/// state, so it stays app-side next to the composer that drives it.
@MainActor
final class RecentMediaStripModel: ObservableObject {
    @Published private(set) var assets: [PHAsset] = []
    @Published private(set) var status: PHAuthorizationStatus =
        PHPhotoLibrary.authorizationStatus(for: .readWrite)

    private let imageManager = PHImageManager.default()

    /// True once a fetch attempt has run, so the view never re-prompts.
    private var didLoad = false

    func load(limit: Int = 40) {
        guard !didLoad else { return }
        didLoad = true
        switch status {
        case .authorized, .limited:
            fetch(limit: limit)
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { [weak self] newStatus in
                Task { @MainActor in
                    guard let self else { return }
                    self.status = newStatus
                    if newStatus == .authorized || newStatus == .limited {
                        self.fetch(limit: limit)
                    }
                }
            }
        default:
            break
        }
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
    }

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
            imageManager.requestImage(
                for: asset, targetSize: size, contentMode: .aspectFill, options: options
            ) { image, _ in
                continuation.resume(returning: ImageBox(image: image))
            }
        }.image
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
            imageManager.requestImage(
                for: asset,
                targetSize: CGSize(width: 2048, height: 2048),
                contentMode: .aspectFit,
                options: options
            ) { image, _ in
                continuation.resume(returning: ImageBox(image: image))
            }
        }
        return box.image.map { .image($0) }
    }

    private func resolveVideo(_ asset: PHAsset) async -> RecentMediaPick? {
        let options = PHVideoRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.isNetworkAccessAllowed = true
        let url: URL? = await withCheckedContinuation { (continuation: CheckedContinuation<URL?, Never>) in
            imageManager.requestAVAsset(forVideo: asset, options: options) { avAsset, _, _ in
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
        }
        return url.map { .video($0) }
    }
}

// ============================================================================
// MARK: - RecentMediaStrip
// ============================================================================

/// Horizontal strip of recent photos/videos shown beneath the attachment
/// carousel. Tapping a thumbnail hands the resolved media to `onSelect`; the
/// leading "+" tile opens the full photo library via `onOpenLibrary`.
struct RecentMediaStrip: View {
    let accentColor: String
    let onOpenLibrary: () -> Void
    let onSelect: (RecentMediaPick) -> Void

    @StateObject private var model = RecentMediaStripModel()
    @State private var resolvingId: String?

    private let cell: CGFloat = 84

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                openLibraryTile
                ForEach(model.assets, id: \.localIdentifier) { asset in
                    RecentMediaCell(
                        asset: asset,
                        model: model,
                        cell: cell,
                        isResolving: resolvingId == asset.localIdentifier,
                        onTap: { tap(asset) }
                    )
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
        }
        .task { model.load() }
    }

    private func tap(_ asset: PHAsset) {
        guard resolvingId == nil else { return }
        HapticFeedback.light()
        resolvingId = asset.localIdentifier
        Task {
            let pick = await model.resolve(asset)
            resolvingId = nil
            if let pick { onSelect(pick) }
        }
    }

    private var openLibraryTile: some View {
        Button {
            HapticFeedback.light()
            onOpenLibrary()
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
            .frame(width: cell, height: cell)
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
    let isResolving: Bool
    let onTap: () -> Void

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

                if isResolving {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.black.opacity(0.35))
                    ProgressView().tint(.white)
                }
            }
            .frame(width: cell, height: cell)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(asset.mediaType == .video
            ? String(localized: "composer.a11y.recentVideo", defaultValue: "Vid\u{00E9}o r\u{00E9}cente", bundle: .main)
            : String(localized: "composer.a11y.recentPhoto", defaultValue: "Photo r\u{00E9}cente", bundle: .main))
        .task(id: asset.localIdentifier) {
            let px = cell * displayScale
            thumbnail = await model.thumbnail(for: asset, size: CGSize(width: px, height: px))
        }
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}
