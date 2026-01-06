//
//  NotificationRowView.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import SwiftUI

struct NotificationRowView: View {
    let notification: MeeshyNotification

    var body: some View {
        HStack(spacing: 12) {
            // Left icon
            notificationIcon

            // Content
            VStack(alignment: .leading, spacing: 4) {
                Text(notification.title)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.primary)
                    .lineLimit(1)

                Text(notification.content)
                    .font(.system(size: 15))
                    .foregroundColor(.secondary)
                    .lineLimit(2)

                Text(notification.timeAgo)
                    .font(.system(size: 13))
                    .foregroundColor(.gray)
            }

            Spacer()

            // Right side
            HStack(spacing: 8) {
                if !notification.isRead {
                    Circle()
                        .fill(Color.blue)
                        .frame(width: 8, height: 8)
                }

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.gray)
            }
        }
        .padding(.vertical, 8)
        .frame(minHeight: 68)
        .background(notification.isRead ? Color.clear : Color.blue.opacity(0.05))
        .contextMenu {
            contextMenuItems
        }
    }

    // MARK: - Notification Icon

    private var notificationIcon: some View {
        ZStack {
            Circle()
                .fill(iconBackgroundColor)
                .frame(width: 40, height: 40)

            Image(systemName: notification.type.iconName)
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(.white)
        }
    }

    private var iconBackgroundColor: Color {
        switch notification.type.iconColor {
        case "blue": return .blue
        case "orange": return .orange
        case "green": return .green
        case "gray": return .gray
        default: return .blue
        }
    }

    // MARK: - Context Menu

    private var contextMenuItems: some View {
        Group {
            if !notification.isRead {
                Button {
                    Task {
                        await markAsRead()
                    }
                } label: {
                    Label("Mark as Read", systemImage: "checkmark")
                }
            }

            Button(role: .destructive) {
                Task {
                    await deleteNotification()
                }
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    // MARK: - Actions

    private func markAsRead() async {
        NotificationCenter.default.post(
            name: .markNotificationAsRead,
            object: nil,
            userInfo: ["notificationId": notification.id]
        )
    }

    private func deleteNotification() async {
        // Handle via parent view's swipe action
    }
}

#Preview {
    List {
        NotificationRowView(
            notification: MeeshyNotification(
                id: "1",
                userId: "current_user",
                type: .newMessage,
                title: "New message from Alice",
                content: "Hey! Are you coming to the meeting today? We need to discuss the new features.",
                data: nil,
                priority: .high,
                isRead: false,
                emailSent: false,
                pushSent: true,
                expiresAt: nil,
                senderId: "user1",
                senderUsername: "Alice Johnson",
                senderAvatar: nil,
                messagePreview: "Hey! Are you coming...",
                conversationId: "conv1",
                messageId: "msg1",
                callSessionId: nil,
                createdAt: Date().addingTimeInterval(-300)
            )
        )

        NotificationRowView(
            notification: MeeshyNotification(
                id: "2",
                userId: "current_user",
                type: .missedCall,
                title: "Missed call from Bob",
                content: "Audio call at 2:30 PM",
                data: nil,
                priority: .normal,
                isRead: true,
                emailSent: false,
                pushSent: true,
                expiresAt: nil,
                senderId: "user2",
                senderUsername: "Bob Smith",
                senderAvatar: nil,
                messagePreview: nil,
                conversationId: nil,
                messageId: nil,
                callSessionId: "call1",
                createdAt: Date().addingTimeInterval(-3600)
            )
        )

        NotificationRowView(
            notification: MeeshyNotification(
                id: "3",
                userId: "current_user",
                type: .mention,
                title: "Charlie mentioned you",
                content: "@you What do you think about this design approach?",
                data: nil,
                priority: .normal,
                isRead: false,
                emailSent: false,
                pushSent: true,
                expiresAt: nil,
                senderId: "user3",
                senderUsername: "Charlie Davis",
                senderAvatar: nil,
                messagePreview: "@you What do you think...",
                conversationId: "conv2",
                messageId: "msg3",
                callSessionId: nil,
                createdAt: Date().addingTimeInterval(-7200)
            )
        )
    }
}
