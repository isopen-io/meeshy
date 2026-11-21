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
        ClosePeopleWidget()
        MeeshyLiveActivityBundle().body
    }
}

/// Les activités en direct, dans leur propre groupe : un constructeur de groupe ne prend qu'un nombre borné d'éléments.
struct MeeshyLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        OutboxLiveActivity()
        CallLiveActivity()
        VoicePlaybackLiveActivity()
        VoiceRecordingLiveActivity()
        LocationShareLiveActivity()
    }
}
