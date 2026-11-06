import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les avis système d'une bulle (appel, arrivée, repli générique)

extension ThemedMessageBubble {

    @ViewBuilder
    func systemNotice(_ content: BubbleContent) -> some View {
        if let callNotice = content.callNotice {
            BubbleCallNoticeView(notice: callNotice, accentHex: contactColor, isDark: isDark, onCallBack: onCallBack, onLongPress: onLongPressCallDetail)
        } else if let joinNotice = content.joinNotice {
            // Une arrivée a sa propre notice : la notice générique a pour
            // icône un TÉLÉPHONE, héritée des résumés d'appel.
            BubbleJoinNoticeView(notice: joinNotice, isDark: isDark, onOpenProfile: onOpenParticipantProfile,
                                 timeString: content.meta.timeString, greeting: joinGreeting(joinNotice))
        } else {
            let text = content.text?.raw ?? message.content
            let line = message.arrivalsNotice == nil ? (sentence: text, invite: nil) : ArrivalGreeting.split(text)
            BubbleSystemNoticeView(text: line.sentence, isDark: isDark, timeString: content.meta.timeString,
                                   greeting: line.invite.flatMap(greeting(text:)))
        }
    }

    /// « dis-lui salut » (#16338) — l'invite du catalogue, offerte à tout
    /// lecteur sauf à l'arrivant lui-même et pour un visiteur sans pseudo.
    private func joinGreeting(_ notice: BubbleContent.JoinNotice) -> ArrivalGreetingInvite? {
        guard !message.isMe, !notice.isAnonymous, notice.username?.isEmpty == false else { return nil }
        let line = ConversationPreviewCatalog.strings()(.systemMembersArrivedOne, ["first": notice.displayName])
        return ArrivalGreeting.split(line).invite.flatMap(greeting(text:))
    }

    private func greeting(text: String) -> ArrivalGreetingInvite? {
        guard let onGreetArrivals else { return nil }
        let messageId = message.id
        return ArrivalGreetingInvite(text: text) { onGreetArrivals(messageId) }
    }
}
