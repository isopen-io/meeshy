import Foundation

// MARK: - Sample Data for Previews and Development

public struct SampleData {

    // MARK: - Sample Conversations

    public static let conversations: [Conversation] = [
        Conversation(identifier: "marie_dupont", type: .direct, title: "Marie Dupont",
                     avatar: nil, memberCount: 2, lastMessageAt: Date().addingTimeInterval(-300),
                     unreadCount: 3, lastMessagePreview: "Tu as vu le nouveau projet ?",
                     language: .french, theme: .work),
        Conversation(identifier: "dev_team", type: .group, title: "Equipe Dev",
                     avatar: nil, memberCount: 8, lastMessageAt: Date().addingTimeInterval(-600),
                     unreadCount: 12, lastMessagePreview: "Le deploy est passe !",
                     language: .french, theme: .tech),
        Conversation(identifier: "famille", type: .group, title: "Famille",
                     avatar: nil, memberCount: 5, lastMessageAt: Date().addingTimeInterval(-1800),
                     unreadCount: 0, lastMessagePreview: "A dimanche !",
                     language: .french, theme: .general),
        Conversation(identifier: "global_chat", type: .public, title: "Global Chat",
                     avatar: nil, memberCount: 234, lastMessageAt: Date().addingTimeInterval(-60),
                     unreadCount: 45, lastMessagePreview: "Welcome everyone!",
                     language: .english, theme: .social),
        Conversation(identifier: "gaming_squad", type: .group, title: "Gaming Squad",
                     avatar: nil, memberCount: 4, lastMessageAt: Date().addingTimeInterval(-3600),
                     unreadCount: 7, lastMessagePreview: "GG bien joue !",
                     language: .french, theme: .gaming),
    ]

    // MARK: - Sample Communities

    public static let communities: [Community] = [
        Community(identifier: "meeshy_official", name: "Meeshy Officiel",
                  description: "La communaute officielle Meeshy", memberCount: 1500,
                  conversationCount: 12, emoji: "M", color: "4ECDC4"),
        Community(identifier: "dev_hub", name: "Dev Hub",
                  description: "Pour les developpeurs", memberCount: 340,
                  conversationCount: 8, emoji: "D", color: "3498DB", theme: .tech),
        Community(identifier: "music_lovers", name: "Music Lovers",
                  description: "Partagez votre musique", memberCount: 890,
                  conversationCount: 15, emoji: "M", color: "9B59B6", theme: .music),
    ]

    // MARK: - Sample Messages

    public static func messages(conversationId: String = "sample") -> [Message] {
        [
            Message(conversationId: conversationId, senderId: "user1", content: "Salut ! Comment ca va ?",
                    createdAt: Date().addingTimeInterval(-3600), isMe: false),
            Message(conversationId: conversationId, senderId: "me", content: "Ca va bien merci, et toi ?",
                    createdAt: Date().addingTimeInterval(-3500), isMe: true),
            Message(conversationId: conversationId, senderId: "user1", content: "Super ! Tu as vu le nouveau design ?",
                    createdAt: Date().addingTimeInterval(-3400), isMe: false),
            Message(conversationId: conversationId, senderId: "me", content: "Oui c'est vraiment cool !",
                    createdAt: Date().addingTimeInterval(-3300), isMe: true),
            Message(conversationId: conversationId, senderId: "user1",
                    content: "On se retrouve demain pour en parler ?",
                    createdAt: Date().addingTimeInterval(-300), isMe: false),
        ]
    }

    // MARK: - Sample Feed Posts

    public static let feedPosts: [FeedPost] = [
        FeedPost(author: "Marie", content: "Premier jour sur Meeshy !", likes: 12,
                 media: [.image(color: "FF6B6B")]),
        FeedPost(author: "Thomas", content: "Check ce nouveau morceau",
                 likes: 45, media: [.audio(duration: 240)]),
        FeedPost(author: "Sophie", content: "Le coucher de soleil ce soir...",
                 likes: 89, commentCount: 15, media: [.image(color: "F39C12")]),
        FeedPost(author: "Lucas", content: "Nouveau projet open source ! Venez contribuer",
                 likes: 23),
    ]
}
