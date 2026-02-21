import SwiftUI

// MARK: - MessageInfoSheet

struct MessageInfoSheet: View {
    let message: Message
    let contactColor: String
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    @State private var appearAnimation = false

    // MARK: - Computed Properties

    private var accentColor: Color {
        Color(hex: contactColor)
    }

    private var sentTimestamp: Date {
        message.createdAt
    }

    private var deliveredTimestamp: Date? {
        guard message.deliveryStatus == .delivered || message.deliveryStatus == .read else { return nil }
        return message.updatedAt
    }

    private var readTimestamp: Date? {
        guard message.deliveryStatus == .read else { return nil }
        return message.updatedAt
    }

    private var isDelivered: Bool {
        message.deliveryStatus == .delivered || message.deliveryStatus == .read
    }

    private var isRead: Bool {
        message.deliveryStatus == .read
    }

    private var attachmentTypeLabel: String? {
        guard let attachment = message.attachments.first else { return nil }
        switch attachment.type {
        case .image: return "Photo"
        case .video: return "Video"
        case .audio: return "Message vocal"
        case .file: return attachment.originalName.isEmpty ? "Fichier" : attachment.originalName
        case .location: return "Position"
        }
    }

    // MARK: - Date Formatting

    private var dateFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateFormat = "HH:mm, dd MMM yyyy"
        return formatter
    }

    private var timeFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateFormat = "HH:mm"
        return formatter
    }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            headerBar
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 20) {
                    senderSection
                    statusTimeline
                    messagePreview
                    // TODO: Per-participant read receipts (when backend supports it)
                    // participantReceiptsSection
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
        }
        .background(sheetBackground)
        .presentationDragIndicator(.visible)
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                appearAnimation = true
            }
        }
    }

    // MARK: - Sheet Background

    private var sheetBackground: some View {
        ZStack {
            theme.backgroundPrimary
                .ignoresSafeArea()

            // Ambient accent glow
            Circle()
                .fill(accentColor.opacity(theme.mode.isDark ? 0.06 : 0.04))
                .frame(width: 300, height: 300)
                .blur(radius: 80)
                .offset(x: -60, y: -120)
                .ignoresSafeArea()

            Circle()
                .fill(accentColor.opacity(theme.mode.isDark ? 0.04 : 0.02))
                .frame(width: 200, height: 200)
                .blur(radius: 60)
                .offset(x: 100, y: 80)
                .ignoresSafeArea()
        }
    }

    // MARK: - Header Bar

    private var headerBar: some View {
        HStack {
            Text("Infos du message")
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 28, height: 28)
                    .background(
                        Circle()
                            .fill(theme.textMuted.opacity(0.12))
                    )
            }
            .accessibilityLabel("Fermer")
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 12)
    }

    // MARK: - Sender Section

    private var senderSection: some View {
        HStack(spacing: 12) {
            MeeshyAvatar(
                name: message.senderName ?? "?",
                mode: .messageBubble,
                accentColor: message.senderColor ?? contactColor,
                avatarURL: message.senderAvatarURL
            )

            VStack(alignment: .leading, spacing: 3) {
                Text(message.senderName ?? "Moi")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.textPrimary)

                Text("Envoye a \(dateFormatter.string(from: sentTimestamp))")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(theme.textSecondary)
            }

            Spacer()
        }
        .padding(14)
        .background(sectionBackground)
        .opacity(appearAnimation ? 1 : 0)
        .offset(y: appearAnimation ? 0 : 10)
    }

    // MARK: - Status Timeline

    private var statusTimeline: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Section header
            Text("Statut de livraison")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(theme.textSecondary)
                .padding(.bottom, 14)

            // Sent step (always shown)
            timelineStep(
                icon: "checkmark",
                iconColor: theme.textMuted,
                label: "Envoye",
                timestamp: timeFormatter.string(from: sentTimestamp),
                isActive: true,
                hasNextStep: true
            )

            // Connector line
            timelineConnector(isActive: isDelivered)

            // Delivered step
            timelineStep(
                icon: "checkmark.circle",
                iconColor: isDelivered ? Color(hex: "8E8E93") : theme.textMuted.opacity(0.3),
                label: "Distribue",
                timestamp: deliveredTimestamp.map { timeFormatter.string(from: $0) },
                isActive: isDelivered,
                hasNextStep: true
            )

            // Connector line
            timelineConnector(isActive: isRead)

            // Read step
            timelineStep(
                icon: "checkmark.circle.fill",
                iconColor: isRead ? Color(hex: "34B7F1") : theme.textMuted.opacity(0.3),
                label: "Lu",
                timestamp: readTimestamp.map { timeFormatter.string(from: $0) },
                isActive: isRead,
                hasNextStep: false
            )
        }
        .padding(14)
        .background(sectionBackground)
        .opacity(appearAnimation ? 1 : 0)
        .offset(y: appearAnimation ? 0 : 15)
        .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.05), value: appearAnimation)
    }

    private func timelineStep(
        icon: String,
        iconColor: Color,
        label: String,
        timestamp: String?,
        isActive: Bool,
        hasNextStep: Bool
    ) -> some View {
        HStack(spacing: 12) {
            // Icon circle
            ZStack {
                Circle()
                    .fill(isActive ? iconColor.opacity(0.15) : theme.textMuted.opacity(0.06))
                    .frame(width: 32, height: 32)

                Image(systemName: icon)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(iconColor)
            }

            // Label and timestamp
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.system(size: 14, weight: isActive ? .semibold : .regular))
                    .foregroundColor(isActive ? theme.textPrimary : theme.textMuted)

                if let timestamp {
                    Text(timestamp)
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundColor(isActive ? theme.textSecondary : theme.textMuted)
                } else {
                    Text("En attente")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(theme.textMuted.opacity(0.6))
                        .italic()
                }
            }

            Spacer()

            // Active indicator dot
            if isActive {
                Circle()
                    .fill(iconColor)
                    .frame(width: 6, height: 6)
                    .pulse(intensity: 0.2)
            }
        }
    }

    private func timelineConnector(isActive: Bool) -> some View {
        HStack(spacing: 0) {
            Spacer()
                .frame(width: 15.5)

            Rectangle()
                .fill(
                    isActive
                        ? accentColor.opacity(0.3)
                        : theme.textMuted.opacity(0.12)
                )
                .frame(width: 1, height: 16)

            Spacer()
        }
    }

    // MARK: - Message Content Preview

    private var messagePreview: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Contenu")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(theme.textSecondary)

            HStack(spacing: 10) {
                // Type icon
                messageTypeIcon
                    .frame(width: 32, height: 32)
                    .background(
                        Circle()
                            .fill(accentColor.opacity(theme.mode.isDark ? 0.15 : 0.1))
                    )

                // Content text
                VStack(alignment: .leading, spacing: 2) {
                    if let typeLabel = attachmentTypeLabel {
                        Text(typeLabel)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(accentColor)

                        if !message.content.isEmpty {
                            Text(message.content)
                                .font(.system(size: 13))
                                .foregroundColor(theme.textSecondary)
                                .lineLimit(2)
                        }
                    } else if !message.content.isEmpty {
                        Text(message.content)
                            .font(.system(size: 13))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(2)
                    } else {
                        Text("Message vide")
                            .font(.system(size: 13))
                            .foregroundColor(theme.textMuted)
                            .italic()
                    }
                }

                Spacer()
            }

            // Edited indicator
            if message.isEdited {
                HStack(spacing: 4) {
                    Image(systemName: "pencil")
                        .font(.system(size: 10))
                    Text("Modifie")
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundColor(theme.textMuted)
                .padding(.leading, 42)
            }
        }
        .padding(14)
        .background(sectionBackground)
        .opacity(appearAnimation ? 1 : 0)
        .offset(y: appearAnimation ? 0 : 20)
        .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.1), value: appearAnimation)
    }

    @ViewBuilder
    private var messageTypeIcon: some View {
        switch message.messageType {
        case .text:
            Image(systemName: "text.bubble.fill")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(accentColor)
        case .image:
            Image(systemName: "photo.fill")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(accentColor)
        case .video:
            Image(systemName: "video.fill")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(accentColor)
        case .audio:
            Image(systemName: "waveform")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(accentColor)
        case .file:
            Image(systemName: "doc.fill")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(accentColor)
        case .location:
            Image(systemName: "location.fill")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(accentColor)
        }
    }

    // MARK: - Section Background

    private var sectionBackground: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(.ultraThinMaterial)
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(
                        theme.mode.isDark
                            ? Color.white.opacity(0.03)
                            : Color.white.opacity(0.5)
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(
                        LinearGradient(
                            colors: [
                                accentColor.opacity(theme.mode.isDark ? 0.2 : 0.12),
                                Color.white.opacity(theme.mode.isDark ? 0.06 : 0.3)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 0.5
                    )
            )
            .shadow(
                color: Color.black.opacity(theme.mode.isDark ? 0.15 : 0.04),
                radius: 8,
                y: 4
            )
    }

    // MARK: - Future: Per-Participant Read Receipts
    //
    // When the backend supports per-participant delivery/read receipts,
    // uncomment and adapt this section. Expected data model:
    //
    // struct ParticipantReceipt: Identifiable {
    //     let id: String          // participant userId
    //     let name: String
    //     let avatarURL: String?
    //     let color: String
    //     let deliveredAt: Date?
    //     let readAt: Date?
    // }
    //
    // private var participantReceiptsSection: some View {
    //     VStack(alignment: .leading, spacing: 10) {
    //         Text("Participants")
    //             .font(.system(size: 13, weight: .semibold))
    //             .foregroundColor(theme.textSecondary)
    //
    //         ForEach(receipts) { receipt in
    //             HStack(spacing: 10) {
    //                 MeeshyAvatar(
    //                     name: receipt.name,
    //                     mode: .messageBubble,
    //                     accentColor: receipt.color,
    //                     avatarURL: receipt.avatarURL
    //                 )
    //
    //                 VStack(alignment: .leading, spacing: 2) {
    //                     Text(receipt.name)
    //                         .font(.system(size: 13, weight: .medium))
    //                         .foregroundColor(theme.textPrimary)
    //
    //                     HStack(spacing: 8) {
    //                         if let readAt = receipt.readAt {
    //                             Label(timeFormatter.string(from: readAt), systemImage: "checkmark.circle.fill")
    //                                 .font(.system(size: 10))
    //                                 .foregroundColor(Color(hex: "34B7F1"))
    //                         } else if let deliveredAt = receipt.deliveredAt {
    //                             Label(timeFormatter.string(from: deliveredAt), systemImage: "checkmark.circle")
    //                                 .font(.system(size: 10))
    //                                 .foregroundColor(Color(hex: "8E8E93"))
    //                         } else {
    //                             Text("En attente")
    //                                 .font(.system(size: 10))
    //                                 .foregroundColor(theme.textMuted)
    //                                 .italic()
    //                         }
    //                     }
    //                 }
    //
    //                 Spacer()
    //             }
    //             .padding(.vertical, 4)
    //         }
    //     }
    //     .padding(14)
    //     .background(sectionBackground)
    //     .opacity(appearAnimation ? 1 : 0)
    //     .offset(y: appearAnimation ? 0 : 25)
    //     .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.15), value: appearAnimation)
    // }
}
