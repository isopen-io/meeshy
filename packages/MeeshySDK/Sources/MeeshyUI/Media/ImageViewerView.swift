import SwiftUI
import MeeshySDK

// MARK: - Image Viewer View

public struct ImageViewerView: View {
    public let attachment: MeeshyMessageAttachment
    public let context: MediaPlayerContext
    public var accentColor: String = "08D9D6"

    public var onDelete: (() -> Void)? = nil
    public var onEdit: (() -> Void)? = nil

    @ObservedObject private var theme = ThemeManager.shared
    @State private var showFullscreen = false

    private var isDark: Bool { theme.mode.isDark || context.isImmersive }
    private var accent: Color { Color(hex: accentColor) }

    private var imageURL: URL? {
        let urlStr = attachment.fileUrl.isEmpty
            ? (attachment.thumbnailUrl ?? "")
            : attachment.fileUrl
        return urlStr.isEmpty ? nil : MeeshyConfig.resolveMediaURL(urlStr)
    }

    private var maxWidth: CGFloat {
        switch context {
        case .messageBubble: return 240
        case .composerAttachment: return 100
        case .feedPost, .storyOverlay, .fullscreen: return .infinity
        }
    }

    private var maxHeight: CGFloat {
        switch context {
        case .messageBubble: return 200
        case .composerAttachment: return 80
        case .feedPost: return 350
        case .storyOverlay, .fullscreen: return UIScreen.main.bounds.height
        }
    }

    public init(attachment: MeeshyMessageAttachment, context: MediaPlayerContext,
                accentColor: String = "08D9D6",
                onDelete: (() -> Void)? = nil, onEdit: (() -> Void)? = nil) {
        self.attachment = attachment; self.context = context; self.accentColor = accentColor
        self.onDelete = onDelete; self.onEdit = onEdit
    }

    // MARK: - Body
    public var body: some View {
        ZStack(alignment: context.isEditable ? .topTrailing : .center) {
            imageContent
            overlays
        }
        .frame(maxWidth: maxWidth, maxHeight: maxHeight)
        .clipShape(RoundedRectangle(cornerRadius: context.cornerRadius))
        .contentShape(RoundedRectangle(cornerRadius: context.cornerRadius))
        .onTapGesture {
            if !context.isEditable {
                showFullscreen = true
                HapticFeedback.light()
            }
        }
        .fullScreenCover(isPresented: $showFullscreen) {
            ImageFullscreen(
                imageUrl: imageURL,
                accentColor: accentColor
            )
        }
    }

    // MARK: - Image Content
    @ViewBuilder
    private var imageContent: some View {
        let urlStr = attachment.fileUrl.isEmpty
            ? (attachment.thumbnailUrl ?? "")
            : attachment.fileUrl

        if !urlStr.isEmpty {
            CachedAsyncImage(url: urlStr) {
                placeholder(icon: "photo")
                    .shimmer()
            }
            .aspectRatio(contentMode: .fill)
        } else {
            placeholder(icon: "photo")
        }
    }

    // MARK: - Overlays
    @ViewBuilder
    private var overlays: some View {
        if context.showsDeleteButton, let onDelete = onDelete {
            VStack {
                HStack {
                    Spacer()
                    Button { onDelete(); HapticFeedback.light() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 18))
                            .foregroundColor(Color(hex: "FF6B6B"))
                            .background(Circle().fill(.ultraThinMaterial).frame(width: 14, height: 14))
                    }
                    .padding(6)
                }
                Spacer()
            }
        }

        if context.isEditable, let onEdit = onEdit {
            VStack {
                Spacer()
                HStack {
                    Button { onEdit(); HapticFeedback.light() } label: {
                        HStack(spacing: 3) {
                            Image(systemName: "pencil")
                                .font(.system(size: 10, weight: .bold))
                            Text("\u{00C9}diter")
                                .font(.system(size: 10, weight: .semibold))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(.black.opacity(0.5)))
                    }
                    .padding(6)
                    Spacer()
                }
            }
        }

        if attachment.fileSize > 0, !context.isCompact, !context.isEditable {
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    Text(attachment.fileSizeFormatted)
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(.black.opacity(0.5)))
                        .padding(6)
                }
            }
        }
    }

    // MARK: - Placeholder
    private func placeholder(icon: String) -> some View {
        Rectangle()
            .fill(isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
            .overlay(
                Image(systemName: icon)
                    .font(.system(size: context.isCompact ? 22 : 28))
                    .foregroundColor(isDark ? .white.opacity(0.2) : .black.opacity(0.12))
            )
            .frame(height: context == .composerAttachment ? 80 : (context.isCompact ? 160 : 200))
    }
}

// MARK: - Image Fullscreen View

public struct ImageFullscreen: View {
    public let imageUrl: URL?
    public let accentColor: String

    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var showControls = true
    @State private var saveState: SaveState = .idle

    private enum SaveState {
        case idle, saving, saved, failed
    }

    public init(imageUrl: URL?, accentColor: String) {
        self.imageUrl = imageUrl; self.accentColor = accentColor
    }

    public var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
                .onTapGesture {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showControls.toggle()
                    }
                }

            if let url = imageUrl {
                CachedAsyncImage(url: url.absoluteString) {
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
                .gesture(
                    DragGesture()
                        .onChanged { offset = $0.translation }
                        .onEnded { value in
                            if abs(value.translation.height) > 200 {
                                dismiss()
                            } else {
                                withAnimation(.spring()) { offset = .zero }
                            }
                        }
                )
                .onTapGesture(count: 2) {
                    withAnimation(.spring()) {
                        scale = scale > 1 ? 1 : 2.5
                        offset = .zero
                    }
                }
            }

            if showControls {
                VStack {
                    HStack {
                        Button { dismiss() } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 28))
                                .foregroundColor(.white.opacity(0.8))
                                .padding()
                        }
                        Spacer()

                        Button { saveToPhotos() } label: {
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
                    }
                    Spacer()
                }
                .transition(.opacity)
            }
        }
        .statusBar(hidden: true)
    }

    private func saveToPhotos() {
        guard let url = imageUrl else { return }
        saveState = .saving
        HapticFeedback.light()
        Task {
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                let saved = await PhotoLibraryManager.shared.saveImage(data)
                await MainActor.run {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        saveState = saved ? .saved : .failed
                    }
                    if saved { HapticFeedback.success() } else { HapticFeedback.error() }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        withAnimation { saveState = .idle }
                    }
                }
            } catch {
                await MainActor.run {
                    withAnimation { saveState = .failed }
                    HapticFeedback.error()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        withAnimation { saveState = .idle }
                    }
                }
            }
        }
    }
}
