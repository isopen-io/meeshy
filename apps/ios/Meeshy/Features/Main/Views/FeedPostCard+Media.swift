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
                .contentShape(RoundedRectangle(cornerRadius: 12))
        } else if count == 2 {
            // Two images side by side - equal width
            HStack(spacing: spacing) {
                galleryImageView(mediaList[0])
                    .contentShape(Rectangle())
                    .accessibilityLabel(galleryLabel(mediaList[0], index: 0, total: count))
                    .accessibilityAddTraits(.isButton)
                    .onTapGesture { openFullscreen(mediaList[0]) }
                galleryImageView(mediaList[1])
                    .contentShape(Rectangle())
                    .accessibilityLabel(galleryLabel(mediaList[1], index: 1, total: count))
                    .accessibilityAddTraits(.isButton)
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
                    .accessibilityLabel(galleryLabel(mediaList[0], index: 0, total: count))
                    .accessibilityAddTraits(.isButton)
                    .onTapGesture { openFullscreen(mediaList[0]) }

                VStack(spacing: spacing) {
                    galleryImageView(mediaList[1])
                        .contentShape(Rectangle())
                        .accessibilityLabel(galleryLabel(mediaList[1], index: 1, total: count))
                        .accessibilityAddTraits(.isButton)
                        .onTapGesture { openFullscreen(mediaList[1]) }
                    galleryImageView(mediaList[2])
                        .contentShape(Rectangle())
                        .accessibilityLabel(galleryLabel(mediaList[2], index: 2, total: count))
                        .accessibilityAddTraits(.isButton)
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
                        .accessibilityLabel(galleryLabel(mediaList[0], index: 0, total: count))
                        .accessibilityAddTraits(.isButton)
                        .onTapGesture { openFullscreen(mediaList[0]) }
                    galleryImageView(mediaList[1])
                        .contentShape(Rectangle())
                        .accessibilityLabel(galleryLabel(mediaList[1], index: 1, total: count))
                        .accessibilityAddTraits(.isButton)
                        .onTapGesture { openFullscreen(mediaList[1]) }
                }
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[2])
                        .contentShape(Rectangle())
                        .accessibilityLabel(galleryLabel(mediaList[2], index: 2, total: count))
                        .accessibilityAddTraits(.isButton)
                        .onTapGesture { openFullscreen(mediaList[2]) }
                    galleryImageView(mediaList[3])
                        .contentShape(Rectangle())
                        .accessibilityLabel(galleryLabel(mediaList[3], index: 3, total: count))
                        .accessibilityAddTraits(.isButton)
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
                        .accessibilityLabel(galleryLabel(mediaList[0], index: 0, total: count))
                        .accessibilityAddTraits(.isButton)
                        .onTapGesture { openFullscreen(mediaList[0]) }
                    galleryImageView(mediaList[1])
                        .contentShape(Rectangle())
                        .accessibilityLabel(galleryLabel(mediaList[1], index: 1, total: count))
                        .accessibilityAddTraits(.isButton)
                        .onTapGesture { openFullscreen(mediaList[1]) }
                }
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[2])
                        .contentShape(Rectangle())
                        .accessibilityLabel(galleryLabel(mediaList[2], index: 2, total: count))
                        .accessibilityAddTraits(.isButton)
                        .onTapGesture { openFullscreen(mediaList[2]) }
                    galleryImageView(mediaList[3])
                        .contentShape(Rectangle())
                        .accessibilityLabel(galleryLabel(mediaList[3], index: 3, total: count))
                        .accessibilityAddTraits(.isButton)
                        .onTapGesture { openFullscreen(mediaList[3]) }
                    ZStack {
                        galleryImageView(mediaList[4])
                        if count > 5 {
                            Color.black.opacity(0.6)
                            Text("+\(count - 5)")
                                .font(.title2.weight(.bold))
                                .foregroundColor(.white)
                                .accessibilityHidden(true)
                        }
                    }
                    .contentShape(Rectangle())
                    .accessibilityLabel(count > 5
                        ? morePhotosLabel(remaining: count - 5)
                        : galleryLabel(mediaList[4], index: 4, total: count))
                    .accessibilityAddTraits(.isButton)
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
            if !thumbUrl.isEmpty || media.thumbHash != nil {
                ProgressiveCachedImage(
                    thumbHash: media.thumbHash,
                    thumbnailUrl: media.thumbnailUrl,
                    fullUrl: media.url,
                    autoLoad: true
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
                            .font(.caption.weight(.bold))
                            .foregroundColor(.black.opacity(0.7))
                            .offset(x: 1)
                    }
                    if let duration = media.durationFormatted {
                        Text(duration)
                            .font(.caption2.weight(.semibold).monospacedDigit())
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color.black.opacity(0.6)))
                    }
                }
                .accessibilityHidden(true)
            } else if media.type == .audio {
                VStack(spacing: 4) {
                    Image(systemName: "waveform")
                        .font(.title3)
                        .foregroundColor(.white)
                    if let duration = media.durationFormatted {
                        Text(duration)
                            .font(.caption2.weight(.semibold).monospacedDigit())
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color.black.opacity(0.6)))
                    }
                }
                .accessibilityHidden(true)
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

    private func galleryLabel(_ media: FeedMedia, index: Int, total: Int) -> String {
        let type = media.type == .video
            ? String(localized: "feed.media.type.video", defaultValue: "Video", bundle: .main)
            : String(localized: "feed.media.type.photo", defaultValue: "Photo", bundle: .main)
        return "\(type) \(index + 1)/\(total)"
    }

    private func morePhotosLabel(remaining: Int) -> String {
        "\(remaining) " + String(localized: "feed.media.more.photos", defaultValue: "more photos", bundle: .main)
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
            thumbHash: media.thumbHash,
            thumbnailUrl: media.thumbnailUrl,
            fullUrl: media.url,
            autoLoad: true
        ) {
            Color(hex: media.thumbnailColor).shimmer()
        }
        .aspectRatio(aspectRatio, contentMode: .fill)
        .frame(maxWidth: .infinity, minHeight: 160, maxHeight: 280)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityLabel(String(localized: "feed.media.type.photo", defaultValue: "Photo", bundle: .main))
        .accessibilityAddTraits(.isButton)
        .onTapGesture { openFullscreen(media) }
    }

    func videoMediaView(_ media: FeedMedia) -> some View {
        let attachment = media.toMessageAttachment()
        return VideoAvailabilityResolver(attachment: attachment, autoDownload: true) { availability, onDownload in
            MeeshyVideoPlayer(
                attachment: attachment,
                style: .inline,
                controls: .inlineDefault,
                accentColor: accentColor,
                frame: .card,
                availability: availability,
                performance: .inline,
                onDownload: onDownload,
                onExpand: { openFullscreen(media) }
            )
        }
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    func audioMediaView(_ media: FeedMedia) -> some View {
        let attachment = media.toMessageAttachment()
        return AudioAvailabilityResolver(attachment: attachment, autoDownload: true) { availability, onDownload in
            AudioPlayerView(
                attachment: attachment,
                context: .feedPost,
                accentColor: media.thumbnailColor,
                transcription: media.transcription,
                availability: availability,
                onDownload: onDownload
            )
        }
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
                    .font(.title2)
                    .foregroundColor(Color(hex: media.thumbnailColor))
            }
            .accessibilityHidden(true)

            // Document info
            VStack(alignment: .leading, spacing: 4) {
                Text(media.fileName ?? "Document")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                HStack(spacing: 8) {
                    if let size = media.fileSize {
                        Text(size)
                            .font(.caption)
                            .foregroundColor(theme.textMuted)
                    }

                    if let pages = media.pageCount {
                        Text("\u{2022}")
                            .foregroundColor(theme.textMuted)
                        Text("\(pages) pages")
                            .font(.caption)
                            .foregroundColor(theme.textMuted)
                    }
                }
            }

            Spacer()
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
                    .font(.title)
                    .foregroundColor(Color(hex: media.thumbnailColor))
            }
            .accessibilityHidden(true)

            // Location info
            VStack(alignment: .leading, spacing: 4) {
                Text(media.locationName ?? "Location")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(2)

                if let lat = media.latitude, let lon = media.longitude {
                    Text(String(format: "%.4f, %.4f", lat, lon))
                        .font(.caption2)
                        .foregroundColor(theme.textMuted)
                }
            }

            Spacer()

            // Open in maps
            Image(systemName: "arrow.up.right.circle.fill")
                .font(.title)
                .foregroundColor(Color(hex: media.thumbnailColor))
                .accessibilityHidden(true)
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
