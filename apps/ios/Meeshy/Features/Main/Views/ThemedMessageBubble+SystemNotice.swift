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
                                 timeString: content.meta.timeString, greeting: greeting(content))
        } else {
            let text = content.text?.raw ?? message.content
            let sentence = content.arrivalsInvite == nil ? text : ArrivalGreeting.split(text).sentence
            BubbleSystemNoticeView(text: sentence, isDark: isDark, timeString: content.meta.timeString, greeting: greeting(content))
        }
    }

    /// « dis-lui salut » (#16338) — l'invite que porte le modèle, en couleur de la conversation.
    private func greeting(_ content: BubbleContent) -> ArrivalGreetingInvite? {
        guard let onGreetArrivals, let invite = content.arrivalsInvite else { return nil }
        let messageId = message.id
        return ArrivalGreetingInvite(text: invite, accentColor: contactColor) { onGreetArrivals(messageId) }
    }
}
