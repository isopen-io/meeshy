import SwiftUI
import PencilKit
import MeeshySDK

// MARK: - Drawing Overlay View (canvas uniquement, sans toolbar)

public struct DrawingOverlayView: View {
    @Binding public var drawingData: Data?
    @Binding public var isActive: Bool
    @Binding public var canvasView: PKCanvasView
    @Binding public var toolColor: Color
    @Binding public var toolWidth: CGFloat
    @Binding public var toolType: DrawingTool

    public init(drawingData: Binding<Data?>, isActive: Binding<Bool>,
                canvasView: Binding<PKCanvasView>, toolColor: Binding<Color>,
                toolWidth: Binding<CGFloat>, toolType: Binding<DrawingTool>) {
        self._drawingData = drawingData
        self._isActive = isActive
        self._canvasView = canvasView
        self._toolColor = toolColor
        self._toolWidth = toolWidth
        self._toolType = toolType
    }

    public var body: some View {
        PencilKitCanvas(
            canvasView: $canvasView,
            drawingData: $drawingData,
            isActive: isActive,
            inkColor: UIColor(toolColor),
            inkWidth: toolWidth,
            toolType: toolType
        )
        .allowsHitTesting(isActive)
    }
}

// MARK: - Drawing Toolbar Panel (affiché dans le panneau inférieur du composer)

public struct DrawingToolbarPanel: View {
    @Binding public var toolColor: Color
    @Binding public var toolWidth: CGFloat
    @Binding public var toolType: DrawingTool
    public var onUndo: () -> Void
    public var onRedo: () -> Void
    public var onClear: () -> Void

    public init(toolColor: Binding<Color>, toolWidth: Binding<CGFloat>,
                toolType: Binding<DrawingTool>, onUndo: @escaping () -> Void,
                onRedo: @escaping () -> Void,
                onClear: @escaping () -> Void) {
        self._toolColor = toolColor
        self._toolWidth = toolWidth
        self._toolType = toolType
        self.onUndo = onUndo
        self.onRedo = onRedo
        self.onClear = onClear
    }

    public var body: some View {
        VStack(spacing: 10) {
            widthSlider

            colorPalette

            HStack {
                toolButtons
                Spacer()
                actionButtons
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var widthSlider: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(toolColor)
                .frame(width: max(4, toolWidth * 0.6), height: max(4, toolWidth * 0.6))

            Slider(value: $toolWidth, in: 1...30) {
                Text(String(localized: "story.drawing.brushSize", defaultValue: "Taille pinceau", bundle: .module))
            }
            .tint(toolColor)

            Circle()
                .fill(toolColor)
                .frame(width: 20, height: 20)
        }
    }

    private var colorPalette: some View {
        HStack(spacing: 0) {
            ForEach(DrawingColorOption.palette, id: \.self) { colorHex in
                Button {
                    toolColor = Color(hex: colorHex)
                    HapticFeedback.light()
                } label: {
                    Circle()
                        .fill(Color(hex: colorHex))
                        .frame(width: 28, height: 28)
                        .overlay(
                            Circle()
                                .stroke(Color.white, lineWidth: Color(hex: colorHex) == toolColor ? 2.5 : 0)
                        )
                        .frame(width: 44, height: 44)
                        .contentShape(Circle())
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var toolButtons: some View {
        HStack(spacing: 8) {
            ForEach(DrawingTool.allCases, id: \.self) { tool in
                Button {
                    withAnimation(.spring(response: 0.2)) { toolType = tool }
                    HapticFeedback.light()
                } label: {
                    Image(systemName: tool.icon)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(toolType == tool ? .white : .white.opacity(0.6))
                        .frame(width: 44, height: 44)
                        .background(
                            Circle().fill(toolType == tool ? Color(hex: "FF2E63") : Color.white.opacity(0.1))
                        )
                }
                .accessibilityLabel(tool.label)
            }
        }
    }

    private var actionButtons: some View {
        HStack(spacing: 8) {
            Button {
                onUndo()
                HapticFeedback.light()
            } label: {
                Image(systemName: "arrow.uturn.backward")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.white.opacity(0.7))
                    .frame(width: 44, height: 44)
                    .contentShape(Circle())
            }
            .accessibilityLabel(String(localized: "story.drawing.undo", defaultValue: "Annuler", bundle: .module))

            Button {
                onRedo()
                HapticFeedback.light()
            } label: {
                Image(systemName: "arrow.uturn.forward")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.white.opacity(0.7))
                    .frame(width: 44, height: 44)
                    .contentShape(Circle())
            }
            .accessibilityLabel(String(localized: "story.drawing.redo", defaultValue: "Restaurer", bundle: .module))

            Button {
                onClear()
                HapticFeedback.medium()
            } label: {
                Image(systemName: "trash")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(hex: "FF6B6B"))
                    .frame(width: 44, height: 44)
                    .contentShape(Circle())
            }
        }
    }
}

// MARK: - Drawing Tool

public enum DrawingTool: String, CaseIterable {
    case pen, marker, eraser

    public var icon: String {
        switch self {
        case .pen: return "pencil.tip"
        case .marker: return "paintbrush.pointed.fill"
        case .eraser: return "eraser.fill"
        }
    }

    public var label: String {
        switch self {
        case .pen: return String(localized: "story.drawing.pen", defaultValue: "Pen", bundle: .module)
        case .marker: return String(localized: "story.drawing.marker", defaultValue: "Marker", bundle: .module)
        case .eraser: return String(localized: "story.drawing.eraser", defaultValue: "Gomme", bundle: .module)
        }
    }
}

// MARK: - Drawing Color Options

public enum DrawingColorOption {
    public static let palette: [String] = [
        "FFFFFF", "000000", "FF2E63", "08D9D6", "F8B500",
        "9B59B6", "2ECC71", "FF6B6B", "3498DB"
    ]
}

// MARK: - PencilKit Canvas Wrapper

public struct PencilKitCanvas: UIViewRepresentable {
    @Binding var canvasView: PKCanvasView
    @Binding var drawingData: Data?
    var isActive: Bool
    var inkColor: UIColor
    var inkWidth: CGFloat
    var toolType: DrawingTool

    public func makeUIView(context: Context) -> PKCanvasView {
        canvasView.backgroundColor = .clear
        canvasView.isOpaque = false
        canvasView.drawingPolicy = .anyInput
        canvasView.delegate = context.coordinator

        if let data = drawingData, let drawing = try? PKDrawing(data: data) {
            canvasView.drawing = drawing
        }

        applyTool(to: canvasView)
        return canvasView
    }

    public func updateUIView(_ uiView: PKCanvasView, context: Context) {
        uiView.isUserInteractionEnabled = isActive
        applyTool(to: uiView)

        // Sync drawing when slide changes (drawingData changed externally)
        guard !context.coordinator.isUpdatingFromDelegate else { return }
        if let data = drawingData {
            if uiView.drawing.dataRepresentation() != data,
               let drawing = try? PKDrawing(data: data) {
                context.coordinator.isUpdatingFromDelegate = true
                uiView.drawing = drawing
                context.coordinator.isUpdatingFromDelegate = false
            }
        } else if !uiView.drawing.strokes.isEmpty {
            context.coordinator.isUpdatingFromDelegate = true
            uiView.drawing = PKDrawing()
            context.coordinator.isUpdatingFromDelegate = false
        }
    }

    private func applyTool(to canvas: PKCanvasView) {
        switch toolType {
        case .pen:
            canvas.tool = PKInkingTool(.pen, color: inkColor, width: inkWidth)
        case .marker:
            canvas.tool = PKInkingTool(.marker, color: inkColor, width: inkWidth * 2)
        case .eraser:
            if #available(iOS 16.4, *) {
                canvas.tool = PKEraserTool(.bitmap, width: inkWidth * 3)
            } else {
                canvas.tool = PKEraserTool(.bitmap)
            }
        }
    }

    public func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    public class Coordinator: NSObject, PKCanvasViewDelegate {
        var parent: PencilKitCanvas
        var isUpdatingFromDelegate = false

        init(parent: PencilKitCanvas) {
            self.parent = parent
        }

        public func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
            guard !isUpdatingFromDelegate else { return }
            parent.drawingData = canvasView.drawing.dataRepresentation()
        }
    }
}
