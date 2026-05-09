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

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @Environment(\.dismiss) private var dismiss

    @StateObject private var viewModel: ConversationOptionsViewModel

    @State private var showArchiveConfirm: Bool = false
    @State private var showLeaveConfirm: Bool = false
    @State private var showDeleteConfirm: Bool = false
    @State private var showEmojiPicker: Bool = false
    @State private var customNameLocal: String = ""

    @State private var memberSearchQuery: String = ""
    @State private var platformSearchResults: [PrefsUserSearchResult] = []
    @State private var isSearchingPlatform: Bool = false
    @State private var addingUserId: String? = nil
    @State private var addedUserIds: Set<String> = []
    @State private var memberCancellable: AnyCancellable?

    private let memberSearchSubject = PassthroughSubject<String, Never>()

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "conversation-prefs")
    private var presenceManager: PresenceManager { PresenceManager.shared }

    private var isDirect: Bool { conversation.type == .direct }
    private var isCreator: Bool { conversation.currentUserRole?.lowercased() == "creator" }
    private var accent: Color { Color(hex: accentColor) }

    private var canLeave: Bool { !isDirect && !isCreator }

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

    init(conversation: Conversation, participants: [PaginatedParticipant], accentColor: String) {
        self.conversation = conversation
        self.participants = participants
        self.accentColor = accentColor
        self._viewModel = StateObject(wrappedValue: ConversationOptionsViewModel(conversationId: conversation.id))
    }

    var body: some View {
        VStack(spacing: 16) {
            if viewModel.loadState == .loading && viewModel.prefs.tags == nil {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 200)
            } else {
                displaySection
                organizationSection
                notificationsSection
                actionsSection
            }

            if let error = viewModel.errorMessage {
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
        .task {
            await viewModel.load()
            customNameLocal = viewModel.prefs.customName ?? ""
        }
        .onAppear { setupMemberSearchDebounce() }
        .onChange(of: viewModel.didDelete) { _, deleted in if deleted { dismiss() } }
        .onChange(of: viewModel.didLeave) { _, left in if left { dismiss() } }
        .confirmationDialog(
            (viewModel.prefs.isArchived ?? false) ? "Désarchiver la conversation ?" : "Archiver la conversation ?",
            isPresented: $showArchiveConfirm,
            titleVisibility: .visible
        ) {
            Button((viewModel.prefs.isArchived ?? false) ? "Désarchiver" : "Archiver",
                   role: (viewModel.prefs.isArchived ?? false) ? .none : .destructive) {
                Task { await viewModel.toggleArchive() }
            }
            Button("Annuler", role: .cancel) {}
        }
        .confirmationDialog("Quitter la conversation ?", isPresented: $showLeaveConfirm, titleVisibility: .visible) {
            Button("Quitter", role: .destructive) {
                Task { await viewModel.leave() }
            }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Vous ne recevrez plus de messages. Votre historique restera lisible.")
        }
        .confirmationDialog("Supprimer pour moi ?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Supprimer", role: .destructive) {
                Task { await viewModel.deleteForMe() }
            }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Cette conversation sera supprimée de votre liste. Les autres membres ne seront pas affectés.")
        }
    }

    // MARK: - Sections

    private var displaySection: some View {
        settingsSection(title: "Mon affichage", icon: "paintbrush.fill", color: "A855F7") {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Image(systemName: "pencil")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Color(hex: "A855F7"))
                        .frame(width: 28, height: 28)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color(hex: "A855F7").opacity(0.12)))
                    Text("Nom personnalisé")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.textSecondary)
                }

                HStack(spacing: 6) {
                    TextField("Donner un surnom à cette conversation...", text: $customNameLocal)
                        .textFieldStyle(.plain)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                        .onChange(of: customNameLocal) { _, newValue in
                            viewModel.setCustomName(newValue)
                        }
                    if !customNameLocal.isEmpty {
                        Button {
                            customNameLocal = ""
                            viewModel.setCustomName("")
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 14))
                                .foregroundColor(theme.textMuted)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.03))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(theme.textMuted.opacity(0.15), lineWidth: 1)
                )
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)

            Divider().padding(.leading, 54).opacity(0.3)

            Button {
                showEmojiPicker = true
            } label: {
                settingsRow(icon: "heart.fill", iconColor: "A855F7", title: "Réaction") {
                    HStack(spacing: 6) {
                        if let r = viewModel.prefs.reaction, !r.isEmpty {
                            Text(r).font(.system(size: 24))
                        } else {
                            Text("Aucune")
                                .font(.system(size: 14))
                                .foregroundColor(theme.textMuted)
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
                    showEmojiPicker = false
                    Task { await viewModel.setReaction(emoji) }
                }
            )
            .presentationDetents([.medium, .large])
        }
    }

    private var organizationSection: some View {
        settingsSection(title: "Organisation", icon: "folder.fill", color: "3B82F6") {
            // Pin toggle
            settingsRow(icon: "pin.fill", iconColor: "3B82F6", title: "Épingler") {
                Toggle("", isOn: Binding(
                    get: { viewModel.prefs.isPinned ?? false },
                    set: { val in Task { await viewModel.setPinned(val) } }
                ))
                .labelsHidden()
                .tint(Color(hex: "3B82F6"))
            }

            Divider().padding(.leading, 54).opacity(0.3)

            // Catégorie
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Image(systemName: "square.grid.2x2.fill")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Color(hex: "3B82F6"))
                        .frame(width: 28, height: 28)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color(hex: "3B82F6").opacity(0.12)))
                    Text("Catégorie")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.textSecondary)
                }

                CategoryPickerField(
                    categories: viewModel.categories,
                    selectedId: Binding(
                        get: { viewModel.prefs.categoryId },
                        set: { newId in Task { await viewModel.setCategory(newId) } }
                    ),
                    accentColor: Color(hex: "3B82F6"),
                    onCreateCategory: { name in
                        await viewModel.createCategoryAndSelect(name: name)
                    }
                )
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)

            Divider().padding(.leading, 54).opacity(0.3)

            // Tags
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Image(systemName: "tag.fill")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Color(hex: "3B82F6"))
                        .frame(width: 28, height: 28)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color(hex: "3B82F6").opacity(0.12)))
                    Text("Tags")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.textSecondary)
                }

                TagInputField(
                    selectedTags: Binding(
                        get: { viewModel.prefs.tags ?? [] },
                        set: { newTags in
                            Task { await viewModel.setTags(newTags) }
                        }
                    ),
                    knownTags: viewModel.allTags,
                    accentColor: Color(hex: "3B82F6")
                )
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
    }

    private var notificationsSection: some View {
        settingsSection(title: "Notifications", icon: "bell.fill", color: "FF6B6B") {
            settingsRow(icon: "bell.slash.fill", iconColor: "FF6B6B", title: "Muet") {
                Toggle("", isOn: Binding(
                    get: { viewModel.prefs.isMuted ?? false },
                    set: { val in Task { await viewModel.setMuted(val) } }
                ))
                .labelsHidden()
                .tint(Color(hex: "FF6B6B"))
            }
            Divider().padding(.leading, 54).opacity(0.3)
            settingsRow(icon: "at", iconColor: "FF6B6B", title: "Mentions seulement") {
                Toggle("", isOn: Binding(
                    get: { viewModel.prefs.mentionsOnly ?? false },
                    set: { val in Task { await viewModel.setMentionsOnly(val) } }
                ))
                .labelsHidden()
                .tint(Color(hex: "FF6B6B"))
                .disabled(viewModel.prefs.isMuted ?? false)
            }
            .opacity((viewModel.prefs.isMuted ?? false) ? 0.4 : 1)
        }
    }

    private var actionsSection: some View {
        settingsSection(title: "Actions", icon: "ellipsis.circle.fill", color: "6B7280") {
            Button {
                showArchiveConfirm = true
            } label: {
                settingsRow(
                    icon: (viewModel.prefs.isArchived ?? false) ? "archivebox.fill" : "archivebox",
                    iconColor: "F59E0B",
                    title: (viewModel.prefs.isArchived ?? false) ? "Désarchiver" : "Archiver"
                ) { EmptyView() }
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

    // MARK: - Member Search (unchanged behavior)

    private func setupMemberSearchDebounce() {
        guard memberCancellable == nil else { return }
        let manage = canManageMembers
        memberCancellable = memberSearchSubject
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
}
