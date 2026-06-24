import SwiftUI
import MeeshySDK

/// Chip row décorative affichant la couche manipulable courante du canvas
/// (`canvas` / `background` / `foreground`). Non tappable — purement
/// informative. Le chip actif est highlighté indigo, les autres restent
/// outlined grisés.
///
/// Spec : `2026-05-20-stories-video-layers-text-sprint-design.md` § 4.4.
@MainActor
struct CanvasLayerIndicator: View {
    let layer: CanvasManipulationLayer

    @Environment(\.colorScheme) private var colorScheme

    private var primaryText: Color { colorScheme == .dark ? .white : MeeshyColors.indigo950 }
    private var mutedText: Color { (colorScheme == .dark ? Color.white : MeeshyColors.indigo950).opacity(0.45) }

    var body: some View {
        HStack(spacing: 6) {
            chip(.canvas, icon: "circle.dashed", label: layerLabel(.canvas))
            chip(.background, icon: "rectangle", label: layerLabel(.background))
            chip(.foreground, icon: "square.stack.3d.up", label: layerLabel(.foreground))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .animation(.easeInOut(duration: 0.2), value: layer)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityDescription)
    }

    @ViewBuilder
    private func chip(_ value: CanvasManipulationLayer, icon: String, label: String) -> some View {
        let isActive = value == layer
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(10, weight: .medium))
            Text(label)
                .font(MeeshyFont.relative(11, weight: isActive ? .semibold : .medium))
        }
        .foregroundColor(isActive ? .white : mutedText)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(isActive ? MeeshyColors.indigo500 : Color.clear)
        )
        .overlay(
            Capsule()
                .stroke(isActive ? Color.clear : mutedText.opacity(0.4), lineWidth: 1)
        )
    }

    private func layerLabel(_ value: CanvasManipulationLayer) -> String {
        switch value {
        case .canvas:
            return String(localized: "story.canvas.layer.canvas",
                          defaultValue: "Canvas",
                          bundle: .module)
        case .background:
            return String(localized: "story.canvas.layer.background",
                          defaultValue: "Fond",
                          bundle: .module)
        case .foreground:
            return String(localized: "story.canvas.layer.foreground",
                          defaultValue: "Premier",
                          bundle: .module)
        }
    }

    private var accessibilityDescription: String {
        String(
            localized: "story.canvas.layer.indicator.label",
            defaultValue: "Couche active : \(layerLabel(layer))",
            bundle: .module
        )
    }
}
