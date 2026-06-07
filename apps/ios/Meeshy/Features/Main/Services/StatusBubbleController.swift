import SwiftUI
import Combine
import MeeshySDK

// MARK: - Status Bubble Controller

@MainActor
final class StatusBubbleController: ObservableObject {
    static let shared = StatusBubbleController()
    private init() {}

    @Published var currentEntry: StatusEntry?
    @Published var anchor: CGPoint = .zero
    var onRepublish: ((StatusEntry) -> Void)?

    func show(entry: StatusEntry, anchor: CGPoint) {
        currentEntry = entry
        self.anchor = anchor

        // Statut consommé : enregistrer la vue côté serveur (sauf le sien) pour
        // que la notification « X a publié un statut » (friend_new_mood) ne reste
        // pas non lue. Le gateway marque alors les notifications liées à ce post
        // et ré-émet `notification:counts`. Fire-and-forget.
        guard entry.userId != AuthManager.shared.currentUser?.id else { return }
        let statusId = entry.id
        Task { try? await PostService.shared.viewPost(postId: statusId) }
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
                    isPresented: controller.isPresented,
                    onRepublish: entry.userId != AuthManager.shared.currentUser?.id
                        ? controller.onRepublish
                        : nil
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
