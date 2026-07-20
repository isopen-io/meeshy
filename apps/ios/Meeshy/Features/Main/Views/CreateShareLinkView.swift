import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - CreateShareLinkView

struct CreateShareLinkView: View {
    let onCreate: (CreatedShareLink) -> Void

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel
    @Environment(\.dismiss) private var dismiss

    // Conversation
    @State private var selectedConversation: Conversation? = nil
    @State private var showConversationPicker = false

    // Identité
    @State private var linkName: String = ""
    @State private var linkDescription: String = ""
    @State private var customSlug: String = ""

    // Accès invités
    @State private var requireAccount: Bool = false
    @State private var requireNickname: Bool = true
    @State private var requireEmail: Bool = false
    @State private var requireBirthday: Bool = false

    // Permissions anonymes
    @State private var allowAnonymousMessages: Bool = true
    @State private var allowAnonymousFiles: Bool = false
    @State private var allowAnonymousImages: Bool = true
    @State private var allowViewHistory: Bool = false

    // Limites
    @State private var maxUsesEnabled: Bool = false
    @State private var maxUsesValue: Int = 100
    @State private var expirationOption: ExpirationOption = .never

    // Etat
    @State private var isCreating = false
    @State private var errorMessage: String? = nil

    private let accent = MeeshyColors.shareAccent

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 0) {
                        conversationSection
                        identitySection
                        accessSection
                        permissionsSection
                        limitsSection
                        createButton
                            .padding(.top, 8)
                            .padding(.bottom, 40)
                    }
                    .padding(.top, 8)
                }
            }
            .navigationTitle(String(localized: "share.link.create.title", defaultValue: "Nouveau lien de partage", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)) { dismiss() }
                        .foregroundColor(theme.textSecondary)
                }
            }
            .sheet(isPresented: $showConversationPicker) {
                ConversationPickerSheet(
                    conversations: sharableConversations,
                    selected: $selectedConversation,
                    isPresented: $showConversationPicker
                )
            }
        }
    }

    // MARK: - Conversations filtrées (pas de DM)

    private var sharableConversations: [Conversation] {
        conversationListViewModel.conversations.filter { $0.type != .direct }
    }

    // MARK: - Section: Conversation

    private var conversationSection: some View {
        formSection(title: String(localized: "share.link.create.section.conversation", defaultValue: "Conversation", bundle: .main), icon: "bubble.left.and.bubble.right.fill") {
            Button {
                showConversationPicker = true
            } label: {
                HStack(spacing: 12) {
                    if let conv = selectedConversation {
                        conversationTypeIcon(conv.type)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(conv.name)
                                .font(.subheadline.weight(.medium))
                                .foregroundColor(theme.textPrimary)
                            Text(conv.type.displayLabel)
                                .font(.caption)
                                .foregroundColor(theme.textSecondary)
                        }
                    } else {
                        Image(systemName: "plus.circle.dashed")
                            .font(.headline)
                            .foregroundColor(accent)
                        Text(String(localized: "share.link.create.choose_group", defaultValue: "Choisir un groupe ou une communauté", bundle: .main))
                            .font(.subheadline)
                            .foregroundColor(theme.textMuted)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(theme.textMuted)
                }
                .padding(14)
                .background(rowBackground)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Section: Identité du lien

    private var identitySection: some View {
        formSection(title: String(localized: "share.link.create.section.identity", defaultValue: "Identité du lien", bundle: .main), icon: "tag.fill") {
            VStack(spacing: 0) {
                formTextField(String(localized: "share.link.create.field.name", defaultValue: "Nom du lien", bundle: .main), placeholder: String(localized: "share.link.create.field.name.placeholder", defaultValue: "ex: Partage Twitter", bundle: .main), text: $linkName)
                divider
                formTextField(String(localized: "share.link.create.field.description", defaultValue: "Description (optionnel)", bundle: .main), placeholder: String(localized: "share.link.create.field.description.placeholder", defaultValue: "ex: Rejoins notre groupe…", bundle: .main), text: $linkDescription)
                divider
                VStack(alignment: .leading, spacing: 4) {
                    formTextField(String(localized: "share.link.create.field.slug", defaultValue: "Slug URL (optionnel)", bundle: .main), placeholder: String(localized: "share.link.create.field.slug.placeholder", defaultValue: "ex: mon-groupe-2025", bundle: .main), text: $customSlug)
                    if !customSlug.isEmpty {
                        Text("meeshy.me/join/\(customSlug.lowercased())")
                            .font(.caption2.weight(.medium))
                            .foregroundColor(accent.opacity(0.8))
                            .padding(.horizontal, 14)
                            .padding(.bottom, 8)
                    }
                }
            }
        }
    }

    // MARK: - Section: Accès invités

    private var accessSection: some View {
        formSection(title: String(localized: "share.link.create.section.access", defaultValue: "Accès invités", bundle: .main), icon: "person.badge.key.fill",
                    subtitle: String(localized: "share.link.create.section.access.subtitle", defaultValue: "Ce que les visiteurs doivent fournir pour rejoindre", bundle: .main)) {
            VStack(spacing: 0) {
                ruleToggle(
                    String(localized: "share.link.create.access.account_required", defaultValue: "Compte requis", bundle: .main),
                    subtitle: String(localized: "share.link.create.access.account_required.subtitle", defaultValue: "Seuls les membres Meeshy peuvent rejoindre", bundle: .main),
                    icon: "person.fill.checkmark",
                    iconColor: MeeshyColors.shareAccentHex,
                    isOn: $requireAccount
                )
                divider
                ruleToggle(
                    String(localized: "share.link.create.access.nickname_required", defaultValue: "Pseudonyme requis", bundle: .main),
                    subtitle: String(localized: "share.link.create.access.nickname_required.subtitle", defaultValue: "Le visiteur doit choisir un pseudo", bundle: .main),
                    icon: "person.fill",
                    iconColor: MeeshyColors.trackingAccentHex,
                    isOn: $requireNickname
                )
                .disabled(requireAccount)
                .opacity(requireAccount ? 0.4 : 1)
                divider
                ruleToggle(
                    String(localized: "share.link.create.access.email_required", defaultValue: "Email requis", bundle: .main),
                    subtitle: String(localized: "share.link.create.access.email_required.subtitle", defaultValue: "Le visiteur doit fournir son email", bundle: .main),
                    icon: "envelope.fill",
                    iconColor: MeeshyColors.communityAccentHex,
                    isOn: $requireEmail
                )
                .disabled(requireAccount)
                .opacity(requireAccount ? 0.4 : 1)
                divider
                ruleToggle(
                    String(localized: "share.link.create.access.birthday_required", defaultValue: "Date de naissance requise", bundle: .main),
                    subtitle: String(localized: "share.link.create.access.birthday_required.subtitle", defaultValue: "Permet le contrôle d'âge", bundle: .main),
                    icon: "calendar",
                    iconColor: MeeshyColors.warningHex,
                    isOn: $requireBirthday
                )
                .disabled(requireAccount)
                .opacity(requireAccount ? 0.4 : 1)
            }
        }
    }

    // MARK: - Section: Permissions

    private var permissionsSection: some View {
        formSection(title: String(localized: "share.link.create.section.permissions", defaultValue: "Permissions", bundle: .main), icon: "slider.horizontal.3",
                    subtitle: String(localized: "share.link.create.section.permissions.subtitle", defaultValue: "Ce que les invités anonymes peuvent faire", bundle: .main)) {
            VStack(spacing: 0) {
                ruleToggle(
                    String(localized: "share.link.create.permission.send_messages", defaultValue: "Envoyer des messages", bundle: .main),
                    subtitle: String(localized: "share.link.create.permission.send_messages.subtitle", defaultValue: "Les invités peuvent écrire dans la conversation", bundle: .main),
                    icon: "bubble.left.fill",
                    iconColor: MeeshyColors.shareAccentHex,
                    isOn: $allowAnonymousMessages
                )
                divider
                ruleToggle(
                    String(localized: "share.link.create.permission.send_images", defaultValue: "Envoyer des images", bundle: .main),
                    subtitle: String(localized: "share.link.create.permission.send_images.subtitle", defaultValue: "Les invités peuvent partager des photos", bundle: .main),
                    icon: "photo.fill",
                    iconColor: MeeshyColors.indigo300Hex,
                    isOn: $allowAnonymousImages
                )
                divider
                ruleToggle(
                    String(localized: "share.link.create.permission.send_files", defaultValue: "Envoyer des fichiers", bundle: .main),
                    subtitle: String(localized: "share.link.create.permission.send_files.subtitle", defaultValue: "Les invités peuvent envoyer des documents", bundle: .main),
                    icon: "paperclip",
                    iconColor: MeeshyColors.trackingAccentHex,
                    isOn: $allowAnonymousFiles
                )
                divider
                ruleToggle(
                    String(localized: "share.link.create.permission.view_history", defaultValue: "Voir l'historique", bundle: .main),
                    subtitle: String(localized: "share.link.create.permission.view_history.subtitle", defaultValue: "Les invités voient les messages précédents", bundle: .main),
                    icon: "clock.fill",
                    iconColor: MeeshyColors.communityAccentHex,
                    isOn: $allowViewHistory
                )
            }
        }
    }

    // MARK: - Section: Limites

    private var limitsSection: some View {
        formSection(title: String(localized: "share.link.create.section.limits", defaultValue: "Limites", bundle: .main), icon: "gauge.with.dots.needle.bottom.50percent",
                    subtitle: String(localized: "share.link.create.section.limits.subtitle", defaultValue: "Contrôlez l'audience et la durée de vie du lien", bundle: .main)) {
            VStack(spacing: 0) {
                // Max utilisations
                HStack(spacing: 12) {
                    iconBadge("person.2.fill", color: MeeshyColors.shareAccentHex)
                    Toggle(isOn: $maxUsesEnabled) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(String(localized: "share.link.create.limit_uses", defaultValue: "Limiter les utilisations", bundle: .main))
                                .font(.subheadline.weight(.medium))
                                .foregroundColor(theme.textPrimary)
                            if maxUsesEnabled {
                                Text(String(localized: "share.link.create.max_uses", defaultValue: "\(maxUsesValue) utilisation\(maxUsesValue > 1 ? "s" : "") maximum", bundle: .main))
                                    .font(.caption)
                                    .foregroundColor(accent)
                            } else {
                                Text(String(localized: "share.link.create.unlimited", defaultValue: "Illimité", bundle: .main))
                                    .font(.caption)
                                    .foregroundColor(theme.textSecondary)
                            }
                        }
                    }
                    .tint(accent)
                }
                .padding(14)
                .background(rowBackground)

                if maxUsesEnabled {
                    divider
                    Stepper(
                        value: $maxUsesValue,
                        in: 1...10000,
                        step: maxUsesValue < 100 ? 1 : (maxUsesValue < 1000 ? 10 : 100)
                    ) {
                        HStack {
                            Spacer()
                            Text("\(maxUsesValue)")
                                .font(.system(.title, design: .rounded).weight(.bold))
                                .foregroundColor(accent)
                            Text(String(localized: "share.link.create.uses_label", defaultValue: "utilisations", bundle: .main))
                                .font(.footnote)
                                .foregroundColor(theme.textSecondary)
                            Spacer()
                        }
                    }
                    .padding(14)
                    .background(rowBackground)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }

                divider

                // Expiration
                HStack(spacing: 12) {
                    iconBadge("clock.badge.xmark", color: MeeshyColors.warningHex)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(String(localized: "share.link.create.expiration", defaultValue: "Expiration", bundle: .main))
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(theme.textPrimary)
                        Text(expirationOption.label)
                            .font(.caption)
                            .foregroundColor(expirationOption == .never ? theme.textSecondary : MeeshyColors.warning)
                    }
                    Spacer()
                    Picker(String(localized: "share.link.create.expiration", defaultValue: "Expiration", bundle: .main), selection: $expirationOption) {
                        ForEach(ExpirationOption.allCases, id: \.self) { opt in
                            Text(opt.label).tag(opt)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(accent)
                }
                .padding(14)
                .background(rowBackground)
            }
        }
    }

    // MARK: - Bouton créer

    private var createButton: some View {
        VStack(spacing: 12) {
            if let error = errorMessage {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundColor(MeeshyColors.error)
                    Text(error)
                        .font(.footnote)
                        .foregroundColor(MeeshyColors.error)
                }
                .padding(.horizontal, 20)
            }

            Button(action: create) {
                HStack(spacing: 10) {
                    if isCreating {
                        ProgressView().tint(.white).scaleEffect(0.85)
                    } else {
                        Image(systemName: "link.badge.plus")
                            .font(.callout.weight(.semibold))
                    }
                    Text(isCreating
                        ? String(localized: "share.link.create.button.creating", defaultValue: "Création en cours…", bundle: .main)
                        : String(localized: "share.link.create.button.create", defaultValue: "Créer le lien de partage", bundle: .main))
                        .font(.callout.weight(.bold))
                        .foregroundColor(.white)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)

                .background {
                    if selectedConversation == nil {
                        RoundedRectangle(cornerRadius: 16).fill(Color.white.opacity(0.1))
                    } else {
                        RoundedRectangle(cornerRadius: 16)
                            .fill(LinearGradient(
                                colors: [MeeshyColors.shareAccent, MeeshyColors.indigo300],
                                startPoint: .leading, endPoint: .trailing
                            ))
                    }
                }
            }
            .disabled(selectedConversation == nil || isCreating)
            .padding(.horizontal, 20)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: selectedConversation == nil)
        }
    }

    // MARK: - Helpers UI

    private var rowBackground: some View {
        isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.03)
    }

    private var divider: some View {
        Divider()
            .background(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.06))
    }

    private func formSection<Content: View>(
        title: String,
        icon: String,
        subtitle: String? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(accent)
                    .accessibilityHidden(true)
                Text(title.uppercased())
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(theme.textSecondary)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(title)
            .accessibilityAddTraits(.isHeader)

            if let subtitle {
                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(theme.textMuted)
                    .padding(.horizontal, 20)
            }

            content()
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(Color.white.opacity(0.06), lineWidth: 1)
                )
                .padding(.horizontal, 16)
        }
    }

    private func formTextField(_ label: String, placeholder: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption2.weight(.medium))
                .foregroundColor(theme.textSecondary)
            TextField(placeholder, text: text)
                .font(.subheadline)
                .foregroundColor(theme.textPrimary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(rowBackground)
    }

    private func ruleToggle(
        _ title: String,
        subtitle: String,
        icon: String,
        iconColor: String,
        isOn: Binding<Bool>
    ) -> some View {
        HStack(spacing: 12) {
            iconBadge(icon, color: iconColor)
            Toggle(isOn: isOn) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(theme.textPrimary)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundColor(theme.textSecondary)
                }
            }
            .tint(accent)
        }
        .padding(14)
        .background(rowBackground)
    }

    private func iconBadge(_ icon: String, color: String) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8)
                .fill(Color(hex: color).opacity(0.15))
                .frame(width: 34, height: 34)
            Image(systemName: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(Color(hex: color))
        }
    }

    private func conversationTypeIcon(_ type: Conversation.ConversationType) -> some View {
        let (icon, color): (String, String) = switch type {
        case .group:     ("person.3.fill", MeeshyColors.shareAccentHex)
        case .community: ("person.3.sequence.fill", MeeshyColors.communityAccentHex)
        case .channel:   ("megaphone.fill", MeeshyColors.trackingAccentHex)
        case .public:    ("globe", MeeshyColors.indigo300Hex)
        case .broadcast:  ("megaphone.fill", MeeshyColors.trackingAccentHex)
        default:         ("bubble.left.and.bubble.right.fill", MeeshyColors.shareAccentHex)
        }
        return iconBadge(icon, color: color)
    }

    // MARK: - Action

    private func create() {
        guard let conv = selectedConversation else { return }
        isCreating = true
        errorMessage = nil

        let req = CreateShareLinkRequest(
            conversationId: conv.id,
            name: linkName.isEmpty ? nil : linkName,
            description: linkDescription.isEmpty ? nil : linkDescription,
            identifier: customSlug.isEmpty ? nil : customSlug.lowercased(),
            maxUses: maxUsesEnabled ? maxUsesValue : nil,
            expiresAt: expirationOption.iso8601,
            allowAnonymousMessages: allowAnonymousMessages,
            allowAnonymousFiles: allowAnonymousFiles,
            allowAnonymousImages: allowAnonymousImages,
            allowViewHistory: allowViewHistory,
            requireAccount: requireAccount,
            requireNickname: requireNickname && !requireAccount,
            requireEmail: requireEmail && !requireAccount,
            requireBirthday: requireBirthday && !requireAccount
        )

        Task {
            do {
                let created = try await ShareLinkService.shared.createShareLink(request: req)
                await MainActor.run {
                    HapticFeedback.success()
                    onCreate(created)
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isCreating = false
                }
            }
        }
    }
}

// MARK: - Conversation Picker Sheet

private struct ConversationPickerSheet: View {
    let conversations: [Conversation]
    @Binding var selected: Conversation?
    @Binding var isPresented: Bool

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @State private var search: String = ""

    private var filtered: [Conversation] {
        guard !search.isEmpty else { return conversations }
        return conversations.filter { $0.name.localizedCaseInsensitiveContains(search) }
    }

    private var grouped: [(label: String, items: [Conversation])] {
        let groups: [(label: String, types: [Conversation.ConversationType])] = [
            (String(localized: "share.link.create.picker.section.groups", defaultValue: "Groupes", bundle: .main), [.group]),
            (String(localized: "share.link.create.picker.section.communities", defaultValue: "Communautés", bundle: .main), [.community]),
            (String(localized: "share.link.create.picker.section.channels_public", defaultValue: "Canaux & Public", bundle: .main), [.channel, .public, .global]),
        ]
        return groups.compactMap { g in
            let items = filtered.filter { g.types.contains($0.type) }
            return items.isEmpty ? nil : (label: g.label, items: items)
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()
                List {
                    ForEach(grouped, id: \.label) { section in
                        Section(section.label) {
                            ForEach(section.items) { conv in
                                Button {
                                    selected = conv
                                    isPresented = false
                                } label: {
                                    HStack(spacing: 12) {
                                        Text(conv.name)
                                            .foregroundColor(theme.textPrimary)
                                        Spacer()
                                        if selected?.id == conv.id {
                                            Image(systemName: "checkmark.circle.fill")
                                                .foregroundColor(MeeshyColors.shareAccent)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if filtered.isEmpty {
                        AdaptiveContentUnavailableView(
                            String(localized: "share.link.create.picker.empty.title", defaultValue: "Aucun groupe trouvé", bundle: .main),
                            systemImage: "bubble.left.and.bubble.right",
                            description: Text(String(localized: "share.link.create.picker.empty.description", defaultValue: "Créez un groupe ou une communauté pour partager un lien d'invitation", bundle: .main))
                        )
                    }
                }
                .scrollContentBackground(.hidden)
                .searchable(text: $search, prompt: String(localized: "share.link.create.picker.search", defaultValue: "Rechercher un groupe…", bundle: .main))
            }
            .navigationTitle(String(localized: "share.link.create.picker.title", defaultValue: "Choisir une conversation", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .main)) { isPresented = false }
                        .foregroundColor(MeeshyColors.shareAccent)
                }
            }
        }
    }
}

// MARK: - Expiration Option

private enum ExpirationOption: String, CaseIterable {
    case never, h24, d7, d30, m3

    var label: String {
        switch self {
        case .never: String(localized: "share.link.create.expiration.never", defaultValue: "Jamais", bundle: .main)
        case .h24:   String(localized: "share.link.create.expiration.h24", defaultValue: "24 heures", bundle: .main)
        case .d7:    String(localized: "share.link.create.expiration.d7", defaultValue: "7 jours", bundle: .main)
        case .d30:   String(localized: "share.link.create.expiration.d30", defaultValue: "30 jours", bundle: .main)
        case .m3:    String(localized: "share.link.create.expiration.m3", defaultValue: "3 mois", bundle: .main)
        }
    }

    var iso8601: String? {
        let cal = Calendar.current
        let now = Date()
        let date: Date? = switch self {
        case .never: nil
        case .h24:   cal.date(byAdding: .hour, value: 24, to: now)
        case .d7:    cal.date(byAdding: .day, value: 7, to: now)
        case .d30:   cal.date(byAdding: .day, value: 30, to: now)
        case .m3:    cal.date(byAdding: .month, value: 3, to: now)
        }
        guard let date else { return nil }
        return date.formatted(.iso8601)
    }
}

// MARK: - ConversationType display helper

private extension MeeshyConversation.ConversationType {
    var displayLabel: String {
        switch self {
        case .direct:    String(localized: "conversationType.direct", defaultValue: "Message direct", bundle: .main)
        case .group:     String(localized: "conversationType.group", defaultValue: "Groupe", bundle: .main)
        case .public:    String(localized: "conversationType.public", defaultValue: "Public", bundle: .main)
        case .global:    String(localized: "conversationType.global", defaultValue: "Globale", bundle: .main)
        case .community: String(localized: "conversationType.community", defaultValue: "Communauté", bundle: .main)
        case .channel:   String(localized: "conversationType.channel", defaultValue: "Canal", bundle: .main)
        case .bot:       String(localized: "conversationType.bot", defaultValue: "Bot", bundle: .main)
        case .broadcast: String(localized: "conversationType.broadcast", defaultValue: "Communication", bundle: .main)
        }
    }
}
