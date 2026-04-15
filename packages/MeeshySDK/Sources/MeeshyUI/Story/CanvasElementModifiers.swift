import SwiftUI
import MeeshySDK

// MARK: - Selection Glow

struct SelectionGlowModifier: ViewModifier {
    let isSelected: Bool

    func body(content: Content) -> some View {
        content
            .shadow(
                color: isSelected ? Color(hex: "#6366F1").opacity(0.25) : .clear,
                radius: isSelected ? 4 : 0
            )
            .animation(.easeInOut(duration: 0.2), value: isSelected)
    }
}

extension View {
    func selectionGlow(_ isSelected: Bool) -> some View {
        modifier(SelectionGlowModifier(isSelected: isSelected))
    }
}

// MARK: - Canvas Element Context Menu

struct CanvasContextMenu: ViewModifier {
    let elementId: String
    let elementType: CanvasElementType
    @Bindable var viewModel: StoryComposerViewModel

    func body(content: Content) -> some View {
        content
            .contextMenu {
                Button {
                    viewModel.duplicateElement(id: elementId)
                } label: {
                    Label(String(localized: "story.canvas.duplicate", defaultValue: "Dupliquer", bundle: .module), systemImage: "doc.on.doc")
                }

                Button(role: .destructive) {
                    viewModel.deleteElement(id: elementId)
                } label: {
                    Label(String(localized: "story.canvas.delete", defaultValue: "Supprimer", bundle: .module), systemImage: "trash")
                }

                Divider()

                Button {
                    viewModel.bringToFront(id: elementId)
                } label: {
                    Label(String(localized: "story.canvas.bringToFront", defaultValue: "Mettre devant", bundle: .module), systemImage: "square.3.layers.3d.top.filled")
                }

                Button {
                    viewModel.sendToBack(id: elementId)
                } label: {
                    Label(String(localized: "story.canvas.sendToBack", defaultValue: "Mettre derriere", bundle: .module), systemImage: "square.3.layers.3d.bottom.filled")
                }

                if elementType == .video || elementType == .audio || elementType == .text {
                    Divider()
                    Button {
                        viewModel.isTimelineVisible = true
                        viewModel.selectedElementId = elementId
                    } label: {
                        Label(String(localized: "story.canvas.timing", defaultValue: "Timing", bundle: .module), systemImage: "clock")
                    }
                }
            }
    }
}

extension View {
    func canvasContextMenu(
        elementId: String,
        elementType: CanvasElementType,
        viewModel: StoryComposerViewModel
    ) -> some View {
        modifier(CanvasContextMenu(
            elementId: elementId,
            elementType: elementType,
            viewModel: viewModel
        ))
    }
}
