import Foundation

/// L'icône d'un axe d'engagement — UNE table pour l'écran « Progression » et
/// pour la ligne de notification d'un badge (#8724) : « même mot, même icône »
/// (dimension 6). `ProgressionCopy.symbol(for:)` la délègue.
public extension EngagementAxisKey {
    var symbolName: String {
        switch self {
        case .audioMessage: return "mic.fill"
        case .textMessage: return "text.bubble.fill"
        case .post: return "doc.text.fill"
        case .story: return "camera.fill"
        case .reel: return "film.fill"
        case .audioComment: return "waveform"
        case .textComment: return "text.quote"
        case .privateConversation: return "person.fill"
        case .publicConversation: return "globe"
        case .communityConversation: return "person.3.fill"
        case .sticker: return "face.smiling.fill"
        case .inAppEdit: return "wand.and.stars"
        case .trackedLink: return "link.badge.plus"
        case .share: return "square.and.arrow.up.fill"
        case .inviteJoined: return "person.badge.plus.fill"
        case .friendship: return "person.2.fill"
        case .directPublish: return "paperplane.fill"
        case .reaction: return "heart.fill"
        case .attachment: return "paperclip"
        }
    }
}
