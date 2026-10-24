import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce que l'hôte branche sur l'écran — chaque entrée absente n'est pas rendue
/// (loi 4 : un contrôle existe s'il a un effet).
struct ShareSheetHostActions {
    /// D5 : le toast « Envoyé à X · Ouvrir » ouvre la conversation servie.
    var onOpenConversation: ((MeeshyConversation) -> Void)?
    /// « Modifier dans le studio » — l'écran se referme et rend la main.
    var onCompose: (() -> Void)?
    /// « Imager la discussion » (#9039).
    var onImageDiscussion: (() -> Void)?
    /// « Enregistrer » la pièce désignée, par la loi de sortie de l'hôte.
    var onSave: (() -> Void)?
    /// L'extension de partage sans session : « Connectez-vous pour envoyer »
    /// remplace la zone « À qui » et la barre Envoyer (fragment 3).
    var signIn: ShareSignInPrompt?
    /// Le titre de l'hôte quand il diffère du plan (« Envoyer avec Meeshy »
    /// dans l'extension de partage).
    var navigationTitle: String?
}

/// Le fragment « Connectez-vous pour envoyer » — le partage est gardé.
struct ShareSignInPrompt {
    /// « Ouvrir Meeshy » : la fiche est déposée, l'app la reprend après la connexion.
    let onOpenApp: () -> Void
}

/// **L'écran de partage UNIQUE** (#10947, planche
/// `docs/product/partage-unique/planche-partage-unique.html`).
///
/// Quatre zones, toujours dans cet ordre — ce qui part, ce qu'on peut en faire,
/// à qui, puis Envoyer — et deux gestes pour l'usage nominal : toucher un
/// récent, puis Envoyer. Il remplace le sélecteur de transfert, « Partager
/// avec… » et toutes leurs portes ; l'extension de partage pourra monter la même
/// vue en lui donnant ses propres `ShareRecipientSourcing` et `ShareDispatching`.
struct ShareSheetView: View {
    @StateObject var model: ShareSheetViewModel
    let accentColor: String
    var actions = ShareSheetHostActions()
    let onDismiss: () -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @State private var searchText = ""
    @State var pendingCapture: PublicationTarget?
    /// Le lien d'une story frappé au geste « Partager hors de Meeshy » (#12644).
    @State var outgoingLink: ShareOutgoingLink?
    @State private var toastFired = false

    var isDark: Bool { colorScheme == .dark }
    var theme: ThemeManager { ThemeManager.shared }
    var accent: Color { Color(hex: accentColor) }

    init(
        model: @autoclosure @escaping () -> ShareSheetViewModel,
        accentColor: String = "6366F1",
        actions: ShareSheetHostActions = ShareSheetHostActions(),
        onDismiss: @escaping () -> Void
    ) {
        _model = StateObject(wrappedValue: model())
        self.accentColor = accentColor
        self.actions = actions
        self.onDismiss = onDismiss
    }

    var body: some View {
        let plan = model.plan
        NavigationStack {
            Group {
                if let blocked = plan.blocked {
                    blockedCard(blocked)
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: MeeshySpacing.lg, pinnedViews: []) {
                            ShareContentZone(model: model, plan: plan, accentColor: accentColor, isDark: isDark)
                            actionsZone(plan)
                            recipientsZone
                        }
                        .padding(.vertical, MeeshySpacing.md)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .safeAreaInset(edge: .bottom) {
                        if actions.signIn == nil {
                            ShareSendBar(model: model, plan: plan, accentColor: accentColor, onSend: send)
                        }
                    }
                }
            }
            .background(theme.backgroundPrimary)
            .navigationTitle(actions.navigationTitle ?? ShareSheetCopy.title(plan.title))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(model.hasSent ? ShareSheetCopy.close : ShareSheetCopy.cancel) { close() }
                }
                if model.isFinished, !model.failedIds.isEmpty {
                    ToolbarItem(placement: .primaryAction) {
                        Button(ShareSheetCopy.retryAll) { Task { await model.retryAll() } }
                    }
                }
            }
            .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .always), prompt: ShareSheetCopy.searchPrompt)
            .adaptiveOnChange(of: searchText) { _, value in Task { await model.search(value) } }
        }
        .task { await model.load() }
        .adaptiveOnChange(of: model.isFinished) { _, finished in
            guard finished, model.failedIds.isEmpty else { return }
            HapticFeedback.success()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { close() }
        }
        .onDisappear(perform: fireToast)
        .confirmationDialog(ShareSheetCopy.captureWarning, isPresented: captureBinding, titleVisibility: .visible) {
            Button(ShareSheetCopy.publishZone) {
                if let target = pendingCapture { model.togglePublication(target) }
                pendingCapture = nil
            }
            Button(ShareSheetCopy.cancel, role: .cancel) { pendingCapture = nil }
        }
        .sheet(item: $outgoingLink) { link in
            ShareOutActivityView(activityItems: [link.url])
        }
    }

    private var captureBinding: Binding<Bool> {
        Binding(get: { pendingCapture != nil }, set: { if !$0 { pendingCapture = nil } })
    }

    // MARK: - Zone 3 : à qui

    @ViewBuilder
    private var recipientsZone: some View {
        if let signIn = actions.signIn {
            signInCard(signIn)
        } else if model.showsSkeleton {
            VStack(spacing: 0) {
                ForEach(0..<3, id: \.self) { _ in SkeletonConversationRow() }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(ShareSheetCopy.loading)
        } else if model.conversations.isEmpty && model.people.isEmpty && model.searchResults == nil {
            EmptyStateView(
                icon: "person.2", title: ShareSheetCopy.emptyTitle, subtitle: ShareSheetCopy.emptyBody,
                accentColor: accentColor, compact: true
            )
        } else {
            if searchText.isEmpty, !model.recents.isEmpty { recentsRow }
            if model.offersGroupCreation { groupToggle }
            section(ShareSheetCopy.conversations, model.visibleConversations)
            section(ShareSheetCopy.people, model.visiblePeople)
            communitiesSection
        }
    }

    private var recentsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: MeeshySpacing.md) {
                ForEach(model.recents) { recipient in
                    ShareRecentChip(
                        recipient: recipient,
                        presence: model.presenceState(for: recipient),
                        isSelected: model.isSelected(recipient),
                        accentHex: accentColor,
                        isDark: isDark,
                        onTap: { toggle(recipient) }
                    )
                    .equatable()
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
        }
    }

    private var groupToggle: some View {
        Toggle(isOn: $model.createsGroup) {
            Label(ShareSheetCopy.createGroup(model.groupCandidates.map(\.title).joined(separator: ", ")), systemImage: "person.3")
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                .foregroundColor(theme.textPrimary)
        }
        .tint(accent)
        .padding(.horizontal, MeeshySpacing.lg)
        .frame(minHeight: MeeshyControlSize.tapTarget)
    }

    @ViewBuilder
    private func section(_ title: String, _ recipients: [ShareRecipient]) -> some View {
        if !recipients.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                sectionHeader(title)
                ForEach(recipients) { recipient in row(recipient) }
            }
        }
    }

    func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
            .foregroundColor(theme.textMuted)
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.bottom, MeeshySpacing.xs)
            .accessibilityAddTraits(.isHeader)
    }

    private func row(_ recipient: ShareRecipient) -> some View {
        ShareRecipientRow(
            recipient: recipient,
            presence: model.presenceState(for: recipient),
            isSelected: model.isSelected(recipient),
            delivery: model.deliveries[recipient.id],
            accentHex: accentColor,
            isDark: isDark,
            onTap: { toggle(recipient) },
            onRetry: { Task { await model.retry(recipient.id) } }
        )
        .equatable()
    }

    @ViewBuilder
    private var communitiesSection: some View {
        let communities = model.visibleCommunities
        if !communities.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                sectionHeader(ShareSheetCopy.communities)
                ForEach(communities) { community in
                    Button { Task { await model.toggleChannels(of: community) } } label: {
                        HStack(spacing: MeeshySpacing.md) {
                            MeeshyAvatar(name: community.name, context: .conversationList, kind: .entity, avatarURL: community.avatarURL)
                            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                                Text(community.name)
                                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
                                    .foregroundColor(theme.textPrimary)
                                Text(ShareSheetCopy.channelsHint)
                                    .font(MeeshyFont.relative(MeeshyFont.smallSize))
                                    .foregroundColor(theme.textMuted)
                            }
                            Spacer()
                            Image(systemName: model.channels[community.id] == nil ? "chevron.down" : "chevron.up")
                                .foregroundColor(theme.textMuted)
                                .accessibilityHidden(true)
                        }
                        .padding(.horizontal, MeeshySpacing.lg)
                        .frame(minHeight: MeeshyControlSize.tapTarget + MeeshySpacing.md)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                    if let channels = model.channels[community.id] {
                        if channels.isEmpty {
                            Text(ShareSheetCopy.noChannel)
                                .font(MeeshyFont.relative(MeeshyFont.smallSize))
                                .foregroundColor(theme.textMuted)
                                .padding(.horizontal, MeeshySpacing.xxl)
                        }
                        ForEach(channels) { channel in row(channel).padding(.leading, MeeshySpacing.lg) }
                    }
                }
            }
        }
    }

    private func toggle(_ recipient: ShareRecipient) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { model.toggle(recipient) }
        HapticFeedback.light()
    }

    // MARK: - Déconnecté (fragment 3)

    /// L'extension sans session : rien ne se perd. « Studio » remet la fiche au
    /// studio de l'app, « Ouvrir Meeshy » la remet à l'écran de partage de l'app,
    /// qui la reprend après la connexion.
    private func signInCard(_ prompt: ShareSignInPrompt) -> some View {
        VStack(spacing: MeeshySpacing.md) {
            Image(systemName: "person.crop.circle.badge.exclamationmark")
                .font(MeeshyFont.relative(MeeshyIconSize.hero))
                .foregroundColor(accent)
                .accessibilityHidden(true)
            Text(ShareSheetCopy.signInTitle)
                .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
            Text(ShareSheetCopy.signInBody)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: MeeshySpacing.md) {
                if let compose = actions.onCompose {
                    Button { close(); compose() } label: {
                        Text(ShareSheetCopy.studioShort)
                            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                            .foregroundColor(accent)
                            .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.buttonHeight)
                            .background(Capsule().stroke(accent.opacity(0.4), lineWidth: 1))
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
                Button(action: prompt.onOpenApp) {
                    Text(ShareSheetCopy.openMeeshy)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.buttonHeight)
                        .background(Capsule().fill(accent))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("share.sheet.open-app")
            }
        }
        .padding(MeeshySpacing.xl)
        .frame(maxWidth: .infinity)
    }

    // MARK: - Interdit motivé (fragment 4)

    private func blockedCard(_ reason: ShareWithdrawReason) -> some View {
        VStack(spacing: MeeshySpacing.md) {
            Image(systemName: "lock.shield")
                .font(MeeshyFont.relative(MeeshyIconSize.hero))
                .foregroundColor(accent)
                .accessibilityHidden(true)
            Text(ShareSheetCopy.blockedTitle)
                .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)
            Text(ShareSheetCopy.blockedBody(reason))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)
            Button(ShareSheetCopy.understood) { close() }
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .frame(minHeight: MeeshyControlSize.tapTarget)
        }
        .padding(MeeshySpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Envoyer, fermer

    private func send() {
        HapticFeedback.medium()
        Task { await model.send() }
    }

    func close() {
        dismiss()
        onDismiss()
    }

    /// D5 : après l'envoi, un toast « Envoyé à X · Ouvrir », jamais une
    /// navigation imposée. Posé à la FERMETURE : sous la feuille encore montée,
    /// le toast racine serait invisible.
    private func fireToast() {
        guard !toastFired else { return }
        if let served = model.firstServed {
            toastFired = true
            let title = ShareSheetCopy.sentTo(served.recipient.title)
            let conversation = MeeshyConversation(
                id: served.conversationId, identifier: served.conversationId,
                type: served.recipient.isGroup ? .group : .direct,
                title: served.recipient.title, avatar: served.recipient.avatarURL,
                participantUserId: served.recipient.userId
            )
            let open = actions.onOpenConversation.map { open in { open(conversation) } }
            ShareSheetHostBridge.announce(title, open: open)
        } else if model.deliveries.contains(where: { $0.key.hasPrefix("pub:") && $0.value == .sent }) {
            toastFired = true
            ShareSheetHostBridge.announce(ShareSheetCopy.published, open: nil)
        }
    }
}
