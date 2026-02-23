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

// MARK: - Bubble Carousel View (circular + elastic effects)
struct BubbleCarouselView: View {
    let items: [MessageAttachment]
    @Binding var carouselIndex: Int
    @Binding var showCarousel: Bool
    @Binding var fullscreenAttachment: MessageAttachment?
    let contactColor: String

    @State private var carouselDragOffset: CGFloat = 0
    // Internal index into the extended array (with buffer items for circular scrolling)
    @State private var internalIndex: Int = 1

    private var carouselWidth: CGFloat {
        UIScreen.main.bounds.width - 32
    }

    private var isCircular: Bool { items.count > 1 }

    // Extended items: [last] + items + [first] for circular scrolling
    private var extendedItems: [MessageAttachment] {
        guard isCircular else { return items }
        return [items[items.count - 1]] + items + [items[0]]
    }

    var body: some View {
        let itemWidth = carouselWidth
        let totalOffset = -CGFloat(internalIndex) * itemWidth + carouselDragOffset

        ZStack(alignment: .top) {
            HStack(spacing: 0) {
                ForEach(Array(extendedItems.enumerated()), id: \.offset) { index, attachment in
                    let distance = abs(CGFloat(index) - CGFloat(internalIndex) - carouselDragOffset / itemWidth)
                    let scale = max(0.92, 1.0 - distance * 0.08)
                    let opacity = max(0.7, 1.0 - distance * 0.3)
                    let rotation = (CGFloat(index) - CGFloat(internalIndex) - carouselDragOffset / itemWidth) * 5

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
                    .frame(width: itemWidth, height: 280)
                    .clipped()
                    .scaleEffect(scale)
                    .opacity(opacity)
                    .rotation3DEffect(.degrees(Double(rotation)), axis: (x: 0, y: 1, z: 0))
                    .contentShape(Rectangle())
                    .onTapGesture {
                        if attachment.type != .video {
                            fullscreenAttachment = attachment
                            HapticFeedback.light()
                        }
                    }
                }
            }
            .offset(x: totalOffset)
            .animation(.spring(response: 0.45, dampingFraction: 0.75), value: internalIndex)
            .animation(.interactiveSpring(), value: carouselDragOffset)
            .highPriorityGesture(
                DragGesture(minimumDistance: 15)
                    .onChanged { value in
                        if abs(value.translation.width) > abs(value.translation.height) {
                            carouselDragOffset = value.translation.width
                        }
                    }
                    .onEnded { value in
                        let threshold: CGFloat = itemWidth * 0.25
                        let velocity = value.predictedEndTranslation.width - value.translation.width
                        if value.translation.width < -threshold || velocity < -100 {
                            internalIndex += 1
                        } else if value.translation.width > threshold || velocity > 100 {
                            internalIndex -= 1
                        }
                        carouselDragOffset = 0
                        HapticFeedback.medium()
                        syncExternalIndex()
                        handleCircularReset()
                    }
            )
            .frame(width: itemWidth, height: 280)
            .clipped()

            // Top bar: close + dot indicators
            HStack {
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showCarousel = false }
                    HapticFeedback.light()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 24, height: 24)
                        .background(Circle().fill(Color.black.opacity(0.6)))
                }
                .padding(8)
                Spacer()
                dotIndicators
                    .padding(8)
            }
        }
        .onAppear {
            internalIndex = isCircular ? carouselIndex + 1 : carouselIndex
        }
        .task {
            for attachment in items {
                Task {
                    _ = try? await MediaCacheManager.shared.image(
                        for: MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString ?? attachment.fileUrl
                    )
                }
            }
        }
    }

    // MARK: - Dot Indicators

    private var dotIndicators: some View {
        HStack(spacing: 5) {
            ForEach(0..<items.count, id: \.self) { i in
                Circle()
                    .fill(i == carouselIndex ? Color(hex: contactColor) : Color.white.opacity(0.4))
                    .frame(width: 6, height: 6)
                    .scaleEffect(i == carouselIndex ? 1.0 : 0.6)
                    .animation(.spring(response: 0.3, dampingFraction: 0.7), value: carouselIndex)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Capsule().fill(Color.black.opacity(0.6)))
    }

    // MARK: - Circular Helpers

    private func syncExternalIndex() {
        if isCircular {
            let realIndex = (internalIndex - 1 + items.count) % items.count
            carouselIndex = realIndex
        } else {
            internalIndex = max(0, min(internalIndex, items.count - 1))
            carouselIndex = internalIndex
        }
    }

    private func handleCircularReset() {
        guard isCircular else { return }
        if internalIndex <= 0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
                withAnimation(.none) { internalIndex = items.count }
            }
        } else if internalIndex >= items.count + 1 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
                withAnimation(.none) { internalIndex = 1 }
            }
        }
    }

    // MARK: - Cells

    @ViewBuilder
    private func carouselImageCell(_ attachment: MessageAttachment) -> some View {
        let urlStr = attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl
        if !urlStr.isEmpty {
            CachedAsyncImage(url: urlStr) {
                Color(hex: attachment.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fit)
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
        } else {
            Color(hex: attachment.thumbnailColor)
                .overlay(Image(systemName: "photo").foregroundColor(.white.opacity(0.5)))
        }
    }

    @ViewBuilder
    private func carouselVideoCell(_ attachment: MessageAttachment) -> some View {
        InlineVideoPlayerView(
            attachment: attachment,
            accentColor: contactColor,
            onExpandFullscreen: {
                fullscreenAttachment = attachment
            }
        )
    }
}
