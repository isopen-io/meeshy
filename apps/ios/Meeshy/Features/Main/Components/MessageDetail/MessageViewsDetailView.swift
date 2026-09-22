import SwiftUI
import MeeshySDK
import MeeshyUI
import os

// MARK: - Views Sub-Filter

private enum ViewsFilter: String, CaseIterable, Identifiable {
    case sent, delivered, read, notSeen, listened, watched, opened

    var id: String { rawValue }

    var label: String {
        switch self {
        case .sent: return String(localized: "message-detail.views.sent", defaultValue: "Envoyé", bundle: .main)
        case .delivered: return String(localized: "message-detail.views.delivered", defaultValue: "Distribué", bundle: .main)
        case .read: return String(localized: "message-detail.views.read", defaultValue: "Lu", bundle: .main)
        case .notSeen: return String(localized: "message-detail.views.not-seen", defaultValue: "Non vu", bundle: .main)
        case .listened: return String(localized: "message-detail.views.listened", defaultValue: "Écouté", bundle: .main)
        case .watched: return String(localized: "message-detail.views.watched", defaultValue: "Vu", bundle: .main)
        case .opened: return String(localized: "message-detail.views.opened", defaultValue: "Ouvert", bundle: .main)
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
        case .opened: return "doc.viewfinder"
        }
    }

    /// La famille de consommation que cet onglet montre, s'il en montre une.
    /// Les quatre onglets de statut TEXTE (envoyé, distribué, lu, pas vu)
    /// n'en ont aucune.
    var family: MediaConsumptionFamily? {
        switch self {
        case .listened: return .listened
        case .watched: return .watched
        case .opened: return .opened
        default: return nil
        }
    }

    init(family: MediaConsumptionFamily) {
        switch family {
        case .listened: self = .listened
        case .watched: self = .watched
        case .opened: self = .opened
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

    // Historique local des tentatives d'envoi (spec 2026-07-08
    // message-send-failure-retry-flow) — vide pour les messages reçus
    // (aucune ligne `send_attempts` locale), la carte ne s'affiche pas.
    @State private var sendAttempts: [SendAttemptRecord] = []

    private var availableViewsFilters: [ViewsFilter] {
        // #7228 — un onglet par famille de consommation PRÉSENTE. La partition
        // est celle de `MediaConsumptionFamily` : audio, vidéo, et tout le
        // reste, qui s'OUVRE (image, PDF, tableur, présentation, archive…).
        let families = MessageViewsConsumption.families(in: message.attachments)
        return [.sent, .delivered, .read, .notSeen] + families.map(ViewsFilter.init(family:))
    }

    var body: some View {
        viewsTabContent
            .onAppear {
                Task {
                    await loadSendAttempts()
                    await loadReadStatus()
                    await loadAttachmentStatuses()
                }
            }
            // I3 (#7349) — la fiche ne se rechargeait qu'à l'ouverture ;
            // `read-status:updated` pour cette conversation la relance en
            // direct, sans qu'il faille la refermer puis la rouvrir. Même
            // idiome que `MessageTranscriptionDetailView` dans ce même
            // dossier (`.onReceive(MessageSocketManager.shared.<event>
            // .filter { ... })`).
            .onReceive(
                MessageSocketManager.shared.readStatusUpdated
                    .filter { $0.conversationId == conversationId }
                    .receive(on: DispatchQueue.main)
            ) { _ in
                Task { await loadReadStatus(force: true) }
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
                case .opened:
                    viewsOpenedContent(accent: accent)
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
        default:
            // Les trois onglets de consommation comptent les participants de
            // LEUR famille ; les autres n'en ont pas et restent sans pastille.
            if let family = filter.family {
                count = MessageViewsConsumption
                    .attachments(message.attachments, in: family)
                    .reduce(0) { $0 + (attachmentStatuses[$1.id]?.count ?? 0) }
            }
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
        // The count is shown visually and the active filter is otherwise
        // signalled by color alone — surface both to VoiceOver (explicit label
        // carries the count, .isSelected carries the active state) so no
        // information is lost to non-sighted users (HIG: never rely on color to
        // convey state). Mirrors MessageReactionsDetailView.reactionFilterCapsule.
        .accessibilityLabel(count.map { "\(filter.label), \($0)" } ?? filter.label)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
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

                // Même règle que la bulle : la fiche de détail lisait
                // `forward.senderName` en clair et affichait le nom de la
                // conversation source même pour un tête-à-tête. Une seule
                // surface de vérité désormais.
                if message.forwardedFrom != nil {
                    metaDivider
                    metaInfoRow(
                        icon: "arrowshape.turn.up.forward.fill",
                        label: String(localized: "message.detail.forwarded", defaultValue: "Transféré", bundle: .main),
                        value: BubbleForwardedIndicator.label(for: ForwardBadgePolicy.attribution(for: message.forwardedFrom)),
                        accent: accent
                    )
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

            if !sendAttempts.isEmpty {
                sendAttemptsCard(accent: accent)
            }
        }
    }

    // MARK: - Historique d'envoi (tentatives locales)

    /// Pluriel résolu explicitement : le markup AGA inline (`^[…](inflect: true)`)
    /// dans un `defaultValue` sans entrée String Catalog fuit en brut sur iOS 18.x.
    /// `bundle` / `locale` : même paire que `PostStatAccessibility` — la table
    /// et la règle de pluriel, injectables pour qu'un témoin fixe la loi.
    static func sendAttemptCountLabel(_ count: Int,
                                      bundle: Bundle = .main,
                                      locale: Locale = .current) -> String {
        String(
            localized: "message-detail.send-history.attempt-count",
            defaultValue: "\(count) tentatives",
            bundle: bundle,
            locale: locale
        )
    }

    private func sendAttemptsCard(accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "clock.arrow.circlepath")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(accent.opacity(0.7))
                Text(String(localized: "message-detail.send-history.title", defaultValue: "Historique d'envoi", bundle: .main))
                    .font(.caption.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                Spacer()
                Text(Self.sendAttemptCountLabel(sendAttempts.count))
                    .font(.caption2.weight(.medium))
                    .foregroundColor(theme.textMuted)
            }

            if let first = sendAttempts.first {
                metaInfoRow(
                    icon: "paperplane",
                    label: String(localized: "message-detail.send-history.first-attempt", defaultValue: "1re tentative", bundle: .main),
                    value: formatDateTimeFR(first.startedAt),
                    accent: accent
                )
            }

            VStack(spacing: 0) {
                ForEach(sendAttempts, id: \.attemptNumber) { attempt in
                    sendAttemptRow(attempt, accent: accent)
                    if attempt.attemptNumber != sendAttempts.last?.attemptNumber {
                        metaDivider
                    }
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isDark ? Color.white.opacity(0.03) : Color.black.opacity(0.015))
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
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
    }

    private func sendAttemptRow(_ attempt: SendAttemptRecord, accent: Color) -> some View {
        let isSuccess = attempt.outcome == SendAttemptRecord.Outcome.success.rawValue
        return HStack(alignment: .top, spacing: 10) {
            Image(systemName: isSuccess ? "checkmark.circle.fill" : "xmark.circle.fill")
                .font(.caption2.weight(.medium))
                .foregroundColor(isSuccess ? MeeshyColors.success : MeeshyColors.error)
                .frame(width: 16)
                .padding(.top, 1)
                .accessibilityLabel(isSuccess
                    ? String(localized: "message-detail.send-history.outcome.succeeded", defaultValue: "Réussi", bundle: .main)
                    : String(localized: "message-detail.send-history.outcome.failed", defaultValue: "Échec", bundle: .main))

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(String(localized: "message-detail.send-history.attempt-number", defaultValue: "Tentative \(attempt.attemptNumber)", bundle: .main))
                        .font(.caption.weight(.medium))
                        .foregroundColor(theme.textPrimary)
                    Text(sendAttemptTransportLabel(attempt.transport))
                        .font(.caption2.weight(.medium))
                        .foregroundColor(accent.opacity(0.8))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 1)
                        .background(Capsule().fill(accent.opacity(0.1)))
                }
                if let errorMessage = attempt.errorMessage, !errorMessage.isEmpty {
                    Text(errorMessage)
                        .font(.caption2)
                        .foregroundColor(theme.textMuted)
                        .lineLimit(2)
                }
            }

            Spacer()

            Text(formatTimeWithSecondsFR(attempt.startedAt))
                .font(.system(.caption2, design: .monospaced))
                .foregroundColor(theme.textMuted)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .accessibilityElement(children: .combine)
    }

    private func sendAttemptTransportLabel(_ transport: String) -> String {
        switch SendAttemptRecord.Transport(rawValue: transport) {
        case .socketFirst: return String(localized: "message-detail.send-history.transport.realtime", defaultValue: "Temps réel", bundle: .main)
        case .rest: return "REST"
        case .socketFallback: return String(localized: "message-detail.send-history.transport.realtime-fallback", defaultValue: "Repli temps réel", bundle: .main)
        case .outbox: return String(localized: "message-detail.send-history.transport.auto-retry", defaultValue: "Nouvelle tentative automatique", bundle: .main)
        case nil: return transport
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
            label = String(localized: "bubble.delivery.read", defaultValue: "Lu", bundle: .main)
            color = .green
        case 2:
            icon = "checkmark.circle.fill"
            label = String(localized: "bubble.delivery.delivered", defaultValue: "Distribué", bundle: .main)
            color = accent
        case 1:
            icon = "checkmark"
            label = String(localized: "bubble.delivery.sent", defaultValue: "Envoyé", bundle: .main)
            color = accent.opacity(0.7)
        case 0:
            icon = "arrow.up.circle"
            label = String(localized: "bubble.delivery.sending", defaultValue: "Envoi en cours", bundle: .main)
            color = theme.textMuted
        default:
            icon = "exclamationmark.circle"
            label = String(localized: "bubble.delivery.failed", defaultValue: "Échec de l'envoi", bundle: .main)
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
        .accessibilityElement(children: .combine)
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
            if showsReadStatusSpinner {
                loadingIndicator(accent: accent)
            } else if let status = readStatusData {
                if status.receivedBy.isEmpty {
                    emptyStateView(icon: "checkmark.circle", text: String(localized: "message-detail.views.delivered.empty", defaultValue: "Aucune confirmation de distribution", bundle: .main), accent: accent)
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
            if showsReadStatusSpinner {
                loadingIndicator(accent: accent)
            } else if let status = readStatusData {
                if status.readBy.isEmpty {
                    emptyStateView(icon: "eye.slash", text: String(localized: "message-detail.views.read.empty", defaultValue: "Personne n'a lu ce message", bundle: .main), accent: accent)
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
            if showsReadStatusSpinner {
                loadingIndicator(accent: accent)
            } else if let status = readStatusData {
                let notSeen = status.notSeenBy ?? []
                if notSeen.isEmpty {
                    emptyStateView(icon: "checkmark.circle", text: String(localized: "message-detail.views.not-seen.empty", defaultValue: "Tout le monde a reçu le message", bundle: .main), accent: accent)
                } else {
                    timelineBanner(
                        icon: "eye.slash.fill",
                        text: String(localized: "message-detail.views.not-seen.title", defaultValue: "Pas encore vu", bundle: .main),
                        detail: String(localized: "message-detail.views.not-seen.count", defaultValue: "^[\(notSeen.count) participant](inflect: true)", bundle: .main),
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

    // MARK: - Consommation par pièce jointe (écoutée / visionnée / ouverte)

    private func viewsListenedContent(accent: Color) -> some View {
        consumptionContent(family: .listened, accent: accent)
    }

    private func viewsWatchedContent(accent: Color) -> some View {
        consumptionContent(family: .watched, accent: accent)
    }

    private func viewsOpenedContent(accent: Color) -> some View {
        consumptionContent(family: .opened, accent: accent)
    }

    /// Une carte par pièce jointe de la famille. UNE fonction pour les trois
    /// onglets (#7228) : les trois corps recopiés divergeaient — seul celui de
    /// l'audio savait dire « Nx », et aucun ne montrait les téléchargements.
    private func consumptionContent(family: MediaConsumptionFamily, accent: Color) -> some View {
        let attachments = MessageViewsConsumption.attachments(message.attachments, in: family)

        return VStack(alignment: .leading, spacing: 14) {
            if isLoadingAttachmentStatuses {
                loadingIndicator(accent: accent)
            } else if attachments.isEmpty {
                emptyStateView(icon: Self.emptyIcon(for: family), text: Self.emptyLabel(for: family), accent: accent)
            } else {
                ForEach(attachments) { attachment in
                    mediaConsumptionCard(attachment: attachment, family: family, accent: accent)
                }
            }
        }
    }

    private static func emptyIcon(for family: MediaConsumptionFamily) -> String {
        switch family {
        case .listened: return "headphones"
        case .watched: return "play.rectangle"
        case .opened: return "doc.viewfinder"
        }
    }

    private static func emptyLabel(for family: MediaConsumptionFamily) -> String {
        switch family {
        case .listened:
            return String(localized: "message-detail.views.audio.empty", defaultValue: "Aucun audio attaché", bundle: .main)
        case .watched:
            return String(localized: "message-detail.views.video.empty", defaultValue: "Aucune vidéo attachée", bundle: .main)
        case .opened:
            return String(localized: "message-detail.views.opened.empty", defaultValue: "Aucune image ni document attaché", bundle: .main)
        }
    }

    /// « Personne n'a encore … » — le verbe suit la famille, et il est
    /// LOCALISÉ : les deux libellés d'origine étaient des littéraux français
    /// sans accents (« Pas encore ecoute »), donc servis tels quels aux sept
    /// langues.
    private static func notConsumedLabel(for family: MediaConsumptionFamily) -> String {
        switch family {
        case .listened:
            return String(localized: "message-detail.views.not-listened", defaultValue: "Pas encore écouté", bundle: .main)
        case .watched:
            return String(localized: "message-detail.views.not-watched", defaultValue: "Pas encore visionné", bundle: .main)
        case .opened:
            return String(localized: "message-detail.views.not-opened", defaultValue: "Pas encore ouvert", bundle: .main)
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

    /// #7228 — la famille est PASSÉE, plus devinée depuis un booléen `isAudio`
    /// que la vidéo et l'image partageaient déjà à contresens.
    private func mediaConsumptionCard(attachment: MessageAttachment, family: MediaConsumptionFamily, accent: Color) -> some View {
        let users = attachmentStatuses[attachment.id] ?? []
        let kind = AttachmentKind(mimeType: attachment.mimeType)
        // Audio et vidéo gardent leurs glyphes historiques ; tout le reste tire
        // le sien d'`AttachmentKind.sfSymbolName`, seule source des glyphes de
        // pièce jointe du dépôt (un PDF n'est pas un document Word).
        let icon = family == .listened ? "waveform" : family == .watched ? "film" : kind.sfSymbolName
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
                Text(Self.notConsumedLabel(for: family))
                    .font(.caption)
                    .foregroundColor(theme.textMuted)
                    .padding(.vertical, 4)
            } else {
                // User consumption rows
                ForEach(Array(users.enumerated()), id: \.element.id) { index, user in
                    let reading = MessageViewsConsumption.reading(for: user, in: family)
                    let fraction = family.showsProgress
                        ? Self.positionFraction(positionMs: reading.positionMs, complete: reading.isComplete, durationMs: attachment.duration)
                        : 0

                    VStack(alignment: .leading, spacing: 4) {
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

                                if let date = reading.consumedAt {
                                    Text(relativeDate(date))
                                        .font(.caption2)
                                        .foregroundColor(theme.textMuted)
                                }
                            }

                            Spacer()

                            // Compteur de consommations — écoutes, visionnages
                            // ou OUVERTURES (`viewCount`, servi par la
                            // passerelle et jeté par le décodeur avant #7228).
                            if let c = reading.count, c > 1 {
                                Text("\(c)x")
                                    .font(.system(.caption2, design: .monospaced).weight(.bold))
                                    .foregroundColor(accent.opacity(0.8))
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 2)
                                    .background(
                                        Capsule().fill(accent.opacity(0.08))
                                    )
                            }

                            // Téléchargement — servi pour toutes les familles
                            // et affiché nulle part avant #7228. Il occupe la
                            // place que la progression laisse libre sur ce qui
                            // n'a pas de piste.
                            if let downloadedAt = reading.downloadedAt {
                                HStack(spacing: 3) {
                                    Image(systemName: "arrow.down.circle.fill")
                                        .font(.caption2)
                                    Text(relativeDate(downloadedAt))
                                        .font(.caption2.weight(.semibold))
                                }
                                .foregroundColor(theme.textMuted)
                                .accessibilityElement(children: .combine)
                                .accessibilityLabel(
                                    String(
                                        format: String(localized: "message-detail.views.downloaded.a11y", defaultValue: "Téléchargé %@", bundle: .main),
                                        relativeDate(downloadedAt)
                                    )
                                )
                            }

                            // Progression — seulement pour un média à piste.
                            if family.showsProgress {
                                if reading.isComplete {
                                    HStack(spacing: 3) {
                                        Image(systemName: "checkmark.circle.fill")
                                            .font(.caption2)
                                        Text(String(localized: "message-detail.complete", defaultValue: "complet", bundle: .main))
                                            .font(.caption2.weight(.semibold))
                                    }
                                    .foregroundColor(MeeshyColors.success)
                                } else if let pos = reading.positionMs, pos > 0 {
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
                        }

                        // La barre ne s'affiche que pour un média à piste : une
                        // image ouverte n'est ni « à 40 % » ni « complète ».
                        if family.showsProgress, !reading.isComplete, fraction > 0 {
                            HStack(spacing: 6) {
                                ProgressView(value: fraction)
                                    .progressViewStyle(.linear)
                                    .tint(accent)
                                Text("\(Int((fraction * 100).rounded()))%")
                                    .font(.system(.caption2, design: .monospaced).weight(.semibold))
                                    .foregroundColor(theme.textMuted)
                                    .frame(minWidth: 30, alignment: .trailing)
                            }
                            .padding(.leading, 54)
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
                // 28pt (< 40pt hero freeze) paired with a footnote caption → scale
                // it with Dynamic Type so icon and caption grow in proportion.
                .font(MeeshyFont.relative(28, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))
                // Decorative — the caption below already states the empty state.
                .accessibilityHidden(true)
            Text(text)
                .font(.footnote.weight(.medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
        // Read the whole empty state as the single caption, not "image" + text.
        .accessibilityElement(children: .combine)
    }

    private func retryableErrorView(accent: Color) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.slash")
                // 28pt (< 40pt hero freeze) paired with a footnote caption → scale
                // it with Dynamic Type so icon and caption grow in proportion.
                .font(MeeshyFont.relative(28, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))
                // Decorative — the error caption + Retry button carry the meaning.
                // Not combined into one element: the button must stay independently
                // focusable for VoiceOver.
                .accessibilityHidden(true)
            Text(readStatusError ?? String(localized: "message-detail.load-error", defaultValue: "Impossible de charger les données", bundle: .main))
                .font(.footnote.weight(.medium))
                .foregroundColor(theme.textMuted)
            Button {
                readStatusData = nil
                Task { await loadReadStatus() }
            } label: {
                Text(String(localized: "common.retry", defaultValue: "Réessayer", bundle: .main))
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

    private func loadSendAttempts() async {
        guard sendAttempts.isEmpty else { return }
        sendAttempts = (try? await DependencyContainer.shared.messagePersistence
            .sendAttempts(messageId: message.id)) ?? []
    }

    /// Les deux règles pures — « faut-il repartir au réseau » et « le spinner
    /// a-t-il le droit de remplacer ce qui est à l'écran » — vivent dans
    /// `MessageViewsReadStatusRules`, éprouvables sans monter SwiftUI.
    private var showsReadStatusSpinner: Bool {
        MessageViewsReadStatusRules.showsSpinner(
            isLoading: isLoadingReadStatus, hasExisting: readStatusData != nil
        )
    }

    private func loadReadStatus(force: Bool = false) async {
        guard MessageViewsReadStatusRules.shouldFetch(
            hasExisting: readStatusData != nil,
            isLoading: isLoadingReadStatus,
            force: force,
            hasServerId: messageHasServerId
        ) else { return }
        isLoadingReadStatus = true
        readStatusError = nil
        defer { isLoadingReadStatus = false }
        do {
            let response: APIResponse<ReadStatusData> = try await APIClient.shared.request(
                MessagesEndpoint.byMessageIdReadStatus(messageId: message.id)
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

    /// #7228 — TOUTES les pièces jointes, plus seulement les médias à piste :
    /// une image et un document ont des ouvertures et des téléchargements à
    /// montrer. La boucle SÉRIELLE d'origine coûtait alors un aller-retour par
    /// photo — dix photos, dix attentes en file derrière un seul spinner — et
    /// écrivait l'état dix fois, donc dix rendus. Les appels partent ensemble,
    /// et `attachmentStatuses` n'est écrit QU'UNE fois.
    private func loadAttachmentStatuses() async {
        let targets = MessageViewsConsumption.statusTargets(in: message.attachments)
        guard !targets.isEmpty, !isLoadingAttachmentStatuses else { return }
        isLoadingAttachmentStatuses = true
        defer { isLoadingAttachmentStatuses = false }

        let loaded = await withTaskGroup(of: (String, [AttachmentStatusUser])?.self) { group in
            for attachment in targets {
                group.addTask {
                    do {
                        let statuses = try await AttachmentService.shared.getStatusDetails(attachmentId: attachment.id)
                        return (attachment.id, statuses)
                    } catch {
                        Logger.network.error("attachment status fetch failed for \(attachment.id): \(error.localizedDescription)")
                        return nil
                    }
                }
            }
            var accumulated: [String: [AttachmentStatusUser]] = [:]
            for await result in group {
                guard let result else { continue }
                accumulated[result.0] = result.1
            }
            return accumulated
        }

        attachmentStatuses.merge(loaded) { _, fresh in fresh }
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

    private func formatTimeWithSecondsFR(_ date: Date) -> String {
        date.formatted(.dateTime.hour().minute().second())
    }

    private func formatDuration(_ seconds: Int) -> String {
        LocalizedNumber.duration(seconds: seconds)
    }

    private func relativeDate(_ date: Date) -> String {
        RelativeTimeFormatter.longString(for: date)
    }

    /// Fraction (`0...1`) of an attachment consumed by a participant — ported
    /// from the (now-deleted) `MessageInfoSheet.mediaFraction`. `complete`
    /// always wins: a media marked complete reads as fully consumed
    /// regardless of the last reported position (matches the server's own
    /// `listenedComplete`/`watchedComplete` semantics).
    static func positionFraction(positionMs: Int?, complete: Bool, durationMs: Int?) -> Double {
        if complete { return 1 }
        guard let durationMs, durationMs > 0, let positionMs else { return 0 }
        return min(1, max(0, Double(positionMs) / Double(durationMs)))
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
