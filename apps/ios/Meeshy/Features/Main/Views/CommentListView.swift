import SwiftUI

struct CommentListView: UIViewControllerRepresentable {
    let store: CommentStore

    func makeUIViewController(context: Context) -> CommentListViewController {
        CommentListViewController(store: store)
    }

    func updateUIViewController(_ vc: CommentListViewController, context: Context) {}
}
