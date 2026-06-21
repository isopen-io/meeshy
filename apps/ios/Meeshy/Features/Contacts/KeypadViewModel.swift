import Foundation
import MeeshySDK

/// Drives the People hub's **Keypad** tab.
///
/// A single input field doubles as a dial pad and a name search box. The
/// classification is automatic and friction-free:
/// - input made only of phone characters (`+`, digits, separators) →
///   exact lookup via `GET /users/phone/:phone` (`getProfileByPhone`).
/// - any other input → username / name search via `GET /users/search`
///   (`searchUsers`).
///
/// Both endpoints already exist — the keypad reuses them, it does not add new
/// API surface.
@MainActor
final class KeypadViewModel: ObservableObject {

    // MARK: - Published State

    @Published var input: String = ""
    @Published private(set) var matches: [UserSearchResult] = []
    @Published private(set) var loadState: LoadState = .idle

    // MARK: - Dependencies

    private let userService: UserServiceProviding

    // MARK: - Private

    private var searchTask: Task<Void, Never>?

    // MARK: - Init

    init(userService: UserServiceProviding = UserService.shared) {
        self.userService = userService
    }

    deinit {
        searchTask?.cancel()
    }

    // MARK: - Input Editing

    func append(_ key: String) {
        input.append(key)
    }

    func deleteLast() {
        guard !input.isEmpty else { return }
        input.removeLast()
    }

    func clear() {
        searchTask?.cancel()
        input = ""
        matches = []
        loadState = .idle
    }

    // MARK: - Classification

    /// `true` when the trimmed input is composed solely of phone characters
    /// (digits, `+`, and common separators). Decides phone-exact lookup vs.
    /// name search.
    var isPhoneNumber: Bool {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        let allowed = CharacterSet(charactersIn: "0123456789+ -().")
        return trimmed.unicodeScalars.allSatisfy { allowed.contains($0) }
    }

    // MARK: - Search

    /// Debounced entry point the view calls on every input change. Cancels any
    /// in-flight search so only the latest keystroke runs.
    func scheduleSearch() {
        searchTask?.cancel()
        searchTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            await self?.search()
        }
    }

    /// Resolves the current input. Tested directly (the view goes through
    /// `scheduleSearch()` for debouncing).
    func search() async {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            matches = []
            loadState = .idle
            return
        }
        loadState = .loading
        if isPhoneNumber {
            await lookupByPhone(trimmed)
        } else {
            await searchByName(trimmed)
        }
    }

    private func lookupByPhone(_ phone: String) async {
        do {
            let user = try await userService.getProfileByPhone(phone)
            matches = [Self.result(from: user)]
            loadState = .loaded
        } catch {
            // A 404 here simply means "no Meeshy user owns this number" — a
            // normal, expected outcome of dialing, not an error state.
            matches = []
            loadState = .loaded
        }
    }

    private func searchByName(_ query: String) async {
        guard query.count >= 2 else {
            matches = []
            loadState = .idle
            return
        }
        do {
            matches = try await userService.searchUsers(query: query, limit: 20, offset: 0)
            loadState = .loaded
        } catch {
            matches = []
            loadState = .error(error.localizedDescription)
        }
    }

    private static func result(from user: MeeshyUser) -> UserSearchResult {
        UserSearchResult(
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatar: user.avatar,
            isOnline: user.isOnline
        )
    }
}
