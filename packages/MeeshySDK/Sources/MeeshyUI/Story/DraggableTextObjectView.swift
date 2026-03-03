import SwiftUI
import MeeshySDK

public struct DraggableTextObjectView: View {
    @Binding public var textObject: StoryTextObject
    public let isEditing: Bool
    public let onTapToFront: () -> Void
    public let onDoubleTap: () -> Void
    public let onDragEnd: () -> Void

    // Local state snapshots — read from binding once, update on gesture end.
    @State private var baseX: CGFloat?
    @State private var baseY: CGFloat?
    @State private var baseScale: CGFloat?
    @State private var baseRotation: CGFloat?

    // Gesture-transient visual offsets — never written to binding, reset on gesture end.
    @GestureState private var dragOffset: CGSize = .zero
    @GestureState private var gestureScale: CGFloat = 1.0
    @GestureState private var gestureRotation: Angle = .zero

    @State private var canvasSize: CGSize = .zero

    public init(textObject: Binding<StoryTextObject>,
                isEditing: Bool = false,
                onTapToFront: @escaping () -> Void = {},
                onDoubleTap: @escaping () -> Void = {},
                onDragEnd: @escaping () -> Void = {}) {
        self._textObject = textObject
        self.isEditing = isEditing
        self.onTapToFront = onTapToFront
        self.onDoubleTap = onDoubleTap
        self.onDragEnd = onDragEnd
    }

    private var currentX: CGFloat { baseX ?? textObject.x }
    private var currentY: CGFloat { baseY ?? textObject.y }
    private var currentScale: CGFloat { baseScale ?? textObject.scale }
    private var currentRotation: CGFloat { baseRotation ?? textObject.rotation }

    public var body: some View {
        GeometryReader { geo in
            textContentWithGestures(canvasWidth: geo.size.width, canvasHeight: geo.size.height)
                .onAppear {
                    canvasSize = geo.size
                    syncBaseFromBinding()
                }
                .onChange(of: geo.size) { newSize in canvasSize = newSize }
                .onChange(of: textObject.id) { _ in syncBaseFromBinding() }
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
                    dragGesture(canvasWidth: canvasWidth, canvasHeight: canvasHeight)
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

    private func dragGesture(canvasWidth: CGFloat, canvasHeight: CGFloat) -> some Gesture {
        DragGesture()
            .updating($dragOffset) { value, state, _ in
                state = value.translation
            }
            .onEnded { value in
                let newX = min(1, max(0, currentX + value.translation.width / canvasWidth))
                let newY = min(1, max(0, currentY + value.translation.height / canvasHeight))
                baseX = newX
                baseY = newY
                textObject.x = newX
                textObject.y = newY
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
