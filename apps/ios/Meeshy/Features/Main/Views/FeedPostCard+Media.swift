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
                galleryImageView(mediaList[1])
            }
            .frame(height: 180)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        } else if count == 3 {
            // One large left, two stacked right
            HStack(spacing: spacing) {
                galleryImageView(mediaList[0])
                    .aspectRatio(0.75, contentMode: .fill)

                VStack(spacing: spacing) {
                    galleryImageView(mediaList[1])
                    galleryImageView(mediaList[2])
                }
            }
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        } else if count == 4 {
            // 2x2 grid
            VStack(spacing: spacing) {
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[0])
                    galleryImageView(mediaList[1])
                }
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[2])
                    galleryImageView(mediaList[3])
                }
            }
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        } else if count >= 5 {
            // First row: 2 images, Second row: 3 images with +N overlay
            VStack(spacing: spacing) {
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[0])
                    galleryImageView(mediaList[1])
                }
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[2])
                    galleryImageView(mediaList[3])
                    ZStack {
                        galleryImageView(mediaList[4])
                        if count > 5 {
                            Color.black.opacity(0.6)
                            Text("+\(count - 5)")
                                .font(.system(size: 22, weight: .bold))
                                .foregroundColor(.white)
                        }
                    }
                }
            }
            .frame(height: 240)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }

    // Gallery-specific image view (no individual rounding)
    func galleryImageView(_ media: FeedMedia) -> some View {
        ZStack {
            LinearGradient(
                colors: [Color(hex: media.thumbnailColor), Color(hex: media.thumbnailColor).opacity(0.6)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            // Type-specific overlay
            switch media.type {
            case .image:
                Image(systemName: "photo.fill")
                    .font(.system(size: 24))
                    .foregroundColor(.white.opacity(0.4))
            case .video:
                VStack(spacing: 6) {
                    ZStack {
                        Circle()
                            .fill(Color.white.opacity(0.3))
                            .frame(width: 44, height: 44)
                        Image(systemName: "play.fill")
                            .font(.system(size: 18))
                            .foregroundColor(.white)
                    }
                    if let duration = media.durationFormatted {
                        Text(duration)
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color.black.opacity(0.5)))
                    }
                }
            default:
                EmptyView()
            }
        }
        .clipped()
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
        ZStack {
            RoundedRectangle(cornerRadius: 12)
                .fill(
                    LinearGradient(
                        colors: [Color(hex: media.thumbnailColor), Color(hex: media.thumbnailColor).opacity(0.6)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            Image(systemName: "photo.fill")
                .font(.system(size: 32))
                .foregroundColor(.white.opacity(0.5))
        }
        .frame(maxWidth: .infinity, minHeight: 160)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    func videoMediaView(_ media: FeedMedia) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12)
                .fill(
                    LinearGradient(
                        colors: [Color(hex: media.thumbnailColor), Color(hex: media.thumbnailColor).opacity(0.6)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            VStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.3))
                        .frame(width: 56, height: 56)

                    Image(systemName: "play.fill")
                        .font(.system(size: 24))
                        .foregroundColor(.white)
                }

                if let duration = media.durationFormatted {
                    Text(duration)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(Color.black.opacity(0.5)))
                }
            }
        }
        .frame(maxWidth: .infinity, minHeight: 180)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    func audioMediaView(_ media: FeedMedia) -> some View {
        let theme = ThemeManager.shared
        return VStack(alignment: .leading, spacing: 0) {
            // Player row: play button + waveform
            HStack(spacing: 14) {
                // Play button
                ZStack {
                    Circle()
                        .fill(Color(hex: media.thumbnailColor))
                        .frame(width: 48, height: 48)

                    Image(systemName: "play.fill")
                        .font(.system(size: 18))
                        .foregroundColor(.white)
                }

                // Waveform placeholder
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 2) {
                        ForEach(0..<25, id: \.self) { i in
                            RoundedRectangle(cornerRadius: 1)
                                .fill(Color(hex: media.thumbnailColor).opacity(0.6))
                                .frame(width: 3, height: CGFloat.random(in: 8...24))
                        }
                    }

                    if let duration = media.durationFormatted {
                        Text(duration)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(theme.textMuted)
                    }
                }

                Spacer()
            }

            // Transcription display if available
            if let transcription = media.transcription, !transcription.text.isEmpty {
                let displaySegments = TranscriptionDisplaySegment.buildFrom(transcription)

                VStack(alignment: .leading, spacing: 4) {
                    if displaySegments.count > 1 {
                        // Multi-speaker with colored speaker indicators
                        ForEach(displaySegments) { seg in
                            HStack(alignment: .top, spacing: 8) {
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Color(hex: seg.speakerColor))
                                    .frame(width: 3)
                                Text(seg.text)
                                    .font(.caption)
                                    .foregroundStyle(.primary.opacity(0.85))
                            }
                        }
                    } else {
                        // Single speaker — plain text
                        Text(transcription.text)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(4)
                    }
                }
                .padding(.top, 8)
            }
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
