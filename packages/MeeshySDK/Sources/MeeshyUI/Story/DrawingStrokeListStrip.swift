import SwiftUI
import MeeshySDK

/// Liste permanente des traits, affichée en bas des contrôleurs flottants de dessin.
/// Tap d'un chip = sélection (halo sur le canvas) ; le chip sélectionné expose une
/// corbeille pour supprimer le trait. Toujours visible dès qu'au moins un trait existe.
struct DrawingStrokeListStrip: View {
    @ObservedObject var viewModel: StoryComposerViewModel

    var body: some View {
        if !viewModel.drawingStrokes.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text("\(viewModel.drawingStrokes.count) trait\(viewModel.drawingStrokes.count > 1 ? "s" : "")")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(viewModel.drawingStrokes) { stroke in
                            chip(stroke)
                        }
                    }
                    .padding(2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func chip(_ stroke: StoryDrawingStroke) -> some View {
        let isSel = viewModel.drawingEditingMode.selectedStrokeId == stroke.id
        return HStack(spacing: 6) {
            Circle()
                .fill(Color(hex: stroke.colorHex))
                .frame(width: 16, height: 16)
                .overlay(Circle().stroke(.white.opacity(0.5), lineWidth: 0.5))
            Image(systemName: DrawingEditToolOptions.symbol(for: stroke.tool))
                .font(.system(size: 11, weight: .semibold))
            if isSel {
                Button {
                    viewModel.deleteStroke(stroke.id)
                    HapticFeedback.medium()
                } label: {
                    Image(systemName: "trash.fill")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(MeeshyColors.error)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Supprimer le trait")
            }
        }
        .foregroundStyle(isSel ? Color.white : Color.primary)
        .padding(.horizontal, 12)
        .frame(height: 36)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(isSel ? AnyShapeStyle(MeeshyColors.brandGradient)
                            : AnyShapeStyle(Color.gray.opacity(0.18)))
        )
        .contentShape(Rectangle())
        .onTapGesture {
            viewModel.selectStroke(isSel ? nil : stroke.id)
            HapticFeedback.light()
        }
        .accessibilityLabel("Trait \(isSel ? "sélectionné" : "")")
    }
}
