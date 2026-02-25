import Foundation
import MeeshySDK

// MARK: - Profile Sheet User

public struct ProfileSheetUser: Identifiable {
    public var id: String { userId ?? username }
    public let userId: String?
    public let username: String
    public let displayName: String?
    public let avatarURL: String?
    public let accentColor: String
    public let bio: String?
    public let systemLanguage: String?
    public let regionalLanguage: String?
    public let isOnline: Bool?
    public let lastActiveAt: Date?
    public let createdAt: Date?
    public let bannerURL: String?

    public init(
        userId: String? = nil, username: String, displayName: String? = nil,
        avatarURL: String? = nil, accentColor: String = "",
        bio: String? = nil, systemLanguage: String? = nil, regionalLanguage: String? = nil,
        isOnline: Bool? = nil, lastActiveAt: Date? = nil,
        createdAt: Date? = nil, bannerURL: String? = nil
    ) {
        self.userId = userId
        self.username = username
        self.displayName = displayName
        self.avatarURL = avatarURL
        self.accentColor = accentColor.isEmpty ? DynamicColorGenerator.colorForName(username) : accentColor
        self.bio = bio
        self.systemLanguage = systemLanguage
        self.regionalLanguage = regionalLanguage
        self.isOnline = isOnline
        self.lastActiveAt = lastActiveAt
        self.createdAt = createdAt
        self.bannerURL = bannerURL
    }

    public var resolvedDisplayName: String {
        displayName ?? username
    }
}

// MARK: - Factory Methods

extension ProfileSheetUser {

    public static func from(message: MeeshyMessage) -> ProfileSheetUser {
        ProfileSheetUser(
            userId: message.senderId,
            username: message.senderName ?? "?",
            avatarURL: message.senderAvatarURL,
            accentColor: message.senderColor ?? ""
        )
    }

    public static func from(storyGroup: StoryGroup) -> ProfileSheetUser {
        ProfileSheetUser(
            userId: storyGroup.id,
            username: storyGroup.username,
            avatarURL: storyGroup.avatarURL,
            accentColor: storyGroup.avatarColor
        )
    }

    public static func from(feedPost: FeedPost) -> ProfileSheetUser {
        ProfileSheetUser(
            userId: feedPost.authorId.isEmpty ? nil : feedPost.authorId,
            username: feedPost.author,
            avatarURL: feedPost.authorAvatarURL,
            accentColor: feedPost.authorColor
        )
    }

    public static func from(feedComment: FeedComment) -> ProfileSheetUser {
        ProfileSheetUser(
            userId: feedComment.authorId.isEmpty ? nil : feedComment.authorId,
            username: feedComment.author,
            avatarURL: feedComment.authorAvatarURL,
            accentColor: feedComment.authorColor
        )
    }

    public static func from(conversation: MeeshyConversation) -> ProfileSheetUser? {
        guard conversation.type == .direct, let participantId = conversation.participantUserId else {
            return nil
        }
        return ProfileSheetUser(
            userId: participantId,
            username: conversation.name,
            avatarURL: conversation.participantAvatarURL,
            accentColor: conversation.accentColor
        )
    }

    public static func from(user: MeeshyUser) -> ProfileSheetUser {
        let lastActive: Date? = {
            guard let str = user.lastActiveAt else { return nil }
            let fmt = ISO8601DateFormatter()
            fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return fmt.date(from: str) ?? {
                fmt.formatOptions = [.withInternetDateTime]
                return fmt.date(from: str)
            }()
        }()

        let createdAt: Date? = {
            guard let str = user.createdAt else { return nil }
            let fmt = ISO8601DateFormatter()
            fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return fmt.date(from: str) ?? {
                fmt.formatOptions = [.withInternetDateTime]
                return fmt.date(from: str)
            }()
        }()

        let resolvedDisplayName: String? = user.displayName ?? {
            let parts = [user.firstName, user.lastName].compactMap { $0 }.filter { !$0.isEmpty }
            return parts.isEmpty ? nil : parts.joined(separator: " ")
        }()

        return ProfileSheetUser(
            userId: user.id,
            username: user.username,
            displayName: resolvedDisplayName,
            avatarURL: user.avatar,
            accentColor: "",
            bio: user.bio,
            systemLanguage: user.systemLanguage,
            regionalLanguage: user.regionalLanguage,
            isOnline: user.isOnline,
            lastActiveAt: lastActive,
            createdAt: createdAt,
            bannerURL: user.banner
        )
    }
}
