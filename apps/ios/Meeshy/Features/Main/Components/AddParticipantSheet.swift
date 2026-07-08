import SwiftUI
import Combine
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
    let lastActiveAt: Date?

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
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

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
            Text(String(localized: "participants.add.title", defaultValue: "Ajouter un membre", bundle: .main))
                .font(MeeshyFont.relative(17, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Spacer()

            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                // Glyphe chrome de fermeture dans un cadre tap fixe 28×28 — laissé
                // figé (doctrine 82i/87i : le chrome ne suit pas Dynamic Type).
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(theme.textMuted.opacity(0.12)))
            }
            .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 8)
    }

    // MARK: - Search Field

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)

            TextField(String(localized: "participants.add.search-placeholder", defaultValue: "Rechercher un utilisateur...", bundle: .main), text: $searchQuery)
                .font(MeeshyFont.relative(15))
                .foregroundColor(theme.textPrimary)
                .focused($isSearchFocused)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .adaptiveOnChange(of: searchQuery) { _, newValue in
                    Task { await searchUsers(query: newValue) }
                }

            if !searchQuery.isEmpty {
                Button {
                    searchQuery = ""
                    searchResults = []
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(MeeshyFont.relative(16))
                        .foregroundColor(theme.textMuted)
                }
                .accessibilityLabel(String(localized: "common.clear-search", defaultValue: "Effacer la recherche", bundle: .main))
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
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundColor(MeeshyColors.error)
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
                context: .userListItem,
                accentColor: color,
                avatarURL: user.avatar,
                presenceState: PresenceManager.shared.resolvedState(userId: user.id, isOnline: user.isOnline, lastActiveAt: user.lastActiveAt)
            )

            VStack(alignment: .leading, spacing: 2) {
                Text(user.name)
                    .font(MeeshyFont.relative(14, weight: .semibold))
                    .foregroundColor(isMember ? theme.textMuted : theme.textPrimary)
                    .lineLimit(1)

                Text("@\(user.username)")
                    .font(MeeshyFont.relative(11, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(1)
            }
            .accessibilityElement(children: .combine)

            Spacer()

            if isMember {
                Text(String(localized: "participants.add.member", defaultValue: "Membre", bundle: .main))
                    .font(MeeshyFont.relative(11, weight: .semibold))
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
                    Text(String(localized: "common.add", defaultValue: "Ajouter", bundle: .main))
                        .font(MeeshyFont.relative(12, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(accent))
                }
                .accessibilityLabel(String(format: String(localized: "participants.add.add-a11y", defaultValue: "Ajouter %@", bundle: .main), user.name))
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
            // Glyphe décoratif d'état vide — laissé figé (illustration, pas du texte)
            // et masqué de VoiceOver via le `.combine` parent.
            Image(systemName: "person.badge.plus")
                .font(.system(size: 32, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))
            Text(String(localized: "participants.add.prompt", defaultValue: "Recherchez par nom ou @pseudo", bundle: .main))
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Empty Results

    private var emptyResults: some View {
        VStack(spacing: 12) {
            // Glyphe décoratif d'état vide — laissé figé (illustration, pas du texte)
            // et masqué de VoiceOver via le `.combine` parent.
            Image(systemName: "person.slash")
                .font(.system(size: 32, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))
            Text(String(localized: "participants.add.no-results", defaultValue: "Aucun utilisateur trouve", bundle: .main))
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
        .accessibilityElement(children: .combine)
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
            errorMessage = String(localized: "participants.add.error", defaultValue: "Impossible d'ajouter ce membre.", bundle: .main)
        }

        addingUserId = nil
    }
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let participants = Logger(subsystem: "me.meeshy.app", category: "participants")
}
