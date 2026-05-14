import SwiftUI
import MeeshySDK

struct ComposerMediaFormatBand: View, Equatable {
    let elementId: String
    @Bindable var viewModel: StoryComposerViewModel
    let onDone: () -> Void
    let onOpenCropEditor: (String) -> Void
    let onOpenFilterPicker: (String) -> Void

    var body: some View {
        HStack(spacing: 18) {
            Button(action: { onDone() }) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(MeeshyColors.success)
            }
            .accessibilityLabel("Done")

            Divider().frame(height: 24)

            actionButton(icon: "rotate.right", label: "Rotation") {
                // Phase 4: viewModel.rotateMedia(id: elementId, by: .pi / 2)
            }

            actionButton(icon: "arrow.up.left.and.arrow.down.right", label: "Échelle") {
                // Phase 4 wiring
            }

            actionButton(icon: "crop", label: "Recadrer") {
                onOpenCropEditor(elementId)
            }

            actionButton(icon: "camera.filters", label: "Filtre") {
                onOpenFilterPicker(elementId)
            }

            actionButton(icon: "doc.on.doc", label: "Dupliquer") {
                viewModel.duplicateElement(id: elementId)
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .frame(height: 130)
        .background(.ultraThinMaterial)
    }

    private func actionButton(icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 18, weight: .semibold))
                Text(label).font(.system(size: 10, weight: .medium))
            }
            .foregroundColor(.white)
            .frame(width: 56)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    static func == (lhs: ComposerMediaFormatBand, rhs: ComposerMediaFormatBand) -> Bool {
        lhs.elementId == rhs.elementId
    }
}
