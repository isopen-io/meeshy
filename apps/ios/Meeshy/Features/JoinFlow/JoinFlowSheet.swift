import SwiftUI
import MeeshySDK
import MeeshyUI

struct JoinFlowSheet: View {
    @StateObject private var viewModel: JoinFlowViewModel

    let isSignedIn: Bool
    let onAccountRequest: ((InviteLandingChoice) -> Void)?
    let onJoinSuccess: (AnonymousJoinResponse) -> Void

    init(
        identifier: String,
        isSignedIn: Bool = false,
        entry: JoinFlowViewModel.Entry = .landing,
        onAccountRequest: ((InviteLandingChoice) -> Void)? = nil,
        onJoinSuccess: @escaping (AnonymousJoinResponse) -> Void
    ) {
        self._viewModel = StateObject(wrappedValue: JoinFlowViewModel(identifier: identifier, entry: entry))
        self.isSignedIn = isSignedIn
        self.onAccountRequest = onAccountRequest
        self.onJoinSuccess = onJoinSuccess
    }

    var body: some View {
        JoinFlowScreen(
            viewModel: viewModel,
            isSignedIn: isSignedIn,
            onAccountRequest: onAccountRequest,
            onJoinSuccess: onJoinSuccess
        )
    }
}
