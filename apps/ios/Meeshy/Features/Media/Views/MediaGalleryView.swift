//
//  MediaGalleryView.swift
//  Meeshy
//
//  Full screen media gallery for images and videos
//  Features:
//  - Swipe left/right to navigate between media
//  - Swipe down to dismiss
//  - Tap to toggle metadata overlay
//  - Pinch to zoom images
//  - Download and share buttons
//
//  iOS 16+
//

import SwiftUI
import AVKit

// MARK: - Media Item

struct MediaItem: Identifiable, Equatable {
    let id: String
    let type: AttachmentMediaType
    let url: String
    let thumbnailUrl: String?
    let fileName: String
    let fileSize: Int64
    let width: CGFloat?
    let height: CGFloat?
    let duration: TimeInterval?
    let createdAt: Date
    let senderName: String?
    let senderId: String?
    let senderAvatar: String?

    // Conversation context (for scroll-to-message on dismiss)
    let messageId: String?
    let caption: String?

    init(attachment: Attachment, senderName: String? = nil, senderId: String? = nil, senderAvatar: String? = nil, messageId: String? = nil, caption: String? = nil) {
        self.id = attachment.id
        self.type = attachment.resolvedType
        self.url = attachment.url
        self.thumbnailUrl = attachment.thumbnailUrl
        self.fileName = attachment.fileName
        self.fileSize = attachment.fileSize
        self.width = attachment.width
        self.height = attachment.height
        self.duration = attachment.duration
        self.createdAt = attachment.createdAt
        self.senderName = senderName
        self.senderId = senderId
        self.senderAvatar = senderAvatar
        self.messageId = messageId
        self.caption = caption
    }

    /// Initialize from MessageAttachment (used in chat context)
    init(
        messageAttachment: MessageAttachment,
        messageId: String,
        caption: String?,
        senderName: String?,
        senderAvatar: String?,
        createdAt: Date
    ) {
        self.id = messageAttachment.id
        self.type = messageAttachment.isImage ? .image : (messageAttachment.isVideo ? .video : .file)
        self.url = messageAttachment.fileUrl
        self.thumbnailUrl = messageAttachment.thumbnailUrl
        self.fileName = messageAttachment.originalName
        self.fileSize = Int64(messageAttachment.fileSize)
        self.width = messageAttachment.width.map { CGFloat($0) }
        self.height = messageAttachment.height.map { CGFloat($0) }
        self.duration = messageAttachment.duration.map { TimeInterval($0) / 1000.0 }
        self.createdAt = createdAt
        self.senderName = senderName
        self.senderId = nil
        self.senderAvatar = senderAvatar
        self.messageId = messageId
        self.caption = caption
    }

    var isImage: Bool { type == .image }
    var isVideo: Bool { type == .video }

    var fileSizeFormatted: String {
        ByteCountFormatter.string(fromByteCount: fileSize, countStyle: .file)
    }

    var dimensionsFormatted: String? {
        guard let w = width, let h = height else { return nil }
        return "\(Int(w)) x \(Int(h))"
    }

    static func == (lhs: MediaItem, rhs: MediaItem) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Media Gallery View

struct MediaGalleryView: View {
    @Environment(\.dismiss) private var dismiss

    let items: [MediaItem]
    let initialIndex: Int

    /// Callback when gallery is dismissed - returns the messageId to scroll to (if available)
    var onDismiss: ((String?) -> Void)?

    @State private var currentIndex: Int
    @State private var showMetadata = true
    @State private var showShareSheet = false
    @State private var dragOffset: CGSize = .zero
    @State private var isDragging = false

    // For image zoom
    @State private var scale: CGFloat = 1.0
    @State private var lastScale: CGFloat = 1.0

    init(items: [MediaItem], initialIndex: Int = 0, onDismiss: ((String?) -> Void)? = nil) {
        self.items = items
        self.initialIndex = initialIndex
        self.onDismiss = onDismiss
        self._currentIndex = State(initialValue: initialIndex)
    }

    var currentItem: MediaItem? {
        guard !items.isEmpty, currentIndex >= 0, currentIndex < items.count else {
            return nil
        }
        return items[currentIndex]
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Background
                Color.black.ignoresSafeArea()

                // Media content with swipe gestures
                TabView(selection: $currentIndex) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        mediaContentView(item: item, geometry: geometry)
                            .tag(index)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .offset(y: dragOffset.height)
                .gesture(dismissDragGesture)

                // Metadata overlay (tap to toggle)
                if showMetadata {
                    metadataOverlay
                }

                // Page indicator
                if items.count > 1 {
                    pageIndicator
                }
            }
            .onTapGesture {
                withAnimation(.easeInOut(duration: 0.2)) {
                    showMetadata.toggle()
                }
            }
            .sheet(isPresented: $showShareSheet) {
                shareSheet
            }
            .statusBarHidden(!showMetadata)
        }
    }

    // MARK: - Media Content View

    @ViewBuilder
    private func mediaContentView(item: MediaItem, geometry: GeometryProxy) -> some View {
        if item.isImage {
            imageView(item: item, geometry: geometry)
        } else if item.isVideo {
            videoView(item: item, geometry: geometry)
        }
    }

    private func imageView(item: MediaItem, geometry: GeometryProxy) -> some View {
        CachedAsyncImage(urlString: item.url, cacheType: .attachment) { image in
            image
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(maxWidth: geometry.size.width, maxHeight: geometry.size.height)
                .scaleEffect(scale)
                .gesture(
                    MagnificationGesture()
                        .onChanged { value in
                            scale = lastScale * value
                        }
                        .onEnded { _ in
                            lastScale = scale
                            // Reset if zoomed out too much
                            if scale < 1.0 {
                                withAnimation {
                                    scale = 1.0
                                    lastScale = 1.0
                                }
                            }
                        }
                )
                .onTapGesture(count: 2) {
                    // Double tap to reset zoom
                    withAnimation {
                        if scale > 1.0 {
                            scale = 1.0
                            lastScale = 1.0
                        } else {
                            scale = 2.0
                            lastScale = 2.0
                        }
                    }
                }
        } placeholder: {
            ProgressView()
                .tint(.white)
                .scaleEffect(1.5)
        }
    }

    private func videoView(item: MediaItem, geometry: GeometryProxy) -> some View {
        VideoPlayerContent(
            urlString: item.url,
            thumbnailUrl: item.thumbnailUrl
        )
        .frame(maxWidth: geometry.size.width, maxHeight: geometry.size.height)
    }

    // MARK: - Metadata Overlay

    private var metadataOverlay: some View {
        VStack {
            // Top bar
            HStack(alignment: .top) {
                // Close button
                Button { dismissGallery() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 32))
                        .foregroundColor(.white)
                        .shadow(color: .black.opacity(0.5), radius: 4)
                }

                Spacer()

                // Action buttons
                HStack(spacing: 16) {
                    // Download button
                    Button { downloadMedia() } label: {
                        Image(systemName: "arrow.down.circle.fill")
                            .font(.system(size: 32))
                            .foregroundColor(.white)
                            .shadow(color: .black.opacity(0.5), radius: 4)
                    }

                    // Share button
                    Button { showShareSheet = true } label: {
                        Image(systemName: "square.and.arrow.up.circle.fill")
                            .font(.system(size: 32))
                            .foregroundColor(.white)
                            .shadow(color: .black.opacity(0.5), radius: 4)
                    }
                }
            }
            .padding()

            Spacer()

            // Bottom info bar
            if let item = currentItem {
                VStack(alignment: .leading, spacing: 8) {
                    // Sender info with avatar
                    HStack(spacing: 10) {
                        // Avatar
                        if let avatarUrl = item.senderAvatar, let url = URL(string: avatarUrl) {
                            CachedAsyncImage(url: url, cacheType: .avatar) { img in
                                img.resizable().aspectRatio(contentMode: .fill)
                            } placeholder: {
                                Circle().fill(Color.gray.opacity(0.3))
                            }
                            .frame(width: 36, height: 36)
                            .clipShape(Circle())
                        } else if let name = item.senderName {
                            Circle()
                                .fill(Color.gray.opacity(0.5))
                                .frame(width: 36, height: 36)
                                .overlay(
                                    Text(String(name.prefix(1)).uppercased())
                                        .font(.system(size: 16, weight: .semibold))
                                        .foregroundColor(.white)
                                )
                        }

                        VStack(alignment: .leading, spacing: 2) {
                            if let senderName = item.senderName {
                                Text(senderName)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(.white)
                            }

                            Text(item.createdAt, style: .date)
                                .font(.system(size: 12))
                                .foregroundColor(.white.opacity(0.7))
                        }

                        Spacer()

                        Text(item.createdAt, style: .time)
                            .font(.system(size: 12))
                            .foregroundColor(.white.opacity(0.7))
                    }

                    // Caption (message content)
                    if let caption = item.caption, !caption.isEmpty {
                        Text(caption)
                            .font(.system(size: 15))
                            .foregroundColor(.white)
                            .lineLimit(3)
                    }

                    // File info
                    HStack {
                        // File size
                        Label(item.fileSizeFormatted, systemImage: "doc")
                            .font(.system(size: 11))
                            .foregroundColor(.white.opacity(0.6))

                        // Dimensions
                        if let dimensions = item.dimensionsFormatted {
                            Label(dimensions, systemImage: "aspectratio")
                                .font(.system(size: 11))
                                .foregroundColor(.white.opacity(0.6))
                        }

                        // Duration for videos
                        if let duration = item.duration {
                            Label(formatDuration(duration), systemImage: "clock")
                                .font(.system(size: 11))
                                .foregroundColor(.white.opacity(0.6))
                        }

                        Spacer()

                        // Counter
                        if items.count > 1 {
                            Text("\(currentIndex + 1) / \(items.count)")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.white.opacity(0.7))
                        }
                    }
                }
                .padding()
                .background(
                    LinearGradient(
                        colors: [.clear, .black.opacity(0.7)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
            }
        }
        .transition(.opacity)
    }

    // MARK: - Page Indicator

    private var pageIndicator: some View {
        VStack {
            Spacer()
            HStack(spacing: 6) {
                ForEach(0..<items.count, id: \.self) { index in
                    Circle()
                        .fill(index == currentIndex ? Color.white : Color.white.opacity(0.4))
                        .frame(width: 6, height: 6)
                }
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 12)
            .background(
                Capsule()
                    .fill(Color.black.opacity(0.4))
            )
            .padding(.bottom, showMetadata ? 100 : 20)
        }
    }

    // MARK: - Dismiss Gesture

    private var dismissDragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                // Only allow vertical drag when not zoomed
                guard scale <= 1.0 else { return }

                // Only trigger dismiss for downward drag
                if value.translation.height > 0 {
                    isDragging = true
                    dragOffset = value.translation
                }
            }
            .onEnded { value in
                guard scale <= 1.0 else { return }

                if value.translation.height > 100 || value.predictedEndTranslation.height > 200 {
                    // Dismiss
                    dismissGallery()
                } else {
                    // Reset
                    withAnimation(.spring(response: 0.3)) {
                        dragOffset = .zero
                        isDragging = false
                    }
                }
            }
    }

    /// Dismiss the gallery and call the onDismiss callback with the current message ID
    private func dismissGallery() {
        // Call callback with current message ID before dismissing
        onDismiss?(currentItem?.messageId)
        dismiss()
    }

    // MARK: - Share Sheet

    @ViewBuilder
    private var shareSheet: some View {
        // Try to get cached file for sharing
        if let item = currentItem {
            ShareSheetLoader(urlString: item.url, isImage: item.isImage)
        } else {
            EmptyView()
        }
    }

    // MARK: - Actions

    private func downloadMedia() {
        guard let item = currentItem else { return }

        Task {
            let cacheType: CacheFileType = item.isImage ? .image : .video

            // Get or download file
            var fileURL: URL?
            if let cached = await AttachmentFileCache.shared.getFile(for: item.url, type: cacheType) {
                fileURL = cached
            } else if let downloaded = await AttachmentFileCache.shared.downloadAndCache(from: item.url, type: cacheType) {
                fileURL = downloaded
            }

            guard let url = fileURL else { return }

            await MainActor.run {
                if item.isImage {
                    // Save image to photos
                    if let image = UIImage(contentsOfFile: url.path) {
                        UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
                        let generator = UINotificationFeedbackGenerator()
                        generator.notificationOccurred(.success)
                    }
                } else {
                    // Save video to photos
                    UISaveVideoAtPathToSavedPhotosAlbum(url.path, nil, nil, nil)
                    let generator = UINotificationFeedbackGenerator()
                    generator.notificationOccurred(.success)
                }
            }
        }
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let minutes = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", minutes, secs)
    }
}

// MARK: - Share Sheet Loader

private struct ShareSheetLoader: View {
    let urlString: String
    let isImage: Bool

    @State private var shareItem: Any?
    @State private var isLoading = true

    var body: some View {
        Group {
            if isLoading {
                VStack {
                    ProgressView()
                    Text("Loading...")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .frame(height: 200)
            } else if let item = shareItem {
                ShareSheet(items: [item])
            } else {
                Text("Failed to load")
                    .foregroundColor(.secondary)
            }
        }
        .onAppear {
            loadShareItem()
        }
    }

    private func loadShareItem() {
        Task {
            let cacheType: CacheFileType = isImage ? .image : .video

            if let cached = await AttachmentFileCache.shared.getFile(for: urlString, type: cacheType) {
                if isImage, let image = UIImage(contentsOfFile: cached.path) {
                    await MainActor.run {
                        shareItem = image
                        isLoading = false
                    }
                } else {
                    await MainActor.run {
                        shareItem = cached
                        isLoading = false
                    }
                }
            } else {
                await MainActor.run {
                    isLoading = false
                }
            }
        }
    }
}

// MARK: - Video Player Content

private struct VideoPlayerContent: View {
    let urlString: String
    let thumbnailUrl: String?

    @State private var player: AVPlayer?
    @State private var isPlaying = false
    @State private var localURL: URL?

    var body: some View {
        ZStack {
            if let player = player {
                VideoPlayer(player: player)
                    .onAppear {
                        player.play()
                        isPlaying = true
                    }
                    .onDisappear {
                        player.pause()
                    }
            } else {
                // Thumbnail or loading
                if let thumbnailUrl = thumbnailUrl {
                    CachedAsyncImage(urlString: thumbnailUrl, cacheType: .thumbnail) { image in
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                    } placeholder: {
                        Color.black
                    }
                    .overlay(
                        ProgressView()
                            .tint(.white)
                            .scaleEffect(1.5)
                    )
                } else {
                    Color.black
                        .overlay(
                            ProgressView()
                                .tint(.white)
                                .scaleEffect(1.5)
                        )
                }
            }
        }
        .onAppear {
            loadVideo()
        }
    }

    private func loadVideo() {
        Task {
            // Try cached first
            if let cached = await AttachmentFileCache.shared.getFile(for: urlString, type: .video) {
                await MainActor.run {
                    localURL = cached
                    player = AVPlayer(url: cached)
                }
            } else if let resolved = EnvironmentConfig.buildURL(urlString),
                      let url = URL(string: resolved) {
                await MainActor.run {
                    player = AVPlayer(url: url)
                }
            }
        }
    }
}

// MARK: - Image Extension

extension Image {
    /// Convert SwiftUI Image to UIImage
    /// Note: This uses ImageRenderer which requires iOS 16+
    @MainActor
    func asUIImage() -> UIImage? {
        let renderer = ImageRenderer(content: self)
        renderer.scale = UIScreen.main.scale
        return renderer.uiImage
    }
}

// MARK: - Preview

#Preview {
    MediaGalleryView(
        items: [
            MediaItem(
                attachment: Attachment(
                    id: "1",
                    type: .image,
                    url: "https://picsum.photos/800/600",
                    fileName: "photo1.jpg",
                    fileSize: 1_234_567,
                    mimeType: "image/jpeg",
                    metadata: ["width": 800, "height": 600],
                    createdAt: Date()
                ),
                senderName: "John Doe"
            ),
            MediaItem(
                attachment: Attachment(
                    id: "2",
                    type: .image,
                    url: "https://picsum.photos/600/800",
                    fileName: "photo2.jpg",
                    fileSize: 987_654,
                    mimeType: "image/jpeg",
                    metadata: ["width": 600, "height": 800],
                    createdAt: Date().addingTimeInterval(-3600)
                ),
                senderName: "Jane Smith"
            )
        ],
        initialIndex: 0
    )
}
