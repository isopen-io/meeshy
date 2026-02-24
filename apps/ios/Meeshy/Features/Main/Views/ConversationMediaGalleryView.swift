// MARK: - Conversation-level fullscreen media gallery
import SwiftUI
import AVKit
import MeeshySDK
import MeeshyUI

/// Fullscreen gallery that allows swiping through ALL visual media in the conversation.
/// Opened when tapping any image/video in a message bubble.
struct ConversationMediaGalleryView: View {
    let allAttachments: [MessageAttachment]
    let startAttachmentId: String
    let accentColor: String
    /// Maps attachment.id → caption text (message content or attachment caption)
    var captionMap: [String: String] = [:]
    /// Maps attachment.id → sender info (name, avatar, color, date)
    var senderInfoMap: [String: ConversationViewModel.MediaSenderInfo] = [:]

    @Environment(\.dismiss) private var dismiss
    @State private var currentPageID: String?
    @State private var currentIndex: Int = 0
    @State private var showControls = true
    @State private var scale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var saveState: SaveState = .idle
    @ObservedObject private var videoManager = SharedAVPlayerManager.shared

    private enum SaveState { case idle, saving, saved, failed }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            galleryPager

            if showControls {
                controlsOverlay
                    .transition(.opacity)
            }
        }
        .statusBar(hidden: true)
        .onAppear {
            if let idx = allAttachments.firstIndex(where: { $0.id == startAttachmentId }) {
                currentIndex = idx
                currentPageID = startAttachmentId
            }
            cacheAttachment(allAttachments.first(where: { $0.id == startAttachmentId }))
        }
        .animation(.easeInOut(duration: 0.2), value: showControls)
    }

    // MARK: - Pager

    private var galleryPager: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 0) {
                ForEach(allAttachments) { attachment in
                    galleryPage(attachment)
                        .containerRelativeFrame(.horizontal)
                        .containerRelativeFrame(.vertical)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $currentPageID)
        .ignoresSafeArea()
        .onChange(of: currentPageID) { _, newID in
            guard let newID,
                  let newIdx = allAttachments.firstIndex(where: { $0.id == newID })
            else { return }

            let oldIdx = currentIndex
            currentIndex = newIdx

            if oldIdx != newIdx {
                let oldAtt = allAttachments[oldIdx]
                if oldAtt.type == .video && videoManager.activeURL == oldAtt.fileUrl {
                    videoManager.pause()
                }
                HapticFeedback.light()
            }

            prefetchNeighbors(around: newIdx)

            withAnimation(.spring(response: 0.3)) {
                scale = 1.0
                offset = .zero
            }
        }
    }

    // MARK: - Gallery Page

    @ViewBuilder
    private func galleryPage(_ attachment: MessageAttachment) -> some View {
        ZStack {
            Color.black

            switch attachment.type {
            case .image:
                galleryImagePage(attachment)
            case .video:
                galleryVideoPage(attachment)
            default:
                EmptyView()
            }

            // Caption overlay at bottom
            if showControls, let caption = captionMap[attachment.id], !caption.isEmpty {
                VStack {
                    Spacer()
                    captionOverlay(caption)
                }
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            withAnimation(.easeInOut(duration: 0.2)) {
                showControls.toggle()
            }
        }
    }

    // MARK: - Caption Overlay

    private func captionOverlay(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(.white)
            .multilineTextAlignment(.center)
            .lineLimit(4)
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity)
            .background(
                LinearGradient(
                    colors: [.clear, .black.opacity(0.7)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 120)
            )
            .padding(.bottom, 60)
    }

    // MARK: - Vertical-only drag gesture (does not capture horizontal → ScrollView paging works)

    private var verticalDismissGesture: some Gesture {
        DragGesture(minimumDistance: 30)
            .onChanged { value in
                // Only respond to primarily vertical drags
                guard abs(value.translation.height) > abs(value.translation.width) else { return }
                if scale <= 1.0 {
                    offset = CGSize(width: 0, height: value.translation.height)
                }
            }
            .onEnded { value in
                guard abs(value.translation.height) > abs(value.translation.width) else {
                    withAnimation(.spring()) { offset = .zero }
                    return
                }
                if scale <= 1.0 && abs(value.translation.height) > 150 {
                    dismiss()
                } else {
                    withAnimation(.spring()) { offset = .zero }
                }
            }
    }

    private func videoDismissGesture(_ attachment: MessageAttachment) -> some Gesture {
        DragGesture(minimumDistance: 30)
            .onChanged { value in
                guard abs(value.translation.height) > abs(value.translation.width) else { return }
                offset = CGSize(width: 0, height: value.translation.height)
            }
            .onEnded { value in
                guard abs(value.translation.height) > abs(value.translation.width) else {
                    withAnimation(.spring()) { offset = .zero }
                    return
                }
                if abs(value.translation.height) > 150 {
                    if videoManager.isPlaying && videoManager.activeURL == attachment.fileUrl {
                        videoManager.startPip()
                    }
                    dismiss()
                } else {
                    withAnimation(.spring()) { offset = .zero }
                }
            }
    }

    // MARK: - Image Page (pinch-to-zoom, vertical drag-to-dismiss)

    @ViewBuilder
    private func galleryImagePage(_ attachment: MessageAttachment) -> some View {
        let urlStr = attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl

        if !urlStr.isEmpty {
            CachedAsyncImage(url: urlStr) {
                ProgressView().tint(.white)
            }
            .aspectRatio(contentMode: .fit)
            .scaleEffect(scale)
            .offset(offset)
            .gesture(
                MagnificationGesture()
                    .onChanged { scale = $0 }
                    .onEnded { _ in
                        withAnimation(.spring()) {
                            scale = max(1, min(5, scale))
                        }
                    }
            )
            .gesture(verticalDismissGesture)
            .onTapGesture(count: 2) {
                withAnimation(.spring()) {
                    scale = scale > 1 ? 1 : 2.5
                    offset = .zero
                }
            }
        } else {
            Image(systemName: "photo")
                .font(.system(size: 48))
                .foregroundColor(.white.opacity(0.3))
        }
    }

    // MARK: - Video Page

    @ViewBuilder
    private func galleryVideoPage(_ attachment: MessageAttachment) -> some View {
        let isActive = videoManager.activeURL == attachment.fileUrl && videoManager.isPlaying

        ZStack {
            if let thumb = attachment.thumbnailUrl, !thumb.isEmpty, !isActive {
                CachedAsyncImage(url: thumb) {
                    Color(hex: attachment.thumbnailColor)
                }
                .aspectRatio(contentMode: .fit)
            }

            if isActive || (videoManager.activeURL == attachment.fileUrl) {
                if let player = videoManager.player {
                    FullscreenAVPlayerLayerView(player: player, gravity: .resizeAspect)
                        .ignoresSafeArea()
                }
            }

            if !isActive {
                Button {
                    videoManager.load(urlString: attachment.fileUrl)
                    videoManager.play()
                    HapticFeedback.light()
                    cacheAttachment(attachment)
                } label: {
                    ZStack {
                        Circle()
                            .fill(.ultraThinMaterial)
                            .frame(width: 64, height: 64)
                        Circle()
                            .fill(Color(hex: accentColor).opacity(0.85))
                            .frame(width: 56, height: 56)
                        Image(systemName: "play.fill")
                            .font(.system(size: 22, weight: .bold))
                            .foregroundColor(.white)
                            .offset(x: 2)
                    }
                    .shadow(color: .black.opacity(0.4), radius: 12, y: 6)
                }
            }
        }
        .gesture(videoDismissGesture(attachment))
        .offset(y: offset.height)
    }

    // MARK: - Controls Overlay

    private var controlsOverlay: some View {
        VStack {
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 28))
                        .foregroundColor(.white.opacity(0.8))
                        .padding()
                }

                Spacer()

                if allAttachments.count > 1 {
                    Text("\(currentIndex + 1) / \(allAttachments.count)")
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(.ultraThinMaterial.opacity(0.7)))
                        .contentTransition(.numericText())
                        .animation(.spring(response: 0.3), value: currentIndex)
                }

                Spacer()

                if currentIndex < allAttachments.count && allAttachments[currentIndex].type == .image {
                    Button { saveCurrentToPhotos() } label: {
                        Group {
                            switch saveState {
                            case .idle:
                                Image(systemName: "arrow.down.to.line")
                            case .saving:
                                ProgressView().tint(.white)
                            case .saved:
                                Image(systemName: "checkmark")
                            case .failed:
                                Image(systemName: "xmark")
                            }
                        }
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white.opacity(0.9))
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(Color.white.opacity(0.2)))
                        .padding(.trailing, 12)
                        .padding(.top, 8)
                    }
                    .disabled(saveState == .saving || saveState == .saved)
                } else {
                    Color.clear.frame(width: 52, height: 40).padding(.trailing, 12)
                }
            }

            Spacer()

            // Bottom metadata overlay (author + dimensions)
            if currentIndex < allAttachments.count {
                let att = allAttachments[currentIndex]
                let hasCaption = captionMap[att.id]?.isEmpty == false
                if !hasCaption {
                    bottomMetadataOverlay(att)
                }
            }
        }
    }

    private func bottomMetadataOverlay(_ att: MessageAttachment) -> some View {
        let info = senderInfoMap[att.id]
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                MeeshyAvatar(
                    name: info?.senderName ?? "?",
                    mode: .custom(36),
                    accentColor: info?.senderColor ?? accentColor,
                    avatarURL: info?.senderAvatarURL
                )
                VStack(alignment: .leading, spacing: 2) {
                    Text(info?.senderName ?? "")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                    if let sentAt = info?.sentAt {
                        Text(sentAt, format: .dateTime.day().month(.abbreviated).hour().minute())
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.white.opacity(0.6))
                    }
                }
                Spacer()
            }
            HStack(spacing: 8) {
                Image(systemName: att.type == .video ? "video.fill" : "photo")
                    .font(.system(size: 11))
                    .foregroundColor(.white.opacity(0.6))
                if let w = att.width, let h = att.height, w > 0, h > 0 {
                    Text("\(w) \u{00D7} \(h)")
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundColor(.white.opacity(0.6))
                }
                if att.fileSize > 0 {
                    Text(att.fileSizeFormatted)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                }
                Spacer()
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            LinearGradient(colors: [.clear, .black.opacity(0.5)], startPoint: .top, endPoint: .bottom)
        )
    }

    // MARK: - Actions

    private func cacheAttachment(_ attachment: MessageAttachment?) {
        guard let attachment else { return }
        let urlStr = attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl
        guard !urlStr.isEmpty,
              let resolved = MeeshyConfig.resolveMediaURL(urlStr)?.absoluteString
        else { return }
        Task { await MediaCacheManager.shared.prefetch(resolved) }
    }

    private func prefetchNeighbors(around index: Int) {
        let range = max(0, index - 2)...min(allAttachments.count - 1, index + 2)
        for i in range {
            cacheAttachment(allAttachments[i])
        }
    }

    private func saveCurrentToPhotos() {
        guard currentIndex < allAttachments.count else { return }
        let att = allAttachments[currentIndex]
        let urlStr = att.fileUrl.isEmpty ? (att.thumbnailUrl ?? "") : att.fileUrl
        guard !urlStr.isEmpty, let url = MeeshyConfig.resolveMediaURL(urlStr) else { return }
        saveState = .saving
        HapticFeedback.light()
        Task {
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                let saved = await PhotoLibraryManager.shared.saveImage(data)
                withAnimation(.spring(response: 0.3)) { saveState = saved ? .saved : .failed }
                saved ? HapticFeedback.success() : HapticFeedback.error()
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                withAnimation { saveState = .idle }
            } catch {
                withAnimation { saveState = .failed }
                HapticFeedback.error()
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                withAnimation { saveState = .idle }
            }
        }
    }
}
