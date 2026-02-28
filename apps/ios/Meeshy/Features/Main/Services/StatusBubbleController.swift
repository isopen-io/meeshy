import SwiftUI
import MeeshySDK

// MARK: - Status Bubble Controller

@MainActor
final class StatusBubbleController: ObservableObject {
    static let shared = StatusBubbleController()
    private init() {}

    @Published var currentEntry: StatusEntry?
    @Published var anchor: CGPoint = .zero

    func show(entry: StatusEntry, anchor: CGPoint) {
        currentEntry = entry
        self.anchor = anchor
    }

    func dismiss() {
        currentEntry = nil
    }

    var isPresented: Binding<Bool> {
        Binding(
            get: { self.currentEntry != nil },
            set: { if !$0 { self.currentEntry = nil } }
        )
    }
}

// MARK: - View Modifier

private struct StatusBubbleOverlayModifier: ViewModifier {
    @ObservedObject private var controller = StatusBubbleController.shared

    func body(content: Content) -> some View {
        ZStack {
            content
            if let entry = controller.currentEntry {
                StatusBubbleOverlay(
                    status: entry,
                    anchorPoint: controller.anchor,
                    isPresented: controller.isPresented
                )
                .zIndex(200)
            }
        }
    }
}

extension View {
    func withStatusBubble() -> some View {
        modifier(StatusBubbleOverlayModifier())
    }
}
