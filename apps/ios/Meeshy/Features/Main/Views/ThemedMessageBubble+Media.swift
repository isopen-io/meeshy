// MARK: - Extracted from ConversationView.swift (via ThemedMessageBubble.swift)
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Visual Media Grid
extension ThemedMessageBubble {

    @ViewBuilder
    var visualMediaGrid: some View {
        let items = visualAttachments

        switch items.count {
        case 1:
            gridCell(items[0], solo: true)
                .frame(width: gridMaxWidth, height: items[0].type == .video ? 200 : 240)

        case 2:
            HStack(spacing: gridSpacing) {
                gridCell(items[0])
                gridCell(items[1])
            }
            .frame(width: gridMaxWidth, height: 180)

        case 3:
            let leftW = (gridMaxWidth - gridSpacing) * 0.6
            let rightW = (gridMaxWidth - gridSpacing) * 0.4
            HStack(spacing: gridSpacing) {
                gridCell(items[0])
                    .frame(width: leftW)
                VStack(spacing: gridSpacing) {
                    gridCell(items[1])
                    gridCell(items[2])
                }
                .frame(width: rightW)
            }
            .frame(width: gridMaxWidth, height: 240)

        default:
            let overflow = items.count - 4
            VStack(spacing: gridSpacing) {
                HStack(spacing: gridSpacing) {
                    gridCell(items[0])
                    gridCell(items[1])
                }
                HStack(spacing: gridSpacing) {
                    gridCell(items[2])
                    gridCell(items[3], overflowCount: max(0, overflow))
                }
            }
            .frame(width: gridMaxWidth, height: 240)
        }
    }

    // MARK: - Carousel View (inline within message, for browsing this message's media)

    @ViewBuilder
    var carouselView: some View {
        BubbleCarouselView(
            items: visualAttachments,
            carouselIndex: $carouselIndex,
            showCarousel: $showCarousel,
            fullscreenAttachment: $fullscreenAttachment,
            contactColor: contactColor
        )
    }

    // MARK: - Grid Cell

    @ViewBuilder
    private func gridCell(_ attachment: MessageAttachment, overflowCount: Int = 0, solo: Bool = false) -> some View {
        let attachmentIsProtected = attachment.isViewOnce || attachment.isBlurred
        let isRevealed = revealedAttachmentIds.contains(attachment.id)

        ZStack {
            Color.black

            switch attachment.type {
            case .image:
                gridImageView(attachment)
            case .video:
                gridVideoThumbnail(attachment, solo: solo)
            default:
                EmptyView()
            }

            if overflowCount > 0 {
                Color.black.opacity(0.5)
                Text("+\(overflowCount)")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.white)
            }

            // Per-attachment view-once / blur overlay
            if attachmentIsProtected && !isRevealed {
                AttachmentBlurOverlayView(
                    isViewOnce: attachment.isViewOnce,
                    onReveal: {
                        HapticFeedback.medium()
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            _ = revealedAttachmentIds.insert(attachment.id)
                        }
                        if attachment.isViewOnce {
                            let attachmentId = attachment.id
                            DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                                withAnimation(.easeOut(duration: 0.5)) {
                                    _ = revealedAttachmentIds.remove(attachmentId)
                                }
                            }
                        }
                    }
                )
            }

            // View count badge (top-trailing)
            if attachment.isViewOnce && attachment.viewOnceCount > 0 {
                VStack {
                    HStack {
                        Spacer()
                        Text("\(attachment.viewOnceCount)")
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                            .frame(width: 18, height: 18)
                            .background(
                                Circle()
                                    .fill(Color(hex: "FF6B6B").opacity(0.85))
                            )
                    }
                    .padding(6)
                    Spacer()
                }
                .accessibilityLabel(Text("\(attachment.viewOnceCount) vue\(attachment.viewOnceCount > 1 ? "s" : "")"))
            }
        }
        .clipped()
        .contentShape(Rectangle())
        .onTapGesture {
            guard !attachmentIsProtected || isRevealed else { return }
            if overflowCount > 0 {
                let items = visualAttachments
                carouselIndex = items.firstIndex(where: { $0.id == attachment.id }) ?? 0
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    showCarousel = true
                }
            } else {
                fullscreenAttachment = attachment
            }
            HapticFeedback.light()
        }
        .overlay(alignment: .bottom) {
            if !attachmentIsProtected || isRevealed {
                downloadBadge(attachment)
                    .padding(.bottom, 6)
            }
        }
    }

    // MARK: - Grid Image

    @ViewBuilder
    private func gridImageView(_ attachment: MessageAttachment) -> some View {
        let fullUrl = attachment.fileUrl.isEmpty ? nil : attachment.fileUrl
        let thumbUrl = attachment.thumbnailUrl
        let urlStr = fullUrl ?? thumbUrl ?? ""
        if !urlStr.isEmpty {
            CachedAsyncImage(url: urlStr) {
                if let thumbUrl, fullUrl != nil, thumbUrl != fullUrl {
                    CachedAsyncImage(url: thumbUrl) {
                        Color(hex: attachment.thumbnailColor).shimmer()
                    }
                    .aspectRatio(contentMode: .fill)
                } else {
                    Color(hex: attachment.thumbnailColor).shimmer()
                }
            }
            .aspectRatio(contentMode: .fill)
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
            .clipped()
        } else {
            Color(hex: attachment.thumbnailColor)
                .overlay(Image(systemName: "photo").foregroundColor(.white.opacity(0.5)))
        }
    }

    // MARK: - Grid Video Thumbnail (no inline player -- tap opens gallery)

    @ViewBuilder
    private func gridVideoThumbnail(_ attachment: MessageAttachment, solo: Bool = false) -> some View {
        ZStack {
            let thumbUrl = attachment.thumbnailUrl ?? ""
            if !thumbUrl.isEmpty {
                CachedAsyncImage(url: thumbUrl) {
                    Color(hex: attachment.thumbnailColor).shimmer()
                }
                .aspectRatio(contentMode: .fill)
                .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
                .clipped()
            } else {
                Color(hex: attachment.thumbnailColor)
            }

            // Play icon overlay
            ZStack {
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: solo ? 48 : 36, height: solo ? 48 : 36)
                Circle()
                    .fill(Color(hex: contactColor).opacity(0.85))
                    .frame(width: solo ? 42 : 30, height: solo ? 42 : 30)
                Image(systemName: "play.fill")
                    .font(.system(size: solo ? 18 : 12, weight: .bold))
                    .foregroundColor(.white)
                    .offset(x: solo ? 2 : 1)
            }
            .shadow(color: .black.opacity(0.3), radius: 6, y: 3)

            // Duration badge
            if let formatted = attachment.durationFormatted {
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Text(formatted)
                            .font(.system(size: 10, weight: .semibold, design: .monospaced))
                            .foregroundColor(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color.black.opacity(0.6)))
                    }
                    .padding(.trailing, 4)
                    .padding(.bottom, 4)
                }
            }
        }
    }

    // MARK: - Download Badge

    func downloadBadge(_ attachment: MessageAttachment) -> some View {
        DownloadBadgeView(
            attachment: attachment,
            accentColor: contactColor,
            onShareFile: { url in
                shareURL = url
                showShareSheet = true
            }
        )
    }
}

// MARK: - Attachment Blur Overlay (standalone struct to avoid type-checker ambiguity)

private struct AttachmentBlurOverlayView: View {
    let isViewOnce: Bool
    let onReveal: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.5)
                .background(.ultraThinMaterial)

            VStack(spacing: 5) {
                Image(systemName: "eye.slash.fill")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(.white)

                Text(isViewOnce ? "Voir une fois" : "Contenu masque")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.white)

                Text("Maintenir pour voir")
                    .font(.system(size: 9))
                    .foregroundStyle(.white.opacity(0.7))
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(isViewOnce ? "Media a voir une fois" : "Media masque")
        .accessibilityHint("Maintenir pour reveler le contenu")
        .onLongPressGesture(minimumDuration: 0.3) {
            onReveal()
        }
    }
}

// MARK: - Bubble Carousel View (Native Paging + Elegant Transitions)

struct BubbleCarouselView: View {
    let items: [MessageAttachment]
    @Binding var carouselIndex: Int
    @Binding var showCarousel: Bool
    @Binding var fullscreenAttachment: MessageAttachment?
    let contactColor: String

    @State private var currentPageID: String?
    @ObservedObject private var videoManager = SharedAVPlayerManager.shared

    private let carouselHeight: CGFloat = 300

    var body: some View {
        ZStack(alignment: .top) {
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 0) {
                    ForEach(items) { attachment in
                        carouselPage(attachment)
                            .containerRelativeFrame(.horizontal)
                            .scrollTransition(.animated(
                                .spring(response: 0.4, dampingFraction: 0.86)
                            )) { content, phase in
                                content
                                    .scaleEffect(
                                        x: phase.isIdentity ? 1 : 0.94,
                                        y: phase.isIdentity ? 1 : 0.94
                                    )
                                    .opacity(phase.isIdentity ? 1 : 0.6)
                                    .blur(radius: phase.isIdentity ? 0 : 1.5)
                            }
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $currentPageID)
            .frame(height: carouselHeight)
            .scrollClipDisabled(false)

            carouselTopBar
        }
        .onAppear {
            let startIndex = max(0, min(carouselIndex, items.count - 1))
            currentPageID = items[startIndex].id
        }
        .onChange(of: currentPageID) { _, newID in
            guard let newID,
                  let newIndex = items.firstIndex(where: { $0.id == newID })
            else { return }

            let oldIndex = carouselIndex
            carouselIndex = newIndex

            if oldIndex != newIndex {
                let oldAttachment = items[oldIndex]
                if oldAttachment.type == .video && videoManager.activeURL == oldAttachment.fileUrl {
                    videoManager.pause()
                }
                HapticFeedback.light()
            }

            prefetchAdjacentPages(around: newIndex)
        }
    }

    // MARK: - Top Bar

    private var carouselTopBar: some View {
        HStack(spacing: 0) {
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showCarousel = false
                }
                HapticFeedback.light()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 26, height: 26)
                    .background(Circle().fill(.ultraThinMaterial.opacity(0.8)))
                    .overlay(Circle().stroke(Color.white.opacity(0.15), lineWidth: 0.5))
            }

            Spacer()

            if items.count > 1 {
                pageIndicator
            }
        }
        .padding(.horizontal, 10)
        .padding(.top, 10)
    }

    // MARK: - Page Indicator

    @ViewBuilder
    private var pageIndicator: some View {
        let accent = Color(hex: contactColor)

        if items.count <= 7 {
            HStack(spacing: 5) {
                ForEach(0..<items.count, id: \.self) { i in
                    Circle()
                        .fill(i == carouselIndex ? accent : Color.white.opacity(0.45))
                        .frame(
                            width: i == carouselIndex ? 7 : 5,
                            height: i == carouselIndex ? 7 : 5
                        )
                        .shadow(
                            color: i == carouselIndex ? accent.opacity(0.6) : .clear,
                            radius: 4
                        )
                        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: carouselIndex)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                Capsule()
                    .fill(.ultraThinMaterial.opacity(0.7))
                    .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 0.5))
            )
        } else {
            Text("\(carouselIndex + 1) / \(items.count)")
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundColor(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    Capsule()
                        .fill(.ultraThinMaterial.opacity(0.7))
                        .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 0.5))
                )
                .contentTransition(.numericText())
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: carouselIndex)
        }
    }

    // MARK: - Carousel Page

    @ViewBuilder
    private func carouselPage(_ attachment: MessageAttachment) -> some View {
        ZStack {
            Color.black

            switch attachment.type {
            case .image:
                carouselImageCell(attachment)
            case .video:
                carouselVideoCell(attachment)
            default:
                EmptyView()
            }
        }
        .frame(height: carouselHeight)
        .clipped()
        .contentShape(Rectangle())
        .onTapGesture {
            fullscreenAttachment = attachment
            HapticFeedback.light()
        }
        .overlay(alignment: .bottom) {
            DownloadBadgeView(
                attachment: attachment,
                accentColor: contactColor,
                onShareFile: { _ in }
            )
            .padding(.bottom, 8)
        }
    }

    // MARK: - Image Cell

    @ViewBuilder
    private func carouselImageCell(_ attachment: MessageAttachment) -> some View {
        let urlStr = attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl
        if !urlStr.isEmpty {
            CachedAsyncImage(url: urlStr) {
                if let thumb = attachment.thumbnailUrl, !thumb.isEmpty, thumb != urlStr {
                    CachedAsyncImage(url: thumb) {
                        Color(hex: attachment.thumbnailColor).shimmer()
                    }
                    .aspectRatio(contentMode: .fill)
                } else {
                    Color(hex: attachment.thumbnailColor).shimmer()
                }
            }
            .aspectRatio(contentMode: .fit)
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
        } else {
            Color(hex: attachment.thumbnailColor)
                .overlay(
                    Image(systemName: "photo")
                        .font(.system(size: 28))
                        .foregroundColor(.white.opacity(0.4))
                )
        }
    }

    // MARK: - Video Cell

    @ViewBuilder
    private func carouselVideoCell(_ attachment: MessageAttachment) -> some View {
        InlineVideoPlayerView(
            attachment: attachment,
            accentColor: contactColor,
            onExpandFullscreen: {
                fullscreenAttachment = attachment
            }
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Prefetch

    private func prefetchAdjacentPages(around index: Int) {
        let prefetchRange = max(0, index - 1)...min(items.count - 1, index + 1)
        for i in prefetchRange {
            let attachment = items[i]
            let urlStr = attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl
            guard !urlStr.isEmpty else { continue }
            Task {
                _ = try? await MediaCacheManager.shared.image(
                    for: MeeshyConfig.resolveMediaURL(urlStr)?.absoluteString ?? urlStr
                )
            }
        }
    }
}
