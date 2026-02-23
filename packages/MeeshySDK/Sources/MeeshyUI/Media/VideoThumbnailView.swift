import SwiftUI
import AVFoundation
import MeeshySDK

// MARK: - Video Thumbnail View

public struct VideoThumbnailView: View {
    public let videoUrlString: String
    public let accentColor: String

    @State private var thumbnail: UIImage?
    @State private var isLoading = false

    public init(videoUrlString: String, accentColor: String) {
        self.videoUrlString = videoUrlString; self.accentColor = accentColor
    }

    public var body: some View {
        Group {
            if let thumbnail {
                Image(uiImage: thumbnail)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                placeholder
                    .overlay {
                        if isLoading {
                            ProgressView()
                                .tint(.white.opacity(0.6))
                        }
                    }
            }
        }
        .task(id: videoUrlString) { await extractThumbnail() }
    }

    private var placeholder: some View {
        Rectangle()
            .fill(
                LinearGradient(
                    colors: [Color(hex: accentColor).opacity(0.25), Color(hex: accentColor).opacity(0.08)],
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

    private func extractThumbnail() async {
        guard thumbnail == nil, !videoUrlString.isEmpty else { return }
        guard let url = MeeshyConfig.resolveMediaURL(videoUrlString) else { return }

        let resolvedUrl = url.absoluteString
        let thumbKey = "thumb:\(resolvedUrl)"

        // 1. Check MediaCacheManager for persisted thumbnail
        if let cachedData = try? await MediaCacheManager.shared.cachedData(for: thumbKey),
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

            // Store JPEG data in MediaCacheManager with thumb: prefix
            if let jpegData = image.jpegData(compressionQuality: 0.7) {
                await MediaCacheManager.shared.store(jpegData, for: thumbKey)
            }

            await MainActor.run {
                withAnimation(.easeIn(duration: 0.15)) { self.thumbnail = image }
            }
        } catch {
            // Placeholder remains visible
        }
    }
}
