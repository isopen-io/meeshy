import SwiftUI
import MeeshySDK
import MeeshyUI

struct NewConversationView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @StateObject private var router = Router()

    @State private var searchQuery = ""
    @State private var searchResults: [SearchedUser] = []
    @State private var selectedUsers: [SearchedUser] = []
    @State private var isSearching = false
    @State private var isCreating = false
    @State private var groupTitle = ""
    @State private var searchTask: Task<Void, Never>?
    @State private var errorMessage: String?

    private let accentColor = "4ECDC4"

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
        .onChange(of: searchQuery) { _, newValue in
            debounceSearch(query: newValue)
        }
        .withStatusBubble()
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
            }

            Spacer()

            Text("Nouvelle conversation")
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            if !selectedUsers.isEmpty {
                Button {
                    HapticFeedback.medium()
                    createConversation()
                } label: {
                    if isCreating {
                        ProgressView()
                            .tint(Color(hex: accentColor))
                    } else {
                        Text("Créer")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(Color(hex: accentColor))
                    }
                }
                .disabled(isCreating || (isGroupMode && groupTitle.trimmingCharacters(in: .whitespaces).isEmpty))
            } else {
                Color.clear.frame(width: 40, height: 24)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Group Title Field

    private var groupTitleField: some View {
        HStack(spacing: 10) {
            Image(systemName: "person.3.fill")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(MeeshyColors.purple)

            TextField("Nom du groupe", text: $groupTitle)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(theme.textPrimary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(theme.surfaceGradient(tint: "9B59B6"))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(theme.border(tint: "9B59B6"), lineWidth: 1)
                )
        )
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .transition(.opacity.combined(with: .move(edge: .top)))
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isGroupMode)
    }

    // MARK: - Selected Users Bar

    @ViewBuilder
    private var selectedUsersBar: some View {
        if !selectedUsers.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(selectedUsers) { user in
                        selectedUserChip(user)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
        }
    }

    private func selectedUserChip(_ user: SearchedUser) -> some View {
        HStack(spacing: 6) {
            MeeshyAvatar(
                name: user.displayName ?? user.username,
                mode: .custom(24),
                accentColor: DynamicColorGenerator.colorForName(user.username),
                secondaryColor: accentColor,
                moodEmoji: statusViewModel.statusForUser(userId: user.id)?.moodEmoji,
                onMoodTap: statusViewModel.moodTapHandler(for: user.id)
            )

            Text(user.displayName ?? user.username)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .lineLimit(1)

            Button {
                HapticFeedback.light()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    selectedUsers.removeAll { $0.id == user.id }
                }
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 14))
                    .foregroundColor(theme.textMuted)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(Color(hex: accentColor).opacity(0.12))
                .overlay(
                    Capsule()
                        .stroke(Color(hex: accentColor).opacity(0.3), lineWidth: 1)
                )
        )
        .transition(.scale.combined(with: .opacity))
    }

    // MARK: - Search Field

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textMuted)

            TextField("Rechercher un utilisateur...", text: $searchQuery)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(theme.textPrimary)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)

            if isSearching {
                ProgressView()
                    .scaleEffect(0.7)
            } else if !searchQuery.isEmpty {
                Button {
                    searchQuery = ""
                    searchResults = []
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundColor(theme.textMuted)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(theme.border(tint: accentColor), lineWidth: 1)
                )
        )
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    // MARK: - Results List

    private var resultsList: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: 4) {
                if searchResults.isEmpty && !searchQuery.isEmpty && !isSearching {
                    emptyState
                } else {
                    ForEach(searchResults) { user in
                        userRow(user)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "person.slash")
                .font(.system(size: 36))
                .foregroundColor(theme.textMuted.opacity(0.5))

            Text("Aucun utilisateur trouvé")
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    private func userRow(_ user: SearchedUser) -> some View {
        let isSelected = selectedUsers.contains { $0.id == user.id }
        let userColor = DynamicColorGenerator.colorForName(user.username)

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
            HStack(spacing: 12) {
                MeeshyAvatar(
                    name: user.displayName ?? user.username,
                    mode: .custom(42),
                    accentColor: userColor,
                    secondaryColor: accentColor,
                    moodEmoji: statusViewModel.statusForUser(userId: user.id)?.moodEmoji,
                    onMoodTap: statusViewModel.moodTapHandler(for: user.id)
                )

                VStack(alignment: .leading, spacing: 2) {
                    Text(user.displayName ?? user.username)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(theme.textPrimary)

                    Text("@\(user.username)")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }

                Spacer()

                if user.isOnline == true {
                    Circle()
                        .fill(Color(hex: "2ECC71"))
                        .frame(width: 8, height: 8)
                }

                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 20))
                    .foregroundColor(isSelected ? Color(hex: accentColor) : theme.textMuted.opacity(0.4))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(isSelected
                        ? AnyShapeStyle(Color(hex: accentColor).opacity(0.08))
                        : AnyShapeStyle(theme.surfaceGradient(tint: userColor))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(
                                isSelected ? AnyShapeStyle(Color(hex: accentColor).opacity(0.3)) : AnyShapeStyle(theme.border(tint: userColor)),
                                lineWidth: 1
                            )
                    )
            )
        }
    }

    // MARK: - Actions

    private func debounceSearch(query: String) {
        searchTask?.cancel()
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 2 else {
            searchResults = []
            isSearching = false
            return
        }
        isSearching = true
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 350_000_000) // 350ms debounce
            guard !Task.isCancelled else { return }
            await performSearch(query: trimmed)
        }
    }

    private func performSearch(query: String) async {
        do {
            let queryItems = [
                URLQueryItem(name: "q", value: query),
                URLQueryItem(name: "limit", value: "20"),
                URLQueryItem(name: "offset", value: "0")
            ]
            let response: APIResponse<[SearchedUser]> = try await APIClient.shared.request(
                endpoint: "/users/search",
                queryItems: queryItems
            )
            let currentUserId = AuthManager.shared.currentUser?.id
            await MainActor.run {
                searchResults = response.data.filter { $0.id != currentUserId }
                isSearching = false
            }
        } catch {
            await MainActor.run {
                searchResults = []
                isSearching = false
            }
        }
    }

    private func createConversation() {
        guard !selectedUsers.isEmpty else { return }
        isCreating = true
        errorMessage = nil

        Task {
            do {
                let type = selectedUsers.count == 1 ? "direct" : "group"
                let title = isGroupMode ? groupTitle.trimmingCharacters(in: .whitespaces) : nil

                struct CreateConversationBody: Encodable {
                    let type: String
                    let title: String?
                    let participantIds: [String]
                }

                let body = CreateConversationBody(
                    type: type,
                    title: title,
                    participantIds: selectedUsers.map(\.id)
                )

                let response: APIResponse<APIConversation> = try await APIClient.shared.post(
                    endpoint: "/conversations",
                    body: body
                )

                let currentUserId = AuthManager.shared.currentUser?.id ?? ""
                let conversation = response.data.toConversation(currentUserId: currentUserId)

                await MainActor.run {
                    HapticFeedback.success()
                    isCreating = false
                    dismiss()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        NotificationCenter.default.post(
                            name: .navigateToConversation,
                            object: conversation
                        )
                    }
                }
            } catch {
                await MainActor.run {
                    HapticFeedback.error()
                    isCreating = false
                    errorMessage = "Impossible de créer la conversation"
                }
            }
        }
    }
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
    let lastActiveAt: String?
    let avatar: String?
}

// MARK: - Notification Name

extension Notification.Name {
    static let navigateToConversation = Notification.Name("navigateToConversation")
}
