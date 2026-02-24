import SwiftUI
import os
import MeeshySDK
import MeeshyUI

// MARK: - User Search Result

private struct UserSearchResult: Identifiable, Decodable {
    let id: String
    let username: String
    let firstName: String?
    let lastName: String?
    let displayName: String?
    let avatar: String?
    let isOnline: Bool?

    var name: String {
        displayName ?? [firstName, lastName].compactMap { $0 }.joined(separator: " ").ifEmptyFallback(username)
    }
}

private extension String {
    func ifEmptyFallback(_ fallback: String) -> String {
        isEmpty ? fallback : self
    }
}

// MARK: - User Search Response

private struct UserSearchResponse: Decodable {
    let success: Bool
    let data: [UserSearchResult]
}

// MARK: - AddParticipantSheet

struct AddParticipantSheet: View {
    let conversationId: String
    let accentColor: String
    let existingMemberIds: Set<String>
    let onAdded: () -> Void

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    @State private var searchQuery = ""
    @State private var searchResults: [UserSearchResult] = []
    @State private var isSearching = false
    @State private var addingUserId: String?
    @State private var addedUserIds: Set<String> = []
    @State private var errorMessage: String?
    @FocusState private var isSearchFocused: Bool

    private var accent: Color { Color(hex: accentColor) }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            headerBar
            searchField
            resultsList
        }
        .background(theme.backgroundPrimary.ignoresSafeArea())
        .presentationDragIndicator(.visible)
        .onAppear { isSearchFocused = true }
    }

    // MARK: - Header Bar

    private var headerBar: some View {
        HStack {
            Text("Ajouter un membre")
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(theme.textMuted.opacity(0.12)))
            }
            .accessibilityLabel("Fermer")
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 8)
    }

    // MARK: - Search Field

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textMuted)

            TextField("Rechercher un utilisateur...", text: $searchQuery)
                .font(.system(size: 15))
                .foregroundColor(theme.textPrimary)
                .focused($isSearchFocused)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .onChange(of: searchQuery) { _, newValue in
                    Task { await searchUsers(query: newValue) }
                }

            if !searchQuery.isEmpty {
                Button {
                    searchQuery = ""
                    searchResults = []
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 16))
                        .foregroundColor(theme.textMuted)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(theme.textMuted.opacity(0.08))
        )
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
    }

    // MARK: - Results List

    @ViewBuilder
    private var resultsList: some View {
        ScrollView(.vertical, showsIndicators: false) {
            if isSearching {
                VStack(spacing: 12) {
                    ForEach(0..<3, id: \.self) { _ in
                        searchSkeletonRow
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
            } else if searchQuery.count < 2 {
                searchPrompt
            } else if searchResults.isEmpty {
                emptyResults
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(searchResults) { user in
                        userRow(user)
                    }
                }
            }

            if let error = errorMessage {
                Text(error)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "FF6B6B"))
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
            }
        }
    }

    // MARK: - User Row

    private func userRow(_ user: UserSearchResult) -> some View {
        let isMember = existingMemberIds.contains(user.id) || addedUserIds.contains(user.id)
        let isAdding = addingUserId == user.id
        let color = DynamicColorGenerator.colorForName(user.name)

        return HStack(spacing: 12) {
            MeeshyAvatar(
                name: user.name,
                size: .small,
                accentColor: color,
                avatarURL: user.avatar
            )

            VStack(alignment: .leading, spacing: 2) {
                Text(user.name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(isMember ? theme.textMuted : theme.textPrimary)
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
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(theme.textMuted.opacity(0.1)))
            } else if isAdding {
                ProgressView()
                    .scaleEffect(0.8)
                    .tint(accent)
            } else {
                Button {
                    Task { await addParticipant(userId: user.id) }
                } label: {
                    Text("Ajouter")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(accent))
                }
                .accessibilityLabel("Ajouter \(user.name)")
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .opacity(isMember ? 0.5 : 1)
        .contentShape(Rectangle())
    }

    // MARK: - Search Prompt

    private var searchPrompt: some View {
        VStack(spacing: 12) {
            Image(systemName: "person.badge.plus")
                .font(.system(size: 32, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))
            Text("Recherchez par nom ou @pseudo")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    // MARK: - Empty Results

    private var emptyResults: some View {
        VStack(spacing: 12) {
            Image(systemName: "person.slash")
                .font(.system(size: 32, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))
            Text("Aucun utilisateur trouve")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    // MARK: - Skeleton Row

    private var searchSkeletonRow: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(theme.textMuted.opacity(0.12))
                .frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 4) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(theme.textMuted.opacity(0.12))
                    .frame(width: 100, height: 12)
                RoundedRectangle(cornerRadius: 3)
                    .fill(theme.textMuted.opacity(0.08))
                    .frame(width: 70, height: 10)
            }
            Spacer()
        }
        .shimmer()
    }

    // MARK: - API Calls

    private func searchUsers(query: String) async {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else {
            searchResults = []
            isSearching = false
            return
        }

        isSearching = true
        errorMessage = nil

        do {
            let response: UserSearchResponse = try await APIClient.shared.request(
                endpoint: "/users/search",
                queryItems: [
                    URLQueryItem(name: "q", value: trimmed),
                    URLQueryItem(name: "limit", value: "20"),
                ]
            )
            if response.success {
                searchResults = response.data
            }
        } catch {
            Logger.participants.error("User search failed: \(error.localizedDescription)")
            searchResults = []
        }

        isSearching = false
    }

    private func addParticipant(userId: String) async {
        addingUserId = userId
        errorMessage = nil

        struct AddBody: Encodable { let userId: String }

        do {
            let _: APIResponse<[String: String]> = try await APIClient.shared.post(
                endpoint: "/conversations/\(conversationId)/participants",
                body: AddBody(userId: userId)
            )
            HapticFeedback.success()
            addedUserIds.insert(userId)
            onAdded()
        } catch {
            Logger.participants.error("Failed to add participant: \(error.localizedDescription)")
            HapticFeedback.error()
            errorMessage = "Impossible d'ajouter ce membre."
        }

        addingUserId = nil
    }
}

// MARK: - Logger Extension

private extension Logger {
    static let participants = Logger(subsystem: "com.meeshy.app", category: "participants")
}
