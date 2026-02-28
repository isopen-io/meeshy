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
    public var onClear: () -> Void

    public init(toolColor: Binding<Color>, toolWidth: Binding<CGFloat>,
                toolType: Binding<DrawingTool>, onUndo: @escaping () -> Void,
                onClear: @escaping () -> Void) {
        self._toolColor = toolColor
        self._toolWidth = toolWidth
        self._toolType = toolType
        self.onUndo = onUndo
        self.onClear = onClear
    }

    public var body: some View {
        VStack(spacing: 12) {
            widthSlider
            HStack(spacing: 12) {
                toolButtons
                Spacer()
                colorPalette
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
                Text("Taille pinceau")
            }
            .tint(toolColor)

            Circle()
                .fill(toolColor)
                .frame(width: 20, height: 20)
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
                        .foregroundColor(toolType == tool ? .white : .white.opacity(0.5))
                        .frame(width: 36, height: 36)
                        .background(
                            Circle().fill(toolType == tool ? Color(hex: "FF2E63") : Color.white.opacity(0.1))
                        )
                }
                .accessibilityLabel(tool.label)
            }
        }
    }

    private var colorPalette: some View {
        HStack(spacing: 6) {
            ForEach(DrawingColorOption.palette, id: \.self) { colorHex in
                Button {
                    toolColor = Color(hex: colorHex)
                    HapticFeedback.light()
                } label: {
                    Circle()
                        .fill(Color(hex: colorHex))
                        .frame(width: 24, height: 24)
                        .overlay(
                            Circle()
                                .stroke(Color.white, lineWidth: Color(hex: colorHex) == toolColor ? 2 : 0)
                        )
                }
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
                    .frame(width: 36, height: 36)
            }

            Button {
                onClear()
                HapticFeedback.medium()
            } label: {
                Image(systemName: "trash")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(hex: "FF6B6B"))
                    .frame(width: 36, height: 36)
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
        case .pen: return "Pen"
        case .marker: return "Marker"
        case .eraser: return "Gomme"
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

        updateTool()
        return canvasView
    }

    public func updateUIView(_ uiView: PKCanvasView, context: Context) {
        uiView.isUserInteractionEnabled = isActive
        updateTool()
    }

    private func updateTool() {
        switch toolType {
        case .pen:
            canvasView.tool = PKInkingTool(.pen, color: inkColor, width: inkWidth)
        case .marker:
            canvasView.tool = PKInkingTool(.marker, color: inkColor, width: inkWidth * 2)
        case .eraser:
            canvasView.tool = PKEraserTool(.bitmap)
        }
    }

    public func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    public class Coordinator: NSObject, PKCanvasViewDelegate {
        var parent: PencilKitCanvas

        init(parent: PencilKitCanvas) {
            self.parent = parent
        }

        public func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
            parent.drawingData = canvasView.drawing.dataRepresentation()
        }
    }
}
