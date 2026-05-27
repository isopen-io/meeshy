import SwiftUI

struct SyncPillHost: View {
    @StateObject private var viewModel: SyncPillViewModel
    private let router: SyncPillRouting

    init(viewModel: SyncPillViewModel = SyncPillViewModel(), router: SyncPillRouting) {
        _viewModel = StateObject(wrappedValue: viewModel)
        self.router = router
    }

    var body: some View {
        SyncPill(
            state: viewModel.state,
            onSingleTap: {},
            onDoubleTap: {
                let items = viewModel.state.items
                guard let first = items.first else { return }
                Task { await router.open(first.source) }
            }
        )
        .padding(.top, 8)
        .padding(.horizontal, 16)
        .animation(.easeInOut(duration: 0.35), value: viewModel.state)
    }
}
