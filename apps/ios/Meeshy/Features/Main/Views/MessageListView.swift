import SwiftUI
import MeeshySDK

struct MessageListView: UIViewControllerRepresentable {
    let store: MessageStore
    let currentUserId: String
    var onNewMessagesBadge: ((Int) -> Void)?

    func makeUIViewController(context: Context) -> MessageListViewController {
        let vc = MessageListViewController(store: store, currentUserId: currentUserId)
        vc.onNewMessagesBadge = onNewMessagesBadge
        return vc
    }

    func updateUIViewController(_ vc: MessageListViewController, context: Context) {}
}
