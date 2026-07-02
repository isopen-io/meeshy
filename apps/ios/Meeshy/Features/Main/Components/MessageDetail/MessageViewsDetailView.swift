import SwiftUI
import MeeshySDK
import MeeshyUI
import os

// MARK: - Views Sub-Filter

private enum ViewsFilter: String, CaseIterable, Identifiable {
    case sent, delivered, read, notSeen, listened, watched

    var id: String { rawValue }

    var label: String {
        switch self {
        case .sent: return String(localized: "message-detail.views.sent", defaultValue: "Sent", bundle: .main)
        case .delivered: return String(localized: "message-detail.views.delivered", defaultValue: "Delivered", bundle: .main)
        case .read: return String(localized: "message-detail.views.read", defaultValue: "Read", bundle: .main)
        case .notSeen: return String(localized: "message-detail.views.not-seen", defaultValue: "Not seen", bundle: .main)
        case .listened: return String(localized: "message-detail.views.listened", defaultValue: "Listened", bundle: .main)
        case .watched: return String(localized: "message-detail.views.watched", defaultValue: "Seen", bundle: .main)
        }
    }

    var icon: String {
        switch self {
        case .sent: return "paperplane.fill"
        case .delivered: return "checkmark.circle.fill"
        case .read: return "eye.fill"
        case .notSeen: return "eye.slash.fill"
        case .listened: return "headphones"
        case .watched: return "play.rectangle.fill"
        }
    }
}

// MARK: - MessageViewsDetailView

/// Onglet « Qui a vu » du détail d'un message : sous-filtres (Envoyé / Distribué /
/// Lu / Pas vu / Écouté / Vu) + listes d'utilisateurs et cartes de consommation
/// média. État de read-status 100 % encapsulé — extrait de l'ancien
/// `MessageDetailSheet.viewsTabContent`. Aucun changement de comportement.
struct MessageViewsDetailView: View {
    let message: Message
    let contactColor: String
    let conversationId: String

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    // Read status state
    @State private var readStatusData: ReadStatusData? = nil
    @State private var isLoadingReadStatus = false
    @State private var attachmentStatuses: [String: [AttachmentStatusUser]] = [:]
    @State private var isLoadingAttachmentStatuses = false
    @State private var readStatusError: String? = nil

    // Views sub-filter
    @State private var viewsFilter: ViewsFilter = .sent

    private var availableViewsFilters: [ViewsFilter] {
        var filters: [ViewsFilter] = [.sent, .delivered, .read, .notSeen]
        let hasAudio = message.attachments.contains { AttachmentKind(mimeType: $0.mimeType) == .audio }
        let hasVideo = message.attachments.contains { AttachmentKind(mimeType: $0.mimeType) == .video }
        if hasAudio { filters.append(.listened) }
        if hasVideo { filters.append(.watched) }
        return filters
    }

    var body: some View {
        viewsTabContent
            .onAppear {
                Task {
                    await loadReadStatus()
                    await loadAttachmentStatuses()
                }
            }
    }

    // MARK: - Views Tab Content (Premium Redesign)

    private var viewsTabContent: some View {
        let accent = Color(hex: contactColor)

        return VStack(alignment: .leading, spacing: 0) {
            // Sub-filter capsules
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(availableViewsFilters) { filter in
                        viewsFilterCapsule(filter, accent: accent)
                    }
                }
            }
            .padding(.bottom, 14)

            // Content for selected filter
            Group {
                switch viewsFilter {
                case .sent:
                    viewsSentContent(accent: accent)
                case .delivered:
                    viewsDeliveredContent(accent: accent)
                case .read:
                    viewsReadContent(accent: accent)
                case .notSeen:
                    viewsNotSeenContent(accent: accent)
                case .listened:
                    viewsListenedContent(accent: accent)
                case .watched:
                    viewsWatchedContent(accent: accent)
                }
            }
            .id(viewsFilter)
            .transition(.asymmetric(
                insertion: .opacity.combined(with: .move(edge: .trailing)),
                removal: .opacity.combined(with: .move(edge: .leading))
            ))
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: viewsFilter)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func viewsFilterCapsule(_ filter: ViewsFilter, accent: Color) -> some View {
        let isSelected = viewsFilter == filter
        var count: Int? = nil

        switch filter {
        case .delivered: count = readStatusData?.receivedCount
        case .read: count = readStatusData?.readCount
        case .notSeen: count = readStatusData?.notSeenCount
        case .listened:
            let audioIds = message.attachments.filter { AttachmentKind(mimeType: $0.mimeType) == .audio }.map(\.id)
            count = audioIds.reduce(0) { $0 + (attachmentStatuses[$1]?.count ?? 0) }
        case .watched:
            let videoIds = message.attachments.filter { AttachmentKind(mimeType: $0.mimeType) == .video }.map(\.id)
            count = videoIds.reduce(0) { $0 + (attachmentStatuses[$1]?.count ?? 0) }
        default: break
        }

        return Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                viewsFilter = filter
            }
            HapticFeedback.light()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: filter.icon)
                    .font(.caption2.weight(.medium))
                Text(filter.label)
                    .font(.caption.weight(.medium))
                if let count {
                    Text("\(count)")
                        .font(.system(.caption2, design: .monospaced).weight(.bold))
                        .foregroundColor(isSelected ? accent : theme.textMuted)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(
                            Capsule()
                                .fill(isSelected ? accent.opacity(0.15) : isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
                        )
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(
                Capsule()
                    .fill(isSelected ? accent.opacity(0.15) : isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.02))
            )
            .overlay(
                Capsule()
                    .stroke(isSelected ? accent.opacity(0.35) : Color.clear, lineWidth: 0.5)
            )
            .foregroundColor(isSelected ? accent : theme.textMuted)
        }
    }

    // MARK: - Envoyé (Sent) — Message Info + Author

    private func viewsSentContent(accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            // Author card with avatar
            HStack(spacing: 12) {
                MeeshyAvatar(
                    name: message.senderName ?? "?",
                    context: .userListItem,
                    accentColor: message.senderColor ?? contactColor,
                    avatarURL: message.senderAvatarURL
                )

                VStack(alignment: .leading, spacing: 3) {
                    Text(message.senderName ?? "Inconnu")
                        .font(.callout.weight(.semibold))
                        .foregroundColor(theme.textPrimary)

                    Text(formatDateFR(message.createdAt))
                        .font(.caption.weight(.medium))
                        .foregroundColor(theme.textMuted)
                }

                Spacer()

                // Delivery badge
                deliveryBadge(accent: accent)
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.02))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(accent.opacity(0.1), lineWidth: 0.5)
                    )
            )

            // Message meta info (merged from old Meta tab)
            VStack(spacing: 0) {
                metaInfoRow(icon: "number", label: "ID", value: String(message.id.prefix(12)), accent: accent)
                metaDivider
                metaInfoRow(icon: "bubble.left.fill", label: "Type", value: message.messageType.rawValue, accent: accent)
                metaDivider
                metaInfoRow(icon: "antenna.radiowaves.left.and.right", label: "Source", value: message.messageSource.rawValue, accent: accent)
                metaDivider
                metaInfoRow(icon: "globe", label: "Langue", value: message.originalLanguage.uppercased(), accent: accent)
                metaDivider
                metaInfoRow(
                    icon: "lock.shield.fill",
                    label: "Chiffrement",
                    value: message.isEncrypted
                        ? "Oui" + (message.encryptionMode.map { " (\($0))" } ?? "")
                        : "Non",
                    accent: accent,
                    valueColor: message.isEncrypted ? .green : nil
                )

                if message.isEdited {
                    metaDivider
                    metaInfoRow(icon: "pencil", label: "Modifie", value: formatDateTimeFR(message.updatedAt), accent: accent, valueColor: .yellow)
                }

                if !message.attachments.isEmpty {
                    metaDivider
                    let types = Set(message.attachments.map {
                        $0.mimeType.components(separatedBy: "/").first ?? "file"
                    })
                    metaInfoRow(
                        icon: "paperclip",
                        label: "Pieces jointes",
                        value: "\(message.attachments.count) (\(types.sorted().joined(separator: ", ")))",
                        accent: accent
                    )
                }

                if let forward = message.forwardedFrom {
                    metaDivider
                    metaInfoRow(icon: "arrowshape.turn.up.forward.fill", label: "Transfere de", value: forward.senderName, accent: accent)
                    if let convo = forward.conversationName {
                        metaDivider
                        metaInfoRow(icon: "bubble.left.and.bubble.right", label: "Conversation", value: convo, accent: accent)
                    }
                }

                if let reply = message.replyTo {
                    metaDivider
                    metaInfoRow(icon: "arrowshape.turn.up.left.fill", label: "Reponse a", value: reply.authorName, accent: accent)
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isDark ? Color.white.opacity(0.03) : Color.black.opacity(0.015))
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private func deliveryBadge(accent: Color) -> some View {
        let level = deliveryStatusLevel
        let icon: String
        let label: String
        let color: Color

        switch level {
        case 3:
            icon = "eye.fill"
            label = "Lu"
            color = .green
        case 2:
            icon = "checkmark.circle.fill"
            label = "Distribue"
            color = accent
        case 1:
            icon = "checkmark"
            label = "Envoye"
            color = accent.opacity(0.7)
        case 0:
            icon = "arrow.up.circle"
            label = "Envoi..."
            color = theme.textMuted
        default:
            icon = "exclamationmark.circle"
            label = "Echec"
            color = .red
        }

        return HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption2.weight(.semibold))
            Text(label)
                .font(.caption2.weight(.semibold))
        }
        .foregroundColor(color)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(color.opacity(0.12))
        )
    }

    private func metaInfoRow(icon: String, label: String, value: String, accent: Color, valueColor: Color? = nil) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.caption2.weight(.medium))
                .foregroundColor(accent.opacity(0.6))
                .frame(width: 16)

            Text(label)
                .font(.caption.weight(.medium))
                .foregroundColor(theme.textMuted)
                .frame(width: 85, alignment: .leading)

            Text(value)
                .font(.caption.weight(.medium))
                .foregroundColor(valueColor ?? theme.textPrimary)
                .lineLimit(1)

            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
    }

    private var metaDivider: some View {
        Rectangle()
            .fill(isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.03))
            .frame(height: 0.5)
            .padding(.leading, 38)
    }

    // MARK: - Distribué (Delivered) — User List

    private func viewsDeliveredContent(accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if isLoadingReadStatus {
                loadingIndicator(accent: accent)
            } else if let status = readStatusData {
                if status.receivedBy.isEmpty {
                    emptyStateView(icon: "checkmark.circle", text: "Aucune confirmation de distribution", accent: accent)
                } else {
                    timelineBanner(
                        icon: "checkmark.circle.fill",
                        text: status.receivedCount >= status.totalMembers ? "Distribue a tous" : "Distribue",
                        detail: status.receivedBy.first.map { formatTimeFR($0.receivedAt) } ?? "",
                        count: "\(status.receivedCount)/\(status.totalMembers)",
                        accent: accent
                    )

                    LazyVStack(spacing: 0) {
                        ForEach(Array(status.receivedBy.enumerated()), id: \.element.participantId) { index, user in
                            userStatusRow(
                                username: user.displayName,
                                avatar: user.avatarURL,
                                date: user.receivedAt,
                                accent: accent,
                                index: index
                            )
                        }
                    }
                }
            } else {
                retryableErrorView(accent: accent)
            }
        }
    }

    // MARK: - Lu (Read) — User List

    private func viewsReadContent(accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if isLoadingReadStatus {
                loadingIndicator(accent: accent)
            } else if let status = readStatusData {
                if status.readBy.isEmpty {
                    emptyStateView(icon: "eye.slash", text: "Personne n'a lu ce message", accent: accent)
                } else {
                    timelineBanner(
                        icon: "eye.fill",
                        text: status.readCount >= status.totalMembers ? "Lu par tous" : "Lu",
                        detail: status.readBy.first.map { formatTimeFR($0.readAt) } ?? "",
                        count: "\(status.readCount)/\(status.totalMembers)",
                        accent: accent
                    )

                    LazyVStack(spacing: 0) {
                        ForEach(Array(status.readBy.enumerated()), id: \.element.participantId) { index, user in
                            userStatusRow(
                                username: user.displayName,
                                avatar: user.avatarURL,
                                date: user.readAt,
                                accent: accent,
                                index: index
                            )
                        }
                    }
                }
            } else {
                retryableErrorView(accent: accent)
            }
        }
    }

    // MARK: - Pas vu (Not Seen) — User List

    private func viewsNotSeenContent(accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if isLoadingReadStatus {
                loadingIndicator(accent: accent)
            } else if let status = readStatusData {
                let notSeen = status.notSeenBy ?? []
                if notSeen.isEmpty {
                    emptyStateView(icon: "checkmark.circle", text: "Tout le monde a recu le message", accent: accent)
                } else {
                    timelineBanner(
                        icon: "eye.slash.fill",
                        text: "Pas encore vu",
                        detail: "\(notSeen.count) participant\(notSeen.count > 1 ? "s" : "")",
                        count: "\(notSeen.count)/\(status.totalMembers)",
                        accent: accent
                    )

                    LazyVStack(spacing: 0) {
                        ForEach(Array(notSeen.enumerated()), id: \.element.participantId) { index, user in
                            userStatusRow(
                                username: user.displayName,
                                avatar: user.avatarURL,
                                date: nil,
                                accent: accent,
                                index: index
                            )
                        }
                    }
                }
            } else {
                retryableErrorView(accent: accent)
            }
        }
    }

    // MARK: - Écouté (Listened) — Per-Audio Attachment

    private func viewsListenedContent(accent: Color) -> some View {
        let audioAttachments = message.attachments.filter { AttachmentKind(mimeType: $0.mimeType) == .audio }

        return VStack(alignment: .leading, spacing: 14) {
            if isLoadingAttachmentStatuses {
                loadingIndicator(accent: accent)
            } else {
                ForEach(audioAttachments) { attachment in
                    mediaConsumptionCard(
                        attachment: attachment,
                        isAudio: true,
                        accent: accent
                    )
                }

                if audioAttachments.isEmpty {
                    emptyStateView(icon: "headphones", text: "Aucun audio attache", accent: accent)
                }
            }
        }
    }

    // MARK: - Vu (Watched) — Per-Video Attachment

    private func viewsWatchedContent(accent: Color) -> some View {
        let videoAttachments = message.attachments.filter { AttachmentKind(mimeType: $0.mimeType) == .video }

        return VStack(alignment: .leading, spacing: 14) {
            if isLoadingAttachmentStatuses {
                loadingIndicator(accent: accent)
            } else {
                ForEach(videoAttachments) { attachment in
                    mediaConsumptionCard(
                        attachment: attachment,
                        isAudio: false,
                        accent: accent
                    )
                }

                if videoAttachments.isEmpty {
                    emptyStateView(icon: "play.rectangle", text: "Aucune video attachee", accent: accent)
                }
            }
        }
    }

    // MARK: - Shared Views Components

    private func timelineBanner(icon: String, text: String, detail: String, count: String? = nil, accent: Color) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(accent)

            VStack(alignment: .leading, spacing: 1) {
                Text(text)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                Text(detail)
                    .font(.caption2)
                    .foregroundColor(theme.textMuted)
            }

            Spacer()

            if let count {
                Text(count)
                    .font(.system(.caption, design: .monospaced).weight(.bold))
                    .foregroundColor(accent)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(
                        Capsule()
                            .fill(accent.opacity(0.12))
                    )
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(accent.opacity(isDark ? 0.06 : 0.04))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(accent.opacity(0.12), lineWidth: 0.5)
                )
        )
    }

    private func userStatusRow(username: String, avatar: String?, date: Date?, accent: Color, index: Int, trailing: AnyView? = nil) -> some View {
        HStack(spacing: 10) {
            MeeshyAvatar(
                name: username,
                context: .userListItem,
                accentColor: contactColor,
                avatarURL: avatar
            )

            Text(username)
                .font(.footnote.weight(.medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            if let trailing {
                trailing
            }

            if let date {
                Text(relativeDate(date))
                    .font(.caption2)
                    .foregroundColor(theme.textMuted)
            } else {
                Image(systemName: "clock")
                    .font(.caption2)
                    .foregroundColor(theme.textMuted)
            }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 4)
    }

    private func mediaConsumptionCard(attachment: MessageAttachment, isAudio: Bool, accent: Color) -> some View {
        let users = attachmentStatuses[attachment.id] ?? []
        let icon = isAudio ? "waveform" : "film"
        let name = attachment.originalName.isEmpty ? attachment.fileName : attachment.originalName

        return VStack(alignment: .leading, spacing: 10) {
            // Attachment header
            HStack(spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(accent.opacity(isDark ? 0.15 : 0.1))
                        .frame(width: 32, height: 32)
                    Image(systemName: icon)
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(accent)
                }

                VStack(alignment: .leading, spacing: 1) {
                    Text(name)
                        .font(.caption.weight(.semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    if let duration = attachment.duration {
                        Text(formatDuration(duration / 1000))
                            .font(.system(.caption2, design: .monospaced).weight(.medium))
                            .foregroundColor(theme.textMuted)
                    }
                }

                Spacer()

                Text("\(users.count)")
                    .font(.system(.caption2, design: .monospaced).weight(.bold))
                    .foregroundColor(accent)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(accent.opacity(0.12)))
            }

            if users.isEmpty {
                Text(isAudio ? "Pas encore ecoute" : "Pas encore visionne")
                    .font(.caption)
                    .foregroundColor(theme.textMuted)
                    .padding(.vertical, 4)
            } else {
                // User consumption rows
                ForEach(Array(users.enumerated()), id: \.element.id) { index, user in
                    let listenDate = isAudio ? user.listenedAt : user.watchedAt
                    let isComplete = isAudio ? (user.listenedComplete ?? false) : (user.watchedComplete ?? false)
                    let positionMs = isAudio ? user.lastPlayPositionMs : user.lastWatchPositionMs
                    let count = isAudio ? user.listenCount : user.watchCount

                    HStack(spacing: 10) {
                        MeeshyAvatar(
                            name: user.username,
                            context: .userListItem,
                            accentColor: contactColor,
                            avatarURL: user.avatar
                        )

                        VStack(alignment: .leading, spacing: 1) {
                            Text(user.username)
                                .font(.caption.weight(.medium))
                                .foregroundColor(theme.textPrimary)

                            if let date = listenDate {
                                Text(relativeDate(date))
                                    .font(.caption2)
                                    .foregroundColor(theme.textMuted)
                            }
                        }

                        Spacer()

                        // Play count badge
                        if let c = count, c > 1 {
                            Text("\(c)x")
                                .font(.system(.caption2, design: .monospaced).weight(.bold))
                                .foregroundColor(accent.opacity(0.8))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(
                                    Capsule().fill(accent.opacity(0.08))
                                )
                        }

                        // Completion status
                        if isComplete {
                            HStack(spacing: 3) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.caption2)
                                Text(String(localized: "message-detail.complete", defaultValue: "complet", bundle: .main))
                                    .font(.caption2.weight(.semibold))
                            }
                            .foregroundColor(MeeshyColors.success)
                        } else if let pos = positionMs, pos > 0 {
                            Text(formatDuration(pos / 1000))
                                .font(.system(.caption2, design: .monospaced).weight(.semibold))
                                .foregroundColor(theme.textMuted)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(
                                    Capsule()
                                        .fill(isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
                                )
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(isDark ? Color.white.opacity(0.03) : Color.black.opacity(0.015))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04), lineWidth: 0.5)
                )
        )
    }

    private func loadingIndicator(accent: Color) -> some View {
        HStack {
            Spacer()
            ProgressView()
                .tint(accent)
            Spacer()
        }
        .padding(.vertical, 30)
    }

    private func emptyStateView(icon: String, text: String, accent: Color) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 28, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))
            Text(text)
                .font(.footnote.weight(.medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
    }

    private func retryableErrorView(accent: Color) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 28, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))
            Text(readStatusError ?? String(localized: "message-detail.load-error", defaultValue: "Impossible de charger les donnees", bundle: .main))
                .font(.footnote.weight(.medium))
                .foregroundColor(theme.textMuted)
            Button {
                readStatusData = nil
                Task { await loadReadStatus() }
            } label: {
                Text(String(localized: "common.retry", defaultValue: "Reessayer", bundle: .main))
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(accent))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
    }

    // MARK: - Network Actions

    /// `true` quand `message.id` est un ObjectId MongoDB (24 hex). Un message
    /// encore optimiste garde son id local `cid_…` (l'upgrade in-place ne
    /// change jamais l'identité SwiftUI) : il n'existe pas côté serveur, et
    /// les endpoints `/messages/:id/...` répondraient 400 "Validation failed".
    private var messageHasServerId: Bool {
        message.id.count == 24 && message.id.allSatisfy(\.isHexDigit)
    }

    private func loadReadStatus() async {
        guard readStatusData == nil, !isLoadingReadStatus else { return }
        guard messageHasServerId else { return }
        isLoadingReadStatus = true
        readStatusError = nil
        defer { isLoadingReadStatus = false }
        do {
            let response: APIResponse<ReadStatusData> = try await APIClient.shared.request(
                endpoint: "/messages/\(message.id)/read-status"
            )
            if response.success {
                readStatusData = response.data
            } else {
                readStatusError = "Erreur serveur"
                Logger.network.error("read-status error: success=false")
            }
        } catch {
            readStatusError = "Erreur de connexion"
            Logger.network.error("read-status decode/network error: \(error)")
        }
    }

    private func loadAttachmentStatuses() async {
        let mediaAttachments = message.attachments.filter {
            AttachmentKind(mimeType: $0.mimeType).hasTimebasedTrack
        }
        guard !mediaAttachments.isEmpty, !isLoadingAttachmentStatuses else { return }
        isLoadingAttachmentStatuses = true
        defer { isLoadingAttachmentStatuses = false }

        for attachment in mediaAttachments {
            do {
                let statuses = try await AttachmentService.shared.getStatusDetails(attachmentId: attachment.id)
                attachmentStatuses[attachment.id] = statuses
            } catch {
                Logger.network.error("attachment status fetch failed for \(attachment.id): \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Helpers

    private var deliveryStatusLevel: Int {
        // Phase 4 spec §6.2 — `.invisible`, `.clock`, `.slow` are all visual
        // refinements of the "still sending" phase (between optimistic apply
        // and server ACK). They share level 0 with `.sending` so the badge
        // collapses them to the single "Envoi..." label, matching the existing
        // 4-bucket design (failed / sending / sent / delivered / read).
        switch message.deliveryStatus {
        case .failed: return -1
        case .sending, .invisible, .clock, .slow: return 0
        case .sent: return 1
        case .delivered: return 2
        case .read: return 3
        }
    }

    private func formatDateFR(_ date: Date) -> String {
        date.formatted(.dateTime.day().month().year().hour().minute())
    }

    private func formatTimeFR(_ date: Date) -> String {
        date.formatted(.dateTime.hour().minute())
    }

    private func formatDateTimeFR(_ date: Date) -> String {
        date.formatted(.dateTime.day().month().year().hour().minute())
    }

    private func formatDuration(_ seconds: Int) -> String {
        let mins = seconds / 60
        let secs = seconds % 60
        return String(format: "%d:%02d", mins, secs)
    }

    private func relativeDate(_ date: Date) -> String {
        RelativeTimeFormatter.longString(for: date)
    }
}

// MARK: - Read Status API Models

private struct ReadStatusData: Decodable {
    let messageId: String
    let totalMembers: Int
    let receivedCount: Int
    let readCount: Int
    let notSeenCount: Int?
    let receivedBy: [ReceivedByUser]
    let readBy: [ReadByUser]
    let notSeenBy: [NotSeenByUser]?
}

private struct ReceivedByUser: Decodable, Identifiable {
    let participantId: String
    let displayName: String
    let avatarURL: String?
    let receivedAt: Date
    var id: String { participantId }
}

private struct ReadByUser: Decodable, Identifiable {
    let participantId: String
    let displayName: String
    let avatarURL: String?
    let readAt: Date
    var id: String { participantId }
}

private struct NotSeenByUser: Decodable, Identifiable {
    let participantId: String
    let displayName: String
    let avatarURL: String?
    var id: String { participantId }
}
