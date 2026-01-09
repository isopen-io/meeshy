//
//  MessageInfoView.swift
//  Meeshy
//
//  Message metadata display with sender info, location and read receipts
//  iOS 16+
//

import SwiftUI

// MARK: - Message Info View

struct MessageInfoView: View {
    let config: MessageInfoConfig

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Sender Section
                senderSection

                // Location Section
                if let location = config.location {
                    locationSection(location: location)
                }

                // Message Status Sections - Calculated from participant cursors
                MessageStatusSections(
                    config: config,
                    onUserTap: config.onUserTap
                )

                Spacer()
            }
            .padding(.vertical, 12)
        }
    }

    // MARK: - Sender Section

    private var senderSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "person.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)

                Text("Envoyé par")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)

            HStack(spacing: 12) {
                // Sender avatar
                if let avatar = config.senderAvatar, !avatar.isEmpty {
                    CachedAsyncImage(urlString: avatar, cacheType: .avatar) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        senderInitialAvatar
                    }
                    .frame(width: 44, height: 44)
                    .clipShape(Circle())
                } else {
                    senderInitialAvatar
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(config.senderName ?? "Utilisateur")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.primary)

                    HStack(spacing: 4) {
                        Image(systemName: "clock")
                            .font(.system(size: 11))
                        Text(config.timestamp.formatted(date: .abbreviated, time: .shortened))
                            .font(.system(size: 13))
                    }
                    .foregroundColor(.secondary)
                }

                Spacer()

                // Location badge if available
                if config.location != nil {
                    Image(systemName: "location.fill")
                        .font(.system(size: 14))
                        .foregroundColor(.blue)
                }
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(.systemGray6))
            )
            .padding(.horizontal, 16)
        }
    }

    private var senderInitialAvatar: some View {
        Circle()
            .fill(
                LinearGradient(
                    colors: [.blue, .purple],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 44, height: 44)
            .overlay(
                Text(String((config.senderName ?? "U").prefix(1)).uppercased())
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)
            )
    }

    // MARK: - Location Section

    private func locationSection(location: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "location.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(.blue)

                Text("Envoyé depuis")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)

            HStack(spacing: 10) {
                Image(systemName: "mappin.circle.fill")
                    .font(.system(size: 24))
                    .foregroundColor(.blue)

                Text(location)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.primary)

                Spacer()
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.blue.opacity(0.08))
            )
            .padding(.horizontal, 16)
        }
    }

}

// MARK: - Message Status Sections (Cursor-based)

/// Displays message delivery status calculated from participant cursors
struct MessageStatusSections: View {
    let config: MessageInfoConfig
    let onUserTap: ((String) -> Void)?

    var body: some View {
        let statuses = config.participantsByStatus

        VStack(alignment: .leading, spacing: 16) {
            // Summary counts header
            statusSummaryHeader(
                readCount: statuses.read.count,
                receivedCount: statuses.received.count,
                pendingCount: statuses.pending.count
            )

            // Read section
            if !statuses.read.isEmpty {
                ParticipantStatusSection(
                    title: "Lu par",
                    icon: "eye.fill",
                    iconColor: .blue,
                    participants: statuses.read,
                    message: config.message,
                    onUserTap: onUserTap
                )
            }

            // Received section
            if !statuses.received.isEmpty {
                ParticipantStatusSection(
                    title: "Reçu par",
                    icon: "checkmark.circle.fill",
                    iconColor: .green,
                    participants: statuses.received,
                    message: config.message,
                    onUserTap: onUserTap
                )
            }

            // Pending section
            if !statuses.pending.isEmpty {
                ParticipantStatusSection(
                    title: "En attente",
                    icon: "clock.fill",
                    iconColor: .orange,
                    participants: statuses.pending,
                    message: config.message,
                    onUserTap: onUserTap
                )
            }

            // Empty state if no participants
            if config.participants.isEmpty {
                emptyStateView
            }
        }
    }

    private func statusSummaryHeader(readCount: Int, receivedCount: Int, pendingCount: Int) -> some View {
        HStack(spacing: 16) {
            statusBadge(count: readCount, label: "Lu", color: .blue, icon: "eye.fill")
            statusBadge(count: receivedCount, label: "Reçu", color: .green, icon: "checkmark.circle.fill")
            statusBadge(count: pendingCount, label: "Attente", color: .orange, icon: "clock.fill")
        }
        .padding(.horizontal, 16)
    }

    private func statusBadge(count: Int, label: String, color: Color, icon: String) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 12))
                Text("\(count)")
                    .font(.system(size: 16, weight: .semibold))
            }
            .foregroundColor(color)

            Text(label)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(color.opacity(0.1))
        )
    }

    private var emptyStateView: some View {
        HStack {
            Image(systemName: "person.2.slash")
                .foregroundColor(.secondary)
            Text("Aucun participant chargé")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }
}

// MARK: - Participant Status Section (Collapsible)

struct ParticipantStatusSection: View {
    let title: String
    let icon: String
    let iconColor: Color
    let participants: [ConversationMember]
    let message: Message
    let onUserTap: ((String) -> Void)?

    /// Maximum participants to show when collapsed
    private let collapsedLimit = 5

    /// Track expanded state per section
    @State private var isExpanded: Bool = false

    /// Participants to display based on expanded state
    private var displayedParticipants: [ConversationMember] {
        if isExpanded || participants.count <= collapsedLimit {
            return participants
        }
        return Array(participants.prefix(collapsedLimit))
    }

    /// Number of hidden participants
    private var hiddenCount: Int {
        max(0, participants.count - collapsedLimit)
    }

    /// Whether to show the expand/collapse button
    private var showExpandButton: Bool {
        participants.count > collapsedLimit
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header (tappable to expand/collapse)
            Button {
                if showExpandButton {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        isExpanded.toggle()
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: icon)
                        .font(.system(size: 12))
                        .foregroundStyle(iconColor)

                    Text(title)
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Text("(\(participants.count))")
                        .font(.caption)
                        .foregroundStyle(.tertiary)

                    Spacer()

                    // Expand/collapse indicator
                    if showExpandButton {
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(iconColor)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 16)

            // Participants list
            LazyVStack(spacing: 0) {
                ForEach(Array(displayedParticipants.enumerated()), id: \.element.userId) { index, participant in
                    ParticipantStatusRowView(
                        participant: participant,
                        message: message,
                        iconColor: iconColor,
                        onTap: { onUserTap?(participant.userId) }
                    )

                    if index < displayedParticipants.count - 1 || (!isExpanded && showExpandButton) {
                        Divider()
                            .padding(.leading, 56)
                    }
                }

                // "Show more" button when collapsed
                if !isExpanded && showExpandButton {
                    Button {
                        withAnimation(.easeInOut(duration: 0.25)) {
                            isExpanded = true
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "person.2.fill")
                                .font(.system(size: 14))
                                .foregroundColor(iconColor.opacity(0.7))

                            Text("Voir \(hiddenCount) de plus")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(iconColor)

                            Spacer()

                            Image(systemName: "chevron.down")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(iconColor.opacity(0.7))
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 12)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }

                // "Show less" button when expanded (at the bottom)
                if isExpanded && showExpandButton {
                    Divider()
                        .padding(.leading, 56)

                    Button {
                        withAnimation(.easeInOut(duration: 0.25)) {
                            isExpanded = false
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "chevron.up")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(iconColor.opacity(0.7))

                            Text("Réduire")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(iconColor)

                            Spacer()
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(.systemGray6))
            )
            .padding(.horizontal, 16)
        }
    }
}

// MARK: - Participant Status Row View

private struct ParticipantStatusRowView: View {
    let participant: ConversationMember
    let message: Message
    let iconColor: Color
    let onTap: () -> Void

    /// Determines if we should show the timestamp
    /// Only show if the cursor points to THIS exact message (not a later one)
    private var shouldShowTimestamp: Bool {
        guard let cursor = participant.readCursor else { return false }
        // Compare cursor message date with this message's date
        // Only show timestamp if they match (cursor is AT this message)
        return cursor.messageCreatedAt == message.createdAt
    }

    /// Get the appropriate timestamp to display
    private var displayTimestamp: Date? {
        guard shouldShowTimestamp, let cursor = participant.readCursor else { return nil }
        // For read status, show readAt; for received, show receivedAt
        return cursor.readAt ?? cursor.receivedAt
    }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Avatar
                if let avatar = participant.avatar, !avatar.isEmpty {
                    CachedAsyncImage(urlString: avatar, cacheType: .avatar) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        userInitialAvatar
                    }
                    .frame(width: 36, height: 36)
                    .clipShape(Circle())
                } else {
                    userInitialAvatar
                }

                // User name
                Text(participant.preferredName)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.primary)

                Spacer()

                // Timestamp - only show if cursor is at THIS message
                // (not showing dates for messages read before the cursor was updated)
                if let timestamp = displayTimestamp {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(timestamp.formatted(date: .omitted, time: .shortened))
                            .font(.system(size: 13))
                            .foregroundColor(.secondary)

                        Text(timestamp.formatted(date: .abbreviated, time: .omitted))
                            .font(.system(size: 11))
                            .foregroundColor(Color(.tertiaryLabel))
                    }
                }

                // Status icon
                Image(systemName: statusIcon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(iconColor)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var userInitialAvatar: some View {
        Circle()
            .fill(iconColor.opacity(0.2))
            .frame(width: 36, height: 36)
            .overlay(
                Text(String(participant.preferredName.prefix(1)).uppercased())
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(iconColor)
            )
    }

    private var statusIcon: String {
        let status = participant.readStatusForMessage(message)
        return status.icon
    }
}

// MARK: - Preview

#Preview {
    // Create preview message
    let previewMessage = Message(
        id: "preview-message-id",
        conversationId: "conv-1",
        senderId: "sender-1",
        content: "Bonjour à tous !",
        createdAt: Date()
    )

    // Helper to create participants
    func createParticipant(
        index: Int,
        name: String,
        hasRead: Bool,
        hasReceived: Bool
    ) -> ConversationMember {
        let readCursor: ReadCursor? = {
            if hasRead {
                return ReadCursor(
                    messageId: previewMessage.id,
                    messageCreatedAt: previewMessage.createdAt,
                    receivedAt: Date().addingTimeInterval(-3600),
                    readAt: Date().addingTimeInterval(Double(-index * 300)),
                    updatedAt: Date()
                )
            } else if hasReceived {
                return ReadCursor(
                    messageId: previewMessage.id,
                    messageCreatedAt: previewMessage.createdAt,
                    receivedAt: Date().addingTimeInterval(Double(-index * 600)),
                    readAt: nil,
                    updatedAt: Date()
                )
            }
            return nil
        }()

        return ConversationMember(
            id: "member-\(index)",
            userId: "user-\(index)",
            role: .member,
            user: .init(
                id: "user-\(index)",
                username: name.lowercased().replacingOccurrences(of: " ", with: "_"),
                displayName: name,
                avatar: nil,
                isOnline: index % 3 == 0,
                lastActiveAt: Date().addingTimeInterval(Double(-index * 3600))
            ),
            readCursor: readCursor
        )
    }

    // Create 8 readers (to test collapsible)
    let readParticipants = [
        createParticipant(index: 1, name: "Marie Dupont", hasRead: true, hasReceived: true),
        createParticipant(index: 2, name: "Pierre Martin", hasRead: true, hasReceived: true),
        createParticipant(index: 3, name: "Sophie Leroy", hasRead: true, hasReceived: true),
        createParticipant(index: 4, name: "Lucas Bernard", hasRead: true, hasReceived: true),
        createParticipant(index: 5, name: "Emma Petit", hasRead: true, hasReceived: true),
        createParticipant(index: 6, name: "Hugo Moreau", hasRead: true, hasReceived: true),
        createParticipant(index: 7, name: "Léa Dubois", hasRead: true, hasReceived: true),
        createParticipant(index: 8, name: "Nathan Laurent", hasRead: true, hasReceived: true)
    ]

    // Create 3 received
    let receivedParticipants = [
        createParticipant(index: 10, name: "Chloé Simon", hasRead: false, hasReceived: true),
        createParticipant(index: 11, name: "Théo Michel", hasRead: false, hasReceived: true),
        createParticipant(index: 12, name: "Inès Garcia", hasRead: false, hasReceived: true)
    ]

    // Create 2 pending
    let pendingParticipants = [
        createParticipant(index: 20, name: "Raphaël Thomas", hasRead: false, hasReceived: false),
        createParticipant(index: 21, name: "Jade Robert", hasRead: false, hasReceived: false)
    ]

    let allParticipants = readParticipants + receivedParticipants + pendingParticipants

    return ZStack {
        Color.gray.opacity(0.1).ignoresSafeArea()

        MessageInfoView(config: .init(
            message: previewMessage,
            participants: allParticipants,
            senderName: "Jean Dupont",
            senderAvatar: nil,
            location: "Paris, France",
            onUserTap: { userId in print("Tapped user: \(userId)") }
        ))
        .frame(height: 600)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.systemBackground))
                .shadow(radius: 5)
        )
        .padding()
    }
}
