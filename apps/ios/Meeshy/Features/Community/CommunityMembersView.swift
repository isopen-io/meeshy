import SwiftUI
import MeeshyUI

struct CommunityMembersView: View {
    @StateObject private var viewModel: CommunityMembersViewModel
    var onInvite: (() -> Void)?

    init(communityId: String, onInvite: (() -> Void)? = nil) {
        _viewModel = StateObject(wrappedValue: CommunityMembersViewModel(communityId: communityId))
        self.onInvite = onInvite
    }

    var body: some View {
        CommunityMembersScreen(viewModel: viewModel, onInvite: onInvite) {
            CommunityInviteView(communityId: viewModel.communityId)
        }
    }
}
