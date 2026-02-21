import Foundation
import SwiftUI
import MeeshySDK

// MARK: - Extracted from Models.swift

// MARK: - Sample Data Generator
struct SampleData {

    static let conversations: [Conversation] = [
        // Direct conversations - Pinned
        Conversation(
            identifier: "conv_alice",
            type: .direct,
            title: "Alice",
            lastMessageAt: Date(),
            unreadCount: 2,
            lastMessagePreview: "Hey, are you free?",
            tags: [
                ConversationTag(name: "Amis", color: "9B59B6"),
                ConversationTag(name: "Important", color: "FF6B6B")
            ],
            isPinned: true,
            sectionId: "friends",
            participantUserId: "user_alice",
            lastSeenAt: Date(),
            language: .english,
            theme: .social
        ),
        Conversation(
            identifier: "conv_bob",
            type: .direct,
            title: "Bob",
            lastMessageAt: Date().addingTimeInterval(-3600),
            unreadCount: 1,
            lastMessagePreview: "\u{1F4F7} Photo",
            tags: [
                ConversationTag(name: "Travail", color: "3498DB"),
                ConversationTag(name: "Projet", color: "F8B500"),
                ConversationTag(name: "Urgent", color: "E91E63")
            ],
            isPinned: true,
            sectionId: "work",
            participantUserId: "user_bob",
            lastSeenAt: Date().addingTimeInterval(-1800),
            language: .french,
            theme: .work
        ),
        Conversation(
            identifier: "conv_sarah",
            type: .direct,
            title: "Sarah",
            lastMessageAt: Date().addingTimeInterval(-3700),
            lastMessagePreview: "Can we meet?",
            tags: [
                ConversationTag(name: "Amis", color: "9B59B6")
            ],
            sectionId: "friends",
            participantUserId: "user_sarah",
            lastSeenAt: Date().addingTimeInterval(-7200),
            language: .spanish,
            theme: .social
        ),
        Conversation(
            identifier: "conv_john",
            type: .direct,
            title: "John",
            lastMessageAt: Date().addingTimeInterval(-14400),
            lastMessagePreview: "Thanks for the help!",
            sectionId: "work",
            participantUserId: "user_john",
            lastSeenAt: Date().addingTimeInterval(-86400),
            language: .german,
            theme: .general
        ),
        Conversation(
            identifier: "conv_emma",
            type: .direct,
            title: "Emma",
            lastMessageAt: Date().addingTimeInterval(-21600),
            lastMessagePreview: "\u{1F3B5} Voice message (0:42)",
            tags: [
                ConversationTag(name: "Famille", color: "2ECC71"),
                ConversationTag(name: "Perso", color: "4ECDC4")
            ],
            isPinned: true,
            sectionId: "family",
            participantUserId: "user_emma",
            lastSeenAt: Date().addingTimeInterval(-300),
            language: .french,
            theme: .food
        ),
        Conversation(
            identifier: "conv_tanaka",
            type: .direct,
            title: "\u{7530}\u{4E2D}\u{592A}\u{90CE}",
            lastMessageAt: Date().addingTimeInterval(-28000),
            unreadCount: 5,
            lastMessagePreview: "\u{3042}\u{308A}\u{304C}\u{3068}\u{3046}\u{3054}\u{3056}\u{3044}\u{307E}\u{3059}\u{FF01}",
            tags: [
                ConversationTag(name: "Tech", color: "45B7D1"),
                ConversationTag(name: "Travail", color: "3498DB"),
                ConversationTag(name: "Important", color: "FF6B6B"),
                ConversationTag(name: "Projet", color: "F8B500")
            ],
            sectionId: "work",
            language: .japanese,
            theme: .tech
        ),

        // Groups with various member counts
        Conversation(
            identifier: "conv_project_x",
            type: .group,
            title: "Project X - Final Sprint",
            isActive: false,
            memberCount: 8,
            lastMessageAt: Date().addingTimeInterval(-7200),
            lastMessagePreview: "Deadline tomorrow",
            tags: [
                ConversationTag(name: "Travail", color: "3498DB"),
                ConversationTag(name: "Urgent", color: "E91E63"),
                ConversationTag(name: "Projet", color: "F8B500"),
                ConversationTag(name: "Important", color: "FF6B6B"),
                ConversationTag(name: "Tech", color: "45B7D1")
            ],
            isPinned: true,
            sectionId: "groups",
            language: .english,
            theme: .work
        ),
        Conversation(
            identifier: "conv_dev_team",
            type: .group,
            title: "Dev Team",
            memberCount: 12,
            lastMessageAt: Date().addingTimeInterval(-7300),
            lastMessagePreview: "Sprint planning at 2pm",
            tags: [
                ConversationTag(name: "Tech", color: "45B7D1"),
                ConversationTag(name: "Travail", color: "3498DB")
            ],
            language: .english,
            theme: .tech
        ),
        Conversation(
            identifier: "conv_gaming_squad",
            type: .group,
            title: "Gaming Squad \u{1F3AE}",
            memberCount: 6,
            lastMessageAt: Date().addingTimeInterval(-25000),
            unreadCount: 23,
            lastMessagePreview: "GG! Next match?",
            tags: [
                ConversationTag(name: "Amis", color: "9B59B6")
            ],
            language: .english,
            theme: .gaming
        ),
        Conversation(
            identifier: "conv_famille_dupont",
            type: .group,
            title: "Famille Dupont - Vacances d'\u{00E9}t\u{00E9} 2024",
            memberCount: 15,
            lastMessageAt: Date().addingTimeInterval(-32000),
            lastMessagePreview: "J'ai r\u{00E9}serv\u{00E9} les billets!",
            tags: [
                ConversationTag(name: "Famille", color: "2ECC71"),
                ConversationTag(name: "Perso", color: "4ECDC4")
            ],
            language: .french,
            theme: .travel
        ),

        // Large communities
        Conversation(
            identifier: "conv_marketing",
            type: .community,
            title: "Marketing",
            memberCount: 45,
            lastMessageAt: Date().addingTimeInterval(-10800),
            lastMessagePreview: "New campaign ideas",
            language: .french,
            theme: .work
        ),
        Conversation(
            identifier: "conv_music_lovers",
            type: .community,
            title: "Music Lovers Worldwide \u{1F3B5}\u{1F30D}",
            memberCount: 234,
            lastMessageAt: Date().addingTimeInterval(-30000),
            unreadCount: 99,
            lastMessagePreview: "Check this new album!",
            language: .japanese,
            theme: .music
        ),
        Conversation(
            identifier: "conv_dev_francophone",
            type: .community,
            title: "Communaut\u{00E9} Francophone des D\u{00E9}veloppeurs iOS et Android - Paris & IDF",
            memberCount: 1250,
            lastMessageAt: Date().addingTimeInterval(-45000),
            lastMessagePreview: "Meetup ce weekend!",
            language: .french,
            theme: .tech
        ),
        Conversation(
            identifier: "conv_startup_founders",
            type: .community,
            title: "Global Startup Founders & Entrepreneurs Network",
            memberCount: 15420,
            lastMessageAt: Date().addingTimeInterval(-50000),
            unreadCount: 500,
            lastMessagePreview: "\u{1F680} Series A announced!",
            language: .english,
            theme: .work
        ),

        // Channels
        Conversation(
            identifier: "conv_announcements",
            type: .channel,
            title: "\u{1F4E2} Announcements",
            memberCount: 50000,
            lastMessageAt: Date().addingTimeInterval(-3600),
            lastMessagePreview: "Version 2.0 is live!",
            language: .english,
            theme: .general
        ),

        // Bot conversations
        Conversation(
            identifier: "conv_ai_assistant",
            type: .bot,
            title: "\u{1F916} AI Assistant",
            memberCount: 1,
            lastMessageAt: Date().addingTimeInterval(-120),
            lastMessagePreview: "How can I help you today?",
            language: .english,
            theme: .tech
        ),
    ]

    static let communities: [Community] = [
        // Short titles
        Community(identifier: "mshy_design", name: "Design", memberCount: 1250, conversationCount: 48, emoji: "\u{1F3A8}", color: "FF6B6B", theme: .art),
        Community(identifier: "mshy_swiftui", name: "SwiftUI", memberCount: 3420, conversationCount: 156, emoji: "\u{1F4F1}", color: "4ECDC4", theme: .tech),
        Community(identifier: "mshy_music", name: "Music", memberCount: 890, conversationCount: 32, emoji: "\u{1F3B5}", color: "9B59B6", theme: .music),

        // Medium titles
        Community(identifier: "mshy_travel_adventures", name: "Travel Adventures", memberCount: 2100, conversationCount: 87, emoji: "\u{2708}\u{FE0F}", color: "F8B500", theme: .travel),
        Community(identifier: "mshy_gaming_central", name: "Gaming Central", memberCount: 4500, conversationCount: 234, emoji: "\u{1F3AE}", color: "2ECC71", theme: .gaming),
        Community(identifier: "mshy_foodies_paradise", name: "Foodies Paradise", memberCount: 1800, conversationCount: 95, emoji: "\u{1F355}", color: "FF7F50", theme: .food),

        // Long titles (edge cases)
        Community(identifier: "mshy_photography_arts", name: "International Photography & Visual Arts Community", memberCount: 12500, conversationCount: 523, emoji: "\u{1F4F8}", color: "E91E63", theme: .art),
        Community(identifier: "mshy_dev_rn_flutter", name: "D\u{00E9}veloppeurs Francophones React Native & Flutter", memberCount: 8900, conversationCount: 312, emoji: "\u{269B}\u{FE0F}", color: "45B7D1", theme: .tech),
        Community(identifier: "mshy_startup_founders", name: "Startup Founders & Tech Entrepreneurs Worldwide", memberCount: 25000, conversationCount: 1250, emoji: "\u{1F680}", color: "9B59B6", theme: .work),

        // Very long titles
        Community(identifier: "mshy_ai_francophone", name: "Communaut\u{00E9} Francophone des Passionn\u{00E9}s d'Intelligence Artificielle", memberCount: 45000, conversationCount: 2340, emoji: "\u{1F916}", color: "00CED1", theme: .tech),
        Community(identifier: "mshy_digital_nomads", name: "European Digital Nomads & Remote Workers Association", memberCount: 78000, conversationCount: 4521, emoji: "\u{1F30D}", color: "2ECC71", theme: .travel),

        // Edge case: Very large numbers
        Community(identifier: "mshy_global_news", name: "Global News", memberCount: 1500000, conversationCount: 50000, emoji: "\u{1F4F0}", color: "3498DB", theme: .general),
        Community(identifier: "mshy_music_fans", name: "Music Fans", memberCount: 999999, conversationCount: 99999, emoji: "\u{1F3B8}", color: "E74C3C", theme: .music),

        // Edge case: Small numbers
        Community(identifier: "mshy_vip_club", name: "VIP Club", memberCount: 3, conversationCount: 1, emoji: "\u{2B50}", color: "F8B500", theme: .social),
        Community(identifier: "mshy_beta_testers", name: "Beta Testers", memberCount: 12, conversationCount: 5, emoji: "\u{1F9EA}", color: "9B59B6", theme: .tech),
    ]

    static let feedItems: [FeedItem] = [
        FeedItem(author: "Alice", content: "Just posted a new photo!", likes: 42, color: "FF6B6B"),
        FeedItem(author: "Design Team", content: "New UI concepts are ready for review", likes: 128, color: "4ECDC4"),
        FeedItem(author: "Bob", content: "Check out this cool article about SwiftUI", likes: 67, color: "9B59B6"),
        FeedItem(author: "Sarah", content: "Working on something exciting!", likes: 23, color: "F8B500"),
        FeedItem(author: "Dev Community", content: "New Swift 6 features announced", likes: 512, color: "E91E63"),
        FeedItem(author: "Emma", content: "Coffee break anyone? \u{2615}", likes: 89, color: "45B7D1"),
    ]

    // Convenience alias used by ConversationPreviewView
    static func messages(conversationId: String) -> [Message] {
        sampleMessages(conversationId: conversationId, contactColor: "4ECDC4")
    }

    // Sample messages with various types
    static func sampleMessages(conversationId: String = "sample_conv", contactColor: String) -> [Message] {
        [
            // Regular text messages
            Message(conversationId: conversationId, content: "Hey! How are you?", createdAt: Date().addingTimeInterval(-600), isMe: false),

            Message(conversationId: conversationId, content: "I'm good! Working on the app", createdAt: Date().addingTimeInterval(-550), isMe: true),

            // Message with reply
            Message(
                conversationId: conversationId,
                content: "That sounds great! Keep it up \u{1F4AA}",
                createdAt: Date().addingTimeInterval(-500),
                replyTo: ReplyReference(authorName: "Me", previewText: "I'm good! Working on the app", isMe: true),
                isMe: false
            ),

            // Image attachment
            Message(
                conversationId: conversationId,
                content: "Check out this design I made!",
                createdAt: Date().addingTimeInterval(-450),
                attachments: [.image(color: "4ECDC4")],
                isMe: true
            ),

            // Reply to image
            Message(
                conversationId: conversationId,
                content: "Wow! This looks amazing \u{1F60D}",
                createdAt: Date().addingTimeInterval(-400),
                replyTo: ReplyReference(authorName: "Me", previewText: "\u{1F4F7} Photo", isMe: true),
                isMe: false
            ),

            // Voice message
            Message(
                conversationId: conversationId,
                content: "",
                messageType: .audio,
                createdAt: Date().addingTimeInterval(-350),
                attachments: [.audio(durationMs: 42000, color: contactColor)],
                isMe: false
            ),

            // Reply to voice message
            Message(
                conversationId: conversationId,
                content: "Got it, will do!",
                createdAt: Date().addingTimeInterval(-300),
                replyTo: ReplyReference(authorName: "Contact", previewText: "\u{1F3B5} Voice message (0:42)", isMe: false, authorColor: contactColor),
                isMe: true
            ),

            // File attachment
            Message(
                conversationId: conversationId,
                content: "Here's the document you asked for",
                messageType: .file,
                createdAt: Date().addingTimeInterval(-250),
                attachments: [.file(name: "Project_Brief.pdf", size: 2457600, color: "F8B500")],
                isMe: true
            ),

            // Video attachment
            Message(
                conversationId: conversationId,
                content: "Look at this funny video \u{1F602}",
                messageType: .video,
                createdAt: Date().addingTimeInterval(-200),
                attachments: [.video(durationMs: 83000, color: "FF6B6B")],
                isMe: false
            ),

            // Location share
            Message(
                conversationId: conversationId,
                content: "I'm here!",
                messageType: .location,
                createdAt: Date().addingTimeInterval(-150),
                attachments: [.location(latitude: 48.8566, longitude: 2.3522, color: "2ECC71")],
                isMe: false
            ),

            // Message with reactions (using ReactionSummary for display)
            Message(
                conversationId: conversationId,
                content: "Let's meet at 5pm then?",
                createdAt: Date().addingTimeInterval(-100),
                isMe: true
            ),

            // Long message
            Message(
                conversationId: conversationId,
                content: "By the way, I've been thinking about what we discussed yesterday. I think we should definitely go with option B because it provides more flexibility and scalability for future updates. What do you think?",
                createdAt: Date().addingTimeInterval(-50),
                isMe: false
            ),

            Message(conversationId: conversationId, content: "Yes! Totally agree \u{1F389}", createdAt: Date().addingTimeInterval(-10), isMe: true),
        ]
    }
}
