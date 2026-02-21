import SwiftUI
import AVFoundation
import MeeshySDK

// MARK: - Video Thumbnail View

/// Downloads the first ~1MB of a video via Range header and extracts a frame locally.
/// Used as a fallback when no server-generated thumbnailUrl is available.
struct VideoThumbnailView: View {
    let videoUrlString: String
    let accentColor: String

    @State private var thumbnail: UIImage?
    @State private var isLoading = false

    private static let thumbnailCache = NSCache<NSString, UIImage>()

    var body: some View {
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

        let cacheKey = url.absoluteString as NSString
        if let cached = Self.thumbnailCache.object(forKey: cacheKey) {
            self.thumbnail = cached
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
            let cgImage = try generator.copyCGImage(at: time, actualTime: nil)
            let image = UIImage(cgImage: cgImage)

            Self.thumbnailCache.setObject(image, forKey: cacheKey)

            await MainActor.run {
                withAnimation(.easeIn(duration: 0.15)) { self.thumbnail = image }
            }
        } catch {
            // Silently fail - placeholder remains visible
        }
    }
}
