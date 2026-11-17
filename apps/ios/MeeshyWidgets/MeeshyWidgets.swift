import WidgetKit
import SwiftUI
import ActivityKit

// MARK: - Widget Bundle
@main
struct MeeshyWidgetBundle: WidgetBundle {
    var body: some Widget {
        RecentConversationsWidget()
        UnreadCountWidget()
        QuickReplyWidget()
        FavoriteContactsWidget()
        MyProfileLinkWidget()
        OutboxLiveActivity()
        CallLiveActivity()
        VoicePlaybackLiveActivity()
        VoiceRecordingLiveActivity()
    }
}
