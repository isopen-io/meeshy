//
//  NotificationBanner.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import SwiftUI

struct NotificationBanner: View {
    let notification: MeeshyNotification
    let onTap: () -> Void
    let onDismiss: () -> Void

    @State private var offset: CGFloat = -200
    @State private var isVisible = false

    var body: some View {
        VStack {
            HStack(spacing: 12) {
                // Icon
                ZStack {
                    Circle()
                        .fill(iconBackgroundColor)
                        .frame(width: 36, height: 36)

                    Image(systemName: notification.type.iconName)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)
                }

                // Content
                VStack(alignment: .leading, spacing: 2) {
                    Text(notification.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.primary)
                        .lineLimit(1)

                    Text(notification.content)
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }

                Spacer()

                // Dismiss button
                Button {
                    dismissBanner()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.secondary)
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(.systemBackground))
                    .shadow(color: .black.opacity(0.1), radius: 10, x: 0, y: 5)
            )
            .padding(.horizontal)
            .offset(y: offset)
            .gesture(
                DragGesture()
                    .onChanged { gesture in
                        if gesture.translation.height < 0 {
                            offset = gesture.translation.height - 200
                        }
                    }
                    .onEnded { gesture in
                        if gesture.translation.height < -50 {
                            dismissBanner()
                        } else {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                offset = 0
                            }
                        }
                    }
            )
            .onTapGesture {
                dismissBanner()
                onTap()
            }

            Spacer()
        }
        .onAppear {
            showBanner()
            scheduleAutoDismiss()
        }
    }

    // MARK: - Computed Properties

    private var iconBackgroundColor: Color {
        switch notification.type.iconColor {
        case "blue": return .blue
        case "orange": return .orange
        case "green": return .green
        case "gray": return .gray
        default: return .blue
        }
    }

    // MARK: - Animations

    private func showBanner() {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
            offset = 0
            isVisible = true
        }

        // Haptic feedback
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)
    }

    private func dismissBanner() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            offset = -200
            isVisible = false
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            onDismiss()
        }
    }

    private func scheduleAutoDismiss() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 5.0) {
            if isVisible {
                dismissBanner()
            }
        }
    }
}

// MARK: - Banner Modifier

struct NotificationBannerModifier: ViewModifier {
    @Binding var notification: MeeshyNotification?

    func body(content: Content) -> some View {
        ZStack {
            content

            if let notification = notification {
                NotificationBanner(
                    notification: notification,
                    onTap: {
                        handleNotificationTap(notification)
                    },
                    onDismiss: {
                        self.notification = nil
                    }
                )
                .zIndex(999)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
    }

    private func handleNotificationTap(_ notification: MeeshyNotification) {
        // Navigate based on notification type
        if let conversationId = notification.conversationId {
            NotificationCenter.default.post(
                name: .openConversation,
                object: nil,
                userInfo: ["conversationId": conversationId]
            )
        }

        self.notification = nil
    }
}

extension View {
    func notificationBanner(_ notification: Binding<MeeshyNotification?>) -> some View {
        modifier(NotificationBannerModifier(notification: notification))
    }
}

#Preview {
    ZStack {
        Color.gray.opacity(0.2)
            .ignoresSafeArea()

        NotificationBanner(
            notification: MeeshyNotification(
                id: "1",
                userId: "current_user",
                type: .newMessage,
                title: "New message from Alice",
                content: "Hey! Are you coming to the meeting today?",
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
                createdAt: Date()
            ),
            onTap: { },
            onDismiss: { }
        )
    }
}
