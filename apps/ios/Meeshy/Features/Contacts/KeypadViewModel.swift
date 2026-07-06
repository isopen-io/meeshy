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

    /// Shortest numeric input that triggers a phone lookup. Below this we stay
    /// idle rather than pinging `getProfileByPhone` for every leading digit.
    private static let minPhoneDigits = 3
    /// Shortest text input that triggers a name search.
    private static let minNameLength = 2

    /// `true` when the trimmed input is composed solely of phone characters
    /// (digits, `+`, and common separators). Decides phone-exact lookup vs.
    /// name search.
    var isPhoneNumber: Bool {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        let allowed = CharacterSet(charactersIn: "0123456789+ -().")
        return trimmed.unicodeScalars.allSatisfy { allowed.contains($0) }
    }

    private var digitCount: Int {
        input.unicodeScalars.filter { CharacterSet.decimalDigits.contains($0) }.count
    }

    // MARK: - Search

    /// Debounced entry point the view calls on every input change. Cancels any
    /// in-flight search so only the latest keystroke runs.
    func scheduleSearch() {
        searchTask?.cancel()
        searchTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(0.3))
            guard !Task.isCancelled else { return }
            await self?.search()
        }
    }

    /// Resolves the current input. Tested directly (the view goes through
    /// `scheduleSearch()` for debouncing). `.loading` is set only when a network
    /// call actually fires — short inputs stay `.idle`.
    func search() async {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            matches = []
            loadState = .idle
            return
        }
        if isPhoneNumber {
            guard digitCount >= Self.minPhoneDigits else {
                matches = []
                loadState = .idle
                return
            }
            loadState = .loading
            await lookupByPhone(trimmed)
        } else {
            guard trimmed.count >= Self.minNameLength else {
                matches = []
                loadState = .idle
                return
            }
            loadState = .loading
            await searchByName(trimmed)
        }
    }

    private func lookupByPhone(_ phone: String) async {
        // A thrown error (typically 404) simply means "no Meeshy user owns this
        // number" — a normal, expected outcome of dialing, not an error state.
        let user = try? await userService.getProfileByPhone(phone)
        // Drop results from a superseded query: the input may have changed (new
        // keystroke) or been cleared while this lookup was in flight.
        guard isCurrent(phone) else { return }
        matches = user.map { [Self.result(from: $0)] } ?? []
        loadState = .loaded
    }

    private func searchByName(_ query: String) async {
        do {
            let results = try await userService.searchUsers(query: query, limit: 20, offset: 0)
            guard isCurrent(query) else { return }
            matches = results
            loadState = .loaded
        } catch {
            guard isCurrent(query) else { return }
            matches = []
            loadState = .error(error.localizedDescription)
        }
    }

    /// `true` when `query` still matches the live input — i.e. no newer
    /// keystroke (or `clear()`) has superseded the search that produced it.
    /// Guards against debounce races and out-of-order network completion.
    private func isCurrent(_ query: String) -> Bool {
        input.trimmingCharacters(in: .whitespacesAndNewlines) == query
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
