import SwiftUI
import MeeshySDK
import MeeshyUI

struct AddChannelSheet: View {
    @StateObject private var viewModel: CommunityAddChannelViewModel

    init(communityId: String, onAdded: @escaping () -> Void) {
        _viewModel = StateObject(wrappedValue: CommunityAddChannelViewModel(communityId: communityId, onAdded: onAdded))
    }

    var body: some View {
        CommunityAddChannelScreen(viewModel: viewModel)
    }
}
