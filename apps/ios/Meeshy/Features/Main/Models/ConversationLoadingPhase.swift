import Foundation

/// Mutually-exclusive view of `ConversationViewModel`'s 4 message-loading
/// booleans. Exposed as a derived computed property so views — and
/// future refactors — can switch on a single value instead of weaving
/// `if isLoadingInitial { ... } else if isLoadingOlder { ... }` ladders
/// across the codebase.
///
/// ### Why an enum, not a struct of booleans
/// `isLoadingInitial`, `isLoadingOlder`, `isLoadingNewer`, `isRevalidating`
/// are not actually independent — `loadOlderMessages()` guards against
/// `isLoadingInitial`, `loadInitialMessages()` guards against
/// `isLoadingOlder`, and the revalidation path runs while `.loaded` is
/// already true. Modelling them as a single phase makes those invariants
/// expressible in the type.
///
/// ### Additive migration (M2 of the post-PR #280 follow-up)
/// The underlying `@Published` booleans on the ViewModel stay in place
/// — every existing read / write site keeps working unchanged. The new
/// `paginationPhase` computed property is the canonical projection. A
/// follow-up PR (with an Xcode build loop available) can flip the
/// dependency by switching individual views to read `paginationPhase`,
/// then deleting the booleans once no callers remain.
enum ConversationLoadingPhase: Equatable, Sendable {

    /// No loading is happening. Either the conversation just opened
    /// and is waiting for its initial load to be requested, or the last
    /// load completed and no follow-up was triggered.
    case idle

    /// First page request is in flight. This is the only state where
    /// the chat surface is allowed to show a blocking spinner (no
    /// cached data yet to paint).
    case loadingInitial

    /// Paginating older messages (user scrolled to the top, infinite
    /// scroll). The visible message list MUST stay rendered behind the
    /// loading indicator — never replace it.
    case loadingOlder

    /// Paginating newer messages (user jumped back from an older
    /// position, now catching back up to the latest). Same UI contract
    /// as `.loadingOlder` — keep the list visible.
    case loadingNewer

    /// Background refresh after a `.stale` cache hit. The list is
    /// already painted with cached data and is being silently brought
    /// up to date. The only visible affordance should be subtle (e.g. a
    /// "sparkle" indicator in the header) — never a spinner or skeleton.
    case revalidating

    /// At least one batch has landed and no other load is currently
    /// running. The chat surface is fully interactive.
    case loaded

    /// Convenience for views deciding whether to paint a blocking
    /// spinner. Only `.loadingInitial` qualifies — every other phase
    /// either has data to show or is a background refresh.
    var isBlockingSpinnerNeeded: Bool { self == .loadingInitial }

    /// `true` for the two pagination phases (older / newer). Views that
    /// dim their bottom / top hint chevron during pagination can read
    /// this rather than juggling the two booleans separately.
    var isPaginating: Bool {
        switch self {
        case .loadingOlder, .loadingNewer: return true
        default: return false
        }
    }

    /// Derive the phase from the four legacy `@Published` booleans on
    /// `ConversationViewModel`. Resolution order matters when more than
    /// one boolean is `true` at the same time — that shouldn't normally
    /// happen, but if it does we surface the "louder" state first:
    ///
    /// `loadingInitial > loadingOlder > loadingNewer > revalidating > X`
    ///
    /// where `X` is `loaded` when any data has been observed, otherwise
    /// `idle`.
    static func derive(
        isLoadingInitial: Bool,
        isLoadingOlder: Bool,
        isLoadingNewer: Bool,
        isRevalidating: Bool,
        hasObservedAnyData: Bool
    ) -> ConversationLoadingPhase {
        if isLoadingInitial { return .loadingInitial }
        if isLoadingOlder { return .loadingOlder }
        if isLoadingNewer { return .loadingNewer }
        if isRevalidating { return .revalidating }
        return hasObservedAnyData ? .loaded : .idle
    }
}
