import SwiftUI
import MeeshySDK
import MeeshyUI
import Combine
import os

// MARK: - User Search Models (Preferences)

private struct PrefsUserSearchResult: Identifiable, Decodable {
    let id: String
    let username: String
    let firstName: String?
    let lastName: String?
    let displayName: String?
    let avatar: String?
    let isOnline: Bool?

    var name: String {
        displayName ?? [firstName, lastName].compactMap { $0 }.joined(separator: " ").prefsIfEmptyFallback(username)
    }
}

private extension String {
    func prefsIfEmptyFallback(_ fallback: String) -> String {
        isEmpty ? fallback : self
    }
}

private struct PrefsUserSearchResponse: Decodable {
    let success: Bool
    let data: [PrefsUserSearchResult]
}

// MARK: - ConversationPreferencesTab

struct ConversationPreferencesTab: View {
    let conversation: Conversation
    let participants: [PaginatedParticipant]
    let accentColor: String

    @ObservedObject private var theme = ThemeManager.shared
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var isPinned: Bool = false
    @State private var isMuted: Bool = false
    @State private var mentionsOnly: Bool = false
    @State private var isArchived: Bool = false
    @State private var customName: String = ""
    @State private var reaction: String = ""
    @State private var tags: [String] = []
    @State private var categoryId: String? = nil

    @State private var isLoading: Bool = false
    @State private var isSaving: Bool = false
    @State private var showArchiveConfirm: Bool = false
    @State private var showLeaveConfirm: Bool = false
    @State private var showDeleteConfirm: Bool = false
    @State private var errorMessage: String? = nil
    @State private var showEmojiPicker: Bool = false

    @State private var memberSearchQuery: String = ""
    @State private var platformSearchResults: [PrefsUserSearchResult] = []
    @State private var isSearchingPlatform: Bool = false
    @State private var addingUserId: String? = nil
    @State private var addedUserIds: Set<String> = []

    private let customNameSubject = PassthroughSubject<String, Never>()
    private let memberSearchSubject = PassthroughSubject<String, Never>()
    @State private var cancellables = Set<AnyCancellable>()

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "conversation-prefs")
    private var presenceManager: PresenceManager { PresenceManager.shared }

    private var isDirect: Bool { conversation.type == .direct }
    private var isCreator: Bool { conversation.currentUserRole?.lowercased() == "creator" }
    private var accent: Color { Color(hex: accentColor) }

    private var canLeave: Bool {
        !isDirect && !isCreator
    }

    private var canManageMembers: Bool {
        guard let role = conversation.currentUserRole?.lowercased() else { return false }
        return ["creator", "admin", "moderator"].contains(role)
    }

    private var filteredParticipants: [PaginatedParticipant] {
        let trimmed = memberSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return participants }
        return participants.filter { p in
            p.name.lowercased().contains(trimmed) ||
            (p.username?.lowercased().contains(trimmed) ?? false)
        }
    }

    private var existingMemberIds: Set<String> {
        Set(participants.compactMap(\.userId))
    }

    var body: some View {
        VStack(spacing: 16) {
            if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 200)
            } else {
                membersSection
                displaySection
                organizationSection
                notificationsSection
                actionsSection
            }

            if let error = errorMessage {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundColor(Color(hex: "F87171"))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 20)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 32)
        .task { await loadPreferences() }
        .onAppear { setupDebounce(); setupMemberSearchDebounce() }
        .confirmationDialog(
            isArchived ? "Désarchiver la conversation ?" : "Archiver la conversation ?",
            isPresented: $showArchiveConfirm,
            titleVisibility: .visible
        ) {
            Button(isArchived ? "Désarchiver" : "Archiver", role: isArchived ? .none : .destructive) {
                Task { await toggleArchive() }
            }
            Button("Annuler", role: .cancel) {}
        }
        .confirmationDialog("Quitter la conversation ?", isPresented: $showLeaveConfirm, titleVisibility: .visible) {
            Button("Quitter", role: .destructive) {
                Task { await leaveConversation() }
            }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Vous ne recevrez plus de messages. Votre historique restera lisible.")
        }
        .confirmationDialog("Supprimer pour moi ?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Supprimer", role: .destructive) {
                Task { await deleteForMe() }
            }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Cette conversation sera supprimée de votre liste. Les autres membres ne seront pas affectés.")
        }
    }

    // MARK: - Members Section

    private var membersSection: some View {
        settingsSection(title: "Membres (\(participants.count))", icon: "person.2.fill", color: "6366F1") {
            memberSearchField
            Divider().padding(.leading, 54).opacity(0.3)

            if filteredParticipants.isEmpty && memberSearchQuery.isEmpty {
                HStack {
                    Spacer()
                    Text("Aucun membre")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(theme.textMuted)
                    Spacer()
                }
                .padding(.vertical, 16)
            } else {
                ForEach(filteredParticipants) { participant in
                    participantRow(participant)
                    if participant.id != filteredParticipants.last?.id {
                        Divider().padding(.leading, 54).opacity(0.3)
                    }
                }

                if !memberSearchQuery.isEmpty && filteredParticipants.isEmpty {
                    HStack {
                        Spacer()
                        Text("Aucun membre correspondant")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(theme.textMuted)
                        Spacer()
                    }
                    .padding(.vertical, 10)
                }
            }

            if !platformSearchResults.isEmpty && canManageMembers {
                Divider().opacity(0.3)
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(accent)
                    Text("Résultats de recherche")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundColor(accent)
                        .tracking(0.5)
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)
                .padding(.bottom, 4)

                ForEach(platformSearchResults) { user in
                    platformUserRow(user)
                    if user.id != platformSearchResults.last?.id {
                        Divider().padding(.leading, 54).opacity(0.3)
                    }
                }
            }

            if isSearchingPlatform {
                HStack {
                    Spacer()
                    ProgressView()
                        .scaleEffect(0.8)
                    Spacer()
                }
                .padding(.vertical, 8)
            }
        }
    }

    private var memberSearchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textMuted)

            TextField("Rechercher ou ajouter...", text: $memberSearchQuery)
                .font(.system(size: 14))
                .foregroundColor(theme.textPrimary)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .onChange(of: memberSearchQuery) { _, newValue in
                    memberSearchSubject.send(newValue)
                    if newValue.trimmingCharacters(in: .whitespacesAndNewlines).count < 3 {
                        platformSearchResults = []
                    }
                }

            if !memberSearchQuery.isEmpty {
                Button {
                    memberSearchQuery = ""
                    platformSearchResults = []
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundColor(theme.textMuted)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func participantRow(_ participant: PaginatedParticipant) -> some View {
        let color = DynamicColorGenerator.colorForName(participant.name)
        let presence = presenceManager.presenceState(for: participant.id)

        return HStack(spacing: 10) {
            MeeshyAvatar(
                name: participant.name,
                context: .userListItem,
                accentColor: color,
                avatarURL: participant.avatar,
                moodEmoji: participant.userId.flatMap { statusViewModel.statusForUser(userId: $0)?.moodEmoji },
                presenceState: presence,
                onMoodTap: participant.userId.flatMap { statusViewModel.moodTapHandler(for: $0) }
            )

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(participant.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    if let role = participant.conversationRole,
                       role.lowercased() != "member" {
                        Text(roleBadgeLabel(role))
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(Capsule().fill(roleBadgeColor(role)))
                    }
                }

                if let username = participant.username {
                    Text("@\(username)")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .lineLimit(1)
                }
            }

            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    private func platformUserRow(_ user: PrefsUserSearchResult) -> some View {
        let isMember = existingMemberIds.contains(user.id) || addedUserIds.contains(user.id)
        let isAdding = addingUserId == user.id
        let color = DynamicColorGenerator.colorForName(user.username)

        return HStack(spacing: 10) {
            MeeshyAvatar(
                name: user.name,
                context: .userListItem,
                accentColor: color,
                avatarURL: user.avatar
            )

            VStack(alignment: .leading, spacing: 2) {
                Text(user.name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                Text("@\(user.username)")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(1)
            }

            Spacer()

            if isMember {
                Text("Membre")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(theme.textMuted.opacity(0.1)))
            } else if isAdding {
                ProgressView()
                    .scaleEffect(0.7)
            } else {
                Button {
                    Task { await addParticipant(userId: user.id) }
                } label: {
                    Text("Ajouter")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Capsule().fill(accent))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    private func roleBadgeLabel(_ role: String) -> String {
        switch role.lowercased() {
        case "admin", "creator": return "Admin"
        case "moderator": return "Mod"
        default: return role.capitalized
        }
    }

    private func roleBadgeColor(_ role: String) -> Color {
        switch role.lowercased() {
        case "admin", "creator": return Color(hex: "FF6B6B")
        case "moderator": return Color(hex: "F8B500")
        default: return Color(hex: "45B7D1")
        }
    }

    // MARK: - Sections

    private var displaySection: some View {
        settingsSection(title: "Mon affichage", icon: "paintbrush.fill", color: "A855F7") {
            settingsRow(icon: "pencil", iconColor: "A855F7", title: "Nom personnalisé") {
                HStack(spacing: 6) {
                    TextField("Nom personnalisé...", text: $customName)
                        .textFieldStyle(.plain)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 160)
                        .onChange(of: customName) { _, newValue in
                            customNameSubject.send(newValue)
                        }
                    if !customName.isEmpty {
                        Button {
                            customName = ""
                            customNameSubject.send("")
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 14))
                                .foregroundColor(theme.textMuted)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            Divider().padding(.leading, 54).opacity(0.3)
            Button {
                showEmojiPicker = true
            } label: {
                settingsRow(icon: "heart.fill", iconColor: "A855F7", title: "Réaction") {
                    HStack(spacing: 6) {
                        if reaction.isEmpty {
                            Text("Aucune")
                                .font(.system(size: 14))
                                .foregroundColor(theme.textMuted)
                        } else {
                            Text(reaction)
                                .font(.system(size: 24))
                        }
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(theme.textMuted)
                    }
                }
            }
            .buttonStyle(.plain)
        }
        .sheet(isPresented: $showEmojiPicker) {
            EmojiPickerSheet(
                quickReactions: ["❤️", "😂", "👍", "🔥", "😍", "😮", "😢", "👏", "🎉"],
                onSelect: { emoji in
                    reaction = emoji
                    showEmojiPicker = false
                    Task { await save(UpdateConversationPreferencesRequest(reaction: emoji)) }
                }
            )
            .presentationDetents([.medium, .large])
        }
    }

    private var organizationSection: some View {
        settingsSection(title: "Organisation", icon: "folder.fill", color: "3B82F6") {
            settingsRow(icon: "pin.fill", iconColor: "3B82F6", title: "Épingler") {
                Toggle("", isOn: $isPinned)
                    .labelsHidden()
                    .tint(Color(hex: "3B82F6"))
                    .onChange(of: isPinned) { _, newValue in
                        Task { await save(UpdateConversationPreferencesRequest(isPinned: newValue)) }
                    }
            }
            Divider().padding(.leading, 54).opacity(0.3)
            settingsRow(icon: "square.grid.2x2.fill", iconColor: "3B82F6", title: "Catégorie") {
                HStack(spacing: 4) {
                    Text(categoryId == nil ? "Aucune" : "...")
                        .font(.system(size: 14))
                        .foregroundColor(theme.textMuted)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            Divider().padding(.leading, 54).opacity(0.3)
            tagsRow
        }
    }

    private var tagsRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                Image(systemName: "tag.fill")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(hex: "3B82F6"))
                    .frame(width: 28, height: 28)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Color(hex: "3B82F6").opacity(0.12)))
                Text("Tags")
                    .font(.system(size: 15))
                    .foregroundColor(theme.textPrimary)
            }
            .padding(.horizontal, 14)
            .padding(.top, 10)

            TagInputView(tags: $tags) {
                Task { await save(UpdateConversationPreferencesRequest(tags: tags)) }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 10)
        }
    }

    private var notificationsSection: some View {
        settingsSection(title: "Notifications", icon: "bell.fill", color: "FF6B6B") {
            settingsRow(icon: "bell.slash.fill", iconColor: "FF6B6B", title: "Muet") {
                Toggle("", isOn: $isMuted)
                    .labelsHidden()
                    .tint(Color(hex: "FF6B6B"))
                    .onChange(of: isMuted) { _, newValue in
                        Task { await save(UpdateConversationPreferencesRequest(isMuted: newValue)) }
                    }
            }
            Divider().padding(.leading, 54).opacity(0.3)
            settingsRow(icon: "at", iconColor: "FF6B6B", title: "Mentions seulement") {
                Toggle("", isOn: $mentionsOnly)
                    .labelsHidden()
                    .tint(Color(hex: "FF6B6B"))
                    .disabled(isMuted)
                    .onChange(of: mentionsOnly) { _, newValue in
                        Task { await save(UpdateConversationPreferencesRequest(mentionsOnly: newValue)) }
                    }
            }
            .opacity(isMuted ? 0.4 : 1)
        }
    }

    private var actionsSection: some View {
        settingsSection(title: "Actions", icon: "ellipsis.circle.fill", color: "6B7280") {
            Button {
                showArchiveConfirm = true
            } label: {
                settingsRow(icon: isArchived ? "archivebox.fill" : "archivebox", iconColor: "F59E0B", title: isArchived ? "Désarchiver" : "Archiver") {
                    EmptyView()
                }
                .foregroundColor(Color(hex: "F59E0B"))
            }
            .buttonStyle(.plain)

            if canLeave {
                Divider().padding(.leading, 54).opacity(0.3)
                Button {
                    showLeaveConfirm = true
                } label: {
                    settingsRow(icon: "rectangle.portrait.and.arrow.right", iconColor: "F97316", title: "Quitter le groupe") {
                        EmptyView()
                    }
                    .foregroundColor(Color(hex: "F97316"))
                }
                .buttonStyle(.plain)
            }

            Divider().padding(.leading, 54).opacity(0.3)
            Button {
                showDeleteConfirm = true
            } label: {
                settingsRow(icon: "trash.fill", iconColor: "F87171", title: "Supprimer pour moi") {
                    EmptyView()
                }
                .foregroundColor(Color(hex: "F87171"))
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Builders

    private func settingsSection<Content: View>(
        title: String,
        icon: String,
        color: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: color))
                Text(title.uppercased())
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: color))
                    .tracking(1.2)
            }
            .padding(.leading, 4)

            VStack(spacing: 0) {
                content()
            }
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(theme.surfaceGradient(tint: color))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(theme.border(tint: color), lineWidth: 1)
                    )
            )
        }
    }

    @ViewBuilder
    private func settingsRow<Trailing: View>(
        icon: String,
        iconColor: String,
        title: String,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: iconColor))
                .frame(width: 28, height: 28)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color(hex: iconColor).opacity(0.12)))
            Text(title)
                .font(.system(size: 15))
                .foregroundColor(theme.textPrimary)
            Spacer()
            trailing()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    // MARK: - Data

    private func setupDebounce() {
        customNameSubject
            .debounce(for: .milliseconds(500), scheduler: DispatchQueue.main)
            .sink { value in
                Task { await save(UpdateConversationPreferencesRequest(customName: value.isEmpty ? nil : value)) }
            }
            .store(in: &cancellables)
    }

    private func setupMemberSearchDebounce() {
        let manage = canManageMembers
        memberSearchSubject
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { query in
                guard manage else { return }
                let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
                guard trimmed.count >= 3 else {
                    platformSearchResults = []
                    return
                }
                Task { await searchPlatformUsers(query: trimmed) }
            }
            .store(in: &cancellables)
    }

    private func searchPlatformUsers(query: String) async {
        isSearchingPlatform = true
        defer { isSearchingPlatform = false }

        do {
            let response: PrefsUserSearchResponse = try await APIClient.shared.request(
                endpoint: "/users/search",
                queryItems: [
                    URLQueryItem(name: "q", value: query),
                    URLQueryItem(name: "limit", value: "10"),
                ]
            )
            if response.success {
                platformSearchResults = response.data.filter { !existingMemberIds.contains($0.id) && !addedUserIds.contains($0.id) }
            }
        } catch {
            Self.logger.error("Platform user search failed: \(error.localizedDescription)")
            platformSearchResults = []
        }
    }

    private func addParticipant(userId: String) async {
        addingUserId = userId

        struct AddBody: Encodable { let userId: String }

        do {
            let _: APIResponse<[String: String]> = try await APIClient.shared.post(
                endpoint: "/conversations/\(conversation.id)/participants",
                body: AddBody(userId: userId)
            )
            HapticFeedback.success()
            addedUserIds.insert(userId)
            platformSearchResults.removeAll { $0.id == userId }
        } catch {
            Self.logger.error("Failed to add participant: \(error.localizedDescription)")
            HapticFeedback.error()
            errorMessage = "Impossible d'ajouter ce membre."
        }

        addingUserId = nil
    }

    private func loadPreferences() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let prefs = try await PreferenceService.shared.getConversationPreferences(conversationId: conversation.id)
            isPinned = prefs.isPinned ?? false
            isMuted = prefs.isMuted ?? false
            mentionsOnly = prefs.mentionsOnly ?? false
            isArchived = prefs.isArchived ?? false
            customName = prefs.customName ?? ""
            reaction = prefs.reaction ?? ""
            tags = prefs.tags ?? []
            categoryId = prefs.categoryId
        } catch {
            errorMessage = "Impossible de charger les préférences."
        }
    }

    private func save(_ request: UpdateConversationPreferencesRequest) async {
        do {
            try await PreferenceService.shared.updateConversationPreferences(
                conversationId: conversation.id,
                request: request
            )
            errorMessage = nil
        } catch {
            errorMessage = "Erreur lors de la sauvegarde."
        }
    }

    private func toggleArchive() async {
        let newValue = !isArchived
        isArchived = newValue
        await save(UpdateConversationPreferencesRequest(isArchived: newValue))
    }

    private func leaveConversation() async {
        do {
            try await ConversationService.shared.leave(conversationId: conversation.id)
            dismiss()
        } catch {
            errorMessage = "Impossible de quitter la conversation."
        }
    }

    private func deleteForMe() async {
        do {
            try await ConversationService.shared.deleteForMe(conversationId: conversation.id)
            dismiss()
        } catch {
            errorMessage = "Impossible de supprimer la conversation."
        }
    }
}
