import SwiftUI
import MeeshySDK

// MARK: - CreateShareLinkView

struct CreateShareLinkView: View {
    let onCreate: (CreatedShareLink) -> Void

    @ObservedObject private var theme = ThemeManager.shared
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

    private let accent = Color(hex: "08D9D6")

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
            .navigationTitle("Nouveau lien de partage")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Annuler") { dismiss() }
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
        formSection(title: "Conversation", icon: "bubble.left.and.bubble.right.fill") {
            Button {
                showConversationPicker = true
            } label: {
                HStack(spacing: 12) {
                    if let conv = selectedConversation {
                        conversationTypeIcon(conv.type)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(conv.name)
                                .font(.system(size: 15, weight: .medium))
                                .foregroundColor(theme.textPrimary)
                            Text(conv.type.displayLabel)
                                .font(.system(size: 12))
                                .foregroundColor(theme.textSecondary)
                        }
                    } else {
                        Image(systemName: "plus.circle.dashed")
                            .font(.system(size: 18))
                            .foregroundColor(accent)
                        Text("Choisir un groupe ou une communauté")
                            .font(.system(size: 15))
                            .foregroundColor(theme.textMuted)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
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
        formSection(title: "Identité du lien", icon: "tag.fill") {
            VStack(spacing: 0) {
                formTextField("Nom du lien", placeholder: "ex: Partage Twitter", text: $linkName)
                divider
                formTextField("Description (optionnel)", placeholder: "ex: Rejoins notre groupe…", text: $linkDescription)
                divider
                VStack(alignment: .leading, spacing: 4) {
                    formTextField("Slug URL (optionnel)", placeholder: "ex: mon-groupe-2025", text: $customSlug)
                    if !customSlug.isEmpty {
                        Text("meeshy.me/join/\(customSlug.lowercased())")
                            .font(.system(size: 11, weight: .medium))
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
        formSection(title: "Accès invités", icon: "person.badge.key.fill",
                    subtitle: "Ce que les visiteurs doivent fournir pour rejoindre") {
            VStack(spacing: 0) {
                ruleToggle(
                    "Compte requis",
                    subtitle: "Seuls les membres Meeshy peuvent rejoindre",
                    icon: "person.fill.checkmark",
                    iconColor: "08D9D6",
                    isOn: $requireAccount
                )
                divider
                ruleToggle(
                    "Pseudonyme requis",
                    subtitle: "Le visiteur doit choisir un pseudo",
                    icon: "person.fill",
                    iconColor: "A855F7",
                    isOn: $requireNickname
                )
                .disabled(requireAccount)
                .opacity(requireAccount ? 0.4 : 1)
                divider
                ruleToggle(
                    "Email requis",
                    subtitle: "Le visiteur doit fournir son email",
                    icon: "envelope.fill",
                    iconColor: "F8B500",
                    isOn: $requireEmail
                )
                .disabled(requireAccount)
                .opacity(requireAccount ? 0.4 : 1)
                divider
                ruleToggle(
                    "Date de naissance requise",
                    subtitle: "Permet le contrôle d'âge",
                    icon: "calendar",
                    iconColor: "FF6B6B",
                    isOn: $requireBirthday
                )
                .disabled(requireAccount)
                .opacity(requireAccount ? 0.4 : 1)
            }
        }
    }

    // MARK: - Section: Permissions

    private var permissionsSection: some View {
        formSection(title: "Permissions", icon: "slider.horizontal.3",
                    subtitle: "Ce que les invités anonymes peuvent faire") {
            VStack(spacing: 0) {
                ruleToggle(
                    "Envoyer des messages",
                    subtitle: "Les invités peuvent écrire dans la conversation",
                    icon: "bubble.left.fill",
                    iconColor: "08D9D6",
                    isOn: $allowAnonymousMessages
                )
                divider
                ruleToggle(
                    "Envoyer des images",
                    subtitle: "Les invités peuvent partager des photos",
                    icon: "photo.fill",
                    iconColor: "4ECDC4",
                    isOn: $allowAnonymousImages
                )
                divider
                ruleToggle(
                    "Envoyer des fichiers",
                    subtitle: "Les invités peuvent envoyer des documents",
                    icon: "paperclip",
                    iconColor: "A855F7",
                    isOn: $allowAnonymousFiles
                )
                divider
                ruleToggle(
                    "Voir l'historique",
                    subtitle: "Les invités voient les messages précédents",
                    icon: "clock.fill",
                    iconColor: "F8B500",
                    isOn: $allowViewHistory
                )
            }
        }
    }

    // MARK: - Section: Limites

    private var limitsSection: some View {
        formSection(title: "Limites", icon: "gauge.with.dots.needle.bottom.50percent",
                    subtitle: "Contrôlez l'audience et la durée de vie du lien") {
            VStack(spacing: 0) {
                // Max utilisations
                HStack(spacing: 12) {
                    iconBadge("person.2.fill", color: "08D9D6")
                    Toggle(isOn: $maxUsesEnabled) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Limiter les utilisations")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundColor(theme.textPrimary)
                            if maxUsesEnabled {
                                Text("\(maxUsesValue) utilisation\(maxUsesValue > 1 ? "s" : "") maximum")
                                    .font(.system(size: 12))
                                    .foregroundColor(accent)
                            } else {
                                Text("Illimité")
                                    .font(.system(size: 12))
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
                                .font(.system(size: 28, weight: .bold, design: .rounded))
                                .foregroundColor(accent)
                            Text("utilisations")
                                .font(.system(size: 14))
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
                    iconBadge("clock.badge.xmark", color: "FF6B6B")
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Expiration")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(theme.textPrimary)
                        Text(expirationOption.label)
                            .font(.system(size: 12))
                            .foregroundColor(expirationOption == .never ? theme.textSecondary : Color(hex: "FF6B6B"))
                    }
                    Spacer()
                    Picker("Expiration", selection: $expirationOption) {
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
                        .foregroundColor(.red)
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundColor(.red)
                }
                .padding(.horizontal, 20)
            }

            Button(action: create) {
                HStack(spacing: 10) {
                    if isCreating {
                        ProgressView().tint(.white).scaleEffect(0.85)
                    } else {
                        Image(systemName: "link.badge.plus")
                            .font(.system(size: 16, weight: .semibold))
                    }
                    Text(isCreating ? "Création en cours…" : "Créer le lien de partage")
                        .font(.system(size: 16, weight: .bold))
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
                                colors: [Color(hex: "08D9D6"), Color(hex: "4ECDC4")],
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
        theme.mode.isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.03)
    }

    private var divider: some View {
        Divider()
            .background(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.06))
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
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(accent)
                Text(title.uppercased())
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(theme.textSecondary)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)

            if let subtitle {
                Text(subtitle)
                    .font(.system(size: 12))
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
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(theme.textSecondary)
            TextField(placeholder, text: text)
                .font(.system(size: 15))
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
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                    Text(subtitle)
                        .font(.system(size: 12))
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
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(Color(hex: color))
        }
    }

    private func conversationTypeIcon(_ type: Conversation.ConversationType) -> some View {
        let (icon, color): (String, String) = switch type {
        case .group:     ("person.3.fill", "08D9D6")
        case .community: ("person.3.sequence.fill", "F8B500")
        case .channel:   ("megaphone.fill", "A855F7")
        case .public:    ("globe", "4ECDC4")
        default:         ("bubble.left.and.bubble.right.fill", "08D9D6")
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

    @ObservedObject private var theme = ThemeManager.shared
    @State private var search: String = ""

    private var filtered: [Conversation] {
        guard !search.isEmpty else { return conversations }
        return conversations.filter { $0.name.localizedCaseInsensitiveContains(search) }
    }

    private var grouped: [(label: String, items: [Conversation])] {
        let groups: [(label: String, types: [Conversation.ConversationType])] = [
            ("Groupes", [.group]),
            ("Communautés", [.community]),
            ("Canaux & Public", [.channel, .public, .global]),
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
                                                .foregroundColor(Color(hex: "08D9D6"))
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if filtered.isEmpty {
                        ContentUnavailableView(
                            "Aucun groupe trouvé",
                            systemImage: "bubble.left.and.bubble.right",
                            description: Text("Créez un groupe ou une communauté pour partager un lien d'invitation")
                        )
                    }
                }
                .scrollContentBackground(.hidden)
                .searchable(text: $search, prompt: "Rechercher un groupe…")
            }
            .navigationTitle("Choisir une conversation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fermer") { isPresented = false }
                        .foregroundColor(Color(hex: "08D9D6"))
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
        case .never: "Jamais"
        case .h24:   "24 heures"
        case .d7:    "7 jours"
        case .d30:   "30 jours"
        case .m3:    "3 mois"
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
        return ISO8601DateFormatter().string(from: date)
    }
}

// MARK: - ConversationType display helper

private extension MeeshyConversation.ConversationType {
    var displayLabel: String {
        switch self {
        case .direct:    "Message direct"
        case .group:     "Groupe"
        case .public:    "Public"
        case .global:    "Global"
        case .community: "Communauté"
        case .channel:   "Canal"
        case .bot:       "Bot"
        }
    }
}
