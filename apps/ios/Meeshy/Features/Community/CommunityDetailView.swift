import SwiftUI
import MeeshySDK
import MeeshyUI

struct CommunityDetailView: View {
    @StateObject private var viewModel: CommunityDetailViewModel

    var onSelectConversation: ((APIConversation) -> Void)?
    var onOpenSettings: ((MeeshyCommunity) -> Void)?
    var onOpenMembers: ((String) -> Void)?
    var onInvite: ((String) -> Void)?
    var onDismiss: (() -> Void)?
    var onCreatePost: (() -> Void)?

    init(communityId: String,
         onSelectConversation: ((APIConversation) -> Void)? = nil,
         onOpenSettings: ((MeeshyCommunity) -> Void)? = nil,
         onOpenMembers: ((String) -> Void)? = nil,
         onInvite: ((String) -> Void)? = nil,
         onDismiss: (() -> Void)? = nil,
         onCreatePost: (() -> Void)? = nil) {
        _viewModel = StateObject(wrappedValue: CommunityDetailViewModel(communityId: communityId))
        self.onSelectConversation = onSelectConversation
        self.onOpenSettings = onOpenSettings
        self.onOpenMembers = onOpenMembers
        self.onInvite = onInvite
        self.onDismiss = onDismiss
        self.onCreatePost = onCreatePost
    }

    var body: some View {
        CommunityDetailScreen(
            viewModel: viewModel,
            onSelectConversation: onSelectConversation,
            onOpenSettings: onOpenSettings,
            onOpenMembers: onOpenMembers,
            onInvite: onInvite,
            onDismiss: onDismiss,
            onCreatePost: onCreatePost,
            settingsSheet: { community, actions in
                CommunitySettingsView(
                    community: community,
                    onUpdated: actions.onUpdated,
                    onDeleted: actions.onDeleted,
                    onLeft: actions.onLeft
                )
            },
            addChannelSheet: { onAdded in
                AddChannelSheet(communityId: viewModel.communityId, onAdded: onAdded)
            }
        )
    }
}
