import SwiftUI
import MeeshySDK

// MARK: - Story Canvas View

public struct StoryCanvasView: View {
    @Binding public var text: String
    @Binding public var textStyle: StoryTextStyle
    @Binding public var textColor: Color
    @Binding public var textSize: CGFloat
    @Binding public var textBgEnabled: Bool
    @Binding public var textAlignment: TextAlignment
    @Binding public var textPosition: StoryTextPosition
    @Binding public var stickerObjects: [StorySticker]
    @Binding public var selectedFilter: StoryFilter?
    @Binding public var drawingData: Data?
    @Binding public var isDrawingActive: Bool
    @Binding public var backgroundColor: Color
    @Binding public var selectedImage: UIImage?

    public init(text: Binding<String>, textStyle: Binding<StoryTextStyle>,
                textColor: Binding<Color>, textSize: Binding<CGFloat>,
                textBgEnabled: Binding<Bool>, textAlignment: Binding<TextAlignment>,
                textPosition: Binding<StoryTextPosition>, stickerObjects: Binding<[StorySticker]>,
                selectedFilter: Binding<StoryFilter?>, drawingData: Binding<Data?>,
                isDrawingActive: Binding<Bool>, backgroundColor: Binding<Color>,
                selectedImage: Binding<UIImage?>) {
        self._text = text; self._textStyle = textStyle
        self._textColor = textColor; self._textSize = textSize
        self._textBgEnabled = textBgEnabled; self._textAlignment = textAlignment
        self._textPosition = textPosition; self._stickerObjects = stickerObjects
        self._selectedFilter = selectedFilter; self._drawingData = drawingData
        self._isDrawingActive = isDrawingActive; self._backgroundColor = backgroundColor
        self._selectedImage = selectedImage
    }

    public var body: some View {
        GeometryReader { geo in
            ZStack {
                backgroundLayer

                mediaLayer

                drawingLayer

                textLayer(canvasSize: geo.size)

                stickerLayer(canvasSize: geo.size)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: 0))
        }
    }

    // MARK: - Background Layer

    private var backgroundLayer: some View {
        ZStack {
            backgroundColor
                .ignoresSafeArea()

            if selectedImage == nil {
                gradientOverlay
            }
        }
    }

    private var gradientOverlay: some View {
        LinearGradient(
            colors: [
                backgroundColor.opacity(0.8),
                backgroundColor,
                backgroundColor.opacity(0.9)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    // MARK: - Media Layer

    @ViewBuilder
    private var mediaLayer: some View {
        if let image = selectedImage {
            let filtered = StoryFilterProcessor.apply(selectedFilter, to: image)
            Image(uiImage: filtered)
                .resizable()
                .scaledToFill()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
        }
    }

    // MARK: - Drawing Layer

    private var drawingLayer: some View {
        DrawingOverlayView(drawingData: $drawingData, isActive: $isDrawingActive)
    }

    // MARK: - Text Layer

    @ViewBuilder
    private func textLayer(canvasSize: CGSize) -> some View {
        if !text.isEmpty && !isDrawingActive {
            draggableTextView(canvasSize: canvasSize)
        }
    }

    private func draggableTextView(canvasSize: CGSize) -> some View {
        let posX = textPosition.x * canvasSize.width
        let posY = textPosition.y * canvasSize.height

        return styledTextView
            .position(x: posX, y: posY)
            .gesture(
                DragGesture()
                    .onChanged { value in
                        let newX = max(0.05, min(0.95, value.location.x / canvasSize.width))
                        let newY = max(0.05, min(0.95, value.location.y / canvasSize.height))
                        textPosition = StoryTextPosition(x: newX, y: newY)
                    }
            )
    }

    private var styledTextView: some View {
        Text(text)
            .font(storyFont(for: textStyle, size: textSize))
            .foregroundColor(textColor)
            .multilineTextAlignment(textAlignment)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Group {
                    if textBgEnabled {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.black.opacity(0.5))
                    }
                }
            )
            .shadow(color: textStyle == .neon ? textColor.opacity(0.6) : .clear, radius: 10)
            .frame(maxWidth: 280)
    }

    // MARK: - Sticker Layer

    private func stickerLayer(canvasSize: CGSize) -> some View {
        ForEach(Array(stickerObjects.enumerated()), id: \.element.id) { index, sticker in
            DraggableSticker(
                sticker: sticker,
                canvasSize: canvasSize,
                onUpdate: { updated in
                    guard index < stickerObjects.count else { return }
                    stickerObjects[index] = updated
                },
                onRemove: {
                    guard index < stickerObjects.count else { return }
                    stickerObjects.remove(at: index)
                }
            )
        }
    }
}

// MARK: - Draggable Sticker

public struct DraggableSticker: View {
    public let sticker: StorySticker
    public let canvasSize: CGSize
    public var onUpdate: (StorySticker) -> Void
    public var onRemove: () -> Void

    @State private var currentScale: CGFloat = 1
    @State private var currentRotation: Angle = .zero
    @State private var showDeleteButton = false

    public init(sticker: StorySticker, canvasSize: CGSize,
                onUpdate: @escaping (StorySticker) -> Void,
                onRemove: @escaping () -> Void) {
        self.sticker = sticker; self.canvasSize = canvasSize
        self.onUpdate = onUpdate; self.onRemove = onRemove
    }

    public var body: some View {
        ZStack(alignment: .topTrailing) {
            Text(sticker.emoji)
                .font(.system(size: 50 * sticker.scale * currentScale))
                .rotationEffect(Angle(degrees: sticker.rotation) + currentRotation)

            if showDeleteButton {
                Button {
                    onRemove()
                    HapticFeedback.medium()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(.white)
                        .background(Circle().fill(Color.red).padding(-2))
                }
                .offset(x: 10, y: -10)
                .transition(.scale.combined(with: .opacity))
            }
        }
        .position(
            x: sticker.x * canvasSize.width,
            y: sticker.y * canvasSize.height
        )
        .gesture(dragGesture)
        .gesture(magnificationGesture)
        .gesture(rotationGesture)
        .onTapGesture(count: 2) {
            withAnimation(.spring(response: 0.2)) { showDeleteButton.toggle() }
        }
    }

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                let newX = max(0.05, min(0.95, value.location.x / canvasSize.width))
                let newY = max(0.05, min(0.95, value.location.y / canvasSize.height))
                var updated = sticker
                updated.x = newX; updated.y = newY
                onUpdate(updated)
            }
    }

    private var magnificationGesture: some Gesture {
        MagnificationGesture()
            .onChanged { scale in
                currentScale = scale
            }
            .onEnded { scale in
                var updated = sticker
                updated.scale = max(0.3, min(3.0, sticker.scale * scale))
                onUpdate(updated)
                currentScale = 1
            }
    }

    private var rotationGesture: some Gesture {
        RotationGesture()
            .onChanged { angle in
                currentRotation = angle
            }
            .onEnded { angle in
                var updated = sticker
                updated.rotation = sticker.rotation + angle.degrees
                onUpdate(updated)
                currentRotation = .zero
            }
    }
}
