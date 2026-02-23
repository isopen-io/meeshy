// MARK: - Extracted from ConversationView.swift (via ThemedMessageBubble.swift)
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Visual Media Grid & Carousel
extension ThemedMessageBubble {

    @ViewBuilder
    var visualMediaGrid: some View {
        let items = visualAttachments

        switch items.count {
        case 1:
            visualGridCell(items[0])
                .frame(width: gridMaxWidth, height: 240)

        case 2:
            HStack(spacing: gridSpacing) {
                visualGridCell(items[0])
                visualGridCell(items[1])
            }
            .frame(width: gridMaxWidth, height: 180)

        case 3:
            let leftW = (gridMaxWidth - gridSpacing) * 0.6
            let rightW = (gridMaxWidth - gridSpacing) * 0.4
            HStack(spacing: gridSpacing) {
                visualGridCell(items[0])
                    .frame(width: leftW)
                VStack(spacing: gridSpacing) {
                    visualGridCell(items[1])
                    visualGridCell(items[2], isFirstRow: false)
                }
                .frame(width: rightW)
            }
            .frame(width: gridMaxWidth, height: 240)

        default:
            let overflow = items.count - 3
            VStack(spacing: gridSpacing) {
                HStack(spacing: gridSpacing) {
                    visualGridCell(items[0])
                    visualGridCell(items[1])
                }
                HStack(spacing: gridSpacing) {
                    visualGridCell(items[2], isFirstRow: false)
                    visualGridCell(items[3], overflowCount: overflow, isFirstRow: false)
                }
            }
            .frame(width: gridMaxWidth, height: 240)
        }
    }

    @ViewBuilder
    func visualGridCell(_ attachment: MessageAttachment, overflowCount: Int = 0, isFirstRow: Bool = true) -> some View {
        ZStack {
            Color.black

            switch attachment.type {
            case .image:
                gridImageCell(attachment)
            case .video:
                gridVideoCell(attachment)
            default:
                EmptyView()
            }

            if overflowCount > 0 {
                Color.black.opacity(0.5)
                Text("+\(overflowCount)")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.white)
            }
        }
        .clipped()
        .contentShape(Rectangle())
        .onTapGesture {
            if overflowCount > 0 {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showCarousel = true
                    carouselIndex = 0
                }
                HapticFeedback.light()
            } else if attachment.type != .video {
                fullscreenAttachment = attachment
                HapticFeedback.light()
            }
        }
        .overlay(alignment: .bottom) {
            downloadBadge(attachment)
                .padding(.bottom, 6)
        }
    }

    // MARK: - Carousel View

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

    @ViewBuilder
    func gridImageCell(_ attachment: MessageAttachment) -> some View {
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

    @ViewBuilder
    func gridVideoCell(_ attachment: MessageAttachment) -> some View {
        InlineVideoPlayerView(
            attachment: attachment,
            accentColor: contactColor,
            onExpandFullscreen: {
                fullscreenAttachment = attachment
            }
        )
    }

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
            // Native paging ScrollView
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

            // Top bar: close + page indicator
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

            // Auto-pause video when swiping away
            if oldIndex != newIndex {
                let oldAttachment = items[oldIndex]
                if oldAttachment.type == .video && videoManager.activeURL == oldAttachment.fileUrl {
                    videoManager.pause()
                }
                HapticFeedback.light()
            }

            // Prefetch adjacent pages
            prefetchAdjacentPages(around: newIndex)
        }
    }

    // MARK: - Top Bar

    private var carouselTopBar: some View {
        HStack(spacing: 0) {
            // Close button
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

            // Page indicator
            if items.count > 1 {
                pageIndicator
            }
        }
        .padding(.horizontal, 10)
        .padding(.top, 10)
    }

    // MARK: - Adaptive Page Indicator

    @ViewBuilder
    private var pageIndicator: some View {
        let accent = Color(hex: contactColor)

        if items.count <= 7 {
            // Dot indicator for small counts
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
            // Counter for many items
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
        .onTapGesture(count: 2) {
            fullscreenAttachment = attachment
            HapticFeedback.medium()
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
