//
//  MessageGrouper.swift
//  Meeshy
//
//  Groups messages by date and sender for efficient display
//  iOS 16+
//

import Foundation

final class MessageGrouper {
    // MARK: - Group Messages by Date

    static func groupByDate(_ messages: [Message]) -> [DateGroup] {
        let calendar = Calendar.current
        var groups: [DateGroup] = []
        var currentDate: Date?
        var currentMessages: [Message] = []

        // Sort messages by date (oldest first)
        let sortedMessages = messages.sorted { $0.createdAt < $1.createdAt }

        for message in sortedMessages {
            let messageDate = calendar.startOfDay(for: message.createdAt)

            if currentDate == nil {
                currentDate = messageDate
                currentMessages.append(message)
            } else if currentDate == messageDate {
                currentMessages.append(message)
            } else {
                if let date = currentDate {
                    groups.append(DateGroup(date: date, messages: currentMessages))
                }
                currentDate = messageDate
                currentMessages = [message]
            }
        }

        // Add remaining messages
        if let date = currentDate, !currentMessages.isEmpty {
            groups.append(DateGroup(date: date, messages: currentMessages))
        }

        return groups
    }

    // MARK: - Group Messages by Sender

    static func groupBySender(_ messages: [Message]) -> [SenderGroup] {
        var groups: [SenderGroup] = []
        var currentSenderId: String?
        var currentMessages: [Message] = []

        for message in messages {
            if currentSenderId == nil {
                currentSenderId = message.senderId
                currentMessages.append(message)
            } else if currentSenderId == message.senderId {
                // Check if messages are close enough in time (within 2 minutes)
                if let lastMessage = currentMessages.last,
                   message.createdAt.timeIntervalSince(lastMessage.createdAt) <= 120 {
                    currentMessages.append(message)
                } else {
                    // Start new group if too much time has passed
                    if let senderId = currentSenderId {
                        groups.append(SenderGroup(
                            senderId: senderId,
                            senderName: currentMessages.first?.sender?.displayName ?? currentMessages.first?.sender?.username ?? "Utilisateur",
                            messages: currentMessages
                        ))
                    }
                    currentSenderId = message.senderId
                    currentMessages = [message]
                }
            } else {
                // Different sender, create new group
                if let senderId = currentSenderId {
                    groups.append(SenderGroup(
                        senderId: senderId,
                        senderName: currentMessages.first?.sender?.displayName ?? currentMessages.first?.sender?.username ?? "Utilisateur",
                        messages: currentMessages
                    ))
                }
                currentSenderId = message.senderId
                currentMessages = [message]
            }
        }

        // Add remaining messages
        if let senderId = currentSenderId, !currentMessages.isEmpty {
            groups.append(SenderGroup(
                senderId: senderId,
                senderName: currentMessages.first?.sender?.displayName ?? currentMessages.first?.sender?.username ?? "Utilisateur",
                messages: currentMessages
            ))
        }

        return groups
    }

    // MARK: - Determine Display Properties

    static func shouldShowAvatar(for message: Message, in messages: [Message]) -> Bool {
        guard let index = messages.firstIndex(where: { $0.id == message.id }) else {
            return true
        }

        // Show avatar if it's the last message from this sender in sequence
        if index == messages.count - 1 {
            return true
        }

        let nextMessage = messages[index + 1]

        // Show avatar if next message is from different sender
        if nextMessage.senderId != message.senderId {
            return true
        }

        // Show avatar if there's a significant time gap
        if nextMessage.createdAt.timeIntervalSince(message.createdAt) > 120 {
            return true
        }

        return false
    }

    static func shouldShowSenderName(for message: Message, in messages: [Message]) -> Bool {
        guard let index = messages.firstIndex(where: { $0.id == message.id }) else {
            return true
        }

        // Show sender name if it's the first message from this sender in sequence
        if index == 0 {
            return true
        }

        let previousMessage = messages[index - 1]

        // Show sender name if previous message is from different sender
        if previousMessage.senderId != message.senderId {
            return true
        }

        // Show sender name if there's a significant time gap
        if message.createdAt.timeIntervalSince(previousMessage.createdAt) > 120 {
            return true
        }

        return false
    }

    static func shouldShowTimestamp(for message: Message, in messages: [Message]) -> Bool {
        guard let index = messages.firstIndex(where: { $0.id == message.id }) else {
            return true
        }

        // Always show timestamp for the last message
        if index == messages.count - 1 {
            return true
        }

        let nextMessage = messages[index + 1]

        // Show timestamp if next message is from different sender
        if nextMessage.senderId != message.senderId {
            return true
        }

        // Show timestamp if there's a time gap of more than 5 minutes
        if nextMessage.createdAt.timeIntervalSince(message.createdAt) > 300 {
            return true
        }

        return false
    }

    // MARK: - Message Spacing

    static func spacing(between message: Message, and nextMessage: Message) -> CGFloat {
        // Different sender - larger spacing
        if message.senderId != nextMessage.senderId {
            return 16
        }

        // Same sender within 1 minute - minimal spacing
        if nextMessage.createdAt.timeIntervalSince(message.createdAt) <= 60 {
            return 2
        }

        // Same sender but more time passed - medium spacing
        if nextMessage.createdAt.timeIntervalSince(message.createdAt) <= 300 {
            return 8
        }

        // Large time gap - larger spacing
        return 16
    }
}

// MARK: - Date Group Model

struct DateGroup: Identifiable {
    let id: String
    let date: Date
    let messages: [Message]

    init(id: String = UUID().uuidString, date: Date, messages: [Message]) {
        self.id = id
        self.date = date
        self.messages = messages
    }

    var dateString: String {
        let calendar = Calendar.current
        let now = Date()

        if calendar.isDateInToday(date) {
            return "Today"
        } else if calendar.isDateInYesterday(date) {
            return "Yesterday"
        } else if calendar.isDate(date, equalTo: now, toGranularity: .weekOfYear) {
            let formatter = DateFormatter()
            formatter.dateFormat = "EEEE"
            return formatter.string(from: date)
        } else if calendar.isDate(date, equalTo: now, toGranularity: .year) {
            let formatter = DateFormatter()
            formatter.dateFormat = "MMMM d"
            return formatter.string(from: date)
        } else {
            let formatter = DateFormatter()
            formatter.dateFormat = "MMMM d, yyyy"
            return formatter.string(from: date)
        }
    }
}

// MARK: - Sender Group Model

struct SenderGroup: Identifiable {
    let id: String
    let senderId: String
    let senderName: String
    let messages: [Message]

    init(
        id: String = UUID().uuidString,
        senderId: String,
        senderName: String,
        messages: [Message]
    ) {
        self.id = id
        self.senderId = senderId
        self.senderName = senderName
        self.messages = messages
    }
}

// MARK: - Date Extensions

extension Date {
    var relativeTimeString: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: self, relativeTo: Date())
    }

    var shortTimeString: String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: self)
    }

    var mediumDateString: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter.string(from: self)
    }

    var fullDateTimeString: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: self)
    }
}
