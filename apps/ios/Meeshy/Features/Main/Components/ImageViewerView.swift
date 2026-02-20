import SwiftUI
import MeeshySDK

// ============================================================================
// MARK: - Image Viewer View
// ============================================================================
///
/// Reusable image viewer that adapts to context:
///  - `.messageBubble` — Compact thumbnail, tap to fullscreen
///  - `.composerAttachment` — Preview tile with delete
///  - `.feedPost` — Full width, social bar
///  - `.storyOverlay` — Fullscreen backdrop
///  - `.fullscreen` — Pinch-to-zoom, pan, swipe-to-dismiss
///
struct ImageViewerView: View {
    let attachment: MessageAttachment
    let context: MediaPlayerContext
    var accentColor: String = "08D9D6"

    // Actions
    var onDelete: (() -> Void)? = nil
    var onEdit: (() -> Void)? = nil

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

    // MARK: - Body
    var body: some View {
        ZStack(alignment: context.isEditable ? .topTrailing : .center) {
            // Image content
            imageContent

            // Overlays per context
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
        // Delete button (composer attachment)
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

        // Edit button (composer)
        if context.isEditable, let onEdit = onEdit {
            VStack {
                Spacer()
                HStack {
                    Button { onEdit(); HapticFeedback.light() } label: {
                        HStack(spacing: 3) {
                            Image(systemName: "pencil")
                                .font(.system(size: 10, weight: .bold))
                            Text("Éditer")
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

        // File size badge (non-compact)
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

// ============================================================================
// MARK: - Image Fullscreen View
// ============================================================================

struct ImageFullscreen: View {
    let imageUrl: URL?
    let accentColor: String

    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var showControls = true

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
                .onTapGesture {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showControls.toggle()
                    }
                }

            if let url = imageUrl {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
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
                    default:
                        ProgressView().tint(.white)
                    }
                }
            }

            // Close button
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

                        // Share button
                        Button { /* TODO: share */ } label: {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 20))
                                .foregroundColor(.white.opacity(0.8))
                                .padding()
                        }
                    }
                    Spacer()
                }
                .transition(.opacity)
            }
        }
        .statusBar(hidden: true)
    }
}
