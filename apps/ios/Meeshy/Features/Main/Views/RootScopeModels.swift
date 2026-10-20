import SwiftUI

@MainActor
final class RootScopeModels: ObservableObject {
    nonisolated deinit {}

    let story: StoryViewModel
    let status: StatusViewModel
    let conversations: ConversationListVMOwner
    let notifications: RootNotificationSource
    let upgradeGate: UpgradeGateController

    init() {
        story = StoryViewModel()
        status = StatusViewModel()
        conversations = ConversationListVMOwner()
        notifications = RootNotificationSource()
        upgradeGate = UpgradeGateController()
    }

    init(
        story: StoryViewModel,
        status: StatusViewModel,
        conversations: ConversationListVMOwner,
        notifications: RootNotificationSource,
        upgradeGate: UpgradeGateController
    ) {
        self.story = story
        self.status = status
        self.conversations = conversations
        self.notifications = notifications
        self.upgradeGate = upgradeGate
    }
}
