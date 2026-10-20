import SwiftUI
import MeeshySDK
import MeeshyUI

struct CommunityListView: View {
    @StateObject private var viewModel = CommunityListViewModel()

    var onSelectCommunity: ((MeeshyCommunity) -> Void)?
    var onCreateCommunity: (() -> Void)?
    var onDismiss: (() -> Void)?

    init(
        onSelectCommunity: ((MeeshyCommunity) -> Void)? = nil,
        onCreateCommunity: (() -> Void)? = nil,
        onDismiss: (() -> Void)? = nil
    ) {
        self.onSelectCommunity = onSelectCommunity
        self.onCreateCommunity = onCreateCommunity
        self.onDismiss = onDismiss
    }

    var body: some View {
        CommunityListScreen(
            viewModel: viewModel,
            onSelectCommunity: onSelectCommunity,
            onCreateCommunity: onCreateCommunity,
            onDismiss: onDismiss
        )
    }
}
