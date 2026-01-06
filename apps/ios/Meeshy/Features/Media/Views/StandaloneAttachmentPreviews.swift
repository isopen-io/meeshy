//
//  StandaloneAttachmentPreviews.swift
//  Meeshy
//
//  Standalone preview components for attachments outside of message bubbles
//  Supports: Image, Video, Audio, PDF, Text, Code (TXT, MD, PY, C, etc.)
//
//  iOS 16+
//

import SwiftUI
import AVKit
import PDFKit

// MARK: - Unified Attachment Preview

/// A unified preview component that automatically selects the appropriate preview based on attachment type
struct StandaloneAttachmentPreview: View {
    let attachment: Attachment
    var style: PreviewStyle = .card
    var onTap: (() -> Void)?
    var onRemove: (() -> Void)?

    enum PreviewStyle {
        case card       // Card style with rounded corners and shadow
        case compact    // Minimal compact style
        case large      // Larger preview with more details
    }

    var body: some View {
        Group {
            switch attachment.resolvedType {
            case .image:
                ImagePreviewCard(attachment: attachment, style: style, onTap: onTap, onRemove: onRemove)
            case .video:
                VideoPreviewCard(attachment: attachment, style: style, onTap: onTap, onRemove: onRemove)
            case .audio:
                AudioPreviewCard(attachment: attachment, style: style, onTap: onTap, onRemove: onRemove)
            case .document:
                DocumentPreviewCard(attachment: attachment, style: style, onTap: onTap, onRemove: onRemove)
            case .code:
                CodePreviewCard(attachment: attachment, style: style, onTap: onTap, onRemove: onRemove)
            case .text:
                TextPreviewCard(attachment: attachment, style: style, onTap: onTap, onRemove: onRemove)
            case .file:
                FilePreviewCard(attachment: attachment, style: style, onTap: onTap, onRemove: onRemove)
            case .location:
                LocationPreviewCard(attachment: attachment, style: style, onTap: onTap, onRemove: onRemove)
            }
        }
    }
}

// MARK: - Image Preview Card

struct ImagePreviewCard: View {
    let attachment: Attachment
    var style: StandaloneAttachmentPreview.PreviewStyle = .card
    var onTap: (() -> Void)?
    var onRemove: (() -> Void)?

    @State private var showFullScreen = false

    private var cardSize: CGSize {
        switch style {
        case .compact: return CGSize(width: 100, height: 100)
        case .card: return CGSize(width: 200, height: 150)
        case .large: return CGSize(width: 300, height: 220)
        }
    }

    var body: some View {
        Button(action: { onTap?() ?? (showFullScreen = true) }) {
            ZStack(alignment: .topTrailing) {
                CachedAsyncImage(urlString: attachment.url, cacheType: .thumbnail) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } placeholder: {
                    Rectangle()
                        .fill(Color(.systemGray5))
                        .overlay(
                            ProgressView()
                                .tint(.secondary)
                        )
                }
                .frame(width: cardSize.width, height: cardSize.height)
                .clipped()
                .cornerRadius(style == .compact ? 8 : 12)

                // Remove button
                if let onRemove = onRemove {
                    removeButton(action: onRemove)
                }

                // File info overlay (for large style)
                if style == .large {
                    fileInfoOverlay
                }
            }
        }
        .buttonStyle(.plain)
        .shadow(color: .black.opacity(0.1), radius: style == .compact ? 2 : 4, y: 2)
        .fullScreenCover(isPresented: $showFullScreen) {
            ImageFullScreenView(imageUrl: attachment.url)
        }
    }

    private var fileInfoOverlay: some View {
        VStack {
            Spacer()
            HStack {
                Text(attachment.fileSizeFormatted)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(Color.black.opacity(0.6)))
                Spacer()
            }
            .padding(8)
        }
    }
}

// MARK: - Video Preview Card

struct VideoPreviewCard: View {
    let attachment: Attachment
    var style: StandaloneAttachmentPreview.PreviewStyle = .card
    var onTap: (() -> Void)?
    var onRemove: (() -> Void)?

    @State private var showFullScreen = false
    @State private var localURL: URL?
    @State private var generatedThumbnail: UIImage?
    @State private var isLoadingThumbnail = false

    /// Resolve video URL using EnvironmentConfig (handles relative paths)
    private var resolvedVideoURL: URL? {
        // Priority 1: Use cached local file
        if let local = localURL {
            return local
        }
        // Priority 2: Resolve relative URL using EnvironmentConfig
        if let resolved = EnvironmentConfig.buildURL(attachment.url),
           let url = URL(string: resolved) {
            return url
        }
        // Fallback: Only accept complete URLs with scheme
        if attachment.url.hasPrefix("http://") || attachment.url.hasPrefix("https://") || attachment.url.hasPrefix("file://") {
            return URL(string: attachment.url)
        }
        return nil
    }

    private var cardSize: CGSize {
        switch style {
        case .compact: return CGSize(width: 120, height: 90)
        case .card: return CGSize(width: 220, height: 140)
        case .large: return CGSize(width: 300, height: 180)
        }
    }

    var body: some View {
        Button(action: { onTap?() ?? (showFullScreen = true) }) {
            ZStack(alignment: .topTrailing) {
                ZStack {
                    // Black background (always shown as base)
                    Color.black

                    // Thumbnail - priority: server URL > generated > black
                    thumbnailContent

                    // Play button overlay
                    Circle()
                        .fill(Color.black.opacity(0.5))
                        .frame(width: style == .compact ? 36 : 50, height: style == .compact ? 36 : 50)
                        .overlay(
                            Image(systemName: "play.fill")
                                .font(.system(size: style == .compact ? 14 : 20))
                                .foregroundColor(.white)
                        )

                    // Duration badge
                    if let duration = attachment.duration {
                        VStack {
                            Spacer()
                            HStack {
                                Spacer()
                                Text(formatDuration(duration))
                                    .font(.system(size: style == .compact ? 10 : 12, weight: .semibold))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 3)
                                    .background(Capsule().fill(Color.black.opacity(0.7)))
                                    .padding(6)
                            }
                        }
                    }
                }
                .frame(width: cardSize.width, height: cardSize.height)
                .clipped()
                .cornerRadius(style == .compact ? 8 : 12)

                // Remove button
                if let onRemove = onRemove {
                    removeButton(action: onRemove)
                }
            }
        }
        .buttonStyle(.plain)
        .shadow(color: .black.opacity(0.1), radius: style == .compact ? 2 : 4, y: 2)
        .fullScreenCover(isPresented: $showFullScreen) {
            if let url = resolvedVideoURL {
                VideoPlayerView(url: url)
            }
        }
        .onAppear {
            cacheVideo()
            loadThumbnailIfNeeded()
        }
    }

    // MARK: - Thumbnail Content

    @ViewBuilder
    private var thumbnailContent: some View {
        // Priority 1: Server-provided thumbnail URL
        if let thumbnailUrl = attachment.thumbnailUrl, !thumbnailUrl.isEmpty {
            CachedAsyncImage(urlString: thumbnailUrl, cacheType: .thumbnail) { image in
                image
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } placeholder: {
                // While loading, show generated thumbnail or black
                if let generated = generatedThumbnail {
                    Image(uiImage: generated)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } else {
                    Color.black
                }
            }
        }
        // Priority 2: Generated thumbnail from first frame
        else if let generated = generatedThumbnail {
            Image(uiImage: generated)
                .resizable()
                .aspectRatio(contentMode: .fill)
        }
        // Priority 3: Loading indicator
        else if isLoadingThumbnail {
            ProgressView()
                .tint(.white)
                .scaleEffect(0.7)
        }
        // Priority 4: Black background with video icon
        else {
            Image(systemName: "video.fill")
                .font(.system(size: style == .compact ? 16 : 24))
                .foregroundColor(.white.opacity(0.5))
        }
    }

    // MARK: - Video Caching

    private func cacheVideo() {
        Task {
            if let cached = await AttachmentFileCache.shared.getFile(for: attachment.url, type: .video) {
                await MainActor.run { localURL = cached }
            }
        }
    }

    // MARK: - Thumbnail Generation

    private func loadThumbnailIfNeeded() {
        // Skip if we already have a server thumbnail URL
        if let thumbnailUrl = attachment.thumbnailUrl, !thumbnailUrl.isEmpty {
            return
        }

        // Skip if already loading or loaded
        guard !isLoadingThumbnail, generatedThumbnail == nil else { return }

        isLoadingThumbnail = true

        Task {
            // Use video URL to create cache key
            let videoURL = localURL ?? URL(string: attachment.url)
            guard let url = videoURL else {
                await MainActor.run { isLoadingThumbnail = false }
                return
            }

            let cacheKey = "video_thumb_\(url.absoluteString.hashValue)"

            // Check cache first
            if let cached = await ImageCacheManager.shared.getImage(for: cacheKey) {
                await MainActor.run {
                    self.generatedThumbnail = cached
                    self.isLoadingThumbnail = false
                }
                return
            }

            // Generate thumbnail from first frame
            do {
                if let thumbnail = try await VideoCompressor.generateThumbnail(url, at: .zero) {
                    // Cache the generated thumbnail
                    await ImageCacheManager.shared.cacheImage(thumbnail, for: cacheKey)

                    await MainActor.run {
                        self.generatedThumbnail = thumbnail
                        self.isLoadingThumbnail = false
                    }
                } else {
                    await MainActor.run {
                        self.isLoadingThumbnail = false
                    }
                }
            } catch {
                print("[VideoPreviewCard] Failed to generate thumbnail: \(error)")
                await MainActor.run {
                    self.isLoadingThumbnail = false
                }
            }
        }
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

// MARK: - Audio Preview Card

struct AudioPreviewCard: View {
    let attachment: Attachment
    var style: StandaloneAttachmentPreview.PreviewStyle = .card
    var onTap: (() -> Void)?
    var onRemove: (() -> Void)?

    @State private var localURL: URL?
    @State private var showFullScreen = false

    private var cardWidth: CGFloat {
        switch style {
        case .compact: return 180
        case .card: return 260
        case .large: return 320
        }
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            VStack(spacing: 0) {
                if let url = localURL ?? URL(string: attachment.url) {
                    AudioPlayerView(
                        url: url,
                        style: style == .compact ? .compact : .standard,
                        onOpenFullscreen: {
                            showFullScreen = true
                        }
                    )
                } else {
                    // Placeholder
                    HStack(spacing: 12) {
                        ZStack {
                            Circle()
                                .fill(Color.meeshyPrimary.opacity(0.2))
                                .frame(width: 44, height: 44)
                            Image(systemName: "waveform")
                                .font(.system(size: 20))
                                .foregroundColor(.meeshyPrimary)
                        }

                        VStack(alignment: .leading, spacing: 4) {
                            Text(attachment.fileName)
                                .font(.system(size: 14, weight: .medium))
                                .lineLimit(1)
                            if let duration = attachment.duration {
                                Text(formatDuration(duration))
                                    .font(.system(size: 12))
                                    .foregroundColor(.secondary)
                            }
                        }
                        Spacer()
                    }
                    .padding(12)
                }
            }
            .frame(width: cardWidth)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(.systemGray6))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color(.systemGray4), lineWidth: 0.5)
            )

            // Remove button
            if let onRemove = onRemove {
                removeButton(action: onRemove)
            }
        }
        .shadow(color: .black.opacity(0.05), radius: 4, y: 2)
        .fullScreenCover(isPresented: $showFullScreen) {
            if let url = localURL ?? URL(string: attachment.url) {
                AudioFullScreenView(url: url, attachment: attachment)
            }
        }
        .onAppear {
            cacheAudio()
        }
    }

    private func cacheAudio() {
        Task {
            if let cached = await AttachmentFileCache.shared.getFile(for: attachment.url, type: .audio) {
                await MainActor.run { localURL = cached }
            }
        }
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

// MARK: - Document Preview Card (PDF, DOC, XLS, etc.)

struct DocumentPreviewCard: View {
    let attachment: Attachment
    var style: StandaloneAttachmentPreview.PreviewStyle = .card
    var onTap: (() -> Void)?
    var onRemove: (() -> Void)?

    @State private var thumbnail: UIImage?
    @State private var showFullScreen = false

    var body: some View {
        Button(action: { onTap?() ?? (showFullScreen = true) }) {
            ZStack(alignment: .topTrailing) {
                HStack(spacing: 12) {
                    // Thumbnail or icon
                    documentIcon
                        .frame(width: style == .compact ? 40 : 56, height: style == .compact ? 50 : 72)

                    // Info
                    VStack(alignment: .leading, spacing: 4) {
                        Text(attachment.fileName)
                            .font(.system(size: style == .compact ? 12 : 14, weight: .medium))
                            .foregroundColor(.primary)
                            .lineLimit(2)

                        HStack(spacing: 6) {
                            Text(attachment.fileExtension.uppercased())
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Capsule().fill(extensionColor))

                            Text(attachment.fileSizeFormatted)
                                .font(.system(size: 11))
                                .foregroundColor(.secondary)
                        }
                    }

                    Spacer()

                    if style != .compact {
                        Image(systemName: "arrow.up.left.and.arrow.down.right")
                            .font(.system(size: 14))
                            .foregroundColor(.secondary)
                    }
                }
                .padding(style == .compact ? 8 : 12)
                .background(
                    RoundedRectangle(cornerRadius: style == .compact ? 10 : 14)
                        .fill(Color(.systemGray6))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: style == .compact ? 10 : 14)
                        .stroke(Color(.systemGray4), lineWidth: 0.5)
                )

                if let onRemove = onRemove {
                    removeButton(action: onRemove)
                }
            }
        }
        .buttonStyle(.plain)
        .frame(maxWidth: style == .compact ? 200 : 300)
        .shadow(color: .black.opacity(0.05), radius: 3, y: 1)
        .fullScreenCover(isPresented: $showFullScreen) {
            DocumentFullScreenView(attachment: attachment, localURL: nil)
        }
        .onAppear {
            loadThumbnail()
        }
    }

    @ViewBuilder
    private var documentIcon: some View {
        if let thumbnail = thumbnail {
            Image(uiImage: thumbnail)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .clipShape(RoundedRectangle(cornerRadius: 6))
        } else {
            RoundedRectangle(cornerRadius: 6)
                .fill(extensionColor.opacity(0.15))
                .overlay(
                    Image(systemName: attachment.icon)
                        .font(.system(size: style == .compact ? 18 : 24))
                        .foregroundColor(extensionColor)
                )
        }
    }

    private var extensionColor: Color {
        switch attachment.fileExtension.lowercased() {
        case "pdf": return .red
        case "doc", "docx": return .blue
        case "xls", "xlsx": return .green
        case "ppt", "pptx": return .orange
        default: return .gray
        }
    }

    private func loadThumbnail() {
        guard attachment.isPDF else { return }
        Task {
            if let cachedURL = await AttachmentFileCache.shared.getFile(for: attachment.url, type: .document),
               let doc = PDFDocument(url: cachedURL),
               let page = doc.page(at: 0) {
                let image = page.thumbnail(of: CGSize(width: 112, height: 144), for: .mediaBox)
                await MainActor.run { thumbnail = image }
            }
        }
    }
}

// MARK: - Code Preview Card (Swift, Python, JS, etc.)

struct CodePreviewCard: View {
    let attachment: Attachment
    var style: StandaloneAttachmentPreview.PreviewStyle = .card
    var onTap: (() -> Void)?
    var onRemove: (() -> Void)?

    @State private var previewLines: [String] = []
    @State private var totalLines = 0
    @State private var showFullScreen = false

    private var maxLines: Int {
        switch style {
        case .compact: return 3
        case .card: return 6
        case .large: return 10
        }
    }

    var body: some View {
        Button(action: { onTap?() ?? (showFullScreen = true) }) {
            ZStack(alignment: .topTrailing) {
                VStack(alignment: .leading, spacing: 0) {
                    // Header
                    HStack(spacing: 8) {
                        Image(systemName: "chevron.left.forwardslash.chevron.right")
                            .font(.system(size: 12))
                            .foregroundColor(languageColor)

                        Text(attachment.fileName)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.primary)
                            .lineLimit(1)

                        Spacer()

                        if let lang = CodeLanguage.from(extension: attachment.fileExtension) {
                            Text(lang.displayName)
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Capsule().fill(languageColor))
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(Color(.systemGray5))

                    // Code preview
                    if previewLines.isEmpty {
                        HStack {
                            Spacer()
                            ProgressView().scaleEffect(0.7)
                            Spacer()
                        }
                        .padding(12)
                    } else {
                        VStack(alignment: .leading, spacing: 2) {
                            ForEach(Array(previewLines.prefix(maxLines).enumerated()), id: \.offset) { index, line in
                                HStack(alignment: .top, spacing: 6) {
                                    Text("\(index + 1)")
                                        .font(.system(size: 10, design: .monospaced))
                                        .foregroundColor(.secondary)
                                        .frame(width: 20, alignment: .trailing)
                                    Text(line)
                                        .font(.system(size: 10, design: .monospaced))
                                        .foregroundColor(.primary)
                                        .lineLimit(1)
                                }
                            }

                            if totalLines > maxLines {
                                Text("+ \(totalLines - maxLines) more lines")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(.secondary)
                                    .padding(.top, 4)
                            }
                        }
                        .padding(8)
                    }
                }
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(.systemGray6))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color(.systemGray4), lineWidth: 0.5)
                )

                if let onRemove = onRemove {
                    removeButton(action: onRemove)
                }
            }
        }
        .buttonStyle(.plain)
        .frame(maxWidth: style == .compact ? 200 : 280)
        .shadow(color: .black.opacity(0.05), radius: 3, y: 1)
        .fullScreenCover(isPresented: $showFullScreen) {
            CodeFullScreenView(attachment: attachment, localURL: nil)
        }
        .onAppear {
            loadPreview()
        }
    }

    private var languageColor: Color {
        guard let lang = CodeLanguage.from(extension: attachment.fileExtension) else { return .gray }
        switch lang {
        case .swift: return .orange
        case .python: return .blue
        case .javascript, .typescript: return .yellow
        case .java: return .red
        case .kotlin: return .purple
        case .c, .cpp: return .blue
        default: return .gray
        }
    }

    private func loadPreview() {
        Task {
            var fileURL: URL?
            if let cached = await AttachmentFileCache.shared.getFile(for: attachment.url, type: .other) {
                fileURL = cached
            } else if let cached = await AttachmentFileCache.shared.downloadAndCache(from: attachment.url, type: .other) {
                fileURL = cached
            }

            guard let url = fileURL,
                  let content = try? String(contentsOf: url, encoding: .utf8) else { return }

            let lines = content.components(separatedBy: .newlines)
            await MainActor.run {
                totalLines = lines.count
                previewLines = Array(lines.prefix(maxLines + 5))
            }
        }
    }
}

// MARK: - Text Preview Card (TXT, MD, etc.)

struct TextPreviewCard: View {
    let attachment: Attachment
    var style: StandaloneAttachmentPreview.PreviewStyle = .card
    var onTap: (() -> Void)?
    var onRemove: (() -> Void)?

    @State private var previewText = ""
    @State private var showFullScreen = false

    private var maxChars: Int {
        switch style {
        case .compact: return 100
        case .card: return 200
        case .large: return 400
        }
    }

    var body: some View {
        Button(action: { onTap?() ?? (showFullScreen = true) }) {
            ZStack(alignment: .topTrailing) {
                VStack(alignment: .leading, spacing: 8) {
                    // Header
                    HStack(spacing: 8) {
                        Image(systemName: attachment.fileExtension == "md" ? "doc.richtext" : "doc.plaintext")
                            .font(.system(size: 14))
                            .foregroundColor(.secondary)

                        Text(attachment.fileName)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.primary)
                            .lineLimit(1)

                        Spacer()

                        Text(attachment.fileSizeFormatted)
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                    }

                    // Preview
                    if previewText.isEmpty {
                        HStack {
                            Spacer()
                            ProgressView().scaleEffect(0.7)
                            Spacer()
                        }
                    } else {
                        Text(previewText)
                            .font(.system(size: 12))
                            .foregroundColor(.primary)
                            .lineLimit(style == .compact ? 3 : 5)
                    }
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(.systemGray6))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color(.systemGray4), lineWidth: 0.5)
                )

                if let onRemove = onRemove {
                    removeButton(action: onRemove)
                }
            }
        }
        .buttonStyle(.plain)
        .frame(maxWidth: style == .compact ? 180 : 280)
        .shadow(color: .black.opacity(0.05), radius: 3, y: 1)
        .fullScreenCover(isPresented: $showFullScreen) {
            TextFullScreenView(attachment: attachment, localURL: nil)
        }
        .onAppear {
            loadPreview()
        }
    }

    private func loadPreview() {
        Task {
            var fileURL: URL?
            if let cached = await AttachmentFileCache.shared.getFile(for: attachment.url, type: .other) {
                fileURL = cached
            } else if let cached = await AttachmentFileCache.shared.downloadAndCache(from: attachment.url, type: .other) {
                fileURL = cached
            }

            guard let url = fileURL,
                  let content = try? String(contentsOf: url, encoding: .utf8) else { return }

            await MainActor.run {
                previewText = String(content.prefix(maxChars))
                if content.count > maxChars {
                    previewText += "..."
                }
            }
        }
    }
}

// MARK: - File Preview Card (Generic)

struct FilePreviewCard: View {
    let attachment: Attachment
    var style: StandaloneAttachmentPreview.PreviewStyle = .card
    var onTap: (() -> Void)?
    var onRemove: (() -> Void)?

    var body: some View {
        Button(action: { onTap?() }) {
            ZStack(alignment: .topTrailing) {
                HStack(spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color(.systemGray4).opacity(0.3))
                            .frame(width: 44, height: 44)

                        Image(systemName: attachment.icon)
                            .font(.system(size: 20))
                            .foregroundColor(.secondary)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text(attachment.fileName)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.primary)
                            .lineLimit(2)

                        Text(attachment.fileSizeFormatted)
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                    }

                    Spacer()
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(.systemGray6))
                )

                if let onRemove = onRemove {
                    removeButton(action: onRemove)
                }
            }
        }
        .buttonStyle(.plain)
        .frame(maxWidth: 260)
    }
}

// MARK: - Location Preview Card

struct LocationPreviewCard: View {
    let attachment: Attachment
    var style: StandaloneAttachmentPreview.PreviewStyle = .card
    var onTap: (() -> Void)?
    var onRemove: (() -> Void)?

    var body: some View {
        Button(action: { onTap?() }) {
            ZStack(alignment: .topTrailing) {
                HStack(spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(Color.red.opacity(0.15))
                            .frame(width: 44, height: 44)

                        Image(systemName: "location.fill")
                            .font(.system(size: 20))
                            .foregroundColor(.red)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text(attachment.locationName ?? "Location")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.primary)
                            .lineLimit(2)

                        if let lat = attachment.latitude, let lon = attachment.longitude {
                            Text("\(lat, specifier: "%.4f"), \(lon, specifier: "%.4f")")
                                .font(.system(size: 12, design: .monospaced))
                                .foregroundColor(.secondary)
                        }
                    }

                    Spacer()
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(.systemGray6))
                )

                if let onRemove = onRemove {
                    removeButton(action: onRemove)
                }
            }
        }
        .buttonStyle(.plain)
        .frame(maxWidth: 260)
    }
}

// MARK: - Helper: Remove Button

private func removeButton(action: @escaping () -> Void) -> some View {
    Button(action: action) {
        ZStack {
            Circle()
                .fill(Color.black.opacity(0.6))
                .frame(width: 24, height: 24)

            Image(systemName: "xmark")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.white)
        }
    }
    .offset(x: 6, y: -6)
}

// MARK: - Previews

#Preview("Image Preview") {
    VStack(spacing: 20) {
        ImagePreviewCard(
            attachment: Attachment(
                id: "1", type: .image, url: "https://picsum.photos/400/300",
                fileName: "photo.jpg", fileSize: 250_000, mimeType: "image/jpeg", createdAt: Date()
            ),
            style: .large
        )

        ImagePreviewCard(
            attachment: Attachment(
                id: "2", type: .image, url: "https://picsum.photos/200",
                fileName: "avatar.png", fileSize: 50_000, mimeType: "image/png", createdAt: Date()
            ),
            style: .compact,
            onRemove: {}
        )
    }
    .padding()
}

#Preview("Video Preview") {
    VideoPreviewCard(
        attachment: Attachment(
            id: "1", type: .video, url: "https://example.com/video.mp4",
            fileName: "vacation.mp4", fileSize: 15_000_000, mimeType: "video/mp4",
            thumbnailUrl: "https://picsum.photos/300/200",
            metadata: ["duration": 125],
            createdAt: Date()
        ),
        style: .card
    )
    .padding()
}

#Preview("All Types") {
    ScrollView {
        VStack(spacing: 16) {
            StandaloneAttachmentPreview(
                attachment: Attachment(id: "1", type: .image, url: "https://picsum.photos/300",
                    fileName: "photo.jpg", fileSize: 100_000, mimeType: "image/jpeg", createdAt: Date()),
                style: .card
            )

            StandaloneAttachmentPreview(
                attachment: Attachment(id: "2", type: .document, url: "https://example.com/doc.pdf",
                    fileName: "Report.pdf", fileSize: 2_000_000, mimeType: "application/pdf", createdAt: Date()),
                style: .card
            )

            StandaloneAttachmentPreview(
                attachment: Attachment(id: "3", type: .code, url: "https://example.com/main.py",
                    fileName: "main.py", fileSize: 5_000, mimeType: "text/x-python", createdAt: Date()),
                style: .card
            )
        }
        .padding()
    }
}
