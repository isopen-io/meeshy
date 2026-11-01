import SwiftUI
import MeeshySDK
import MeeshyUI

extension ConnectionActionView {
    init(
        userId: String,
        userName: String,
        accentColor: Color = MeeshyColors.indigo500,
        onError: ((String) -> Void)? = nil,
        onSuccess: ((String) -> Void)? = nil
    ) {
        self.init(
            userId: userId,
            userName: userName,
            accentColor: accentColor,
            friendService: FriendService.shared,
            resolver: .shared,
            offlineQueue: OfflineQueue.shared,
            friendshipCache: .shared,
            blockService: .shared,
            onError: onError,
            onSuccess: onSuccess
        )
    }
}
