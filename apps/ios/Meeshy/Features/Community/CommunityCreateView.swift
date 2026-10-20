import SwiftUI
import MeeshySDK
import MeeshyUI

struct CommunityCreateView: View {
    @StateObject private var viewModel = CommunityCreateViewModel()

    var onCreated: ((MeeshyCommunity) -> Void)?
    var onDismiss: (() -> Void)?

    init(
        onCreated: ((MeeshyCommunity) -> Void)? = nil,
        onDismiss: (() -> Void)? = nil
    ) {
        self.onCreated = onCreated
        self.onDismiss = onDismiss
    }

    var body: some View {
        CommunityCreateScreen(viewModel: viewModel, onCreated: onCreated, onDismiss: onDismiss)
    }
}
