import SwiftUI
import MeeshySDK

public struct CachedAsyncImage<Placeholder: View>: View {
    public let urlString: String?
    public let placeholder: () -> Placeholder

    @State private var image: UIImage?
    @State private var isLoading = false
    @State private var hasFailed = false
    @State private var retryCount = 0

    public init(url urlString: String?, @ViewBuilder placeholder: @escaping () -> Placeholder) {
        self.urlString = urlString; self.placeholder = placeholder
        if let urlString, !urlString.isEmpty {
            if urlString.hasPrefix("data:image/") {
                _image = State(initialValue: decodeDataURI(urlString))
            } else {
                let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
                _image = State(initialValue: MediaCacheManager.cachedImage(for: resolved))
            }
        } else {
            _image = State(initialValue: nil)
        }
    }

    public var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable()
            } else if hasFailed {
                placeholder()
                    .overlay {
                        Button {
                            hasFailed = false
                            retryCount += 1
                        } label: {
                            VStack(spacing: 4) {
                                Image(systemName: "arrow.clockwise.circle.fill")
                                    .font(.system(size: 22, weight: .medium))
                                    .foregroundStyle(.white.opacity(0.7))
                                Text("Retry")
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.5))
                            }
                        }
                    }
            } else {
                placeholder()
                    .overlay { if isLoading { ProgressView().tint(.white.opacity(0.6)) } }
            }
        }
        .task(id: "\(urlString ?? "")_\(retryCount)") { await loadImage(for: urlString) }
        .onChange(of: urlString) { newUrl in
            guard let newUrl, !newUrl.isEmpty else {
                image = nil
                hasFailed = false
                return
            }
            if newUrl.hasPrefix("data:image/") {
                image = decodeDataURI(newUrl)
                hasFailed = false
            } else {
                let resolved = MeeshyConfig.resolveMediaURL(newUrl)?.absoluteString ?? newUrl
                if let cached = MediaCacheManager.cachedImage(for: resolved) {
                    image = cached
                    hasFailed = false
                } else {
                    image = nil
                    hasFailed = false
                }
            }
        }
    }

    private func loadImage(for currentUrlString: String?) async {
        guard let currentUrlString, !currentUrlString.isEmpty else { return }

        if currentUrlString.hasPrefix("data:image/") {
            if image == nil, let decoded = decodeDataURI(currentUrlString) {
                withAnimation(.easeIn(duration: 0.15)) { self.image = decoded }
            }
            return
        }

        let resolved = MeeshyConfig.resolveMediaURL(currentUrlString)?.absoluteString ?? currentUrlString
        if image != nil && MediaCacheManager.cachedImage(for: resolved) != nil { return }

        isLoading = true; hasFailed = false
        do {
            let loaded = try await MediaCacheManager.shared.image(for: resolved)
            if !Task.isCancelled {
                if self.urlString == currentUrlString {
                    withAnimation(.easeIn(duration: 0.15)) { self.image = loaded }
                }
            }
        } catch is CancellationError {
            // View scrolled out of LazyVStack — don't mark as failed,
            // next appearance will retry with fresh state
        } catch {
            if !Task.isCancelled { hasFailed = true }
        }
        if !Task.isCancelled { isLoading = false }
    }
}

extension CachedAsyncImage where Placeholder == Color {
    public init(url urlString: String?) {
        self.init(url: urlString) { Color.gray.opacity(0.2) }
    }
}

public struct CachedAvatarImage: View {
    public let urlString: String?
    public let name: String
    public let size: CGFloat
    public let accentColor: String

    @State private var image: UIImage?

    public init(urlString: String?, name: String, size: CGFloat, accentColor: String) {
        self.urlString = urlString; self.name = name; self.size = size; self.accentColor = accentColor
        if let urlString, !urlString.isEmpty {
            if urlString.hasPrefix("data:image/") {
                _image = State(initialValue: decodeDataURI(urlString))
            } else {
                let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
                _image = State(initialValue: MediaCacheManager.cachedImage(for: resolved))
            }
        } else {
            _image = State(initialValue: nil)
        }
    }

    public var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().aspectRatio(contentMode: .fill)
            } else { initialsFallback }
        }
        .frame(width: size, height: size).clipShape(Circle())
        .task(id: urlString) { await loadAvatar(for: urlString) }
        .onChange(of: urlString) { newUrl in
            guard let newUrl, !newUrl.isEmpty else { image = nil; return }
            if newUrl.hasPrefix("data:image/") {
                image = decodeDataURI(newUrl)
            } else {
                let resolved = MeeshyConfig.resolveMediaURL(newUrl)?.absoluteString ?? newUrl
                image = MediaCacheManager.cachedImage(for: resolved)
            }
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

    private func loadAvatar(for currentUrlString: String?) async {
        guard let currentUrlString, !currentUrlString.isEmpty else { return }
        if currentUrlString.hasPrefix("data:image/") {
            if image == nil, let decoded = decodeDataURI(currentUrlString) {
                withAnimation(.easeIn(duration: 0.15)) { self.image = decoded }
            }
            return
        }
        let resolved = MeeshyConfig.resolveMediaURL(currentUrlString)?.absoluteString ?? currentUrlString
        if image != nil && MediaCacheManager.cachedImage(for: resolved) != nil { return }
        if let loaded = try? await MediaCacheManager.shared.image(for: resolved) {
            if self.urlString == currentUrlString {
                withAnimation(.easeIn(duration: 0.15)) { self.image = loaded }
            }
        }
    }
}

public struct CachedBannerImage: View {
    public let urlString: String?
    public let fallbackColor: String
    public let height: CGFloat

    @State private var image: UIImage?

    public init(urlString: String?, fallbackColor: String, height: CGFloat) {
        self.urlString = urlString; self.fallbackColor = fallbackColor; self.height = height
        if let urlString, !urlString.isEmpty {
            if urlString.hasPrefix("data:image/") {
                _image = State(initialValue: decodeDataURI(urlString))
            } else {
                let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
                _image = State(initialValue: MediaCacheManager.cachedImage(for: resolved))
            }
        } else {
            _image = State(initialValue: nil)
        }
    }

    public var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().aspectRatio(contentMode: .fill)
            } else {
                let color = Color(hex: fallbackColor)
                LinearGradient(colors: [color.opacity(0.8), color.opacity(0.4)], startPoint: .topLeading, endPoint: .bottomTrailing)
            }
        }
        .frame(height: height).clipped()
        .task(id: urlString) { await loadBanner(for: urlString) }
        .onChange(of: urlString) { newUrl in
            guard let newUrl, !newUrl.isEmpty else {
                image = nil
                return
            }
            if newUrl.hasPrefix("data:image/") {
                image = decodeDataURI(newUrl)
            } else {
                let resolved = MeeshyConfig.resolveMediaURL(newUrl)?.absoluteString ?? newUrl
                if let cached = MediaCacheManager.cachedImage(for: resolved) {
                    image = cached
                } else {
                    image = nil
                }
            }
        }
    }

    private func loadBanner(for currentUrlString: String?) async {
        guard let currentUrlString, !currentUrlString.isEmpty else { return }
        if currentUrlString.hasPrefix("data:image/") {
            if image == nil, let decoded = decodeDataURI(currentUrlString) {
                withAnimation(.easeIn(duration: 0.15)) { self.image = decoded }
            }
            return
        }
        let resolved = MeeshyConfig.resolveMediaURL(currentUrlString)?.absoluteString ?? currentUrlString
        if image != nil && MediaCacheManager.cachedImage(for: resolved) != nil { return }
        if let loaded = try? await MediaCacheManager.shared.image(for: resolved) {
            if self.urlString == currentUrlString {
                withAnimation(.easeIn(duration: 0.15)) {
                    self.image = loaded
                }
            }
        }
    }
}

// MARK: - Shared Helper

private func decodeDataURI(_ dataURI: String) -> UIImage? {
    guard let commaIdx = dataURI.firstIndex(of: ",") else { return nil }
    let base64 = String(dataURI[dataURI.index(after: commaIdx)...])
    guard let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else { return nil }
    return UIImage(data: data)
}
