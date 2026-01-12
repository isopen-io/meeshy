//
//  MockDataGenerator.swift
//  MeeshyTests
//
//  Generates mock data for testing
//

import Foundation
@testable import Meeshy

struct MockDataGenerator {
    // MARK: - User Generation

    static func createUser(
        id: String = UUID().uuidString,
        email: String = "test@meeshy.me",
        username: String = "testuser",
        displayName: String? = "Test User",
        avatar: String? = nil,
        language: String = "en",
        isOnline: Bool = true
    ) -> User {
        return User(
            id: id,
            username: username,
            email: email,
            displayName: displayName,
            avatar: avatar,
            isOnline: isOnline,
            lastActiveAt: Date(),
            systemLanguage: language
        )
    }

    static func createUsers(count: Int) -> [User] {
        return (0..<count).map { index in
            createUser(
                id: "user-\(index)",
                email: "user\(index)@meeshy.me",
                username: "user\(index)",
                displayName: "User \(index)"
            )
        }
    }

    // MARK: - Message Generation

    static func createMessage(
        id: String = UUID().uuidString,
        conversationId: String = "conv-1",
        senderId: String = "user-1",
        content: String = "Test message",
        type: Message.MessageType = .text,
        status: Message.MessageStatus = .sent,
        attachments: [Attachment] = [],
        translations: [Translation] = [],
        readBy: [String] = [],
        isEdited: Bool = false,
        editedAt: Date? = nil,
        replyTo: String? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        localId: UUID? = nil,
        isSending: Bool = false,
        sendError: String? = nil
    ) -> Message {
        return Message(
            id: id,
            conversationId: conversationId,
            senderId: senderId,
            content: content,
            type: type,
            status: status,
            attachments: attachments,
            translations: translations,
            readBy: readBy,
            isEdited: isEdited,
            editedAt: editedAt,
            replyTo: replyTo,
            createdAt: createdAt,
            updatedAt: updatedAt,
            localId: localId,
            isSending: isSending,
            sendError: sendError
        )
    }

    static func createMessages(count: Int, conversationId: String = "conv-1") -> [Message] {
        return (0..<count).map { index in
            createMessage(
                id: "msg-\(index)",
                conversationId: conversationId,
                senderId: "user-\(index % 3)",
                content: "Message \(index)",
                createdAt: Date().addingTimeInterval(TimeInterval(-count + index) * 60)
            )
        }
    }

    // MARK: - Conversation Generation

    static func createConversation(
        id: String = UUID().uuidString,
        title: String? = nil,
        type: Conversation.ConversationType = .direct,
        participants: [User] = [],
        lastMessage: Message? = nil,
        unreadCount: Int = 0,
        isMuted: Bool = false,
        isArchived: Bool = false,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) -> Conversation {
        let finalParticipants = participants.isEmpty ? createUsers(count: 2) : participants
        return Conversation(
            id: id,
            title: title,
            type: type,
            participants: finalParticipants,
            lastMessage: lastMessage,
            unreadCount: unreadCount,
            isMuted: isMuted,
            isArchived: isArchived,
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }

    static func createConversations(count: Int) -> [Conversation] {
        return (0..<count).map { index in
            let participants = createUsers(count: 2)
            let lastMessage = createMessage(
                conversationId: "conv-\(index)",
                content: "Last message \(index)"
            )
            return createConversation(
                id: "conv-\(index)",
                title: "Conversation \(index)",
                participants: participants,
                lastMessage: lastMessage,
                unreadCount: index % 5
            )
        }
    }

    // MARK: - Attachment Generation

    static func createAttachment(
        id: String = UUID().uuidString,
        messageId: String = "msg-1",
        type: Attachment.AttachmentType = .image,
        url: String = "https://example.com/image.jpg",
        thumbnailUrl: String? = "https://example.com/thumb.jpg",
        filename: String = "image.jpg",
        mimeType: String = "image/jpeg",
        size: Int64 = 1024,
        width: Int? = 800,
        height: Int? = 600,
        duration: TimeInterval? = nil
    ) -> Attachment {
        return Attachment(
            id: id,
            messageId: messageId,
            type: type,
            url: url,
            thumbnailUrl: thumbnailUrl,
            filename: filename,
            mimeType: mimeType,
            size: size,
            width: width,
            height: height,
            duration: duration,
            createdAt: Date()
        )
    }

    // MARK: - Translation Generation

    static func createTranslation(
        id: String = UUID().uuidString,
        messageId: String = "msg-1",
        originalText: String = "Hello",
        translatedText: String = "Hola",
        sourceLanguage: String = "en",
        targetLanguage: String = "es",
        confidence: Double = 0.95
    ) -> Translation {
        return Translation(
            id: id,
            messageId: messageId,
            originalText: originalText,
            translatedText: translatedText,
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage,
            confidence: confidence,
            createdAt: Date()
        )
    }

    // MARK: - Call Generation

    static func createCall(
        id: String = UUID().uuidString,
        conversationId: String = "conv-1",
        callerId: String = "user-1",
        participants: [String] = ["user-1", "user-2"],
        type: Call.CallType = .video,
        status: Call.CallStatus = .ringing,
        startedAt: Date? = nil,
        endedAt: Date? = nil,
        duration: TimeInterval? = nil
    ) -> Call {
        return Call(
            id: id,
            conversationId: conversationId,
            callerId: callerId,
            participants: participants,
            type: type,
            status: status,
            startedAt: startedAt,
            endedAt: endedAt,
            duration: duration,
            createdAt: Date()
        )
    }

    // MARK: - Notification Generation

    static func createNotification(
        id: String = UUID().uuidString,
        type: MeeshyNotification.NotificationType = .message,
        title: String = "New Message",
        body: String = "You have a new message",
        data: [String: Any] = [:],
        isRead: Bool = false,
        createdAt: Date = Date()
    ) -> MeeshyNotification {
        return MeeshyNotification(
            id: id,
            type: type,
            title: title,
            body: body,
            data: data,
            isRead: isRead,
            createdAt: createdAt
        )
    }

    // MARK: - Large Dataset Generation (Performance Testing)

    static func createLargeMessageSet(count: Int = 1000) -> [Message] {
        return createMessages(count: count)
    }

    static func createLargeConversationSet(count: Int = 100) -> [Conversation] {
        return createConversations(count: count)
    }

    // MARK: - Edge Case Generation

    static func createEmptyMessage() -> Message {
        return createMessage(content: "")
    }

    static func createLongMessage() -> Message {
        let longText = String(repeating: "Lorem ipsum dolor sit amet. ", count: 100)
        return createMessage(content: longText)
    }

    static func createMessageWithSpecialCharacters() -> Message {
        return createMessage(content: "Test 🎉 émojis & spëcial çhars: <>&\"'")
    }

    static func createMessageWithMention() -> Message {
        return createMessage(content: "Hey @user123, check this out!")
    }

    static func createMessageWithURL() -> Message {
        return createMessage(content: "Check out https://meeshy.me for more info")
    }

    static func createFailedMessage() -> Message {
        return createMessage(
            status: .failed,
            isSending: false,
            sendError: "Network error"
        )
    }

    static func createPendingMessage() -> Message {
        return createMessage(
            status: .pending,
            isSending: true
        )
    }
}
