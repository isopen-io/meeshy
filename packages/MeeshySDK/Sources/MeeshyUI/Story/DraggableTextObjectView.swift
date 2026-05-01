import SwiftUI
import MeeshySDK

public struct DraggableTextObjectView: View {
    @Binding public var textObject: StoryTextObject
    public let isEditing: Bool
    public let onTapToFront: () -> Void
    public let onDoubleTap: () -> Void
    public let onDragEnd: () -> Void

    /// Live drag tracking — same shape as DraggableMediaView so the parent can wire all
    /// draggable elements through a single `viewModel.beginDrag/updateDrag/endDrag` API.
    public var onDragStarted: ((_ position: CGPoint, _ size: CGSize) -> Void)?
    public var onDragChanged: ((CGPoint) -> Void)?
    public var onDragCommitted: (() -> Void)?

    @State private var baseX: CGFloat?
    @State private var baseY: CGFloat?
    @State private var baseScale: CGFloat?
    @State private var baseRotation: CGFloat?
    @State private var dragInitialized: Bool = false

    /// Rendered text size in points, captured via a GeometryReader background — used to
    /// compute a normalized bbox for the safe-zone warning. Defaults to zero until the
    /// first layout pass; the warning will fail closed (no warning) until then.
    @State private var measuredTextSize: CGSize = .zero

    @GestureState private var dragOffset: CGSize = .zero
    @GestureState private var gestureScale: CGFloat = 1.0
    @GestureState private var gestureRotation: Angle = .zero

    public init(textObject: Binding<StoryTextObject>,
                isEditing: Bool = false,
                onTapToFront: @escaping () -> Void = {},
                onDoubleTap: @escaping () -> Void = {},
                onDragStarted: ((CGPoint, CGSize) -> Void)? = nil,
                onDragChanged: ((CGPoint) -> Void)? = nil,
                onDragCommitted: (() -> Void)? = nil,
                onDragEnd: @escaping () -> Void = {}) {
        self._textObject = textObject
        self.isEditing = isEditing
        self.onTapToFront = onTapToFront
        self.onDoubleTap = onDoubleTap
        self.onDragStarted = onDragStarted
        self.onDragChanged = onDragChanged
        self.onDragCommitted = onDragCommitted
        self.onDragEnd = onDragEnd
    }

    private var currentX: CGFloat { baseX ?? textObject.x }
    private var currentY: CGFloat { baseY ?? textObject.y }
    private var currentScale: CGFloat { baseScale ?? textObject.scale }
    private var currentRotation: CGFloat { baseRotation ?? textObject.rotation }

    public var body: some View {
        GeometryReader { geo in
            textContentWithGestures(canvasWidth: geo.size.width, canvasHeight: geo.size.height)
                .onAppear { syncBaseFromBinding() }
                .onChange(of: textObject.id) { _, _ in syncBaseFromBinding() }
                .onChange(of: textObject.x) { _, _ in syncBaseFromBinding() }
                .onChange(of: textObject.y) { _, _ in syncBaseFromBinding() }
                .onChange(of: textObject.scale) { _, _ in syncBaseFromBinding() }
                .onChange(of: textObject.rotation) { _, _ in syncBaseFromBinding() }
        }
    }

    // MARK: - Sync

    private func syncBaseFromBinding() {
        baseX = textObject.x
        baseY = textObject.y
        baseScale = textObject.scale
        baseRotation = textObject.rotation
    }

    // MARK: - Content with gestures

    @ViewBuilder
    private func textContentWithGestures(canvasWidth: CGFloat, canvasHeight: CGFloat) -> some View {
        let effectiveScale = isEditing ? currentScale * gestureScale : currentScale
        let effectiveRotation = isEditing ? currentRotation + gestureRotation.degrees : currentRotation

        if isEditing {
            styledTextContent
                .background(textSizeReader)
                .scaleEffect(effectiveScale)
                .rotationEffect(.degrees(effectiveRotation))
                .contentShape(Rectangle())
                .position(
                    x: currentX * canvasWidth + dragOffset.width,
                    y: currentY * canvasHeight + dragOffset.height
                )
                .highPriorityGesture(TapGesture(count: 2).onEnded { onDoubleTap() })
                .highPriorityGesture(TapGesture().onEnded { onTapToFront() })
                // Combined primary gesture — claims touch exclusively, preventing
                // parent canvas gestures from firing when touching this element.
                .gesture(
                    dragGesture(canvasWidth: canvasWidth, canvasHeight: canvasHeight,
                                normSize: normalizedSize(canvasWidth: canvasWidth, canvasHeight: canvasHeight,
                                                          scale: effectiveScale))
                        .simultaneously(with: pinchGesture)
                        .simultaneously(with: rotateGesture)
                )
        } else {
            styledTextContent
                .scaleEffect(currentScale)
                .rotationEffect(.degrees(currentRotation))
                .contentShape(Rectangle())
                .position(
                    x: currentX * canvasWidth,
                    y: currentY * canvasHeight
                )
        }
    }

    /// Captures the rendered text size into `measuredTextSize` so we can broadcast a
    /// normalized bbox during drag.
    private var textSizeReader: some View {
        GeometryReader { proxy in
            Color.clear
                .preference(key: TextSizePreferenceKey.self, value: proxy.size)
        }
        .onPreferenceChange(TextSizePreferenceKey.self) { measuredTextSize = $0 }
    }

    private func normalizedSize(canvasWidth: CGFloat, canvasHeight: CGFloat, scale: CGFloat) -> CGSize {
        guard canvasWidth > 0, canvasHeight > 0 else { return .zero }
        let w = measuredTextSize.width * scale / canvasWidth
        let h = measuredTextSize.height * scale / canvasHeight
        return CGSize(width: w, height: h)
    }

    // MARK: - Styled text rendering

    private var styledTextContent: some View {
        let style = textObject.parsedTextStyle
        let size = textObject.resolvedSize
        let colorHex = textObject.textColor ?? "FFFFFF"
        let alignment = textObjectAlignment
        let hasBg = textObject.hasBg

        return Text(textObject.content)
            .font(storyFont(for: style, size: size))
            .foregroundColor(Color(hex: colorHex))
            .multilineTextAlignment(alignment)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Group {
                    if hasBg {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.black.opacity(0.5))
                    }
                }
            )
            .shadow(color: style == .neon ? Color(hex: colorHex).opacity(0.6) : .clear, radius: 10)
            .frame(maxWidth: 280)
    }

    private var textObjectAlignment: TextAlignment {
        switch textObject.textAlign {
        case "left": return .leading
        case "right": return .trailing
        default: return .center
        }
    }

    // MARK: - Gestures

    private func dragGesture(canvasWidth: CGFloat, canvasHeight: CGFloat,
                             normSize: CGSize) -> some Gesture {
        DragGesture()
            .updating($dragOffset) { value, state, _ in
                state = value.translation
            }
            .onChanged { value in
                let nx = min(1, max(0, currentX + value.translation.width / canvasWidth))
                let ny = min(1, max(0, currentY + value.translation.height / canvasHeight))
                let pos = CGPoint(x: nx, y: ny)
                if !dragInitialized {
                    dragInitialized = true
                    onDragStarted?(pos, normSize)
                }
                onDragChanged?(pos)
            }
            .onEnded { value in
                let rawX = min(1, max(0, currentX + value.translation.width / canvasWidth))
                let rawY = min(1, max(0, currentY + value.translation.height / canvasHeight))
                let snapped = StoryAlignmentSnap.apply(to: CGPoint(x: rawX, y: rawY))
                baseX = snapped.x
                baseY = snapped.y
                textObject.x = snapped.x
                textObject.y = snapped.y
                dragInitialized = false
                onDragCommitted?()
                onDragEnd()
            }
    }

    private var pinchGesture: some Gesture {
        MagnificationGesture()
            .updating($gestureScale) { value, state, _ in
                state = value
            }
            .onEnded { value in
                let newScale = min(4.0, max(0.3, currentScale * value))
                baseScale = newScale
                textObject.scale = newScale
                onDragEnd()
            }
    }

    private var rotateGesture: some Gesture {
        RotationGesture()
            .updating($gestureRotation) { value, state, _ in
                state = value
            }
            .onEnded { value in
                let newRotation = currentRotation + value.degrees
                baseRotation = newRotation
                textObject.rotation = newRotation
                onDragEnd()
            }
    }
}

// MARK: - Size measurement

private struct TextSizePreferenceKey: PreferenceKey {
    static var defaultValue: CGSize = .zero
    static func reduce(value: inout CGSize, nextValue: () -> CGSize) {
        value = nextValue()
    }
}
