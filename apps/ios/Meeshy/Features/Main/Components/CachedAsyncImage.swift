import SwiftUI
import MeeshySDK

/// Drop-in replacement for AsyncImage that uses MediaCacheManager for caching.
/// Supports placeholder, loading state, and error handling.
struct CachedAsyncImage<Placeholder: View>: View {
    let urlString: String?
    let placeholder: () -> Placeholder

    @State private var image: UIImage?
    @State private var isLoading = false
    @State private var hasFailed = false

    init(url urlString: String?, @ViewBuilder placeholder: @escaping () -> Placeholder) {
        self.urlString = urlString
        self.placeholder = placeholder
    }

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
            } else {
                placeholder()
                    .overlay {
                        if isLoading {
                            ProgressView()
                                .tint(.white.opacity(0.6))
                        }
                    }
            }
        }
        .task(id: urlString) {
            await loadImage()
        }
    }

    private func loadImage() async {
        guard let urlString, !urlString.isEmpty else { return }

        // Skip if already loaded
        if image != nil { return }

        isLoading = true
        hasFailed = false

        do {
            let loaded = try await MediaCacheManager.shared.image(for: urlString)
            withAnimation(.easeIn(duration: 0.15)) {
                self.image = loaded
            }
        } catch {
            hasFailed = true
        }

        isLoading = false
    }
}

// MARK: - Convenience init with Color placeholder

extension CachedAsyncImage where Placeholder == Color {
    init(url urlString: String?) {
        self.init(url: urlString) { Color.gray.opacity(0.2) }
    }
}

// MARK: - Avatar variant with initials fallback

struct CachedAvatarImage: View {
    let urlString: String?
    let name: String
    let size: CGFloat
    let accentColor: String

    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                initialsFallback
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .task(id: urlString) {
            await loadAvatar()
        }
    }

    private var initialsFallback: some View {
        let initials = name.components(separatedBy: " ")
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
        let color = Color(hex: accentColor)

        return ZStack {
            LinearGradient(
                colors: [color, color.opacity(0.7)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Text(initials.isEmpty ? "?" : initials)
                .font(.system(size: size * 0.38, weight: .semibold, design: .rounded))
                .foregroundColor(.white)
        }
    }

    private func loadAvatar() async {
        guard let urlString, !urlString.isEmpty else { return }
        if image != nil { return }
        image = try? await MediaCacheManager.shared.image(for: urlString)
    }
}

// MARK: - Banner variant

struct CachedBannerImage: View {
    let urlString: String?
    let fallbackColor: String
    let height: CGFloat

    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                let color = Color(hex: fallbackColor)
                LinearGradient(
                    colors: [color.opacity(0.8), color.opacity(0.4)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
        .frame(height: height)
        .clipped()
        .task(id: urlString) {
            guard let urlString, !urlString.isEmpty else { return }
            if image != nil { return }
            image = try? await MediaCacheManager.shared.image(for: urlString)
        }
    }
}
