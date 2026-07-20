import SwiftUI
import MeeshySDK

/// Sélecteur de couche manipulable de la bordure gauche du composer : deux
/// chips TAPPABLES « Arrière-plan » / « Premier plan » (directive user
/// 2026-07-14). Choisir un chip pilote quel groupe d'éléments reçoit les
/// gestes (pan/pinch/rotate) — le fond (zoom/rotation/position du média de
/// fond) ou le premier plan (textes, stickers, médias ajoutés).
///
/// La notion « Canvas » a disparu de l'UI : le cadre est désormais entièrement
/// auto-calculé depuis le contenu. Le tap poste
/// `.storyComposerSelectManipulationLayer` (object = rawValue) que le
/// `StoryCanvasUIView` consomme via `setManipulationLayer(_:)`.
@MainActor
struct CanvasLayerIndicator: View {
    /// Couche active courante (pour le highlight). `.canvas` = slide vierge →
    /// aucun chip actif.
    let layer: CanvasManipulationLayer

    @Environment(\.colorScheme) private var colorScheme

    private var mutedText: Color { (colorScheme == .dark ? Color.white : MeeshyColors.indigo950).opacity(0.55) }

    var body: some View {
        HStack(spacing: 6) {
            chip(.background, icon: "photo", label: layerLabel(.background))
            chip(.foreground, icon: "square.stack.3d.up", label: layerLabel(.foreground))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .animation(.easeInOut(duration: 0.2), value: layer)
    }

    @ViewBuilder
    private func chip(_ value: CanvasManipulationLayer, icon: String, label: String) -> some View {
        let isActive = value == layer
        Button {
            HapticFeedback.light()
            NotificationCenter.default.post(
                name: .storyComposerSelectManipulationLayer,
                object: value.rawValue
            )
        } label: {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .medium))
                Text(label)
                    .font(.system(size: 11, weight: isActive ? .semibold : .medium))
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
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }

    private func layerLabel(_ value: CanvasManipulationLayer) -> String {
        switch value {
        case .background:
            return String(localized: "story.canvas.layer.background",
                          defaultValue: "Arrière-plan",
                          bundle: .module)
        case .foreground:
            return String(localized: "story.canvas.layer.foreground",
                          defaultValue: "Premier plan",
                          bundle: .module)
        case .canvas:
            // Plus affiché — conservé pour l'exhaustivité du switch.
            return String(localized: "story.canvas.layer.background",
                          defaultValue: "Arrière-plan",
                          bundle: .module)
        }
    }
}
