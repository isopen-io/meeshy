//
//  CachedAsyncImage.swift
//  Meeshy
//
//  SwiftUI wrapper for ImageCacheManager with configurable TTL
//  Supports memory + disk cache for optimal performance
//
//  Usage:
//    CachedAsyncImage(url: imageURL, cacheType: .image) { image in
//        image.resizable().aspectRatio(contentMode: .fill)
//    } placeholder: {
//        ProgressView()
//    }
//

import SwiftUI

/// A SwiftUI view that loads and caches images from URLs
/// Uses ImageCacheManager for memory and disk caching with TTL
struct CachedAsyncImage<Content: View, Placeholder: View>: View {
    // MARK: - Properties

    let url: URL?
    let cacheType: ImageCacheType
    let content: (Image) -> Content
    let placeholder: () -> Placeholder

    @State private var image: UIImage?
    @State private var isLoading = false
    @State private var loadAttempted = false

    // MARK: - Initialization

    init(
        url: URL?,
        cacheType: ImageCacheType = .image,
        @ViewBuilder content: @escaping (Image) -> Content,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.url = url
        self.cacheType = cacheType
        self.content = content
        self.placeholder = placeholder
    }

    /// Initialize with string URL (automatically resolves relative paths)
    /// Handles:
    /// - Complete URLs: "https://example.com/image.jpg"
    /// - Relative API paths: "/api/attachments/file/..."
    /// - Just file paths: "2024/11/userId/image.jpg"
    init(
        urlString: String?,
        cacheType: ImageCacheType = .image,
        @ViewBuilder content: @escaping (Image) -> Content,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        // Use EnvironmentConfig to resolve relative URLs
        if let urlString = urlString,
           let resolved = EnvironmentConfig.buildURL(urlString) {
            self.url = URL(string: resolved)
            #if DEBUG
            print("🖼️ [CachedAsyncImage] URL resolved: \"\(urlString)\" → \"\(resolved)\"")
            #endif
        } else {
            self.url = nil
            #if DEBUG
            if let urlString = urlString {
                print("🖼️ [CachedAsyncImage] Failed to resolve URL: \"\(urlString)\"")
            }
            #endif
        }
        self.cacheType = cacheType
        self.content = content
        self.placeholder = placeholder
    }

    // MARK: - Body

    var body: some View {
        Group {
            if let image = image {
                content(Image(uiImage: image))
            } else {
                placeholder()
                    .onAppear {
                        if !loadAttempted {
                            loadImage()
                        }
                    }
            }
        }
        .onChange(of: url) { oldURL, newURL in
            if newURL != oldURL {
                image = nil
                loadAttempted = false
                loadImage()
            }
        }
    }

    // MARK: - Private Methods

    private func loadImage() {
        guard let url = url else {
            #if DEBUG
            print("🖼️ [CachedAsyncImage] loadImage() - URL is nil")
            #endif
            return
        }
        guard !isLoading else { return }

        let urlString = url.absoluteString
        loadAttempted = true

        Task {
            isLoading = true

            // Check cache first (instant if cached)
            if let cachedImage = await ImageCacheManager.shared.getImage(for: urlString, type: cacheType) {
                #if DEBUG
                print("🖼️ [CachedAsyncImage] ✅ Cache HIT for: \(url.lastPathComponent)")
                #endif
                await MainActor.run {
                    withAnimation(.easeIn(duration: 0.15)) {
                        self.image = cachedImage
                    }
                    self.isLoading = false
                }
                return
            }

            #if DEBUG
            print("🖼️ [CachedAsyncImage] ⏳ Cache MISS - downloading: \(urlString)")
            #endif

            // Download image
            do {
                let (data, response) = try await URLSession.shared.data(from: url)

                // Validate response
                if let httpResponse = response as? HTTPURLResponse {
                    #if DEBUG
                    print("🖼️ [CachedAsyncImage] HTTP \(httpResponse.statusCode) for: \(url.lastPathComponent)")
                    #endif
                    if !(200...299).contains(httpResponse.statusCode) {
                        #if DEBUG
                        print("🖼️ [CachedAsyncImage] ❌ HTTP error \(httpResponse.statusCode)")
                        #endif
                        await MainActor.run { self.isLoading = false }
                        return
                    }
                }

                if let downloadedImage = UIImage(data: data) {
                    #if DEBUG
                    print("🖼️ [CachedAsyncImage] ✅ Downloaded \(data.count) bytes: \(url.lastPathComponent)")
                    #endif
                    // Cache the image with appropriate type
                    await ImageCacheManager.shared.cacheImage(downloadedImage, for: urlString, type: cacheType)

                    await MainActor.run {
                        withAnimation(.easeIn(duration: 0.2)) {
                            self.image = downloadedImage
                        }
                    }
                } else {
                    #if DEBUG
                    print("🖼️ [CachedAsyncImage] ❌ Failed to decode image data (\(data.count) bytes)")
                    #endif
                }
            } catch {
                #if DEBUG
                print("🖼️ [CachedAsyncImage] ❌ Download failed: \(error.localizedDescription)")
                #endif
            }

            await MainActor.run {
                self.isLoading = false
            }
        }
    }
}

// MARK: - Convenience Initializers

extension CachedAsyncImage where Content == Image, Placeholder == ProgressView<EmptyView, EmptyView> {
    /// Simple initializer with default placeholder
    init(url: URL?, cacheType: ImageCacheType = .image) {
        self.init(
            url: url,
            cacheType: cacheType,
            content: { $0.resizable() },
            placeholder: { ProgressView() }
        )
    }

    /// Simple initializer with string URL
    init(urlString: String?, cacheType: ImageCacheType = .image) {
        self.init(
            url: urlString.flatMap { URL(string: $0) },
            cacheType: cacheType,
            content: { $0.resizable() },
            placeholder: { ProgressView() }
        )
    }
}

extension CachedAsyncImage where Placeholder == EmptyView {
    /// Initializer without placeholder
    init(
        url: URL?,
        cacheType: ImageCacheType = .image,
        @ViewBuilder content: @escaping (Image) -> Content
    ) {
        self.init(
            url: url,
            cacheType: cacheType,
            content: content,
            placeholder: { EmptyView() }
        )
    }
}

// MARK: - CachedAvatarImage

/// Specialized cached image view for avatars with fallback initials
/// Uses shorter TTL since avatars change more frequently
struct CachedAvatarImage: View {
    let url: URL?
    let initials: String
    let size: CGFloat
    let backgroundColor: Color

    init(
        urlString: String?,
        initials: String,
        size: CGFloat = 40,
        backgroundColor: Color = .blue.opacity(0.2)
    ) {
        // Use EnvironmentConfig to resolve relative URLs
        if let urlString = urlString,
           let resolved = EnvironmentConfig.buildURL(urlString) {
            self.url = URL(string: resolved)
        } else {
            self.url = nil
        }
        self.initials = String(initials.prefix(2)).uppercased()
        self.size = size
        self.backgroundColor = backgroundColor
    }

    var body: some View {
        CachedAsyncImage(url: url, cacheType: .avatar) { image in
            image
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: size, height: size)
                .clipShape(Circle())
        } placeholder: {
            Circle()
                .fill(backgroundColor)
                .frame(width: size, height: size)
                .overlay(
                    Text(initials)
                        .font(.system(size: size * 0.4, weight: .semibold))
                        .foregroundColor(.primary)
                )
        }
    }
}

// MARK: - CachedThumbnailImage

/// Specialized cached image view for thumbnails
struct CachedThumbnailImage: View {
    let url: URL?
    let size: CGSize
    let cornerRadius: CGFloat

    init(
        urlString: String?,
        size: CGSize = CGSize(width: 60, height: 60),
        cornerRadius: CGFloat = 8
    ) {
        // Use EnvironmentConfig to resolve relative URLs (thumbnails use same logic)
        if let urlString = urlString,
           let resolved = EnvironmentConfig.buildThumbnailURL(urlString) {
            self.url = URL(string: resolved)
        } else {
            self.url = nil
        }
        self.size = size
        self.cornerRadius = cornerRadius
    }

    var body: some View {
        CachedAsyncImage(url: url, cacheType: .thumbnail) { image in
            image
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: size.width, height: size.height)
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
        } placeholder: {
            RoundedRectangle(cornerRadius: cornerRadius)
                .fill(Color.gray.opacity(0.2))
                .frame(width: size.width, height: size.height)
                .overlay(
                    ProgressView()
                        .scaleEffect(0.7)
                )
        }
    }
}

// MARK: - CachedAttachmentImage

/// Specialized cached image view for message attachments
struct CachedAttachmentImage: View {
    let url: URL?
    let maxWidth: CGFloat
    let maxHeight: CGFloat
    let cornerRadius: CGFloat

    @State private var imageSize: CGSize?

    init(
        urlString: String?,
        maxWidth: CGFloat = 250,
        maxHeight: CGFloat = 300,
        cornerRadius: CGFloat = 12
    ) {
        // Use EnvironmentConfig to resolve relative URLs
        if let urlString = urlString,
           let resolved = EnvironmentConfig.buildAttachmentURL(urlString) {
            self.url = URL(string: resolved)
        } else {
            self.url = nil
        }
        self.maxWidth = maxWidth
        self.maxHeight = maxHeight
        self.cornerRadius = cornerRadius
    }

    var body: some View {
        CachedAsyncImage(url: url, cacheType: .attachment) { image in
            image
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(maxWidth: maxWidth, maxHeight: maxHeight)
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
        } placeholder: {
            RoundedRectangle(cornerRadius: cornerRadius)
                .fill(Color.gray.opacity(0.2))
                .frame(width: maxWidth * 0.6, height: maxHeight * 0.4)
                .overlay(
                    ProgressView()
                )
        }
    }
}

// MARK: - Preview

#Preview("Cached Images") {
    VStack(spacing: 20) {
        Text("Avatar (7 day TTL)")
            .font(.caption)
        CachedAvatarImage(
            urlString: "https://via.placeholder.com/150",
            initials: "JD",
            size: 60
        )

        Text("Avatar Fallback")
            .font(.caption)
        CachedAvatarImage(
            urlString: nil,
            initials: "AB",
            size: 60
        )

        Text("Thumbnail (30 day TTL)")
            .font(.caption)
        CachedThumbnailImage(
            urlString: "https://via.placeholder.com/100",
            size: CGSize(width: 80, height: 80)
        )

        Text("Attachment (30 day TTL)")
            .font(.caption)
        CachedAttachmentImage(
            urlString: "https://via.placeholder.com/300x200",
            maxWidth: 200,
            maxHeight: 150
        )
    }
    .padding()
}

#Preview("Cache Configuration") {
    VStack(alignment: .leading, spacing: 8) {
        Text("Current Cache Settings")
            .font(.headline)

        let config = ImageCacheConfiguration.shared
        Group {
            Text("Image TTL: \(config.imageCacheTTLDays) days")
            Text("Avatar TTL: \(config.avatarCacheTTLDays) days")
            Text("Memory limit: \(config.imageMemoryCacheSizeMB) MB")
            Text("Disk limit: \(config.imageDiskCacheSizeMB) MB")
        }
        .font(.caption)
        .foregroundColor(.secondary)
    }
    .padding()
}
