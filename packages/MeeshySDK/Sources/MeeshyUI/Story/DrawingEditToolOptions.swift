import SwiftUI
import MeeshySDK

// MARK: - StoryDrawingColors

/// Palette de couleurs de dessin (9 teintes). Relocalisée depuis l'ancien
/// `DrawingColorOption` (fichier `DrawingOverlayView` supprimé par la refonte).
public enum StoryDrawingColors {
    public static let palette: [String] = [
        "FFFFFF", "000000", "FF2E63", "08D9D6", "F8B500",
        "9B59B6", "2ECC71", "FF6B6B", "3498DB"
    ]
}

// MARK: - DrawingEditToolOptions

/// Panneau d'options du mode dessin, affiché sous les bulles quand un outil est
/// déplié. Sélection-aware : si un trait est sélectionné, les éditions ciblent ce
/// trait (`updateSelectedStroke*`) ; sinon elles règlent le pinceau actif
/// (`drawingColor` / `drawingWidth` / `activeBrushTool` / `activeBrushSmoothing`).
struct DrawingEditToolOptions: View {
    let tool: DrawingEditTool
    @ObservedObject var viewModel: StoryComposerViewModel

    var body: some View {
        Group {
            switch tool {
            case .tool:      brushToolOptions
            case .color:     colorOptions
            case .thickness: thicknessOptions
            case .smoothing: smoothingOptions
            }
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Selection helpers

    private var selectedStroke: StoryDrawingStroke? {
        guard let id = viewModel.drawingEditingMode.selectedStrokeId else { return nil }
        return viewModel.drawingStrokes.first { $0.id == id }
    }

    private var currentColorHex: String {
        selectedStroke?.colorHex ?? Self.hex(of: viewModel.drawingColor)
    }

    private var currentWidth: Double {
        selectedStroke.map { $0.width } ?? Double(viewModel.drawingWidth)
    }

    private var currentSmoothing: StrokeSmoothing {
        selectedStroke?.smoothing ?? viewModel.activeBrushSmoothing
    }

    private func applyColor(_ hex: String) {
        if selectedStroke != nil { viewModel.updateSelectedStrokeColor(hex) }
        else { viewModel.drawingColor = Color(hex: hex) }
    }

    private func applyWidth(_ width: Double) {
        if selectedStroke != nil { viewModel.updateSelectedStrokeWidth(width) }
        else { viewModel.drawingWidth = CGFloat(width) }
    }

    private func applySmoothing(_ smoothing: StrokeSmoothing) {
        if selectedStroke != nil { viewModel.updateSelectedStrokeSmoothing(smoothing) }
        else { viewModel.activeBrushSmoothing = smoothing }
    }

    // MARK: - Tool (pen / marker / eraser)

    private var brushToolOptions: some View {
        HStack(spacing: 10) {
            ForEach(StrokeTool.allCases, id: \.self) { t in
                let isSel = viewModel.activeBrushTool == t
                Button {
                    viewModel.activeBrushTool = t
                    // Sélectionner un PINCEAU (pas l'édition d'un trait
                    // existant) bascule en plein écran de tracé (user
                    // 2026-07-11 v2 : « à la sélection du pinceau on passe
                    // en mode plein écran »).
                    if selectedStroke == nil {
                        viewModel.enterImmersiveDrawing()
                    }
                    HapticFeedback.light()
                } label: {
                    Image(systemName: Self.symbol(for: t))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(isSel ? Color.white : Color.primary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 38)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(isSel ? AnyShapeStyle(MeeshyColors.brandGradient)
                                            : AnyShapeStyle(Color.gray.opacity(0.18)))
                        )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Self.label(for: t))
            }
        }
    }

    // MARK: - Color

    private var colorOptions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(StoryDrawingColors.palette, id: \.self) { hex in
                    let isSel = currentColorHex.caseInsensitiveCompare(hex) == .orderedSame
                    Button {
                        applyColor(hex)
                        HapticFeedback.light()
                    } label: {
                        colorDot(hex: hex, selected: isSel, size: 32)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(4)
        }
    }

    // MARK: - Thickness

    private var thicknessOptions: some View {
        HStack(spacing: 10) {
            Image(systemName: "minus")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            Slider(
                value: Binding(get: { currentWidth }, set: { applyWidth($0) }),
                in: 1...30, step: 1
            )
            .tint(MeeshyColors.brandPrimary)
            Image(systemName: "plus")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.secondary)
            Text("\(Int(currentWidth))")
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 30)
        }
    }

    // MARK: - Smoothing

    private var smoothingOptions: some View {
        HStack(spacing: 10) {
            smoothingChip(.raw, "scribble", String(localized: "story.drawEdit.smoothing.raw", defaultValue: "Brut", bundle: .module))
            smoothingChip(.curve, "scribble.variable", String(localized: "story.drawEdit.smoothing.curve", defaultValue: "Courbe", bundle: .module))
            smoothingChip(.line, "line.diagonal", String(localized: "story.drawEdit.smoothing.line", defaultValue: "Droite", bundle: .module))
        }
    }

    private func smoothingChip(_ value: StrokeSmoothing, _ symbol: String, _ label: String) -> some View {
        let isSel = currentSmoothing == value
        return Button {
            applySmoothing(value)
            HapticFeedback.light()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: symbol).font(.system(size: 13, weight: .semibold))
                Text(label).font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(isSel ? Color.white : Color.primary)
            .frame(maxWidth: .infinity)
            .frame(height: 38)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isSel ? AnyShapeStyle(MeeshyColors.brandGradient)
                                : AnyShapeStyle(Color.gray.opacity(0.18)))
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Shared

    private func colorDot(hex: String, selected: Bool, size: CGFloat) -> some View {
        Circle()
            .fill(Color(hex: hex))
            .frame(width: size, height: size)
            .overlay(Circle().stroke(Color.white, lineWidth: selected ? 3 : 0).padding(1))
            .overlay(Circle().stroke(Color.black.opacity(0.15), lineWidth: 0.5))
            .scaleEffect(selected ? 1.1 : 1.0)
            .animation(.spring(response: 0.2), value: selected)
    }

    static func symbol(for tool: StrokeTool) -> String {
        switch tool {
        case .pen:    return "pencil.tip"
        case .marker: return "paintbrush.pointed.fill"
        case .eraser: return "eraser.fill"
        }
    }

    static func label(for tool: StrokeTool) -> String {
        switch tool {
        case .pen:    return String(localized: "story.drawEdit.strokeTool.pen", defaultValue: "Stylo", bundle: .module)
        case .marker: return String(localized: "story.drawEdit.strokeTool.marker", defaultValue: "Marqueur", bundle: .module)
        case .eraser: return String(localized: "story.drawEdit.strokeTool.eraser", defaultValue: "Gomme", bundle: .module)
        }
    }

    /// Convertit une `Color` en hex "RRGGBB". Utilise un ARRONDI (`.rounded()`),
    /// pas une troncature : le roundtrip `Color(hex:)` → `hex(of:)` doit être
    /// l'identité pour que la sélection de couleur s'affiche. La conversion
    /// `Color → UIColor → getRed` décale parfois une composante de ~1/255 vers le
    /// bas (ex. vert `2ECC71` : 204 → 203.99) ; avec une troncature `Int(x*255)`
    /// elle tombait à 203 (`CB`) → l'hex ne matchait plus la palette → cercle non
    /// surligné (bug 2026-06-01 « vert/violet non sélectionnés »). L'arrondi
    /// absorbe ce décalage.
    static func hex(of color: Color) -> String {
        let ui = UIColor(color)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard ui.getRed(&r, green: &g, blue: &b, alpha: &a) else { return "FFFFFF" }
        return String(format: "%02X%02X%02X",
                      Int((max(0, min(1, r)) * 255).rounded()),
                      Int((max(0, min(1, g)) * 255).rounded()),
                      Int((max(0, min(1, b)) * 255).rounded()))
    }
}
