import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from FeedView.swift

// MARK: - FeedPostCard Media Preview
extension FeedPostCard {
    @ViewBuilder
    var mediaPreview: some View {
        let mediaList = post.media
        let count = mediaList.count
        let spacing: CGFloat = 3

        if count == 1, let media = mediaList.first {
            singleMediaView(media)
                .frame(height: mediaIsCompact(media) ? nil : 220)
        } else if count == 2 {
            // Two images side by side - equal width
            HStack(spacing: spacing) {
                galleryImageView(mediaList[0])
                    .contentShape(Rectangle())
                    .onTapGesture { openFullscreen(mediaList[0]) }
                galleryImageView(mediaList[1])
                    .contentShape(Rectangle())
                    .onTapGesture { openFullscreen(mediaList[1]) }
            }
            .frame(height: 180)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        } else if count == 3 {
            // One large left, two stacked right
            HStack(spacing: spacing) {
                galleryImageView(mediaList[0])
                    .aspectRatio(0.75, contentMode: .fill)
                    .contentShape(Rectangle())
                    .onTapGesture { openFullscreen(mediaList[0]) }

                VStack(spacing: spacing) {
                    galleryImageView(mediaList[1])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[1]) }
                    galleryImageView(mediaList[2])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[2]) }
                }
            }
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        } else if count == 4 {
            // 2x2 grid
            VStack(spacing: spacing) {
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[0])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[0]) }
                    galleryImageView(mediaList[1])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[1]) }
                }
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[2])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[2]) }
                    galleryImageView(mediaList[3])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[3]) }
                }
            }
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        } else if count >= 5 {
            // First row: 2 images, Second row: 3 images with +N overlay
            VStack(spacing: spacing) {
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[0])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[0]) }
                    galleryImageView(mediaList[1])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[1]) }
                }
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[2])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[2]) }
                    galleryImageView(mediaList[3])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[3]) }
                    ZStack {
                        galleryImageView(mediaList[4])
                        if count > 5 {
                            Color.black.opacity(0.6)
                            Text("+\(count - 5)")
                                .font(.system(size: 22, weight: .bold))
                                .foregroundColor(.white)
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { openFullscreen(mediaList[4]) }
                }
            }
            .frame(height: 240)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }

    // Gallery-specific image view (no individual rounding)
    func galleryImageView(_ media: FeedMedia) -> some View {
        ZStack {
            let thumbUrl = media.thumbnailUrl ?? media.url ?? ""
            if !thumbUrl.isEmpty && (media.type == .image || media.type == .video) {
                ProgressiveCachedImage(
                    thumbnailUrl: media.thumbnailUrl,
                    fullUrl: media.url
                ) {
                    Color(hex: media.thumbnailColor).shimmer()
                }
                .aspectRatio(contentMode: .fill)
                .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
                .clipped()
            } else {
                LinearGradient(
                    colors: [Color(hex: media.thumbnailColor), Color(hex: media.thumbnailColor).opacity(0.6)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }

            // Video overlay
            if media.type == .video {
                VStack(spacing: 6) {
                    ZStack {
                        Circle()
                            .fill(.ultraThinMaterial)
                            .frame(width: 36, height: 36)
                        Circle()
                            .fill(Color.white.opacity(0.85))
                            .frame(width: 30, height: 30)
                        Image(systemName: "play.fill")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.black.opacity(0.7))
                            .offset(x: 1)
                    }
                    if let duration = media.durationFormatted {
                        Text(duration)
                            .font(.system(size: 10, weight: .semibold, design: .monospaced))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color.black.opacity(0.6)))
                    }
                }
            } else if media.type == .audio {
                VStack(spacing: 4) {
                    Image(systemName: "waveform")
                        .font(.system(size: 20))
                        .foregroundColor(.white)
                    if let duration = media.durationFormatted {
                        Text(duration)
                            .font(.system(size: 10, weight: .semibold, design: .monospaced))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color.black.opacity(0.6)))
                    }
                }
            }
        }
        .clipped()
    }

    func openFullscreen(_ media: FeedMedia) {
        guard media.type == .image || media.type == .video else { return }
        fullscreenMediaId = media.id
        showFullscreenGallery = true
        HapticFeedback.light()
    }

    // Check if media should be compact (audio, document, location)
    func mediaIsCompact(_ media: FeedMedia) -> Bool {
        switch media.type {
        case .audio, .document, .location:
            return true
        default:
            return false
        }
    }

    @ViewBuilder
    func singleMediaView(_ media: FeedMedia) -> some View {
        switch media.type {
        case .image:
            imageMediaView(media)
        case .video:
            videoMediaView(media)
        case .audio:
            audioMediaView(media)
        case .document:
            documentMediaView(media)
        case .location:
            locationMediaView(media)
        }
    }

    func imageMediaView(_ media: FeedMedia) -> some View {
        let aspectRatio: CGFloat? = {
            guard let w = media.width, let h = media.height, w > 0, h > 0 else { return nil }
            return CGFloat(w) / CGFloat(h)
        }()
        return ProgressiveCachedImage(
            thumbnailUrl: media.thumbnailUrl,
            fullUrl: media.url
        ) {
            Color(hex: media.thumbnailColor).shimmer()
        }
        .aspectRatio(aspectRatio, contentMode: .fill)
        .frame(maxWidth: .infinity, minHeight: 160, maxHeight: 280)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .onTapGesture { openFullscreen(media) }
    }

    func videoMediaView(_ media: FeedMedia) -> some View {
        let attachment = media.toMessageAttachment()
        return InlineVideoPlayerView(
            attachment: attachment,
            accentColor: accentColor
        )
        .frame(maxWidth: .infinity, minHeight: 180, maxHeight: 280)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    func audioMediaView(_ media: FeedMedia) -> some View {
        let attachment = media.toMessageAttachment()
        return AudioPlayerView(
            attachment: attachment,
            context: .feedPost,
            accentColor: media.thumbnailColor,
            transcription: media.transcription
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    func documentMediaView(_ media: FeedMedia) -> some View {
        let theme = ThemeManager.shared
        return HStack(spacing: 14) {
            // Document icon
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(hex: media.thumbnailColor).opacity(0.2))
                    .frame(width: 48, height: 56)

                Image(systemName: "doc.fill")
                    .font(.system(size: 24))
                    .foregroundColor(Color(hex: media.thumbnailColor))
            }

            // Document info
            VStack(alignment: .leading, spacing: 4) {
                Text(media.fileName ?? "Document")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                HStack(spacing: 8) {
                    if let size = media.fileSize {
                        Text(size)
                            .font(.system(size: 12))
                            .foregroundColor(theme.textMuted)
                    }

                    if let pages = media.pageCount {
                        Text("\u{2022}")
                            .foregroundColor(theme.textMuted)
                        Text("\(pages) pages")
                            .font(.system(size: 12))
                            .foregroundColor(theme.textMuted)
                    }
                }
            }

            Spacer()

            // Download button
            Image(systemName: "arrow.down.circle.fill")
                .font(.system(size: 28))
                .foregroundColor(Color(hex: media.thumbnailColor))
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color(hex: media.thumbnailColor).opacity(0.3), lineWidth: 1)
                )
        )
    }

    func locationMediaView(_ media: FeedMedia) -> some View {
        let theme = ThemeManager.shared
        return HStack(spacing: 14) {
            // Map placeholder
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: media.thumbnailColor).opacity(0.3), Color(hex: media.thumbnailColor).opacity(0.1)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 64, height: 64)

                Image(systemName: "mappin.circle.fill")
                    .font(.system(size: 28))
                    .foregroundColor(Color(hex: media.thumbnailColor))
            }

            // Location info
            VStack(alignment: .leading, spacing: 4) {
                Text(media.locationName ?? "Location")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(2)

                if let lat = media.latitude, let lon = media.longitude {
                    Text(String(format: "%.4f, %.4f", lat, lon))
                        .font(.system(size: 11))
                        .foregroundColor(theme.textMuted)
                }
            }

            Spacer()

            // Open in maps
            Image(systemName: "arrow.up.right.circle.fill")
                .font(.system(size: 28))
                .foregroundColor(Color(hex: media.thumbnailColor))
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color(hex: media.thumbnailColor).opacity(0.3), lineWidth: 1)
                )
        )
    }
}
