//
//  AttachmentPreviewView.swift
//  Meeshy
//
//  Preview selected attachments before sending
//  iOS 16+
//

import SwiftUI

struct AttachmentPreviewView: View {
    // MARK: - Properties

    @Binding var attachments: [Attachment]
    let onRemove: (Attachment) -> Void
    @State private var selectedAttachmentForPreview: Attachment?

    // MARK: - Body

    var body: some View {
        if !attachments.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(attachments) { attachment in
                        AttachmentPreviewCard(
                            attachment: attachment,
                            onRemove: {
                                onRemove(attachment)
                            },
                            onTap: {
                                if attachment.type == .video || attachment.type == .image {
                                    selectedAttachmentForPreview = attachment
                                }
                            }
                        )
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .background(Color(.systemGray6))
            .fullScreenCover(item: $selectedAttachmentForPreview) { attachment in
                MediaPreviewView(
                    attachments: attachments.filter { $0.type == .video || $0.type == .image },
                    initialIndex: attachments.filter { $0.type == .video || $0.type == .image }.firstIndex(where: { $0.id == attachment.id }) ?? 0
                )
            }
        }
    }
}

// MARK: - Attachment Preview Card

struct AttachmentPreviewCard: View {
    let attachment: Attachment
    let onRemove: () -> Void
    var onTap: (() -> Void)? = nil

    // Audio attachments need more width for the player
    private var cardWidth: CGFloat {
        attachment.type == .audio ? 260 : 120
    }

    private var cardHeight: CGFloat {
        attachment.type == .audio ? 90 : 120
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            // Content - Tappable for video/image
            Group {
                switch attachment.type {
                case .image:
                    imagePreview
                        .onTapGesture {
                            onTap?()
                        }
                case .video:
                    videoPreview
                        .onTapGesture {
                            onTap?()
                        }
                case .document, .file:
                    documentPreview
                case .code:
                    codePreview
                case .text:
                    textPreview
                case .audio:
                    audioPreview
                case .location:
                    locationPreview
                }
            }

            // Remove Button
            Button(action: onRemove) {
                ZStack {
                    Circle()
                        .fill(Color.black.opacity(0.6))
                        .frame(width: 28, height: 28)

                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                }
            }
            .padding(8)
        }
        .frame(width: cardWidth, height: cardHeight)
        .background(Color(.systemGray5))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(.systemGray4), lineWidth: 1)
        )
    }

    // MARK: - Image Preview

    private var imagePreview: some View {
        CachedAsyncImage(urlString: attachment.url, cacheType: .thumbnail) { image in
            image
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 120, height: 120)
                .clipped()
        } placeholder: {
            ProgressView()
        }
    }

    // MARK: - Video Preview

    private var videoPreview: some View {
        ZStack {
            if let thumbnailUrl = attachment.thumbnailUrl {
                CachedAsyncImage(urlString: thumbnailUrl, cacheType: .thumbnail) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } placeholder: {
                    Color(.systemGray4)
                }
                .frame(width: 120, height: 120)
                .clipped()
            } else {
                Color(.systemGray4)
            }

            // Play Icon
            ZStack {
                Circle()
                    .fill(Color.black.opacity(0.5))
                    .frame(width: 40, height: 40)

                Image(systemName: "play.fill")
                    .font(.system(size: 18))
                    .foregroundColor(.white)
            }

            // Duration Badge
            if let duration = attachment.duration {
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Text(formatDuration(duration))
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(
                                Capsule()
                                    .fill(Color.black.opacity(0.7))
                            )
                            .padding(6)
                    }
                }
            }
        }
    }

    // MARK: - Document Preview

    private var documentPreview: some View {
        VStack(spacing: 8) {
            Image(systemName: fileIcon(for: attachment.fileName ?? ""))
                .font(.system(size: 40))
                .foregroundColor(.blue)

            Text(attachment.fileName ?? "Document")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 8)

            Text(formatFileSize(attachment.fileSize))
                .font(.system(size: 10))
                .foregroundColor(.secondary)
        }
    }

    // MARK: - Audio Preview (Modern Player)

    private var audioPreview: some View {
        Group {
            // Prefer localURL (for recorded audio), fallback to remote URL
            if let audioURL = attachment.localURL ?? URL(string: attachment.url) {
                // Use modern compact audio player
                AudioPlayerView(url: audioURL, style: .compact)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .padding(.trailing, 28) // Space for remove button
            } else {
                // Fallback for invalid URL
                VStack(spacing: 6) {
                    ZStack {
                        Circle()
                            .fill(Color.meeshyPrimary.opacity(0.2))
                            .frame(width: 40, height: 40)

                        Image(systemName: "waveform")
                            .font(.system(size: 20))
                            .foregroundColor(.meeshyPrimary)
                    }

                    if let duration = attachment.duration {
                        Text(formatDuration(duration))
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.secondary)
                    }
                }
            }
        }
    }

    // MARK: - Code Preview

    private var codePreview: some View {
        VStack(spacing: 6) {
            Image(systemName: "chevron.left.forwardslash.chevron.right")
                .font(.system(size: 32))
                .foregroundColor(.orange)

            Text(attachment.fileName)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 6)

            if let lang = CodeLanguage.from(extension: attachment.fileExtension) {
                Text(lang.displayName)
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Color.orange))
            }
        }
    }

    // MARK: - Text Preview

    private var textPreview: some View {
        VStack(spacing: 6) {
            Image(systemName: "doc.plaintext")
                .font(.system(size: 32))
                .foregroundColor(.secondary)

            Text(attachment.fileName)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 6)

            Text(formatFileSize(attachment.fileSize))
                .font(.system(size: 10))
                .foregroundColor(.secondary)
        }
    }

    // MARK: - Location Preview

    private var locationPreview: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(Color.red.opacity(0.2))
                    .frame(width: 50, height: 50)

                Image(systemName: "location.fill")
                    .font(.system(size: 24))
                    .foregroundColor(.red)
            }

            Text(attachment.locationName ?? "Location")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 8)
        }
    }

    // MARK: - Helper Methods

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let minutes = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", minutes, secs)
    }

    private func formatFileSize(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useKB, .useMB]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }

    private func fileIcon(for filename: String) -> String {
        let ext = (filename as NSString).pathExtension.lowercased()
        switch ext {
        case "pdf":
            return "doc.text.fill"
        case "doc", "docx":
            return "doc.fill"
        case "xls", "xlsx":
            return "tablecells.fill"
        case "ppt", "pptx":
            return "chart.bar.doc.horizontal.fill"
        case "zip", "rar":
            return "doc.zipper"
        default:
            return "doc.fill"
        }
    }
}

// MARK: - Attachment Model Extension

extension Attachment {
    static var previewImage: Attachment {
        Attachment(
            id: "1",
            type: .image,
            url: "https://picsum.photos/200",
            fileName: "photo.jpg",
            fileSize: 1024000,
            mimeType: "image/jpeg",
            createdAt: Date()
        )
    }

    static var previewVideo: Attachment {
        Attachment(
            id: "2",
            type: .video,
            url: "https://example.com/video.mp4",
            fileName: "video.mp4",
            fileSize: 5120000,
            mimeType: "video/mp4",
            thumbnailUrl: "https://picsum.photos/200/150",
            metadata: ["duration": 125],
            createdAt: Date()
        )
    }

    static var previewDocument: Attachment {
        Attachment(
            id: "3",
            type: .file,
            url: "https://example.com/document.pdf",
            fileName: "Presentation.pdf",
            fileSize: 2048000,
            mimeType: "application/pdf",
            createdAt: Date()
        )
    }
}

// MARK: - Preview

#Preview {
    VStack {
        Spacer()

        AttachmentPreviewView(
            attachments: .constant([
                Attachment.previewImage,
                Attachment.previewVideo,
                Attachment.previewDocument
            ]),
            onRemove: { _ in }
        )
    }
}
