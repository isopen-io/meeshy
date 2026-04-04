import SwiftUI
import MeeshySDK

// MARK: - InviteFriendsSheet

struct InviteFriendsSheet: View {
    let conversation: Conversation

    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    // MARK: - Link state
    @State private var createdLink: CreatedShareLink?
    @State private var isCreating = false
    @State private var errorMessage: String?

    // MARK: - Phase toggle
    @State private var showOptions = false

    // MARK: - Editable fields (defaults match shareConversationLink)
    @State private var inviteMessage = ""
    @State private var linkName = ""

    // Limits
    @State private var expirationOption: ExpirationOption = .never
    @State private var maxUsesEnabled = false
    @State private var maxUsesValue: Int = 100

    // Permissions
    @State private var allowMessages = true
    @State private var allowImages = true
    @State private var allowFiles = false
    @State private var allowHistory = true

    // Access
    @State private var requireAccount = false
    @State private var requireNickname = true
    @State private var requireEmail = false

    // Track if user changed options after initial creation
    @State private var optionsModified = false

    // Clipboard feedback
    @State private var showCopiedFeedback = false

    private var shareURL: String? {
        guard let link = createdLink else { return nil }
        return "https://meeshy.me/join/\(link.identifier ?? link.linkId)"
    }

    private var defaultInviteMessage: String {
        String(localized: "invite.defaultMessage", defaultValue: "Rejoins moi pour echanger sans filtre ni barriere...")
    }

    private var defaultLinkName: String {
        String(localized: "invite.defaultLinkName", defaultValue: "Rejoins la conversation") + " \"\(conversation.name)\""
    }

    private var effectiveMessage: String {
        inviteMessage.isEmpty ? defaultInviteMessage : inviteMessage
    }

    private var effectiveLinkName: String {
        linkName.isEmpty ? defaultLinkName : linkName
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()

                ScrollView(showsIndicators: false) {
                    VStack(spacing: 16) {
                        cardPreview
                            .padding(.top, 8)

                        optionsSummary

                        shareButton

                        if !showOptions {
                            customizeLink
                        }

                        if showOptions {
                            optionsPanel
                                .transition(.opacity.combined(with: .move(edge: .bottom)))
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 40)
                }
            }
            .navigationTitle(String(localized: "invite.title", defaultValue: "Invitation"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 20))
                            .foregroundStyle(.ultraThinMaterial)
                    }
                }
            }
            .task {
                await createLinkInBackground()
            }
        }
    }

    // MARK: - Card Preview

    private var cardPreview: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Conversation header
            HStack(spacing: 10) {
                ZStack {
                    Circle()
                        .fill(Color(hex: conversation.accentColor).opacity(0.2))
                        .frame(width: 44, height: 44)
                    Image(systemName: conversationIcon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(Color(hex: conversation.accentColor))
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(conversation.name)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    HStack(spacing: 4) {
                        Text("\(conversation.memberCount) \(String(localized: "invite.members", defaultValue: "membres"))")
                            .font(.system(size: 12))
                            .foregroundColor(theme.textSecondary)
                        Text("·")
                            .foregroundColor(theme.textMuted)
                        Text(conversation.type.displayName)
                            .font(.system(size: 12))
                            .foregroundColor(theme.textSecondary)
                    }
                }

                Spacer()
            }

            // Editable invite message
            VStack(alignment: .leading, spacing: 4) {
                Text(String(localized: "invite.messageLabel", defaultValue: "Message d'invitation"))
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .textCase(.uppercase)

                TextField(defaultInviteMessage, text: $inviteMessage, axis: .vertical)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(2...4)
                    .onChange(of: inviteMessage) { _, _ in optionsModified = true }
            }
            .padding(.top, 4)

            // Copyable URL
            Button {
                copyURL()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "link")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color(hex: conversation.accentColor))

                    if let url = shareURL {
                        Text(url)
                            .font(.system(size: 13, weight: .medium, design: .monospaced))
                            .foregroundColor(Color(hex: conversation.accentColor))
                            .lineLimit(1)
                            .truncationMode(.middle)
                    } else if isCreating {
                        HStack(spacing: 6) {
                            ProgressView()
                                .scaleEffect(0.7)
                            Text(String(localized: "invite.creatingLink", defaultValue: "Creation du lien..."))
                                .font(.system(size: 13))
                                .foregroundColor(theme.textMuted)
                        }
                    }

                    Spacer()

                    if shareURL != nil {
                        Text(showCopiedFeedback
                                ? String(localized: "invite.copied", defaultValue: "Copie !")
                                : String(localized: "invite.copy", defaultValue: "Copier"))
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(
                                Capsule().fill(
                                    showCopiedFeedback
                                        ? MeeshyColors.success
                                        : Color(hex: conversation.accentColor)
                                )
                            )
                    }
                }
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color(hex: conversation.accentColor).opacity(0.08))
                )
            }
            .buttonStyle(.plain)
            .disabled(shareURL == nil)
            .accessibilityLabel("Copier le lien d'invitation")
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(Color(hex: conversation.accentColor).opacity(0.2), lineWidth: 1)
                )
        )
    }

    // MARK: - Options Summary (Phase 1)

    private var optionsSummary: some View {
        HStack(spacing: 8) {
            Label(expirationOption.label, systemImage: "clock")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(theme.textSecondary)

            Text("·")
                .foregroundColor(theme.textMuted)

            HStack(spacing: 4) {
                if allowMessages {
                    Image(systemName: "bubble.left.fill")
                        .font(.system(size: 10))
                        .foregroundColor(MeeshyColors.success)
                }
                if allowImages {
                    Image(systemName: "photo.fill")
                        .font(.system(size: 10))
                        .foregroundColor(MeeshyColors.success)
                }
                if allowFiles {
                    Image(systemName: "paperclip")
                        .font(.system(size: 10))
                        .foregroundColor(MeeshyColors.success)
                }
                if allowHistory {
                    Image(systemName: "clock.fill")
                        .font(.system(size: 10))
                        .foregroundColor(MeeshyColors.success)
                }
            }

            Spacer()
        }
        .padding(.horizontal, 4)
    }

    // MARK: - Share Button

    private var shareButton: some View {
        VStack(spacing: 8) {
            Button {
                Task { await shareAction() }
            } label: {
                HStack(spacing: 10) {
                    if isCreating && createdLink == nil {
                        ProgressView().tint(.white).scaleEffect(0.85)
                    } else {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 16, weight: .semibold))
                    }
                    Text(String(localized: "invite.share", defaultValue: "Partager"))
                        .font(.system(size: 17, weight: .bold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(
                            LinearGradient(
                                colors: [
                                    Color(hex: conversation.accentColor),
                                    Color(hex: conversation.accentColor).opacity(0.8)
                                ],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                )
            }
            .disabled(isCreating && createdLink == nil)
            .accessibilityLabel("Partager le lien d'invitation")

            if let error = errorMessage {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(MeeshyColors.error)
                    Text(error)
                        .font(.system(size: 12))
                        .foregroundColor(MeeshyColors.error)
                }
            }
        }
    }

    // MARK: - Customize Link (Phase 1 → Phase 2)

    private var customizeLink: some View {
        Button {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                showOptions = true
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 13))
                Text(String(localized: "invite.customize", defaultValue: "Personnaliser les options"))
                    .font(.system(size: 14, weight: .medium))
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .semibold))
            }
            .foregroundColor(theme.textSecondary)
            .accessibilityLabel("Personnaliser les options du lien")
        }
    }

    // MARK: - Options Panel (Phase 2)

    private var optionsPanel: some View {
        VStack(spacing: 16) {
            // Identity
            optionSection(title: String(localized: "invite.section.identity", defaultValue: "IDENTITE"), icon: "tag.fill") {
                VStack(spacing: 0) {
                    optionTextField(String(localized: "invite.linkName", defaultValue: "Nom du lien"), placeholder: defaultLinkName, text: $linkName)
                }
            }

            // Limits
            optionSection(title: String(localized: "invite.section.limits", defaultValue: "LIMITES"), icon: "gauge.with.dots.needle.bottom.50percent") {
                VStack(spacing: 0) {
                    optionRow(icon: "clock.badge.xmark", iconColor: MeeshyColors.error) {
                        Picker("Expiration", selection: $expirationOption) {
                            ForEach(ExpirationOption.allCases, id: \.self) { opt in
                                Text(opt.label).tag(opt)
                            }
                        }
                        .pickerStyle(.menu)
                        .tint(Color(hex: conversation.accentColor))
                        .onChange(of: expirationOption) { _, _ in optionsModified = true }
                    }

                    sectionDivider

                    optionToggle(
                        String(localized: "invite.limitUses", defaultValue: "Limiter les utilisations"),
                        subtitle: maxUsesEnabled ? "\(maxUsesValue) max" : String(localized: "invite.unlimited", defaultValue: "Illimite"),
                        icon: "person.2.fill",
                        iconColor: MeeshyColors.info,
                        isOn: $maxUsesEnabled
                    )

                    if maxUsesEnabled {
                        Stepper(value: $maxUsesValue, in: 1...10000, step: maxUsesValue < 100 ? 1 : 10) {
                            Text("\(maxUsesValue)")
                                .font(.system(size: 22, weight: .bold, design: .rounded))
                                .foregroundColor(Color(hex: conversation.accentColor))
                        }
                        .padding(14)
                        .background(rowBackground)
                        .onChange(of: maxUsesValue) { _, _ in optionsModified = true }
                    }
                }
            }

            // Permissions
            optionSection(title: String(localized: "invite.section.permissions", defaultValue: "PERMISSIONS"), icon: "slider.horizontal.3") {
                VStack(spacing: 0) {
                    optionToggle(String(localized: "invite.perm.messages", defaultValue: "Messages"), subtitle: nil, icon: "bubble.left.fill", iconColor: Color(hex: conversation.accentColor), isOn: $allowMessages)
                    sectionDivider
                    optionToggle(String(localized: "invite.perm.images", defaultValue: "Images"), subtitle: nil, icon: "photo.fill", iconColor: MeeshyColors.success, isOn: $allowImages)
                    sectionDivider
                    optionToggle(String(localized: "invite.perm.files", defaultValue: "Fichiers"), subtitle: nil, icon: "paperclip", iconColor: MeeshyColors.warning, isOn: $allowFiles)
                    sectionDivider
                    optionToggle(String(localized: "invite.perm.history", defaultValue: "Historique"), subtitle: nil, icon: "clock.fill", iconColor: MeeshyColors.info, isOn: $allowHistory)
                }
            }

            // Access
            optionSection(title: String(localized: "invite.section.access", defaultValue: "ACCES"), icon: "person.badge.key.fill") {
                VStack(spacing: 0) {
                    optionToggle(String(localized: "invite.access.account", defaultValue: "Compte requis"), subtitle: nil, icon: "person.fill.checkmark", iconColor: Color(hex: conversation.accentColor), isOn: $requireAccount)
                    sectionDivider
                    optionToggle(String(localized: "invite.access.nickname", defaultValue: "Pseudo requis"), subtitle: nil, icon: "person.fill", iconColor: MeeshyColors.indigo400, isOn: $requireNickname)
                        .disabled(requireAccount)
                        .opacity(requireAccount ? 0.4 : 1)
                    sectionDivider
                    optionToggle(String(localized: "invite.access.email", defaultValue: "Email requis"), subtitle: nil, icon: "envelope.fill", iconColor: MeeshyColors.warning, isOn: $requireEmail)
                        .disabled(requireAccount)
                        .opacity(requireAccount ? 0.4 : 1)
                }
            }

            // Collapse
            Button {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    showOptions = false
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "chevron.up")
                        .font(.system(size: 10, weight: .semibold))
                    Text(String(localized: "invite.hideOptions", defaultValue: "Masquer les options"))
                        .font(.system(size: 14, weight: .medium))
                }
                .foregroundColor(theme.textSecondary)
            }
        }
    }

    // MARK: - Option Helpers

    private func optionSection<Content: View>(
        title: String,
        icon: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(Color(hex: conversation.accentColor))
                Text(title)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(theme.textSecondary)
                    .kerning(0.8)
            }

            content()
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.inputBorder.opacity(0.5), lineWidth: 1)
                )
        }
    }

    private func optionTextField(_ label: String, placeholder: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(theme.textMuted)
            TextField(placeholder, text: text)
                .font(.system(size: 15))
                .foregroundColor(theme.textPrimary)
                .onChange(of: text.wrappedValue) { _, _ in optionsModified = true }
        }
        .padding(14)
        .background(rowBackground)
    }

    private func optionToggle(
        _ title: String,
        subtitle: String?,
        icon: String,
        iconColor: Color,
        isOn: Binding<Bool>
    ) -> some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(iconColor.opacity(0.15))
                    .frame(width: 32, height: 32)
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(iconColor)
            }
            Toggle(isOn: isOn) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                    if let subtitle {
                        Text(subtitle)
                            .font(.system(size: 11))
                            .foregroundColor(theme.textSecondary)
                    }
                }
            }
            .tint(Color(hex: conversation.accentColor))
            .onChange(of: isOn.wrappedValue) { _, _ in optionsModified = true }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(rowBackground)
    }

    private func optionRow<Content: View>(
        icon: String,
        iconColor: Color,
        @ViewBuilder content: () -> Content
    ) -> some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(iconColor.opacity(0.15))
                    .frame(width: 32, height: 32)
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(iconColor)
            }
            content()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(rowBackground)
    }

    private var rowBackground: some View {
        theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03)
    }

    private var sectionDivider: some View {
        Divider().background(theme.mode.isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.05))
    }

    private var conversationIcon: String {
        switch conversation.type {
        case .group: "person.3.fill"
        case .community: "person.3.sequence.fill"
        case .channel, .broadcast: "megaphone.fill"
        case .public, .global: "globe"
        default: "bubble.left.and.bubble.right.fill"
        }
    }

    // MARK: - Actions

    private func createLinkInBackground() async {
        guard createdLink == nil else { return }
        isCreating = true
        errorMessage = nil

        do {
            let result = try await createLink()
            createdLink = result
            HapticFeedback.success()
        } catch {
            errorMessage = error.localizedDescription
        }
        isCreating = false
    }

    private func shareAction() async {
        if optionsModified || createdLink == nil {
            isCreating = true
            errorMessage = nil
            do {
                let result = try await createLink()
                createdLink = result
                optionsModified = false
            } catch {
                errorMessage = error.localizedDescription
                isCreating = false
                return
            }
            isCreating = false
        }

        guard let url = shareURL else { return }
        presentShareSheet(url: url)
    }

    private func createLink() async throws -> CreatedShareLink {
        // Capture all @State values locally before crossing isolation boundary
        let convId = conversation.id
        let name = linkName.isEmpty ? defaultLinkName : linkName
        let desc = inviteMessage.isEmpty ? defaultInviteMessage : inviteMessage
        let maxUses = maxUsesEnabled ? maxUsesValue : nil
        let expires = expirationOption.iso8601
        let msgs = allowMessages
        let files = allowFiles
        let imgs = allowImages
        let history = allowHistory
        let account = requireAccount
        let nickname = requireNickname && !requireAccount
        let email = requireEmail && !requireAccount

        let request = CreateShareLinkRequest(
            conversationId: convId,
            name: name,
            description: desc,
            maxUses: maxUses,
            expiresAt: expires,
            allowAnonymousMessages: msgs,
            allowAnonymousFiles: files,
            allowAnonymousImages: imgs,
            allowViewHistory: history,
            requireAccount: account,
            requireNickname: nickname,
            requireEmail: email,
            requireBirthday: false
        )
        return try await ShareLinkService.shared.createShareLink(request: request)
    }

    private func copyURL() {
        guard let url = shareURL else { return }
        UIPasteboard.general.string = url
        HapticFeedback.success()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
            showCopiedFeedback = true
        }
        Task {
            try? await Task.sleep(for: .seconds(1.5))
            await MainActor.run {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                    showCopiedFeedback = false
                }
            }
        }
    }

    @MainActor
    private func presentShareSheet(url: String) {
        let activityVC = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let rootVC = windowScene.windows.first?.rootViewController {
            var topVC = rootVC
            while let presented = topVC.presentedViewController { topVC = presented }
            activityVC.popoverPresentationController?.sourceView = topVC.view
            topVC.present(activityVC, animated: true)
        }
    }
}

// MARK: - ExpirationOption

private enum ExpirationOption: String, CaseIterable {
    case never, h24, d7, d30, m3

    var label: String {
        switch self {
        case .never: String(localized: "invite.expiration.never", defaultValue: "Jamais")
        case .h24: String(localized: "invite.expiration.24h", defaultValue: "24 heures")
        case .d7: String(localized: "invite.expiration.7d", defaultValue: "7 jours")
        case .d30: String(localized: "invite.expiration.30d", defaultValue: "30 jours")
        case .m3: String(localized: "invite.expiration.3m", defaultValue: "3 mois")
        }
    }

    var iso8601: String? {
        let cal = Calendar.current
        let now = Date()
        let date: Date? = switch self {
        case .never: nil
        case .h24: cal.date(byAdding: .hour, value: 24, to: now)
        case .d7: cal.date(byAdding: .day, value: 7, to: now)
        case .d30: cal.date(byAdding: .day, value: 30, to: now)
        case .m3: cal.date(byAdding: .month, value: 3, to: now)
        }
        guard let date else { return nil }
        return ISO8601DateFormatter().string(from: date)
    }
}

// MARK: - ConversationType Display Helper

private extension MeeshyConversation.ConversationType {
    var displayName: String {
        switch self {
        case .direct: "Direct"
        case .group: "Groupe"
        case .public: "Public"
        case .global: "Globale"
        case .community: "Communaute"
        case .channel: "Canal"
        case .bot: "Bot"
        case .broadcast: "Communication"
        }
    }
}
