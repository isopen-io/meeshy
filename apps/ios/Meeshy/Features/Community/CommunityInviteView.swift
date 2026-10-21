import SwiftUI
import MeeshyUI

struct CommunityInviteView: View {
    @StateObject private var viewModel: CommunityInviteViewModel
    private let onDone: (() -> Void)?

    init(communityId: String, onDone: (() -> Void)? = nil) {
        _viewModel = StateObject(wrappedValue: CommunityInviteViewModel(communityId: communityId))
        self.onDone = onDone
    }

    var body: some View {
        CommunityInviteScreen(viewModel: viewModel, onDone: onDone)
    }
}
