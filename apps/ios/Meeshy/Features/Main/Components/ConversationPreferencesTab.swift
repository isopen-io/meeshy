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
        self._viewModel = StateObject(wrappedValue: ConversationOptionsViewModel(conversation: conversation))
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
                    .font(MeeshyFont.relative(13))
                    .foregroundColor(MeeshyColors.error)
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
        .adaptiveOnChange(of: viewModel.didDelete) { _, deleted in if deleted { dismiss() } }
        .adaptiveOnChange(of: viewModel.didLeave) { _, left in if left { dismiss() } }
        .alert(
            (viewModel.prefs.isArchived ?? false) ? String(localized: "conversation.prefs.unarchive.title", defaultValue: "Unarchive conversation?", bundle: .main) : String(localized: "conversation.prefs.archive.title", defaultValue: "Archive conversation?", bundle: .main),
            isPresented: $showArchiveConfirm
        ) {
            Button((viewModel.prefs.isArchived ?? false) ? String(localized: "conversation.prefs.unarchive", defaultValue: "Unarchive", bundle: .main) : String(localized: "conversation.prefs.archive", defaultValue: "Archive", bundle: .main),
                   role: (viewModel.prefs.isArchived ?? false) ? .none : .destructive) {
                viewModel.toggleArchive()
            }
            Button(String(localized: "common.cancel", defaultValue: "Cancel", bundle: .main), role: .cancel) {}
        }
        .confirmationDialog(String(localized: "conversation.prefs.leave.title", defaultValue: "Leave conversation?", bundle: .main), isPresented: $showLeaveConfirm, titleVisibility: .visible) {
            Button(String(localized: "conversation.prefs.leave", defaultValue: "Leave", bundle: .main), role: .destructive) {
                Task { await viewModel.leave() }
            }
            Button(String(localized: "common.cancel", defaultValue: "Cancel", bundle: .main), role: .cancel) {}
        } message: {
            Text(String(localized: "conversation.prefs.leave.message", defaultValue: "You will no longer receive messages. Your history will remain readable.", bundle: .main))
        }
        .confirmationDialog(String(localized: "conversation.prefs.delete.title", defaultValue: "Delete for me?", bundle: .main), isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button(String(localized: "common.delete", defaultValue: "Delete", bundle: .main), role: .destructive) {
                Task { await viewModel.deleteForMe() }
            }
            Button(String(localized: "common.cancel", defaultValue: "Cancel", bundle: .main), role: .cancel) {}
        } message: {
            Text(String(localized: "conversation.prefs.delete.message", defaultValue: "This conversation will be removed from your list. Other members will not be affected.", bundle: .main))
        }
    }

    // MARK: - Sections

    private var displaySection: some View {
        settingsSection(title: String(localized: "conversation.prefs.section.display", defaultValue: "My display", bundle: .main), icon: "paintbrush.fill", color: accentColor) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Image(systemName: "pencil")
                        // Decorative glyph in a fixed 28×28 badge — kept fixed (86i doctrine:
                        // a scalable glyph would overflow the fixed frame) + hidden (the label carries the meaning).
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(accent)
                        .frame(width: 28, height: 28)
                        .background(RoundedRectangle(cornerRadius: 8).fill(accent.opacity(0.12)))
                        .accessibilityHidden(true)
                    Text(String(localized: "conversation.prefs.custom-name", defaultValue: "Custom name", bundle: .main))
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(theme.textSecondary)
                }

                HStack(spacing: 6) {
                    TextField(String(localized: "conversation.prefs.custom-name.placeholder", defaultValue: "Give this conversation a nickname...", bundle: .main), text: $customNameLocal)
                        .textFieldStyle(.plain)
                        .font(MeeshyFont.relative(15, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                        .adaptiveOnChange(of: customNameLocal) { _, newValue in
                            viewModel.setCustomName(newValue)
                        }
                    if !customNameLocal.isEmpty {
                        Button {
                            customNameLocal = ""
                            viewModel.setCustomName("")
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(MeeshyFont.relative(14))
                                .foregroundColor(theme.textMuted)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(String(localized: "conversation.prefs.custom-name.clear", defaultValue: "Clear custom name", bundle: .main))
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
                settingsRow(icon: "heart.fill", iconColor: accentColor, title: String(localized: "conversation.prefs.reaction", defaultValue: "Reaction", bundle: .main)) {
                    HStack(spacing: 6) {
                        if let r = viewModel.prefs.reaction, !r.isEmpty {
                            Text(r).font(MeeshyFont.relative(24))
                        } else {
                            Text(String(localized: "conversation.prefs.reaction.none", defaultValue: "None", bundle: .main))
                                .font(MeeshyFont.relative(14))
                                .foregroundColor(theme.textMuted)
                        }
                        Image(systemName: "chevron.right")
                            .font(MeeshyFont.relative(11, weight: .semibold))
                            .foregroundColor(theme.textMuted)
                            .accessibilityHidden(true)
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
                    viewModel.setReaction(emoji)
                }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }

    private var organizationSection: some View {
        settingsSection(title: String(localized: "conversation.prefs.section.organization", defaultValue: "Organisation", bundle: .main), icon: "folder.fill", color: "3B82F6") {
            // Pin toggle
            settingsToggleRow(
                icon: "pin.fill",
                iconColor: "3B82F6",
                title: String(localized: "conversation.prefs.pin", defaultValue: "Pin", bundle: .main),
                tint: MeeshyColors.info,
                isOn: Binding(
                    get: { viewModel.prefs.isPinned ?? false },
                    set: { val in viewModel.setPinned(val) }
                )
            )

            Divider().padding(.leading, 54).opacity(0.3)

            // Catégorie
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Image(systemName: "square.grid.2x2.fill")
                        // Decorative glyph in a fixed 28×28 badge — kept fixed + hidden (86i doctrine).
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(MeeshyColors.info)
                        .frame(width: 28, height: 28)
                        .background(RoundedRectangle(cornerRadius: 8).fill(MeeshyColors.info.opacity(0.12)))
                        .accessibilityHidden(true)
                    Text(String(localized: "conversation.prefs.category", defaultValue: "Category", bundle: .main))
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(theme.textSecondary)
                }

                CategoryPickerField(
                    categories: viewModel.categories,
                    selectedId: Binding(
                        get: { viewModel.prefs.categoryId },
                        set: { newId in viewModel.setCategory(newId) }
                    ),
                    accentColor: MeeshyColors.info,
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
                        // Decorative glyph in a fixed 28×28 badge — kept fixed + hidden (86i doctrine).
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(MeeshyColors.info)
                        .frame(width: 28, height: 28)
                        .background(RoundedRectangle(cornerRadius: 8).fill(MeeshyColors.info.opacity(0.12)))
                        .accessibilityHidden(true)
                    Text(String(localized: "conversation.prefs.tags", defaultValue: "Tags", bundle: .main))
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(theme.textSecondary)
                }

                TagInputField(
                    selectedTags: Binding(
                        get: { viewModel.prefs.tags ?? [] },
                        set: { newTags in viewModel.setTags(newTags) }
                    ),
                    knownTags: viewModel.allTags,
                    accentColor: MeeshyColors.info
                )
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
    }

    private var notificationsSection: some View {
        settingsSection(title: String(localized: "conversation.prefs.section.notifications", defaultValue: "Notifications", bundle: .main), icon: "bell.fill", color: "FF6B6B") {
            settingsToggleRow(
                icon: "bell.slash.fill",
                iconColor: "FF6B6B",
                title: String(localized: "conversation.prefs.muted", defaultValue: "Muet", bundle: .main),
                tint: MeeshyColors.error,
                isOn: Binding(
                    get: { viewModel.prefs.isMuted ?? false },
                    set: { val in viewModel.setMuted(val) }
                )
            )
            Divider().padding(.leading, 54).opacity(0.3)
            settingsToggleRow(
                icon: "at",
                iconColor: "FF6B6B",
                title: String(localized: "conversation.prefs.mentions-only", defaultValue: "Mentions seulement", bundle: .main),
                tint: MeeshyColors.error,
                isEnabled: !(viewModel.prefs.isMuted ?? false),
                isOn: Binding(
                    get: { viewModel.prefs.mentionsOnly ?? false },
                    set: { val in viewModel.setMentionsOnly(val) }
                )
            )
        }
    }

    private var actionsSection: some View {
        settingsSection(title: String(localized: "conversation.prefs.section.actions", defaultValue: "Actions", bundle: .main), icon: "ellipsis.circle.fill", color: "6B7280") {
            Button {
                showArchiveConfirm = true
            } label: {
                settingsRow(
                    icon: (viewModel.prefs.isArchived ?? false) ? "archivebox.fill" : "archivebox",
                    iconColor: "F59E0B",
                    title: (viewModel.prefs.isArchived ?? false) ? String(localized: "conversation.prefs.unarchive", defaultValue: "Unarchive", bundle: .main) : String(localized: "conversation.prefs.archive", defaultValue: "Archive", bundle: .main)
                ) { EmptyView() }
                .foregroundColor(MeeshyColors.warning)
            }
            .buttonStyle(.plain)

            if canLeave {
                Divider().padding(.leading, 54).opacity(0.3)
                Button {
                    showLeaveConfirm = true
                } label: {
                    settingsRow(icon: "rectangle.portrait.and.arrow.right", iconColor: "F97316", title: String(localized: "conversation.prefs.leave-group", defaultValue: "Quitter le groupe", bundle: .main)) {
                        EmptyView()
                    }
                    .foregroundColor(MeeshyColors.warning)
                }
                .buttonStyle(.plain)
            }

            Divider().padding(.leading, 54).opacity(0.3)
            Button {
                showDeleteConfirm = true
            } label: {
                settingsRow(icon: "trash.fill", iconColor: "F87171", title: String(localized: "conversation.prefs.delete-for-me", defaultValue: "Supprimer pour moi", bundle: .main)) {
                    EmptyView()
                }
                .foregroundColor(MeeshyColors.error)
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
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(Color(hex: color))
                    .accessibilityHidden(true)
                Text(title.uppercased())
                    .font(MeeshyFont.relative(11, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: color))
                    .tracking(1.2)
                    .accessibilityLabel(title)
                    .accessibilityAddTraits(.isHeader)
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
    private func settingsToggleRow(
        icon: String,
        iconColor: String,
        title: String,
        tint: Color,
        isEnabled: Bool = true,
        isOn: Binding<Bool>
    ) -> some View {
        settingsRow(icon: icon, iconColor: iconColor, title: title) {
            Toggle("", isOn: isOn)
                .labelsHidden()
                .tint(tint)
                .disabled(!isEnabled)
                .accessibilityLabel(title)
        }
        .opacity(isEnabled ? 1 : 0.4)
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
                // Decorative glyph in a fixed 28×28 badge — kept fixed + hidden (86i doctrine).
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: iconColor))
                .frame(width: 28, height: 28)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color(hex: iconColor).opacity(0.12)))
                .accessibilityHidden(true)
            Text(title)
                .font(MeeshyFont.relative(15))
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
