import SwiftUI
import PhotosUI
import MeeshySDK

// MARK: - Story Composer Active Panel

public enum StoryComposerPanel: Equatable {
    case none
    case text
    case stickers
    case drawing
    case filter
    case music
    case background
}

// MARK: - Story Background Picker Palette

public enum StoryBackgroundPalette {
    public static let colors: [String] = [
        "0F0C29", "302B63", "24243E", "1A1A2E", "16213E",
        "FF2E63", "E94057", "F27121", "F8B500", "2ECC71",
        "08D9D6", "3498DB", "9B59B6", "45B7D1", "FF6B6B",
        "000000", "FFFFFF"
    ]

    public static let gradients: [(String, String)] = [
        ("FF2E63", "08D9D6"),
        ("9B59B6", "FF6B6B"),
        ("F8B500", "FF2E63"),
        ("0F0C29", "302B63"),
        ("1A1A2E", "E94057"),
        ("2ECC71", "3498DB"),
    ]
}

// MARK: - Story Composer View

public struct StoryComposerView: View {
    @StateObject private var slideManager = StorySlideManager()

    @State private var text = ""
    @State private var textStyle: StoryTextStyle = .bold
    @State private var textColor: Color = .white
    @State private var textSize: CGFloat = 28
    @State private var textBgEnabled = false
    @State private var textAlignment: TextAlignment = .center
    @State private var textPosition: StoryTextPosition = .center

    @State private var stickerObjects: [StorySticker] = []
    @State private var selectedFilter: StoryFilter? = nil
    @State private var drawingData: Data? = nil
    @State private var isDrawingActive = false
    @State private var backgroundColor: Color = Color(hex: "0F0C29")
    @State private var selectedImage: UIImage? = nil

    @State private var musicTrack: StoryMusicTrack? = nil
    @State private var musicTrimStart: TimeInterval = 0
    @State private var musicTrimEnd: TimeInterval = 15

    @State private var activePanel: StoryComposerPanel = .none
    @State private var showPhotoPicker = false
    @State private var photoPickerItem: PhotosPickerItem? = nil

    public var onPublish: (StoryEffects, String?, UIImage?) -> Void
    public var onDismiss: () -> Void

    public init(onPublish: @escaping (StoryEffects, String?, UIImage?) -> Void,
                onDismiss: @escaping () -> Void) {
        self.onPublish = onPublish; self.onDismiss = onDismiss
    }

    public var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                topBar
                canvasArea
                if slideManager.slideCount > 1 {
                    StorySlideCarousel(manager: slideManager) {
                        slideManager.addSlide()
                    }
                }
                toolBar
                activeToolPanel
            }
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $photoPickerItem,
                      matching: .any(of: [.images, .videos]))
        .onChange(of: photoPickerItem) { newItem in
            loadPhoto(from: newItem)
        }
        .statusBarHidden()
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack {
            Button {
                onDismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color.black.opacity(0.4)))
            }

            Spacer()

            if slideManager.canAddSlide {
                Button {
                    slideManager.addSlide()
                    HapticFeedback.medium()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                            .font(.system(size: 12, weight: .bold))
                        Text("Slide")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(Color.white.opacity(0.15)))
                }
            }

            Spacer()

            Button {
                publishStory()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "paperplane.fill")
                        .font(.system(size: 13))
                    Text("Publish")
                        .font(.system(size: 14, weight: .bold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(
                    Capsule().fill(
                        LinearGradient(
                            colors: [Color(hex: "FF2E63"), Color(hex: "E94057")],
                            startPoint: .leading, endPoint: .trailing
                        )
                    )
                )
                .shadow(color: Color(hex: "FF2E63").opacity(0.4), radius: 8, y: 2)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    // MARK: - Canvas Area

    private var canvasArea: some View {
        StoryCanvasView(
            text: $text,
            textStyle: $textStyle,
            textColor: $textColor,
            textSize: $textSize,
            textBgEnabled: $textBgEnabled,
            textAlignment: $textAlignment,
            textPosition: $textPosition,
            stickerObjects: $stickerObjects,
            selectedFilter: $selectedFilter,
            drawingData: $drawingData,
            isDrawingActive: $isDrawingActive,
            backgroundColor: $backgroundColor,
            selectedImage: $selectedImage
        )
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 8)
    }

    // MARK: - Tool Bar

    private var toolBar: some View {
        HStack(spacing: 0) {
            toolButton(icon: "photo.on.rectangle", label: "Photo", panel: nil, action: { showPhotoPicker = true })
            toolButton(icon: "textformat", label: "Text", panel: .text)
            toolButton(icon: "face.smiling", label: "Stickers", panel: .stickers)
            toolButton(icon: "pencil.tip", label: "Draw", panel: .drawing)
            toolButton(icon: "camera.filters", label: "Filter", panel: .filter)
            toolButton(icon: "music.note", label: "Music", panel: .music)
            toolButton(icon: "paintpalette", label: "BG", panel: .background)
        }
        .padding(.vertical, 8)
        .background(Color.black.opacity(0.3))
    }

    private func toolButton(icon: String, label: String, panel: StoryComposerPanel?, action: (() -> Void)? = nil) -> some View {
        let isActive = panel != nil && activePanel == panel
        return Button {
            if let action {
                action()
            } else if let panel {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    if activePanel == panel {
                        activePanel = .none
                        if panel == .drawing { isDrawingActive = false }
                    } else {
                        activePanel = panel
                        if panel == .drawing { isDrawingActive = true }
                        else { isDrawingActive = false }
                    }
                }
            }
            HapticFeedback.light()
        } label: {
            VStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(isActive ? Color(hex: "FF2E63") : .white.opacity(0.6))
                Text(label)
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(isActive ? Color(hex: "FF2E63") : .white.opacity(0.4))
            }
            .frame(maxWidth: .infinity)
        }
        .accessibilityLabel(label)
    }

    // MARK: - Active Tool Panel

    @ViewBuilder
    private var activeToolPanel: some View {
        switch activePanel {
        case .text:
            StoryTextEditorView(
                text: $text, textStyle: $textStyle, textColor: $textColor,
                textSize: $textSize, textBgEnabled: $textBgEnabled, textAlignment: $textAlignment
            )
            .padding(.bottom, 8)
            .transition(.move(edge: .bottom).combined(with: .opacity))

        case .stickers:
            StickerPickerView { emoji in
                let sticker = StorySticker(emoji: emoji, x: 0.5, y: 0.4)
                stickerObjects.append(sticker)
                HapticFeedback.medium()
            }
            .frame(height: 320)
            .transition(.move(edge: .bottom).combined(with: .opacity))

        case .drawing:
            EmptyView()

        case .filter:
            StoryFilterPicker(selectedFilter: $selectedFilter)
                .padding(.vertical, 12)
                .transition(.move(edge: .bottom).combined(with: .opacity))

        case .music:
            StoryMusicPicker(selectedTrack: $musicTrack, trimStart: $musicTrimStart, trimEnd: $musicTrimEnd)
                .frame(height: 380)
                .transition(.move(edge: .bottom).combined(with: .opacity))

        case .background:
            backgroundPicker
                .transition(.move(edge: .bottom).combined(with: .opacity))

        case .none:
            EmptyView()
        }
    }

    // MARK: - Background Picker

    private var backgroundPicker: some View {
        VStack(spacing: 12) {
            Text("Background")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.white.opacity(0.7))

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(StoryBackgroundPalette.colors, id: \.self) { hex in
                        Button {
                            withAnimation(.spring(response: 0.2)) {
                                backgroundColor = Color(hex: hex)
                                selectedImage = nil
                            }
                            HapticFeedback.light()
                        } label: {
                            Circle()
                                .fill(Color(hex: hex))
                                .frame(width: 36, height: 36)
                                .overlay(
                                    Circle()
                                        .stroke(Color.white, lineWidth: backgroundColor == Color(hex: hex) && selectedImage == nil ? 2.5 : 0)
                                        .padding(1)
                                )
                        }
                    }
                }
                .padding(.horizontal, 16)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(StoryBackgroundPalette.gradients.indices, id: \.self) { idx in
                        let grad = StoryBackgroundPalette.gradients[idx]
                        Button {
                            withAnimation(.spring(response: 0.2)) {
                                backgroundColor = Color(hex: grad.0)
                                selectedImage = nil
                            }
                            HapticFeedback.light()
                        } label: {
                            RoundedRectangle(cornerRadius: 8)
                                .fill(
                                    LinearGradient(
                                        colors: [Color(hex: grad.0), Color(hex: grad.1)],
                                        startPoint: .topLeading, endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: 56, height: 36)
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
        .padding(.vertical, 12)
        .background(Color.black.opacity(0.3))
    }

    // MARK: - Actions

    private func loadPhoto(from item: PhotosPickerItem?) {
        guard let item else { return }
        Task {
            if let data = try? await item.loadTransferable(type: Data.self),
               let image = UIImage(data: data) {
                selectedImage = image
                slideManager.setImage(image, for: slideManager.currentSlide.id)
            }
        }
    }

    private func publishStory() {
        let effects = buildEffects()
        let content = text.isEmpty ? nil : text
        onPublish(effects, content, selectedImage)
        HapticFeedback.success()
    }

    private func buildEffects() -> StoryEffects {
        let bgHex = selectedImage != nil ? nil : colorToHex(backgroundColor)
        return StoryEffects(
            background: bgHex,
            textStyle: textStyle.rawValue,
            textColor: colorToHex(textColor),
            textPosition: nil,
            filter: selectedFilter?.rawValue,
            stickers: stickerObjects.isEmpty ? nil : stickerObjects.map(\.emoji),
            textAlign: alignmentString(textAlignment),
            textSize: textSize,
            textBg: textBgEnabled ? "000000" : nil,
            textOffsetY: nil,
            stickerObjects: stickerObjects.isEmpty ? nil : stickerObjects,
            textPositionPoint: textPosition,
            drawingData: drawingData,
            musicTrackId: musicTrack?.id,
            musicStartTime: musicTrack != nil ? musicTrimStart : nil,
            musicEndTime: musicTrack != nil ? musicTrimEnd : nil
        )
    }

    private func alignmentString(_ alignment: TextAlignment) -> String {
        switch alignment {
        case .leading: return "left"
        case .center: return "center"
        case .trailing: return "right"
        }
    }

    private func colorToHex(_ color: Color) -> String {
        let uiColor = UIColor(color)
        var r: CGFloat = 0; var g: CGFloat = 0; var b: CGFloat = 0; var a: CGFloat = 0
        uiColor.getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "%02X%02X%02X", Int(r * 255), Int(g * 255), Int(b * 255))
    }
}
