import SwiftUI
import MeeshySDK

/// Liste **verticale** des traits, en bas des contrôleurs flottants de dessin.
/// Chaque ligne expose la miniature du trait + des contrôles inline par-trait :
/// couleur, style de lissage (brut / courbe / droite — redresse à la volée),
/// épaisseur, et suppression. Toucher une icône ouvre l'éditeur inline sous la
/// ligne (réutilise `DrawingEditToolOptions`, qui édite le trait sélectionné).
struct DrawingStrokeList: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    /// Hauteur max du scroll. `230` pour l'usage flottant historique ; la sheet
    /// redimensionnable passe `.infinity` pour remplir le détent courant.
    var maxListHeight: CGFloat = 230

    var body: some View {
        if !viewModel.drawingStrokes.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text(String(localized: "story.drawEdit.strokeList.count",
                            defaultValue: "\(viewModel.drawingStrokes.count) trait(s)",
                            bundle: .module))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 6) {
                        ForEach(viewModel.drawingStrokes) { stroke in
                            row(stroke)
                        }
                    }
                    .padding(.vertical, 2)
                }
                .frame(maxHeight: maxListHeight)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .animation(.spring(response: 0.28, dampingFraction: 0.85),
                       value: viewModel.drawingEditingMode)
        }
    }

    // MARK: - Row

    private func row(_ stroke: StoryDrawingStroke) -> some View {
        let isSel = viewModel.drawingEditingMode.selectedStrokeId == stroke.id
        let expanded = isSel ? viewModel.drawingEditingMode.expandedTool : nil
        return VStack(spacing: 8) {
            HStack(spacing: 12) {
                miniature(stroke)
                colorButton(stroke, expanded: expanded)
                toolButton("scribble.variable", tool: .smoothing, stroke: stroke, expanded: expanded,
                           label: String(localized: "story.drawEdit.strokeList.style", defaultValue: "Style du trait", bundle: .module))
                toolButton("lineweight", tool: .thickness, stroke: stroke, expanded: expanded,
                           label: String(localized: "story.drawEdit.tool.thickness", defaultValue: "Épaisseur du trait", bundle: .module))
                Spacer(minLength: 0)
                trashButton(stroke)
            }
            if let tool = expanded {
                DrawingEditToolOptions(tool: tool, viewModel: viewModel)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(isSel ? AnyShapeStyle(MeeshyColors.indigo400.opacity(0.18))
                            : AnyShapeStyle(Color.gray.opacity(0.10)))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(isSel ? MeeshyColors.indigo400.opacity(0.6) : Color.clear, lineWidth: 1)
        )
    }

    // MARK: - Miniature

    private func miniature(_ stroke: StoryDrawingStroke) -> some View {
        MeeshyStrokeCanvas(strokes: [stroke], selectedId: nil)
            .frame(width: 30, height: 48)
            .background(
                RoundedRectangle(cornerRadius: 6).fill(Color.black.opacity(0.06))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 6).stroke(Color.white.opacity(0.25), lineWidth: 0.5)
            )
            .accessibilityHidden(true)
    }

    // MARK: - Buttons

    /// Bouton couleur : pastille remplie de la couleur du trait. Tap → éditeur
    /// couleur inline pour ce trait.
    private func colorButton(_ stroke: StoryDrawingStroke, expanded: DrawingEditTool?) -> some View {
        Button {
            toggle(.color, for: stroke, currentlyExpanded: expanded)
        } label: {
            Circle()
                .fill(Color(hex: stroke.colorHex))
                .frame(width: 26, height: 26)
                .overlay(Circle().stroke(Color.white.opacity(0.7), lineWidth: 1.5))
                .overlay(Circle().stroke(Color.black.opacity(0.15), lineWidth: 0.5))
                .scaleEffect(expanded == .color ? 1.12 : 1.0)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "story.drawEdit.tool.color", defaultValue: "Couleur du trait", bundle: .module))
    }

    private func toolButton(_ symbol: String, tool: DrawingEditTool,
                            stroke: StoryDrawingStroke, expanded: DrawingEditTool?,
                            label: String) -> some View {
        let active = expanded == tool
        return Button {
            toggle(tool, for: stroke, currentlyExpanded: expanded)
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(active ? Color.white : Color.primary)
                .frame(width: 30, height: 30)
                .background(
                    Circle().fill(active ? AnyShapeStyle(MeeshyColors.brandGradient)
                                         : AnyShapeStyle(Color.gray.opacity(0.18)))
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func trashButton(_ stroke: StoryDrawingStroke) -> some View {
        Button {
            viewModel.deleteStroke(stroke.id)
            HapticFeedback.medium()
        } label: {
            Image(systemName: "trash")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(MeeshyColors.error)
                .frame(width: 30, height: 30)
                .background(Circle().fill(MeeshyColors.error.opacity(0.12)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "story.drawEdit.strokeList.delete", defaultValue: "Supprimer le trait", bundle: .module))
    }

    // MARK: - Selection / expansion

    /// Sélectionne le trait et déplie l'outil ; re-tap sur l'outil déjà déplié le replie.
    private func toggle(_ tool: DrawingEditTool, for stroke: StoryDrawingStroke,
                        currentlyExpanded: DrawingEditTool?) {
        viewModel.selectStroke(stroke.id)
        viewModel.setExpandedDrawingTool(currentlyExpanded == tool ? nil : tool)
        HapticFeedback.light()
    }
}
