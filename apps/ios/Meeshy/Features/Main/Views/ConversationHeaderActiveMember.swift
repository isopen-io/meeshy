import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - Active Member (for conversation detail header)

/// L'un des trois participants les plus actifs, en avatar dans l'en-tête.
///
/// La pile est une MISE EN AVANT de ces personnes (directive porteur
/// 2026-09-24, #7831) : chacune porte donc l'identité avec laquelle sa fiche
/// s'ouvre — construite par `ProfileSheetUser.from(message:)`, exactement
/// comme l'avatar d'une bulle, pour qu'un visiteur sans compte mène à sa fiche
/// de participation et jamais à un compte qui n'existe pas.
struct ConversationActiveMember: Identifiable {
    let id: String
    let name: String
    let color: String
    let avatarURL: String?
    let profile: ProfileSheetUser

    static func ranked(from messages: [Message], fallbackColor: String, limit: Int = 3) -> [ConversationActiveMember] {
        let tally = messages
            .filter { !$0.isMe && !$0.senderId.isEmpty }
            .reduce(into: [String: (first: Message, count: Int)]()) { tally, message in
                let current = tally[message.senderId]
                tally[message.senderId] = (current?.first ?? message, (current?.count ?? 0) + 1)
            }
        return tally
            .sorted { $0.value.count > $1.value.count }
            .prefix(limit)
            .map { senderId, entry in
                ConversationActiveMember(
                    id: senderId,
                    name: entry.first.senderName ?? "?",
                    color: entry.first.senderColor ?? fallbackColor,
                    avatarURL: entry.first.senderAvatarURL,
                    profile: .from(message: entry.first)
                )
            }
    }
}

// MARK: - Tap

/// Ce qu'ouvre le toucher d'un avatar de la pile : la story tant qu'elle n'a
/// pas été vue, sinon le profil de la personne.
enum ConversationHeaderMemberTap: Equatable {
    case story
    case profile

    static func resolve(storyState: StoryRingState) -> ConversationHeaderMemberTap {
        storyState == .unread ? .story : .profile
    }
}

// MARK: - Long press

/// Les entrées de l'appui long, dans l'ordre où elles se lisent.
enum ConversationHeaderMemberMenuEntry: Equatable {
    case viewStory
    case viewProfile
    case conversationDetails
    case sendMessage

    static func entries(storyState: StoryRingState) -> [ConversationHeaderMemberMenuEntry] {
        let story: [ConversationHeaderMemberMenuEntry] = storyState == .none ? [] : [.viewStory]
        return story + [.viewProfile, .conversationDetails, .sendMessage]
    }
}
