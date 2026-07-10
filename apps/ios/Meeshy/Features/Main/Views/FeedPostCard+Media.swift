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
                    .onTapGesture { openFullscreen(mediaList[0]) }
                    .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 1 of \(count)", bundle: .main))
                    .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Tap to view fullscreen", bundle: .main))
                    .accessibilityAddTraits(.isButton)
                galleryImageView(mediaList[1])
                    .contentShape(Rectangle())
                    .onTapGesture { openFullscreen(mediaList[1]) }
                    .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 2 of \(count)", bundle: .main))
                    .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Tap to view fullscreen", bundle: .main))
                    .accessibilityAddTraits(.isButton)
            }
            .frame(height: 180)
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
        } else if count == 3 {
            // One large left, two stacked right
            HStack(spacing: spacing) {
                galleryImageView(mediaList[0])
                    .aspectRatio(0.75, contentMode: .fill)
                    .contentShape(Rectangle())
                    .onTapGesture { openFullscreen(mediaList[0]) }
                    .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 1 of \(count)", bundle: .main))
                    .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Tap to view fullscreen", bundle: .main))
                    .accessibilityAddTraits(.isButton)

                VStack(spacing: spacing) {
                    galleryImageView(mediaList[1])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[1]) }
                        .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 2 of \(count)", bundle: .main))
                        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Tap to view fullscreen", bundle: .main))
                        .accessibilityAddTraits(.isButton)
                    galleryImageView(mediaList[2])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[2]) }
                        .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 3 of \(count)", bundle: .main))
                        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Tap to view fullscreen", bundle: .main))
                        .accessibilityAddTraits(.isButton)
                }
            }
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
        } else if count == 4 {
            // 2x2 grid
            VStack(spacing: spacing) {
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[0])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[0]) }
                        .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 1 of \(count)", bundle: .main))
                        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Tap to view fullscreen", bundle: .main))
                        .accessibilityAddTraits(.isButton)
                    galleryImageView(mediaList[1])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[1]) }
                        .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 2 of \(count)", bundle: .main))
                        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Tap to view fullscreen", bundle: .main))
                        .accessibilityAddTraits(.isButton)
                }
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[2])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[2]) }
                        .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 3 of \(count)", bundle: .main))
                        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Tap to view fullscreen", bundle: .main))
                        .accessibilityAddTraits(.isButton)
                    galleryImageView(mediaList[3])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[3]) }
                        .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 4 of \(count)", bundle: .main))
                        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Tap to view fullscreen", bundle: .main))
                        .accessibilityAddTraits(.isButton)
                }
            }
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
        } else if count >= 5 {
            // First row: 2 images, Second row: 3 images with +N overlay
            VStack(spacing: spacing) {
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[0])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[0]) }
                        .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 1 of \(count)", bundle: .main))
                        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Tap to view fullscreen", bundle: .main))
                        .accessibilityAddTraits(.isButton)
                    galleryImageView(mediaList[1])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[1]) }
                        .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 2 of \(count)", bundle: .main))
                        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Tap to view fullscreen", bundle: .main))
                        .accessibilityAddTraits(.isButton)
                }
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[2])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[2]) }
                        .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 3 of \(count)", bundle: .main))
                        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Tap to view fullscreen", bundle: .main))
                        .accessibilityAddTraits(.isButton)
                    galleryImageView(mediaList[3])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[3]) }
                        .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 4 of \(count)", bundle: .main))
                        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Tap to view fullscreen", bundle: .main))
                        .accessibilityAddTraits(.isButton)
                    ZStack {
                        galleryImageView(mediaList[4])
                        if count > 5 {
                            Color.black.opacity(0.6)
                            Text("+\(count - 5)")
                                .font(MeeshyFont.relative(22, weight: .bold))
                                .foregroundColor(.white)
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { openFullscreen(mediaList[4]) }
                    .accessibilityLabel(count > 5
                        ? String(localized: "feed.media.moreItems", defaultValue: "\(count - 5) more media items", bundle: .main)
                        : String(localized: "feed.media.item", defaultValue: "Media 5 of \(count)", bundle: .main))
                    .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Tap to view fullscreen", bundle: .main))
                    .accessibilityAddTraits(.isButton)
                }
            }
            .frame(height: 240)
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
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
                    Color(hex: media.thumbnailColor)
                        .shimmer()
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
                            .font(MeeshyFont.relative(12, weight: .bold))
                            .foregroundColor(.black.opacity(0.7))
                            .offset(x: 1)
                    }
                    if let duration = media.durationFormatted {
                        Text(duration)
                            .font(MeeshyFont.relative(10, weight: .semibold, design: .monospaced))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color.black.opacity(0.6)))
                    }
                }
            } else if media.type == .audio {
                VStack(spacing: 4) {
                    Image(systemName: "waveform")
                        .font(MeeshyFont.relative(20))
                        .foregroundColor(.white)
                    if let duration = media.durationFormatted {
                        Text(duration)
                            .font(MeeshyFont.relative(10, weight: .semibold, design: .monospaced))
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
            thumbHash: media.thumbHash,
            thumbnailUrl: media.thumbnailUrl,
            fullUrl: media.url,
            autoLoad: true
        ) {
            Color(hex: media.thumbnailColor)
                .shimmer()
        }
        .aspectRatio(aspectRatio, contentMode: .fill)
        .frame(maxWidth: .infinity, minHeight: 160, maxHeight: 280)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .onTapGesture { openFullscreen(media) }
    }

    func videoMediaView(_ media: FeedMedia) -> some View {
        FeedVideoMediaCell(media: media, accentColor: accentColor, onExpand: { openFullscreen(media) })
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
                    .font(MeeshyFont.relative(24))
                    .foregroundColor(Color(hex: media.thumbnailColor))
            }

            // Document info
            VStack(alignment: .leading, spacing: 4) {
                Text(media.fileName ?? "Document")
                    .font(MeeshyFont.relative(14, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                HStack(spacing: 8) {
                    if let size = media.fileSize {
                        Text(size)
                            .font(MeeshyFont.relative(12))
                            .foregroundColor(theme.textMuted)
                    }

                    if let pages = media.pageCount {
                        Text("\u{2022}")
                            .foregroundColor(theme.textMuted)
                        Text("\(pages) pages")
                            .font(MeeshyFont.relative(12))
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
                    .font(MeeshyFont.relative(28))
                    .foregroundColor(Color(hex: media.thumbnailColor))
            }

            // Location info
            VStack(alignment: .leading, spacing: 4) {
                Text(media.locationName ?? "Location")
                    .font(MeeshyFont.relative(14, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(2)

                if let lat = media.latitude, let lon = media.longitude {
                    Text(String(format: "%.4f, %.4f", lat, lon))
                        .font(MeeshyFont.relative(11))
                        .foregroundColor(theme.textMuted)
                }
            }

            Spacer()

            // Open in maps
            Image(systemName: "arrow.up.right.circle.fill")
                .font(MeeshyFont.relative(28))
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

// MARK: - Feed video cell (fills the card width, aspect-ratio driven height)

/// A post-card video that ALWAYS fills the card width with a height derived
/// from the source ratio. The previous `.aspectRatio(_, .fit)` collapsed the
/// width whenever the surrounding layout proposed a bounded height (portrait
/// clips ended up tiny and centred). Here the real card width is measured via a
/// background `GeometryReader` (no layout hijack) and the height is set
/// explicitly to `width / ratio`, so the width is never the free dimension.
private struct FeedVideoMediaCell: View {
    let media: FeedMedia
    let accentColor: String
    let onExpand: () -> Void

    @State private var measuredWidth: CGFloat = 0

    /// Source ratio (width / height), portrait capped at 1.6× width so a single
    /// clip can't swallow the whole feed.
    private var ratio: CGFloat {
        guard let w = media.width, let h = media.height, w > 0, h > 0 else { return 16.0 / 9.0 }
        return max(CGFloat(w) / CGFloat(h), 1.0 / 1.6)
    }

    var body: some View {
        let attachment = media.toMessageAttachment()
        VideoAvailabilityResolver(attachment: attachment, autoDownload: true) { availability, onDownload in
            MeeshyVideoPlayer(
                attachment: attachment,
                style: .inline,
                controls: .inlineDefault,
                accentColor: accentColor,
                frame: .card,
                availability: availability,
                performance: .inline,
                onDownload: onDownload,
                onExpand: onExpand
            )
        }
        .frame(maxWidth: .infinity)
        .frame(height: measuredWidth > 0 ? measuredWidth / ratio : nil)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .background(
            GeometryReader { geo in
                Color.clear.preference(key: FeedVideoWidthKey.self, value: geo.size.width)
            }
        )
        .onPreferenceChange(FeedVideoWidthKey.self) { width in
            if width > 0, abs(width - measuredWidth) > 0.5 { measuredWidth = width }
        }
    }
}

private struct FeedVideoWidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}
