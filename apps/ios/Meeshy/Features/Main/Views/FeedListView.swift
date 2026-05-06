import SwiftUI

struct FeedListView: UIViewControllerRepresentable {
    let store: FeedStore

    func makeUIViewController(context: Context) -> FeedListViewController {
        FeedListViewController(store: store)
    }

    func updateUIViewController(_ vc: FeedListViewController, context: Context) {}
}
