import Foundation
import Combine
import MeeshySDK
import os

/// Gateway block-rejection detection. A 403 carrying the `USER_BLOCKED` code
/// (a block in either direction) is forwarded by `MeeshySDK`'s `APIClient` as
/// `MeeshyError.forbidden(reason:body:)` with the raw JSON in `body`.
/// `ErrorBody` doesn't surface `code`, so we decode it from the body here.
/// App-side helper (product-specific code string), visible across the module.
private struct BlockedErrorCodeBody: Decodable { let code: String? }

extension Error {
    var isUserBlockedError: Bool {
        guard let meeshy = self as? MeeshyError,
              case let .forbidden(_, body) = meeshy,
              let body else { return false }
        return (try? JSONDecoder().decode(BlockedErrorCodeBody.self, from: body))?.code == "USER_BLOCKED"
    }
}

/// MVVM extraction for ``NewConversationView``.
///
/// Before this extraction the view called `APIClient.shared.request` /
/// `APIClient.shared.post` directly from inside the SwiftUI body. That
/// pattern broke testability (no way to mock the network), made cache-first
/// awkward, and crowded the view file with side-effecting logic. The
/// ViewModel takes dependencies via init injection (CLAUDE.md "All
/// ViewModels accept dependencies via init injection with `.shared`
/// defaults") so tests can supply a `MockAPIClientForApp`.
///
/// The view binds to `@Published` properties; all network work happens here.
@MainActor
final class NewConversationViewModel: ObservableObject {

    // MARK: - Published state

    @Published private(set) var searchResults: [SearchedUser] = []
    @Published private(set) var isSearching = false
    /// `true` when the LAST `performSearch` call failed on a network/server
    /// error — distinguishes "zero results" from "the search itself broke"
    /// (audit 2026-07-20: `performSearch`'s catch cleared `searchResults`
    /// with no log and no distinct state, so a failed search looked
    /// identical to a genuine empty result set). Cleared at the start of
    /// every new search attempt.
    @Published private(set) var searchFailed = false
    @Published private(set) var isCreating = false
    @Published private(set) var errorMessage: String?
    /// Set after a successful `createConversation` so the view can dismiss
    /// itself and trigger navigation. Cleared back to `nil` by `consume…`.
    @Published private(set) var createdConversation: MeeshyConversation?

    // MARK: - Dependencies

    private let api: APIClientProviding
    private let currentUserIdProvider: @MainActor () -> String?
    private var searchTask: Task<Void, Never>?

    static let searchDebounce: UInt64 = 350_000_000  // ns

    init(
        api: APIClientProviding = APIClient.shared,
        currentUserIdProvider: @MainActor @escaping () -> String? = { AuthManager.shared.currentUser?.id }
    ) {
        self.api = api
        self.currentUserIdProvider = currentUserIdProvider
    }

    // MARK: - Search

    /// Debounced free-text search. Caller passes the live query text; the
    /// ViewModel handles the 350 ms debounce + cancellation of stale tasks.
    /// Queries shorter than 2 characters short-circuit to "no results".
    func search(query: String) {
        searchTask?.cancel()
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 2 else {
            searchResults = []
            isSearching = false
            searchFailed = false
            return
        }
        isSearching = true
        searchFailed = false
        searchTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: Self.searchDebounce)
            guard !Task.isCancelled, let self else { return }
            await self.performSearch(query: trimmed)
        }
    }

    /// Direct (non-debounced) entry point used by tests so they don't have
    /// to wait 350 ms for the debounce timer. Exposed `internal` so the
    /// test bundle can call it via `@testable import Meeshy`.
    func performSearch(query: String) async {
        do {
            let queryItems = [
                URLQueryItem(name: "q", value: query),
                URLQueryItem(name: "limit", value: "20"),
                URLQueryItem(name: "offset", value: "0")
            ]
            let response: APIResponse<[SearchedUser]> = try await api.request(
                endpoint: "/users/search",
                method: "GET",
                body: nil,
                queryItems: queryItems
            )
            let currentUserId = currentUserIdProvider()
            searchResults = response.data.filter { $0.id != currentUserId }
            isSearching = false
            searchFailed = false
        } catch {
            searchResults = []
            isSearching = false
            searchFailed = true
            // `query` is free-text the user typed to look up a contact (name,
            // email fragment, phone number…) — logged `.private` so it isn't
            // persisted in cleartext by the unified logging system (fix
            // 2026-07-21; matches the existing `.private` convention for
            // user-entered PII, e.g. `MagicLinkView`'s email log).
            Logger.network.warning("[NewConversationViewModel] user search failed for query=\(query, privacy: .private): \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Create

    /// Issues `POST /conversations`. On success, exposes the resulting
    /// `MeeshyConversation` via `createdConversation` so the view can
    /// dismiss + navigate via NotificationCenter. On failure, surfaces a
    /// user-readable error message (no `try?` masking the underlying
    /// network failure, per the audit's gestion-d-erreur findings).
    ///
    /// Deliberately NOT routed through the `.createConversation` outbox kind
    /// (`OutboxDispatcher.dispatchCreateConversation`) despite that kind
    /// existing and never being enqueued anywhere (audit 2026-07-20,
    /// "OutboxKinds morts"): the outbox is fire-and-forget/eventually
    /// consistent — its dispatcher discards the POST response body — while
    /// this call site needs the created `MeeshyConversation` SYNCHRONOUSLY
    /// to navigate the user into it. Reconciling/removing the dead kind
    /// belongs to whichever lane owns `OutboxDispatcher.swift` /
    /// `OutboxRecord.swift` (settings-profile / offline-instant in the
    /// audit backlog) — out of scope here to avoid touching those files.
    func createConversation(
        selectedUsers: [SearchedUser],
        groupTitle: String
    ) async {
        guard !selectedUsers.isEmpty else { return }
        isCreating = true
        errorMessage = nil

        let isGroup = selectedUsers.count > 1
        let body = CreateConversationBody(
            type: isGroup ? "group" : "direct",
            title: isGroup ? groupTitle.trimmingCharacters(in: .whitespaces) : nil,
            participantIds: selectedUsers.map(\.id)
        )

        do {
            let response: APIResponse<APIConversation> = try await api.post(
                endpoint: "/conversations",
                body: body
            )
            let userId = currentUserIdProvider() ?? ""
            createdConversation = response.data.toConversation(currentUserId: userId)
            isCreating = false
        } catch {
            isCreating = false
            if error.isUserBlockedError {
                errorMessage = String(
                    localized: "new_conversation.error.blocked",
                    defaultValue: "Vous ne pouvez pas démarrer de conversation avec cet utilisateur.",
                    bundle: .main
                )
            } else {
                errorMessage = String(
                    localized: "Impossible de creer la conversation",
                    defaultValue: "Impossible de cr\u{00E9}er la conversation"
                )
            }
        }
    }

    /// Acknowledge the navigation hand-off so a second consumer (e.g. a
    /// re-rendered view) doesn't navigate twice.
    func consumeCreatedConversation() {
        createdConversation = nil
    }

    /// Clears the latest error so the view's alert can dismiss without the
    /// view mutating `@Published` state directly. Calling this from the
    /// alert's `isPresented` binding keeps the encapsulation contract:
    /// only the ViewModel writes its own state.
    func dismissError() {
        errorMessage = nil
    }

    /// Used by the view's search field clear button so the view does not
    /// have to write into `searchResults` directly (which would defeat the
    /// MVVM encapsulation we are extracting in P4.1).
    func clearSearch() {
        searchTask?.cancel()
        searchTask = nil
        searchResults = []
        isSearching = false
        searchFailed = false
    }

    // MARK: - Body

    private struct CreateConversationBody: Encodable {
        let type: String
        let title: String?
        let participantIds: [String]
    }
}
