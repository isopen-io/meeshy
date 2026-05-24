import SwiftUI
import AVFoundation
import MeeshySDK

// MARK: - Meeshy Video Thumbnail
//
// Static video preview. NO `AVPlayer` instantiated. Uses (in order):
//   1. Attachment thumbnail URL (cached image via `ProgressiveCachedImage`)
//   2. Thumbnail extracted from a partial-range HTTP GET + AVAssetImageGenerator,
//      persisted into `CacheCoordinator.thumbnails`
//   3. `attachment.thumbnailColor` placeholder gradient
//
// Use in lists / grids / chips where playback is delegated : mini reply
// chip, composer attachment preview, profile media grid, overflow tile,
// carousel slides that aren't currently visible (memory eviction).

/// Static, cached video poster image with optional play + duration badges.
public struct MeeshyVideoThumbnail: View {

    // MARK: - Inputs (attachment-driven API)

    public let attachment: MeeshyMessageAttachment?
    public let videoUrlString: String
    public let accentColor: String
    public let thumbnailColor: String
    public let durationFormatted: String?
    public var showPlayBadge: Bool
    public var showDurationBadge: Bool
    public var cornerRadius: CGFloat
    public var onTap: (() -> Void)?

    @State private var thumbnail: UIImage?
    @State private var isLoading = false

    // MARK: - Attachment-driven init (preferred)

    public init(
        attachment: MeeshyMessageAttachment,
        accentColor: String,
        showPlayBadge: Bool = true,
        showDurationBadge: Bool = true,
        cornerRadius: CGFloat = 0,
        onTap: (() -> Void)? = nil
    ) {
        self.attachment = attachment
        self.videoUrlString = attachment.fileUrl
        self.accentColor = accentColor
        self.thumbnailColor = attachment.thumbnailColor
        self.durationFormatted = attachment.duration.map { Self.formatDuration(milliseconds: $0) }
        self.showPlayBadge = showPlayBadge
        self.showDurationBadge = showDurationBadge
        self.cornerRadius = cornerRadius
        self.onTap = onTap
    }

    // MARK: - Body

    public var body: some View {
        ZStack {
            thumbnailLayer
            if showPlayBadge { playBadge }
            if showDurationBadge, let formatted = durationFormatted {
                durationBadge(formatted)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
        .contentShape(Rectangle())
        .onTapGesture { onTap?() }
        .task(id: videoUrlString) { await extractThumbnailIfNeeded() }
    }

    // MARK: - Thumbnail layer (cached image -> extracted frame -> color placeholder)

    @ViewBuilder
    private var thumbnailLayer: some View {
        // Priority 1 : attachment carries a thumbnail URL / thumbHash
        if let att = attachment,
           let thumbUrl = att.thumbnailUrl, !thumbUrl.isEmpty {
            ProgressiveCachedImage(
                thumbHash: att.thumbHash,
                thumbnailUrl: thumbUrl,
                fullUrl: thumbUrl
            ) {
                Color(hex: thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fill)
        }
        // Priority 2 : extracted first-frame
        else if let extracted = thumbnail {
            Image(uiImage: extracted)
                .resizable()
                .aspectRatio(contentMode: .fill)
        }
        // Priority 3 : color placeholder while loading or as final fallback
        else {
            placeholder
                .overlay {
                    if isLoading {
                        ProgressView()
                            .tint(.white.opacity(0.6))
                    }
                }
        }
    }

    private var placeholder: some View {
        Rectangle()
            .fill(
                LinearGradient(
                    colors: [
                        Color(hex: thumbnailColor).opacity(0.25),
                        Color(hex: thumbnailColor).opacity(0.08)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                Image(systemName: "video.fill")
                    .font(.system(size: 32))
                    .foregroundColor(.white.opacity(0.2))
            )
    }

    // MARK: - Badges

    private var playBadge: some View {
        ZStack {
            Circle().fill(.ultraThinMaterial).frame(width: 44, height: 44)
            Circle().fill(Color(hex: accentColor).opacity(0.85)).frame(width: 38, height: 38)
            Image(systemName: "play.fill")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.white)
                .offset(x: 1.5)
        }
        .shadow(color: .black.opacity(0.3), radius: 6, y: 3)
    }

    private func durationBadge(_ formatted: String) -> some View {
        VStack {
            Spacer()
            HStack {
                Spacer()
                Text(formatted)
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundColor(.white)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Color.black.opacity(0.6)))
            }
            .padding(.trailing, 4)
            .padding(.bottom, 4)
        }
    }

    // MARK: - Extraction (cached HTTP-range GET + AVAssetImageGenerator)

    private func extractThumbnailIfNeeded() async {
        guard thumbnail == nil, !videoUrlString.isEmpty else { return }
        // If the attachment provides a thumbnail URL, the ProgressiveCachedImage
        // path handles loading. We only run extraction when no URL exists.
        if let att = attachment, let thumbUrl = att.thumbnailUrl, !thumbUrl.isEmpty {
            return
        }
        guard let url = MeeshyConfig.resolveMediaURL(videoUrlString) else { return }

        let resolvedUrl = url.absoluteString
        let thumbKey = "thumb:\(resolvedUrl)"

        // 1. Cache hit -> use immediately
        let thumbStore = await CacheCoordinator.shared.thumbnails
        if let cachedData = thumbStore.cachedData(for: thumbKey),
           let image = UIImage(data: cachedData) {
            withAnimation(.easeIn(duration: 0.15)) { self.thumbnail = image }
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            var request = URLRequest(url: url)
            request.setValue("bytes=0-1048575", forHTTPHeaderField: "Range")
            request.timeoutInterval = 15

            let (data, _) = try await URLSession.shared.data(for: request)

            let tempURL = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension("mp4")
            try data.write(to: tempURL)
            defer { try? FileManager.default.removeItem(at: tempURL) }

            let asset = AVURLAsset(url: tempURL)
            let generator = AVAssetImageGenerator(asset: asset)
            generator.appliesPreferredTrackTransform = true
            generator.maximumSize = CGSize(width: 300, height: 300)

            let time = CMTime(seconds: 0.1, preferredTimescale: 600)
            let (cgImage, _) = try await generator.image(at: time)
            let image = UIImage(cgImage: cgImage)

            if let jpegData = image.jpegData(compressionQuality: 0.7) {
                await CacheCoordinator.shared.thumbnails.store(jpegData, for: thumbKey)
            }

            await MainActor.run {
                withAnimation(.easeIn(duration: 0.15)) { self.thumbnail = image }
            }
        } catch {
            // Placeholder remains visible
        }
    }

    // MARK: - Duration formatting

    private static func formatDuration(milliseconds: Int) -> String {
        let total = milliseconds / 1000
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

