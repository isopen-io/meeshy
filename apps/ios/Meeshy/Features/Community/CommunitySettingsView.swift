import SwiftUI
import MeeshySDK
import MeeshyUI

struct CommunitySettingsView: View {
    @StateObject private var viewModel: CommunitySettingsViewModel

    var onUpdated: ((MeeshyCommunity) -> Void)?
    var onDeleted: (() -> Void)?
    var onLeft: (() -> Void)?
    var onCancel: (() -> Void)?

    init(
        community: MeeshyCommunity,
        onUpdated: ((MeeshyCommunity) -> Void)? = nil,
        onDeleted: (() -> Void)? = nil,
        onLeft: (() -> Void)? = nil,
        onCancel: (() -> Void)? = nil
    ) {
        _viewModel = StateObject(wrappedValue: CommunitySettingsViewModel(community: community))
        self.onUpdated = onUpdated
        self.onDeleted = onDeleted
        self.onLeft = onLeft
        self.onCancel = onCancel
    }

    var body: some View {
        CommunitySettingsScreen(
            viewModel: viewModel,
            onUpdated: onUpdated,
            onDeleted: onDeleted,
            onLeft: onLeft,
            onCancel: onCancel
        )
    }
}
