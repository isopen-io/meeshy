import SwiftUI
import MeeshySDK
import MeeshyUI
import os

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
    @State private var readStatusError: MessageViewsLabels.LoadFailure? = nil
    /// Les membres connus de la conversation, par identifiant de PARTICIPATION (#10956) : les
    /// listes de lecture ne servent que celui-là, et c'est ici que se retrouvent le COMPTE de la
    /// personne (sa présence servie) et son contour équipé (#10946). Lu dans le cache seul.
    @State private var membersByParticipant: [String: PaginatedParticipant] = [:]

    // Views sub-filter — `nil` tant que l'utilisateur n'a rien touché :
    // l'onglet d'ouverture est alors celui que `MessageViewsFilter.initial`
    // juge pertinent (#7366), jamais « Envoyé » par défaut. Il se règle sur
    // le décompte SERVEUR dès qu'il est chargé (#7433) : sur les compteurs
    // locaux seuls, une bulle faussement « lue » ouvrait la fiche sur un
    // onglet « Lu » que le serveur laissait vide.
    @State private var chosenViewsFilter: MessageViewsFilter? = nil
    private var viewsFilter: MessageViewsFilter {
        chosenViewsFilter ?? .initial(
            readCount: readStatusData?.readCount ?? message.readCount,
            deliveredCount: readStatusData?.receivedCount ?? message.deliveredCount,
            showReadReceipts: UserPreferencesManager.shared.privacy.showReadReceipts
        )
    }

    // Historique local des tentatives d'envoi (spec 2026-07-08
    // message-send-failure-retry-flow) — vide pour les messages reçus
    // (aucune ligne `send_attempts` locale), la carte ne s'affiche pas.
    @State private var sendAttempts: [SendAttemptRecord] = []

    private var availableViewsFilters: [MessageViewsFilter] {
        // #7228 — un onglet par famille de consommation PRÉSENTE. La partition
        // est celle de `MediaConsumptionFamily` : audio, vidéo, et tout le
        // reste, qui s'OUVRE (image, PDF, tableur, présentation, archive…).
        let families = MessageViewsConsumption.families(in: message.attachments)
        return [.sent, .delivered, .read, .notSeen] + families.map(MessageViewsFilter.init(family:))
    }

    var body: some View {
        viewsTabContent
            .onAppear {
                Task {
                    await loadMembers()
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
            // I4 (#7360) — les cartes « écouté jusqu'à » / « Nx » se relancent
            // en direct, pour CE message seulement (règle testée à part).
            .onReceive(
                MessageSocketManager.shared.attachmentStatusUpdated
                    .filter { [messageId = message.id, conversationId] in
                        MessageViewsConsumption.refreshesCards(
                            on: $0, messageId: messageId, conversationId: conversationId)
                    }
                    .receive(on: DispatchQueue.main)
            ) { _ in
                Task { await loadAttachmentStatuses() }
            }
    }

    // MARK: - Views Tab Content (Premium Redesign)

    private var viewsTabContent: some View {
        let accent = Color(hex: contactColor)

        return VStack(alignment: .leading, spacing: 0) {
            // Sub-filter capsules
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.xsPlus) {
                    ForEach(availableViewsFilters) { filter in
                        viewsFilterCapsule(filter, accent: accent)
                    }
                }
            }
            .padding(.bottom, MeeshySpacing.mdPlus)

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

    private func viewsFilterCapsule(_ filter: MessageViewsFilter, accent: Color) -> some View {
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
                chosenViewsFilter = filter
            }
            HapticFeedback.light()
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: filter.icon)
                    .font(.caption2.weight(.medium))
                Text(filter.label)
                    .font(.caption.weight(.medium))
                if let count {
                    Text("\(count)")
                        .font(.system(.caption2, design: .monospaced).weight(.bold))
                        .foregroundColor(isSelected ? accent : theme.textMuted)
                        .padding(.horizontal, MeeshySpacing.xs)
                        .padding(.vertical, 1)
                        .background(
                            Capsule()
                                .fill(isSelected ? accent.opacity(0.15) : isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
                        )
                }
            }
            .padding(.horizontal, MeeshySpacing.smPlus)
            .padding(.vertical, MeeshySpacing.xsPlus)
            .background(
                Capsule()
                    .fill(isSelected ? accent.opacity(0.15) : isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.02))
            )
            .overlay(
                Capsule()
                    .stroke(isSelected ? accent.opacity(0.35) : Color.clear, lineWidth: MeeshyBorder.hairline)
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
        VStack(alignment: .leading, spacing: MeeshySpacing.mdPlus) {
            // Author card with avatar
            HStack(spacing: MeeshySpacing.md) {
                LivePresence { MeeshyAvatar(
                    name: message.senderName ?? "?",
                    context: .userListItem,
                    accentColor: message.senderColor ?? contactColor,
                    avatarURL: message.senderAvatarURL,
                    presenceState: message.isMe ? nil : PresenceManager.shared.presenceState(forSenderOf: message),
                    ring: message.senderRing
                ) }

                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(message.senderName ?? String(localized: "common.unknown", defaultValue: "Inconnu", bundle: .main))
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(theme.textPrimary)

                    Text(formatDateFR(message.createdAt))
                        .font(.caption.weight(.medium))
                        .foregroundStyle(theme.textMuted)
                }

                Spacer()

                // Delivery badge
                MessageViewsDeliveryBadge(level: deliveryStatusLevel, accent: accent)
            }
            .padding(MeeshySpacing.md)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.02))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .stroke(accent.opacity(0.1), lineWidth: MeeshyBorder.hairline)
                    )
            )

            // Message meta info (merged from old Meta tab)
            VStack(spacing: 0) {
                MessageViewsMetaRow(icon: "number", label: String(localized: "message-detail.meta.id", bundle: .main), value: String(message.id.prefix(12)), accent: accent)
                MessageViewsMetaDivider()
                MessageViewsMetaRow(icon: "bubble.left.fill", label: String(localized: "message-detail.meta.type", bundle: .main), value: message.messageType.rawValue, accent: accent)
                MessageViewsMetaDivider()
                MessageViewsMetaRow(icon: "antenna.radiowaves.left.and.right", label: String(localized: "message-detail.meta.source", bundle: .main), value: message.messageSource.rawValue, accent: accent)
                MessageViewsMetaDivider()
                MessageViewsMetaRow(icon: "globe", label: String(localized: "message-detail.meta.language", bundle: .main), value: message.originalLanguage.uppercased(), accent: accent)
                MessageViewsMetaDivider()
                MessageViewsMetaRow(
                    icon: "lock.shield.fill",
                    label: String(localized: "message-detail.meta.encryption", bundle: .main),
                    value: message.isEncrypted
                        ? String(localized: "message-detail.meta.encryption-yes", bundle: .main) + (message.encryptionMode.map { " (\($0))" } ?? "")
                        : String(localized: "message-detail.meta.encryption-no", bundle: .main),
                    accent: accent,
                    valueColor: message.isEncrypted ? .green : nil
                )

                if message.isEdited {
                    MessageViewsMetaDivider()
                    MessageViewsMetaRow(icon: "pencil", label: String(localized: "message-detail.meta.modified", bundle: .main), value: formatDateTimeFR(message.updatedAt), accent: accent, valueColor: .yellow)
                }

                if !message.attachments.isEmpty {
                    MessageViewsMetaDivider()
                    let types = Set(message.attachments.map {
                        $0.mimeType.components(separatedBy: "/").first ?? "file"
                    })
                    MessageViewsMetaRow(
                        icon: "paperclip",
                        label: String(localized: "message-detail.meta.attachments", bundle: .main),
                        value: "\(message.attachments.count) (\(types.sorted().joined(separator: ", ")))",
                        accent: accent
                    )
                }

                // Même règle que la bulle : la fiche de détail lisait
                // `forward.senderName` en clair et affichait le nom de la
                // conversation source même pour un tête-à-tête. Une seule
                // surface de vérité désormais.
                if message.forwardedFrom != nil {
                    MessageViewsMetaDivider()
                    MessageViewsMetaRow(
                        icon: "arrowshape.turn.up.forward.fill",
                        label: String(localized: "message.detail.forwarded", defaultValue: "Transféré", bundle: .main),
                        value: BubbleForwardedIndicator.label(for: ForwardBadgePolicy.attribution(for: message.forwardedFrom)),
                        accent: accent
                    )
                }

                if let reply = message.replyTo {
                    MessageViewsMetaDivider()
                    MessageViewsMetaRow(icon: "arrowshape.turn.up.left.fill", label: String(localized: "message-detail.meta.reply-to", bundle: .main), value: reply.authorName, accent: accent)
                }
            }
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                    .fill(isDark ? Color.white.opacity(0.03) : Color.black.opacity(0.015))
            )
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))

            if !sendAttempts.isEmpty {
                MessageViewsSendAttemptsCard(attempts: sendAttempts, accent: accent)
            }
        }
    }

    // MARK: - Historique d'envoi (tentatives locales)

    static func sendAttemptCountLabel(_ count: Int,
                                      bundle: Bundle = .main,
                                      locale: Locale = .current) -> String {
        MessageViewsSendAttemptsCard.sendAttemptCountLabel(count, bundle: bundle, locale: locale)
    }

    // MARK: - Distribué (Delivered) — User List

    private func viewsDeliveredContent(accent: Color) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
            if showsReadStatusSpinner {
                loadingIndicator(accent: accent)
            } else if let status = readStatusData {
                if status.receivedBy.isEmpty {
                    MessageDetailEmptyState(icon: "checkmark.circle", text: String(localized: "message-detail.views.delivered.empty", defaultValue: "Aucune confirmation de distribution", bundle: .main))
                } else {
                    MessageDetailTimelineBanner(
                        icon: "checkmark.circle.fill",
                        text: MessageViewsLabels.deliveredBanner(receivedCount: status.receivedCount, totalMembers: status.totalMembers),
                        detail: status.receivedBy.first.map { MessageDetailClock.hourMinute($0.receivedAt) } ?? "",
                        count: "\(status.receivedCount)/\(status.totalMembers)",
                        accent: accent
                    )

                    LazyVStack(spacing: 0) {
                        ForEach(Array(status.receivedBy.enumerated()), id: \.element.participantId) { index, user in
                            userStatusRow(
                                participantId: user.participantId,
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
        VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
            if showsReadStatusSpinner {
                loadingIndicator(accent: accent)
            } else if let status = readStatusData {
                if status.readBy.isEmpty {
                    MessageDetailEmptyState(icon: "eye.slash", text: String(localized: "message-detail.views.read.empty", defaultValue: "Personne n'a lu ce message", bundle: .main))
                } else {
                    MessageDetailTimelineBanner(
                        icon: "eye.fill",
                        text: MessageViewsLabels.readBanner(readCount: status.readCount, totalMembers: status.totalMembers),
                        detail: status.readBy.first.map { MessageDetailClock.hourMinute($0.readAt) } ?? "",
                        count: "\(status.readCount)/\(status.totalMembers)",
                        accent: accent
                    )

                    LazyVStack(spacing: 0) {
                        ForEach(Array(status.readBy.enumerated()), id: \.element.participantId) { index, user in
                            userStatusRow(
                                participantId: user.participantId,
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
        VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
            if showsReadStatusSpinner {
                loadingIndicator(accent: accent)
            } else if let status = readStatusData {
                let notSeen = status.notSeenBy ?? []
                if notSeen.isEmpty {
                    MessageDetailEmptyState(icon: "checkmark.circle", text: String(localized: "message-detail.views.not-seen.empty", defaultValue: "Tout le monde a reçu le message", bundle: .main))
                } else {
                    MessageDetailTimelineBanner(
                        icon: "eye.slash.fill",
                        text: String(localized: "message-detail.views.not-seen.title", defaultValue: "Pas encore vu", bundle: .main),
                        detail: String(localized: "message-detail.views.not-seen.count", defaultValue: "^[\(notSeen.count) participant](inflect: true)", bundle: .main),
                        count: "\(notSeen.count)/\(status.totalMembers)",
                        accent: accent
                    )

                    LazyVStack(spacing: 0) {
                        ForEach(Array(notSeen.enumerated()), id: \.element.participantId) { index, user in
                            userStatusRow(
                                participantId: user.participantId,
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

        return VStack(alignment: .leading, spacing: MeeshySpacing.mdPlus) {
            if isLoadingAttachmentStatuses {
                loadingIndicator(accent: accent)
            } else if attachments.isEmpty {
                MessageDetailEmptyState(icon: Self.emptyIcon(for: family), text: Self.emptyLabel(for: family))
            } else {
                ForEach(attachments) { attachment in
                    MessageViewsConsumptionCard(
                        attachment: attachment,
                        family: family,
                        accent: accent,
                        users: attachmentStatuses[attachment.id] ?? [],
                        contactColor: contactColor,
                        members: membersByParticipant
                    )
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

    private func userStatusRow(participantId: String, username: String, avatar: String?, date: Date?, accent: Color, index: Int, trailing: AnyView? = nil) -> some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            LivePresence { MeeshyAvatar(
                name: username,
                context: .userListItem,
                accentColor: contactColor,
                avatarURL: avatar,
                presenceState: memberPresence(participantId),
                ring: membersByParticipant[participantId]?.avatarRing
            ) }

            Text(username)
                .font(.footnote.weight(.medium))
                .foregroundStyle(theme.textPrimary)

            Spacer()

            if let trailing {
                trailing
            }

            if let date {
                Text(relativeDate(date))
                    .font(.caption2)
                    .foregroundStyle(theme.textMuted)
            } else {
                Image(systemName: "clock")
                    .font(.caption2)
                    .foregroundStyle(theme.textMuted)
            }
        }
        .padding(.vertical, MeeshySpacing.sm)
        .padding(.horizontal, MeeshySpacing.xs)
    }

    private func loadingIndicator(accent: Color) -> some View {
        HStack {
            Spacer()
            ProgressView()
                .tint(accent)
            Spacer()
        }
        .padding(.vertical, MeeshySpacing.xxxl)
    }

    private func retryableErrorView(accent: Color) -> some View {
        VStack(spacing: MeeshySpacing.md) {
            Image(systemName: "wifi.slash")
                // 28pt (< 40pt hero freeze) paired with a footnote caption → scale
                // it with Dynamic Type so icon and caption grow in proportion.
                .font(MeeshyFont.relative(MeeshyFont.displaySize, weight: .light))
                .foregroundStyle(theme.textMuted.opacity(0.4))
                // Decorative — the error caption + Retry button carry the meaning.
                // Not combined into one element: the button must stay independently
                // focusable for VoiceOver.
                .accessibilityHidden(true)
            Text(readStatusError.map { MessageViewsLabels.loadFailure($0) } ?? String(localized: "message-detail.load-error", defaultValue: "Impossible de charger les données", bundle: .main))
                .font(.footnote.weight(.medium))
                .foregroundStyle(theme.textMuted)
            Button {
                readStatusData = nil
                Task { await loadReadStatus() }
            } label: {
                Text(String(localized: "common.retry", defaultValue: "Réessayer", bundle: .main))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, MeeshySpacing.mdPlus)
                    .padding(.vertical, MeeshySpacing.xsPlus)
                    .background(Capsule().fill(accent))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.xxxl)
    }

    // MARK: - Network Actions

    /// `true` quand `message.id` est un ObjectId MongoDB (24 hex). Un message
    /// encore optimiste garde son id local `cid_…` (l'upgrade in-place ne
    /// change jamais l'identité SwiftUI) : il n'existe pas côté serveur, et
    /// les endpoints `/messages/:id/...` répondraient 400 "Validation failed".
    private var messageHasServerId: Bool { ConversationViewModel.isServerMessageId(message.id) }

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

    /// La présence servie d'un membre listé, par son COMPTE ; aucune pour un membre inconnu.
    private func memberPresence(_ participantId: String) -> PresenceState? {
        MessageViewsMemberPresence.state(of: participantId, in: membersByParticipant)
    }

    private func loadMembers() async {
        switch await CacheCoordinator.shared.participants.load(for: conversationId) {
        case .fresh(let members, _), .stale(let members, _):
            membersByParticipant = Dictionary(members.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        case .expired, .empty:
            return
        }
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
                readStatusError = .server
                Logger.network.error("read-status error: success=false")
            }
        } catch {
            readStatusError = .connection
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

    /// #7365 — résolu comme la bulle (`MessageViewsReadStatusRules`).
    private var deliveryStatusLevel: Int {
        MessageViewsReadStatusRules.deliveryStatusLevel(
            for: message,
            tally: readStatusData.map {
                .init(recipientCount: $0.totalMembers, deliveredCount: $0.receivedCount, readCount: $0.readCount)
            },
            showReadReceipts: UserPreferencesManager.shared.privacy.showReadReceipts
        )
    }

    private func formatDateFR(_ date: Date) -> String {
        date.formatted(.dateTime.day().month().year().hour().minute())
    }

    private func formatDateTimeFR(_ date: Date) -> String {
        date.formatted(.dateTime.day().month().year().hour().minute())
    }

    private func relativeDate(_ date: Date) -> String {
        RelativeTimeFormatter.longString(for: date)
    }

    /// Fraction (`0...1`) consommée d'une pièce jointe — la règle vit dans la carte.
    static func positionFraction(positionMs: Int?, complete: Bool, durationMs: Int?) -> Double {
        MessageViewsConsumptionCard.positionFraction(positionMs: positionMs, complete: complete, durationMs: durationMs)
    }
}
