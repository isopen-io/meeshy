import SwiftUI
import Combine
import MeeshySDK

// MARK: - MessageInfoSheet

struct ParticipantReceipt: Identifiable {
    let id: String
    let name: String
    let avatarURL: String?
    let color: String
    let deliveredAt: Date?
    let readAt: Date?
}

struct MessageReadStatusResponse: Decodable {
    let messageId: String
    let totalMembers: Int
    let receivedCount: Int
    let readCount: Int
    let receivedBy: [ReceivedEntry]
    let readBy: [ReadEntry]
    /// Per-attachment, per-participant playback progress (audio/video).
    /// Optional so older gateway responses (before this shipped) still decode.
    let attachmentConsumption: [AttachmentConsumptionEntry]?

    struct ReceivedEntry: Decodable {
        let participantId: String
        let displayName: String
        let avatarURL: String?
        let receivedAt: Date
    }

    struct ReadEntry: Decodable {
        let participantId: String
        let displayName: String
        let avatarURL: String?
        let readAt: Date
    }

    struct AttachmentConsumptionEntry: Decodable {
        let attachmentId: String
        let participants: [ParticipantConsumption]

        struct ParticipantConsumption: Decodable {
            let participantId: String
            let displayName: String
            let avatarURL: String?
            let lastPlayPositionMs: Int?
            let listenedComplete: Bool
            let lastWatchPositionMs: Int?
            let watchedComplete: Bool
        }
    }
}

private typealias ParticipantMediaConsumption = MessageReadStatusResponse.AttachmentConsumptionEntry.ParticipantConsumption

struct MessageInfoSheet: View {
    let message: Message
    let contactColor: String
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    @State private var appearAnimation = false
    @State private var receipts: [ParticipantReceipt] = []
    /// Per-attachment playback progress of OTHER participants, keyed by
    /// attachmentId. Populated alongside the read receipts from the same
    /// `/read-status` response. Lets the author see how far each participant
    /// listened to an audio / watched a video.
    @State private var attachmentConsumption: [String: [ParticipantMediaConsumption]] = [:]
    @State private var isLoadingReceipts = false
    /// Active-recipient denominator fetched alongside read receipts. Falls back
    /// to the message's server-projected `recipientCount` when the read-status
    /// request hasn't resolved (or failed).
    @State private var totalMembers: Int = 0

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
        case .image: return String(localized: "attachment.kind.photo", defaultValue: "Photo", bundle: .main)
        case .video: return String(localized: "attachment.kind.video", defaultValue: "Video", bundle: .main)
        case .audio: return String(localized: "message-info.voice-message", defaultValue: "Message vocal", bundle: .main)
        case .file: return attachment.originalName.isEmpty ? String(localized: "attachment.kind.file", defaultValue: "Fichier", bundle: .main) : attachment.originalName
        case .location: return String(localized: "attachment.kind.location", defaultValue: "Position", bundle: .main)
        }
    }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            headerBar
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: MeeshySpacing.xl) {
                    senderSection
                    statusTimeline
                    messagePreview
                    attachmentConsumptionSection
                    participantReceiptsSection
                }
                .padding(.horizontal, MeeshySpacing.xl)
                .padding(.top, MeeshySpacing.sm)
                .padding(.bottom, MeeshySpacing.xxxl)
            }
        }
        .background(sheetBackground)
        .presentationDragIndicator(.visible)
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                appearAnimation = true
            }
            Task { await loadReadReceipts() }
        }
    }

    // MARK: - Sheet Background

    private var sheetBackground: some View {
        ZStack {
            theme.backgroundPrimary
                .ignoresSafeArea()

            // Ambient accent glow
            Circle()
                .fill(accentColor.opacity(isDark ? 0.06 : 0.04))
                .frame(width: 300, height: 300)
                .blur(radius: 80)
                .offset(x: -60, y: -120)
                .ignoresSafeArea()

            Circle()
                .fill(accentColor.opacity(isDark ? 0.04 : 0.02))
                .frame(width: 200, height: 200)
                .blur(radius: 60)
                .offset(x: 100, y: 80)
                .ignoresSafeArea()
        }
    }

    // MARK: - Header Bar

    private var headerBar: some View {
        HStack {
            Text(String(localized: "message-info.title", defaultValue: "Infos du message", bundle: .main))
                .font(MeeshyFont.relative(17, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(MeeshyFont.relative(10, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 28, height: 28)
                    .background(
                        Circle()
                            .fill(theme.textMuted.opacity(0.12))
                    )
            }
            .meeshyTapTarget()
            .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.top, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.md)
    }

    // MARK: - Sender Section

    private var senderSection: some View {
        HStack(spacing: MeeshySpacing.md) {
            MeeshyAvatar(
                name: message.senderName ?? "?",
                context: .messageBubble,
                accentColor: message.senderColor ?? contactColor,
                avatarURL: message.senderAvatarURL
            )

            VStack(alignment: .leading, spacing: 3) {
                Text(message.senderName ?? String(localized: "common.me", defaultValue: "Moi", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundColor(theme.textPrimary)

                Text(String(format: String(localized: "message-info.sent-at", defaultValue: "Envoye a %@", bundle: .main), sentTimestamp.formatted(.dateTime.hour().minute().day().month(.abbreviated).year())))
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundColor(theme.textSecondary)
            }

            Spacer()
        }
        .padding(MeeshySpacing.md)
        .background(sectionBackground)
        .opacity(appearAnimation ? 1 : 0)
        .offset(y: appearAnimation ? 0 : 10)
    }

    // MARK: - Status Timeline

    private var statusTimeline: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Section header
            Text(String(localized: "message-info.delivery-status", defaultValue: "Statut de livraison", bundle: .main))
                .font(MeeshyFont.relative(13, weight: .semibold))
                .foregroundColor(theme.textSecondary)
                .padding(.bottom, MeeshySpacing.md)

            // Sent step (always shown)
            timelineStep(
                icon: "checkmark",
                iconColor: theme.textMuted,
                label: String(localized: "message-detail.views.sent", defaultValue: "Envoye", bundle: .main),
                timestamp: sentTimestamp.formatted(date: .omitted, time: .shortened),
                isActive: true,
                hasNextStep: true
            )

            // Connector line
            timelineConnector(isActive: isDelivered)

            // Delivered step
            timelineStep(
                icon: "checkmark.circle",
                iconColor: isDelivered ? MeeshyColors.neutral400 : theme.textMuted.opacity(0.3),
                label: String(localized: "message-detail.views.delivered", defaultValue: "Distribue", bundle: .main),
                timestamp: deliveredTimestamp?.formatted(date: .omitted, time: .shortened),
                isActive: isDelivered,
                hasNextStep: true
            )

            // Connector line
            timelineConnector(isActive: isRead)

            // Read step
            timelineStep(
                icon: "checkmark.circle.fill",
                iconColor: isRead ? MeeshyColors.readReceipt : theme.textMuted.opacity(0.3),
                label: String(localized: "message-detail.views.read", defaultValue: "Lu", bundle: .main),
                timestamp: readTimestamp?.formatted(date: .omitted, time: .shortened),
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
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundColor(iconColor)
            }

            // Label and timestamp
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(MeeshyFont.relative(14, weight: isActive ? .semibold : .regular))
                    .foregroundColor(isActive ? theme.textPrimary : theme.textMuted)

                if let timestamp {
                    Text(timestamp)
                        .font(MeeshyFont.relative(11, weight: .medium, design: .monospaced))
                        .foregroundColor(isActive ? theme.textSecondary : theme.textMuted)
                } else {
                    Text(String(localized: "common.pending", defaultValue: "En attente", bundle: .main))
                        .font(MeeshyFont.relative(11, weight: .medium))
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

    // MARK: - Attachment Consumption

    /// Active-recipient denominator for the all-or-nothing attachment status:
    /// the read-status fetch's `totalMembers` when available, else the message's
    /// server-projected `recipientCount`. `0` → unknown (count shown bare).
    private var recipientDenominator: Int {
        totalMembers > 0 ? totalMembers : message.recipientCount
    }

    @ViewBuilder
    private var attachmentConsumptionSection: some View {
        if !message.attachments.isEmpty {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                Text(String(localized: "message-info.attachment-status", defaultValue: "Pieces jointes", bundle: .main))
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundColor(theme.textSecondary)

                ForEach(message.attachments) { attachment in
                    attachmentConsumptionRow(for: attachment)
                }
            }
            .padding(MeeshySpacing.md)
            .background(sectionBackground)
            .opacity(appearAnimation ? 1 : 0)
            .offset(y: appearAnimation ? 0 : 15)
            .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.08), value: appearAnimation)
        }
    }

    private func attachmentConsumptionRow(for attachment: MeeshyMessageAttachment) -> some View {
        let status = AttachmentConsumptionResolver.resolve(
            mimeType: attachment.mimeType,
            recipientCount: recipientDenominator,
            viewedCount: attachment.viewedCount ?? 0,
            downloadedCount: attachment.downloadedCount ?? 0,
            consumedCount: attachment.consumedCount ?? 0,
            viewedByAllAt: attachment.viewedByAllAt,
            downloadedByAllAt: attachment.downloadedByAllAt,
            listenedByAllAt: attachment.listenedByAllAt,
            watchedByAllAt: attachment.watchedByAllAt
        )
        let byAll = status.isCompleteByAll

        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill((byAll ? accentColor : theme.textMuted).opacity(byAll ? 0.15 : 0.08))
                        .frame(width: 32, height: 32)
                    Image(systemName: consumptionIcon(for: status.action))
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(byAll ? accentColor : theme.textMuted)
                }
                .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    Text(attachmentDisplayName(attachment))
                        .font(MeeshyFont.relative(14, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)
                    Text(consumptionLabel(for: status))
                        .font(MeeshyFont.relative(11, weight: .medium))
                        .foregroundColor(byAll ? theme.textSecondary : theme.textMuted)
                }

                Spacer()

                if byAll {
                    Image(systemName: "checkmark.circle.fill")
                        .font(MeeshyFont.relative(16, weight: .semibold))
                        .foregroundColor(accentColor)
                        .accessibilityHidden(true)
                }
            }
            .accessibilityElement(children: .combine)

            participantProgressRows(for: attachment)
        }
    }

    /// Per-participant playback progress beneath an audio/video attachment row:
    /// how far each OTHER participant listened/watched (position bar + label).
    /// Renders nothing for attachments with no per-participant consumption data.
    @ViewBuilder
    private func participantProgressRows(for attachment: MeeshyMessageAttachment) -> some View {
        let entries = attachmentConsumption[attachment.id] ?? []
        if !entries.isEmpty {
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                ForEach(entries, id: \.participantId) { entry in
                    ParticipantMediaProgressRow(
                        name: entry.displayName,
                        color: DynamicColorGenerator.colorForName(entry.displayName),
                        fraction: mediaFraction(for: entry, type: attachment.type, durationMs: attachment.duration ?? 0),
                        label: mediaProgressLabel(for: entry, type: attachment.type, durationMs: attachment.duration ?? 0),
                        accentHex: contactColor,
                        isDark: isDark
                    )
                }
            }
            .padding(.leading, 44)
            .padding(.top, MeeshySpacing.xs)
        }
    }

    private func mediaFraction(
        for entry: ParticipantMediaConsumption,
        type: MeeshyMessageAttachment.AttachmentType,
        durationMs: Int
    ) -> Double {
        let isVideo = type == .video
        let complete = isVideo ? entry.watchedComplete : entry.listenedComplete
        if complete { return 1 }
        let position = isVideo ? entry.lastWatchPositionMs : entry.lastPlayPositionMs
        guard durationMs > 0, let position else { return 0 }
        return min(1, max(0, Double(position) / Double(durationMs)))
    }

    private func mediaProgressLabel(
        for entry: ParticipantMediaConsumption,
        type: MeeshyMessageAttachment.AttachmentType,
        durationMs: Int
    ) -> String {
        let isVideo = type == .video
        let complete = isVideo ? entry.watchedComplete : entry.listenedComplete
        if complete {
            return isVideo
                ? String(localized: "message-info.consumption.watched-fully", defaultValue: "Regarde en entier", bundle: .main)
                : String(localized: "message-info.consumption.listened-fully", defaultValue: "Ecoute en entier", bundle: .main)
        }
        let position = isVideo ? entry.lastWatchPositionMs : entry.lastPlayPositionMs
        guard let position else {
            return String(localized: "common.pending", defaultValue: "En attente", bundle: .main)
        }
        if durationMs > 0 {
            return "\(Self.formatMediaTime(position)) / \(Self.formatMediaTime(durationMs))"
        }
        return Self.formatMediaTime(position)
    }

    static func formatMediaTime(_ milliseconds: Int) -> String {
        let totalSeconds = max(0, milliseconds) / 1000
        return String(format: "%d:%02d", totalSeconds / 60, totalSeconds % 60)
    }

    private func attachmentDisplayName(_ attachment: MeeshyMessageAttachment) -> String {
        if !attachment.originalName.isEmpty { return attachment.originalName }
        switch attachment.type {
        case .image: return String(localized: "attachment.kind.photo", defaultValue: "Photo", bundle: .main)
        case .video: return String(localized: "attachment.kind.video", defaultValue: "Video", bundle: .main)
        case .audio: return String(localized: "message-info.voice-message", defaultValue: "Message vocal", bundle: .main)
        case .file: return String(localized: "attachment.kind.file", defaultValue: "Fichier", bundle: .main)
        case .location: return String(localized: "attachment.kind.location", defaultValue: "Position", bundle: .main)
        }
    }

    private func consumptionIcon(for action: AttachmentConsumptionResolver.Action) -> String {
        switch action {
        case .viewed: return "eye.fill"
        case .downloaded: return "arrow.down.circle.fill"
        case .listened: return "waveform"
        case .watched: return "play.circle.fill"
        }
    }

    private func consumptionVerb(for action: AttachmentConsumptionResolver.Action) -> String {
        switch action {
        case .viewed: return String(localized: "message-info.consumption.viewed", defaultValue: "Vu", bundle: .main)
        case .downloaded: return String(localized: "message-info.consumption.downloaded", defaultValue: "Telecharge", bundle: .main)
        case .listened: return String(localized: "message-info.consumption.listened", defaultValue: "Ecoute", bundle: .main)
        case .watched: return String(localized: "message-info.consumption.watched", defaultValue: "Regarde", bundle: .main)
        }
    }

    private func consumptionLabel(for status: AttachmentConsumptionResolver.Status) -> String {
        let verb = consumptionVerb(for: status.action)
        if status.isCompleteByAll {
            let base = String(format: String(localized: "message-info.consumption.by-all", defaultValue: "%@ par tous", bundle: .main), verb)
            if let at = status.byAllAt {
                return "\(base) \u{00B7} \(at.formatted(date: .omitted, time: .shortened))"
            }
            return base
        }
        if status.recipientCount > 0 {
            return String(format: String(localized: "message-info.consumption.by-count", defaultValue: "%1$@ par %2$d/%3$d", bundle: .main), verb, status.count, status.recipientCount)
        }
        if status.count > 0 {
            return String(format: String(localized: "message-info.consumption.by-some", defaultValue: "%1$@ par %2$d", bundle: .main), verb, status.count)
        }
        return String(localized: "message-info.consumption.none", defaultValue: "Pas encore consulte", bundle: .main)
    }

    // MARK: - Message Content Preview

    private var messagePreview: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(String(localized: "message-info.content", defaultValue: "Contenu", bundle: .main))
                .font(MeeshyFont.relative(13, weight: .semibold))
                .foregroundColor(theme.textSecondary)

            HStack(spacing: MeeshySpacing.sm) {
                // Type icon
                messageTypeIcon
                    .frame(width: 32, height: 32)
                    .background(
                        Circle()
                            .fill(accentColor.opacity(isDark ? 0.15 : 0.1))
                    )

                // Content text
                VStack(alignment: .leading, spacing: 2) {
                    if let typeLabel = attachmentTypeLabel {
                        Text(typeLabel)
                            .font(MeeshyFont.relative(13, weight: .semibold))
                            .foregroundColor(accentColor)

                        if !message.content.isEmpty {
                            Text(message.content)
                                .font(MeeshyFont.relative(13))
                                .foregroundColor(theme.textSecondary)
                                .lineLimit(2)
                        }
                    } else if !message.content.isEmpty {
                        Text(message.content)
                            .font(MeeshyFont.relative(13))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(2)
                    } else {
                        Text(String(localized: "message-info.empty", defaultValue: "Message vide", bundle: .main))
                            .font(MeeshyFont.relative(13))
                            .foregroundColor(theme.textMuted)
                            .italic()
                    }
                }

                Spacer()
            }

            // Edited indicator
            if message.isEdited {
                HStack(spacing: MeeshySpacing.xs) {
                    Image(systemName: "pencil")
                        .font(MeeshyFont.relative(10))
                    Text(String(localized: "message-info.edited", defaultValue: "Modifie", bundle: .main))
                        .font(MeeshyFont.relative(11, weight: .medium))
                }
                .foregroundColor(theme.textMuted)
                .padding(.leading, 42)
            }
        }
        .padding(MeeshySpacing.md)
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
                .font(MeeshyFont.relative(13, weight: .medium))
                .foregroundColor(accentColor)
        case .image:
            Image(systemName: "photo.fill")
                .font(MeeshyFont.relative(13, weight: .medium))
                .foregroundColor(accentColor)
        case .video:
            Image(systemName: "video.fill")
                .font(MeeshyFont.relative(13, weight: .medium))
                .foregroundColor(accentColor)
        case .audio:
            Image(systemName: "waveform")
                .font(MeeshyFont.relative(13, weight: .medium))
                .foregroundColor(accentColor)
        case .file:
            Image(systemName: "doc.fill")
                .font(MeeshyFont.relative(13, weight: .medium))
                .foregroundColor(accentColor)
        case .location:
            Image(systemName: "location.fill")
                .font(MeeshyFont.relative(13, weight: .medium))
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
                        isDark
                            ? Color.white.opacity(0.03)
                            : Color.white.opacity(0.5)
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(
                        LinearGradient(
                            colors: [
                                accentColor.opacity(isDark ? 0.2 : 0.12),
                                Color.white.opacity(isDark ? 0.06 : 0.3)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 0.5
                    )
            )
            .shadow(
                color: Color.black.opacity(isDark ? 0.15 : 0.04),
                radius: 8,
                y: 4
            )
    }

    // MARK: - Per-Participant Read Receipts

    private var participantReceiptsSection: some View {
        Group {
            if isLoadingReceipts {
                HStack {
                    Spacer()
                    ProgressView()
                        .tint(accentColor)
                    Spacer()
                }
                .padding(14)
                .background(sectionBackground)
            } else if !receipts.isEmpty {
                VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                    Text(String(localized: "message-info.participants", defaultValue: "Participants", bundle: .main))
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(theme.textSecondary)

                    ForEach(receipts) { receipt in
                        HStack(spacing: MeeshySpacing.sm) {
                            MeeshyAvatar(
                                name: receipt.name,
                                context: .messageBubble,
                                accentColor: receipt.color,
                                avatarURL: receipt.avatarURL
                            )

                            VStack(alignment: .leading, spacing: 2) {
                                Text(receipt.name)
                                    .font(MeeshyFont.relative(13, weight: .medium))
                                    .foregroundColor(theme.textPrimary)

                                HStack(spacing: MeeshySpacing.sm) {
                                    if let readAt = receipt.readAt {
                                        Label(readAt.formatted(date: .omitted, time: .shortened), systemImage: "checkmark.circle.fill")
                                            .font(MeeshyFont.relative(10))
                                            .foregroundColor(MeeshyColors.readReceipt)
                                    } else if let deliveredAt = receipt.deliveredAt {
                                        Label(deliveredAt.formatted(date: .omitted, time: .shortened), systemImage: "checkmark.circle")
                                            .font(MeeshyFont.relative(10))
                                            .foregroundColor(theme.textMuted)
                                    } else {
                                        Text(String(localized: "common.pending", defaultValue: "En attente", bundle: .main))
                                            .font(MeeshyFont.relative(10))
                                            .foregroundColor(theme.textMuted)
                                            .italic()
                                    }
                                }
                            }

                            Spacer()
                        }
                        .padding(.vertical, MeeshySpacing.xs)
                    }
                }
                .padding(MeeshySpacing.md)
                .background(sectionBackground)
                .opacity(appearAnimation ? 1 : 0)
                .offset(y: appearAnimation ? 0 : 25)
                .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.15), value: appearAnimation)
            }
        }
    }

    // MARK: - Fetch Read Receipts

    private func loadReadReceipts() async {
        isLoadingReceipts = true
        defer { isLoadingReceipts = false }

        do {
            let response: APIResponse<MessageReadStatusResponse> = try await APIClient.shared.request(
                endpoint: "/messages/\(message.id)/read-status"
            )
            let status = response.data
            totalMembers = status.totalMembers

            var allReceipts: [String: ParticipantReceipt] = [:]

            let readByIds = Set(status.readBy.map(\.participantId))
            let receivedLookup = Dictionary(uniqueKeysWithValues: status.receivedBy.map { ($0.participantId, $0) })

            for entry in status.readBy {
                allReceipts[entry.participantId] = ParticipantReceipt(
                    id: entry.participantId,
                    name: entry.displayName,
                    avatarURL: entry.avatarURL,
                    color: DynamicColorGenerator.colorForName(entry.displayName),
                    deliveredAt: receivedLookup[entry.participantId]?.receivedAt,
                    readAt: entry.readAt
                )
            }

            for entry in status.receivedBy where !readByIds.contains(entry.participantId) {
                allReceipts[entry.participantId] = ParticipantReceipt(
                    id: entry.participantId,
                    name: entry.displayName,
                    avatarURL: entry.avatarURL,
                    color: DynamicColorGenerator.colorForName(entry.displayName),
                    deliveredAt: entry.receivedAt,
                    readAt: nil
                )
            }

            receipts = Array(allReceipts.values).sorted { ($0.readAt ?? .distantPast) > ($1.readAt ?? .distantPast) }

            if let consumption = status.attachmentConsumption {
                attachmentConsumption = Dictionary(
                    uniqueKeysWithValues: consumption.map { ($0.attachmentId, $0.participants) }
                )
            }
        } catch {
            // Non-critical — aggregated counts still visible in timeline
        }
    }
}

// MARK: - Participant Media Progress Row

/// One participant's playback progress on an attachment: a colored identity dot,
/// the name, a position label, and a thin progress bar mirroring the in-bubble
/// `MediaConsumptionProgressBar`. Equatable + primitive inputs so it never
/// re-evaluates unless its own values change.
private struct ParticipantMediaProgressRow: View, Equatable {
    let name: String
    let color: String
    let fraction: Double
    let label: String
    let accentHex: String
    let isDark: Bool

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Circle()
                .fill(Color(hex: color))
                .frame(width: 8, height: 8)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: MeeshySpacing.sm) {
                    Text(name)
                        .font(MeeshyFont.relative(12, weight: .medium))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(1)
                    Spacer(minLength: MeeshySpacing.sm)
                    Text(label)
                        .font(MeeshyFont.relative(10, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .monospacedDigit()
                }

                GeometryReader { geo in
                    let clamped = min(1, max(0, fraction))
                    ZStack(alignment: .leading) {
                        Capsule(style: .continuous)
                            .fill(theme.textMuted.opacity(isDark ? 0.18 : 0.12))
                        Capsule(style: .continuous)
                            .fill(Color(hex: accentHex).opacity(0.85))
                            .frame(width: max(clamped > 0 ? 2 : 0, geo.size.width * CGFloat(clamped)))
                    }
                }
                .frame(height: 3)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(name): \(label)")
    }
}
