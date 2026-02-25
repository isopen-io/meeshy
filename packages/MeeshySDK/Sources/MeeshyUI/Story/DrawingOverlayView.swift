import SwiftUI
import PencilKit
import MeeshySDK

// MARK: - Drawing Overlay View

public struct DrawingOverlayView: View {
    @Binding public var drawingData: Data?
    @Binding public var isActive: Bool

    @State private var canvasView = PKCanvasView()
    @State private var selectedColor: Color = .white
    @State private var selectedWidth: CGFloat = 5
    @State private var toolType: DrawingTool = .pen

    public init(drawingData: Binding<Data?>, isActive: Binding<Bool>) {
        self._drawingData = drawingData
        self._isActive = isActive
    }

    public var body: some View {
        ZStack {
            PencilKitCanvas(
                canvasView: $canvasView,
                drawingData: $drawingData,
                isActive: isActive,
                inkColor: UIColor(selectedColor),
                inkWidth: selectedWidth,
                toolType: toolType
            )
            .allowsHitTesting(isActive)

            if isActive {
                VStack {
                    Spacer()
                    drawingToolbar
                }
            }
        }
    }

    // MARK: - Drawing Toolbar

    private var drawingToolbar: some View {
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
        .background(.ultraThinMaterial)
        .cornerRadius(20, corners: [.topLeft, .topRight])
    }

    private var widthSlider: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(selectedColor)
                .frame(width: max(4, selectedWidth * 0.6), height: max(4, selectedWidth * 0.6))

            Slider(value: $selectedWidth, in: 1...30) {
                Text("Brush size")
            }
            .tint(selectedColor)
            .onChange(of: selectedWidth) { _ in
                updateTool()
            }

            Circle()
                .fill(selectedColor)
                .frame(width: 20, height: 20)
        }
    }

    private var toolButtons: some View {
        HStack(spacing: 8) {
            ForEach(DrawingTool.allCases, id: \.self) { tool in
                Button {
                    withAnimation(.spring(response: 0.2)) { toolType = tool }
                    updateTool()
                    HapticFeedback.light()
                } label: {
                    Image(systemName: tool.icon)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(toolType == tool ? .white : .white.opacity(0.5))
                        .frame(width: 36, height: 36)
                        .background(
                            Circle()
                                .fill(toolType == tool ? Color(hex: "FF2E63") : Color.white.opacity(0.1))
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
                    selectedColor = Color(hex: colorHex)
                    updateTool()
                    HapticFeedback.light()
                } label: {
                    Circle()
                        .fill(Color(hex: colorHex))
                        .frame(width: 24, height: 24)
                        .overlay(
                            Circle()
                                .stroke(Color.white, lineWidth: Color(hex: colorHex) == selectedColor ? 2 : 0)
                        )
                }
            }
        }
    }

    private var actionButtons: some View {
        HStack(spacing: 8) {
            Button {
                canvasView.undoManager?.undo()
                syncDrawingData()
                HapticFeedback.light()
            } label: {
                Image(systemName: "arrow.uturn.backward")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.white.opacity(0.7))
                    .frame(width: 36, height: 36)
            }

            Button {
                canvasView.drawing = PKDrawing()
                drawingData = nil
                HapticFeedback.medium()
            } label: {
                Image(systemName: "trash")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(hex: "FF6B6B"))
                    .frame(width: 36, height: 36)
            }
        }
    }

    private func updateTool() {
        let uiColor = UIColor(selectedColor)
        switch toolType {
        case .pen:
            canvasView.tool = PKInkingTool(.pen, color: uiColor, width: selectedWidth)
        case .marker:
            canvasView.tool = PKInkingTool(.marker, color: uiColor, width: selectedWidth * 2)
        case .eraser:
            canvasView.tool = PKEraserTool(.bitmap)
        }
    }

    private func syncDrawingData() {
        drawingData = canvasView.drawing.dataRepresentation()
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
        case .eraser: return "Eraser"
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
