import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct NewConversationView: View {
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @StateObject private var viewModel: NewConversationViewModel
    /// Outgoing-block awareness for graying out / disabling blocked users in
    /// the picker. Observed so rows update live on block/unblock.
    @ObservedObject private var blockService = BlockService.shared

    @State private var searchQuery = ""
    @State private var selectedUsers: [SearchedUser] = []
    @State private var groupTitle = ""

    /// Default initializer used by production callers. The `wrappedValue:`
    /// argument of `StateObject` is `@autoclosure @escaping`, so the
    /// `NewConversationViewModel()` expression is only evaluated by
    /// SwiftUI the first time the view appears — not on every re-render
    /// of the parent. Constructing the VM inside the body of `init` is
    /// the only shape that gets the lazy semantics; passing a default
    /// argument (`viewModel: VM = VM()`) defeats them.
    init() {
        _viewModel = StateObject(wrappedValue: NewConversationViewModel())
    }

    /// Test- and preview-only initializer. Tests build the VM with a mock
    /// `APIClientProviding` and inject it ready-made; SwiftUI still
    /// honours the StateObject identity contract because the instance is
    /// captured exactly once.
    init(testHook viewModel: NewConversationViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    private let accentColor = "818CF8"

    var isGroupMode: Bool { selectedUsers.count > 1 }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                if isGroupMode { groupTitleField }
                selectedUsersBar
                searchField
                resultsList
            }
        }
        // Contact-first: load the user's contacts as soon as the picker opens,
        // before any search is typed. Cache-First inside the VM keeps this
        // instant when the friends cache is warm.
        .task {
            await viewModel.loadContacts()
        }
        .adaptiveOnChange(of: searchQuery) { _, newValue in
            viewModel.search(query: newValue)
        }
        // Deployment target is iOS 16; the two-argument
        // `onChange(of:initial:_:)` shape is iOS 17+. Use `adaptiveOnChange`
        // (MeeshyUI/Compatibility/AdaptiveOnChange.swift) which backports the
        // `(oldValue, newValue)` signature to iOS 16 — same call site is
        // already used 7 lines above for `searchQuery`.
        .adaptiveOnChange(of: viewModel.createdConversation) { _, conversation in
            guard let conversation else { return }
            HapticFeedback.success()
            dismiss()
            // Brief delay lets the dismiss animation start before the
            // listener-side navigator pushes onto the stack — matches the
            // pre-refactor 300 ms timing.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                NotificationCenter.default.post(
                    name: .navigateToConversation,
                    object: conversation
                )
            }
            viewModel.consumeCreatedConversation()
        }
        .adaptiveOnChange(of: viewModel.errorMessage) { _, message in
            guard message != nil else { return }
            HapticFeedback.error()
        }
        // Surface the error to the user — not just to the haptic engine.
        // The previous shape silently swallowed failures, exactly the
        // pattern the audit flagged. The dismiss path goes through
        // `viewModel.dismissError()` so the view never mutates the
        // VM's `@Published` state directly.
        .alert(
            String(localized: "new_conversation.error.title", defaultValue: "Erreur"),
            isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: { isPresented in
                    if !isPresented { viewModel.dismissError() }
                }
            ),
            presenting: viewModel.errorMessage,
            actions: { _ in
                Button(String(localized: "common.ok", defaultValue: "OK"), role: .cancel) { }
            },
            message: { message in
                Text(message)
            }
        )
        .withStatusBubble()
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                // Chrome nav glyph: fixed 16pt tap target (doctrine 82i/87i/90i —
                // header/toolbar chevrons stay fixed, not Dynamic-Type-scaled).
                Image(systemName: "chevron.backward")
                    .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .semibold))
                    .foregroundColor(MeeshyColors.indigo400)
            }
            .accessibilityLabel(String(localized: "a11y.back", bundle: .main))

            Spacer()

            Text(String(localized: "conversation.new.title", defaultValue: "Nouvelle conversation"))
                .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            if !selectedUsers.isEmpty {
                Button {
                    HapticFeedback.medium()
                    Task { await viewModel.createConversation(selectedUsers: selectedUsers, groupTitle: groupTitle) }
                } label: {
                    if viewModel.isCreating {
                        ProgressView()
                            .tint(MeeshyColors.indigo400)
                    } else {
                        Text(String(localized: "common.create", defaultValue: "Créer"))
                            .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .bold))
                            .foregroundColor(MeeshyColors.indigo400)
                    }
                }
                .disabled(viewModel.isCreating || (isGroupMode && groupTitle.trimmingCharacters(in: .whitespaces).isEmpty))
            } else {
                Color.clear.frame(width: 40, height: 24)
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.md)
    }

    // MARK: - Group Title Field

    private var groupTitleField: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            Image(systemName: "person.3.fill")
                .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .medium))
                .foregroundColor(MeeshyColors.indigo600)
                .accessibilityHidden(true)

            TextField(String(localized: "conversation.new.group-name", defaultValue: "Nom du groupe"), text: $groupTitle)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
                .foregroundColor(theme.textPrimary)
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                .fill(theme.surfaceGradient(tint: MeeshyColors.brandDeepHex))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                        .stroke(theme.border(tint: MeeshyColors.brandDeepHex), lineWidth: 1)
                )
        )
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.sm)
        .transition(.opacity.combined(with: .move(edge: .top)))
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isGroupMode)
    }

    // MARK: - Selected Users Bar

    @ViewBuilder
    private var selectedUsersBar: some View {
        if !selectedUsers.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.smPlus) {
                    ForEach(selectedUsers) { user in
                        selectedUserChip(user)
                    }
                }
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.vertical, MeeshySpacing.sm)
            }
        }
    }

    private func selectedUserChip(_ user: SearchedUser) -> some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            MeeshyAvatar(
                name: user.displayName ?? user.username,
                context: .custom(24),
                accentColor: DynamicColorGenerator.colorForName(user.username),
                secondaryColor: accentColor,
                moodEmoji: statusViewModel.statusForUser(userId: user.id)?.moodEmoji,
                presenceState: PresenceManager.shared.resolvedState(userId: user.id, isOnline: user.isOnline, lastActiveAt: user.lastActiveAt),
                onMoodTap: statusViewModel.moodTapHandler(for: user.id)
            )

            Text(user.displayName ?? user.username)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .lineLimit(1)

            Button {
                HapticFeedback.light()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    selectedUsers.removeAll { $0.id == user.id }
                }
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(MeeshyFont.relative(MeeshyIconSize.sm))
                    .foregroundColor(theme.textMuted)
            }
            .accessibilityLabel(String(localized: "accessibility.remove_selected_user", bundle: .main))
        }
        .padding(.horizontal, MeeshySpacing.smPlus)
        .padding(.vertical, MeeshySpacing.xsPlus)
        .background(
            Capsule()
                .fill(MeeshyColors.indigo400.opacity(0.12))
                .overlay(
                    Capsule()
                        .stroke(MeeshyColors.indigo400.opacity(0.3), lineWidth: 1)
                )
        )
        .transition(.scale.combined(with: .opacity))
    }

    // MARK: - Search Field

    private var searchField: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            Image(systemName: "magnifyingglass")
                .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .medium))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)

            TextField(String(localized: "conversation.new.search-placeholder", defaultValue: "Rechercher un utilisateur…"), text: $searchQuery)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
                .foregroundColor(theme.textPrimary)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)

            if viewModel.isSearching {
                ProgressView()
                    .scaleEffect(0.7)
            } else if !searchQuery.isEmpty {
                Button {
                    searchQuery = ""
                    viewModel.clearSearch()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(MeeshyFont.relative(MeeshyIconSize.sm))
                        .foregroundColor(theme.textMuted)
                }
                .accessibilityLabel(String(localized: "accessibility.clear_search", bundle: .main))
            }
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                        .stroke(theme.border(tint: accentColor), lineWidth: 1)
                )
        )
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.sm)
    }

    // MARK: - Results List

    /// The picker is contact-first: browsing the user's own contacts is the
    /// default surface, and platform-wide search only takes over once the
    /// query reaches the ViewModel's 2-character threshold. Below that the
    /// contacts list stays visible so a single stray keystroke never blanks
    /// the screen.
    private var isSearchActive: Bool {
        searchQuery.trimmingCharacters(in: .whitespaces).count >= 2
    }

    private var resultsList: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: MeeshySpacing.xs) {
                if isSearchActive {
                    searchResultsSection
                } else {
                    contactsSection
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.xs)
        }
    }

    // MARK: - Search Results Section

    @ViewBuilder
    private var searchResultsSection: some View {
        if viewModel.searchResults.isEmpty && !viewModel.isSearching {
            emptyState
        } else {
            ForEach(viewModel.searchResults) { user in
                userRow(user)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: MeeshySpacing.md) {
            Image(systemName: "person.slash")
                .font(MeeshyFont.relative(36))
                .foregroundColor(theme.textMuted.opacity(0.5))
                .accessibilityHidden(true)

            Text(String(localized: "conversation.new.no-user-found", defaultValue: "Aucun utilisateur trouvé"))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Contacts Section (default surface)

    @ViewBuilder
    private var contactsSection: some View {
        if viewModel.contacts.isEmpty {
            if viewModel.isLoadingContacts {
                contactsLoadingState
            } else {
                contactsEmptyState
            }
        } else {
            contactsSectionHeader
            ForEach(viewModel.contacts) { user in
                userRow(user)
            }
        }
    }

    private var contactsSectionHeader: some View {
        HStack {
            Text(String(localized: "new_conversation.contacts.section", defaultValue: "Vos contacts", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .foregroundColor(theme.textMuted)
                .textCase(.uppercase)
            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.top, MeeshySpacing.xsPlus)
        .padding(.bottom, MeeshySpacing.xxs)
        .accessibilityAddTraits(.isHeader)
    }

    private var contactsLoadingState: some View {
        VStack(spacing: MeeshySpacing.xs) {
            ForEach(0..<6, id: \.self) { _ in
                contactSkeletonRow
            }
        }
        .padding(.top, MeeshySpacing.xs)
        .accessibilityLabel(String(localized: "new_conversation.contacts.loading", defaultValue: "Chargement des contacts", bundle: .main))
    }

    private var contactSkeletonRow: some View {
        HStack(spacing: MeeshySpacing.md) {
            Circle()
                .fill(theme.textMuted.opacity(0.12))
                .frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                RoundedRectangle(cornerRadius: MeeshyRadius.xxs)
                    .fill(theme.textMuted.opacity(0.12))
                    .frame(width: 120, height: 12)
                RoundedRectangle(cornerRadius: 3)
                    .fill(theme.textMuted.opacity(0.08))
                    .frame(width: 80, height: 10)
            }
            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
        .shimmer()
        .accessibilityHidden(true)
    }

    private var contactsEmptyState: some View {
        VStack(spacing: MeeshySpacing.md) {
            Image(systemName: "person.2")
                .font(MeeshyFont.relative(36))
                .foregroundColor(theme.textMuted.opacity(0.5))
                .accessibilityHidden(true)

            Text(String(localized: "new_conversation.contacts.empty.title", defaultValue: "Aucun contact", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            Text(String(localized: "new_conversation.contacts.empty.subtitle", defaultValue: "Recherchez un utilisateur pour démarrer une conversation.", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, MeeshySpacing.xxxl)
        .padding(.top, 60)
        .accessibilityElement(children: .combine)
    }

    private func userRow(_ user: SearchedUser) -> some View {
        let isSelected = selectedUsers.contains { $0.id == user.id }
        let isBlocked = blockService.isBlocked(userId: user.id)
        let userColor = DynamicColorGenerator.colorForName(user.username)
        let presence = PresenceManager.shared.resolvedState(userId: user.id, isOnline: user.isOnline, lastActiveAt: user.lastActiveAt)

        return Button {
            HapticFeedback.light()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                if isSelected {
                    selectedUsers.removeAll { $0.id == user.id }
                } else {
                    selectedUsers.append(user)
                }
            }
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                MeeshyAvatar(
                    name: user.displayName ?? user.username,
                    context: .userListItem,
                    accentColor: userColor,
                    secondaryColor: accentColor,
                    moodEmoji: statusViewModel.statusForUser(userId: user.id)?.moodEmoji,
                    presenceState: presence,
                    onMoodTap: statusViewModel.moodTapHandler(for: user.id)
                )

                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(user.displayName ?? user.username)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)

                    Text("@\(user.username)")
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }

                Spacer()

                if isBlocked {
                    Text(String(localized: "new_conversation.user.blocked", defaultValue: "Bloqué", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .foregroundColor(MeeshyColors.error.opacity(0.8))
                    Image(systemName: "hand.raised.fill")
                        .font(MeeshyFont.relative(MeeshyIconSize.md))
                        .foregroundColor(MeeshyColors.error.opacity(0.7))
                        .accessibilityHidden(true)
                } else {
                    // Selection state is conveyed to VoiceOver by the row's
                    // `.isSelected` trait below; the glyph itself is decorative.
                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .font(MeeshyFont.relative(MeeshyIconSize.xl))
                        .foregroundColor(isSelected ? MeeshyColors.indigo400 : theme.textMuted.opacity(0.4))
                        .accessibilityHidden(true)
                }
            }
            .opacity(isBlocked ? 0.5 : 1)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.smPlus)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(isSelected
                        ? AnyShapeStyle(MeeshyColors.indigo400.opacity(0.08))
                        : AnyShapeStyle(theme.surfaceGradient(tint: userColor))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .stroke(
                                isSelected ? AnyShapeStyle(MeeshyColors.indigo400.opacity(0.3)) : AnyShapeStyle(theme.border(tint: userColor)),
                                lineWidth: 1
                            )
                    )
            )
        }
        .disabled(isBlocked)
        .accessibilityLabel(userRowAccessibilityLabel(for: user, isBlocked: isBlocked, presence: presence))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    // VoiceOver otherwise hears only "displayName, @username": the online dot
    // (rendered by MeeshyAvatar via resolvedState) and the "Bloqué" badge convey
    // status by colour/shape alone (WCAG 1.4.1). Compose the status into the row
    // label, mirroring the shipped ContactsListTab idiom and reusing its
    // lowercase status key.
    private func userRowAccessibilityLabel(for user: SearchedUser, isBlocked: Bool, presence: PresenceState) -> String {
        var parts = [user.displayName ?? user.username, "@\(user.username)"]
        if isBlocked {
            parts.append(String(localized: "new_conversation.user.blocked", defaultValue: "Bloqué", bundle: .main))
        } else if presence == .online {
            parts.append(String(localized: "contacts.list.online.lower", defaultValue: "en ligne", bundle: .main))
        }
        return parts.joined(separator: ", ")
    }

    // Networking is delegated to `NewConversationViewModel`. The view no
    // longer holds Task / APIClient / AuthManager references — see
    // ViewModels/NewConversationViewModel.swift for the search + create flow.
}

// MARK: - Searched User Model

struct SearchedUser: Decodable, Identifiable {
    let id: String
    let username: String
    let firstName: String?
    let lastName: String?
    let displayName: String?
    let email: String?
    let isOnline: Bool?
    let lastActiveAt: Date?
    let avatar: String?
}

extension SearchedUser {
    /// Bridges an SDK `FriendRequestUser` (the contact list model) into the
    /// picker's `SearchedUser` so the user's contacts render through the exact
    /// same `userRow` and feed the same selection flow as platform search
    /// results. `email` is absent from the friend payload (`nil`) — it is not
    /// surfaced in the row anyway.
    init(friend: FriendRequestUser) {
        self.init(
            id: friend.id,
            username: friend.username,
            firstName: friend.firstName,
            lastName: friend.lastName,
            displayName: friend.displayName,
            email: nil,
            isOnline: friend.isOnline,
            lastActiveAt: friend.lastActiveAt,
            avatar: friend.avatar
        )
    }
}

// MARK: - Notification Name

extension Notification.Name {
    static let navigateToConversation = Notification.Name("navigateToConversation")
}
