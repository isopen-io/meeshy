import Foundation
import MeeshySDK

/// Libellé localisé du type de conversation — site unique. Recopié à
/// l'identique dans quatre vues (`InviteFriendsSheet`, `SharePickerView`,
/// `GlobalSearchView`, `ConversationInfoSheet`) avant ce dédoublonnage ; les
/// quatre appelaient les mêmes huit clés `conversation.type.*`.
extension MeeshyConversation.ConversationType {
    var displayName: String {
        switch self {
        case .direct: String(localized: "conversation.type.direct", defaultValue: "Direct", bundle: .main)
        case .group: String(localized: "conversation.type.group", defaultValue: "Groupe", bundle: .main)
        case .public: String(localized: "conversation.type.public", defaultValue: "Public", bundle: .main)
        case .global: String(localized: "conversation.type.global", defaultValue: "Global", bundle: .main)
        case .community: String(localized: "conversation.type.community", defaultValue: "Communaute", bundle: .main)
        case .channel: String(localized: "conversation.type.channel", defaultValue: "Channel", bundle: .main)
        case .bot: String(localized: "conversation.type.bot", defaultValue: "Bot", bundle: .main)
        case .broadcast: String(localized: "conversation.type.broadcast", defaultValue: "Communication", bundle: .main)
        }
    }
}
