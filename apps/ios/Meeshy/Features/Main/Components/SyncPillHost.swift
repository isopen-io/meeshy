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
            onDoubleTap: { visible in
                guard let visible else { return }
                Task { await router.open(visible.source) }
            }
        )
        .padding(.top, 8)
        .padding(.horizontal, 16)
        .animation(.easeInOut(duration: 0.35), value: viewModel.state)
        // Spec §7.5: above feed overlay (50) and floating call pill (190),
        // below notification toasts (201).
        .zIndex(195)
    }
}
