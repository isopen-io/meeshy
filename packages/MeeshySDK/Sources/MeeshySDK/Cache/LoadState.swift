import Foundation

/// High-level state for screens that load data through the cache-first
/// pipeline. Distinguishes the user-visible cases the View needs to
/// render: a populated list backed by stale cache (silent revalidate
/// in flight), a populated list freshly synced, an explicit cold-start
/// loading phase, an offline fallback, and an error surface.
///
/// `cachedStale` is the workhorse case: the View shows the cached data
/// immediately, the ViewModel kicks off a background refresh, and on
/// success the state transitions to `loaded`. The cap "no spinner when
/// cache has data" from the architecture bible is enforced by
/// preferring `cachedStale`/`cachedFresh` over `loading` whenever the
/// cache returns a non-empty payload.
public enum LoadState: Equatable, Sendable {
    case idle
    case cachedStale
    case cachedFresh
    case loading
    case loaded
    case offline
    case error(String)
}

/// Cursor-pagination state for infinite-scroll surfaces. Mirrors the
/// shape consumers want: idle when ready to fetch the next page,
/// `loadingMore` while a request is in flight (so the View can show a
/// spinner row at the tail), `exhausted` when the backend has signalled
/// `hasMore=false` (so we can hide the spinner permanently), and an
/// error case for transient failures the user can retry.
///
/// Keeping this distinct from `LoadState` is intentional: a list can be
/// `.loaded` (initial fetch complete) AND `.loadingMore` simultaneously,
/// and conflating the two forced earlier code to invent "isLoadingMore"
/// booleans on top of "isLoading" booleans.
public enum PaginationState: Equatable, Sendable {
    case idle
    case loadingMore
    case exhausted
    case error(String)
}

/// Persisted cursor state for an infinite-scroll surface. Stored
/// alongside the cached items in the cache backend so a cold-start
/// can resume scrolling from the deepest position the user reached
/// instead of refetching page 1. `nextCursor` is the opaque pagination
/// handle returned by the gateway (typically the last item's id);
/// `hasMore` distinguishes "ran out of items" from "haven't paged yet".
public struct PaginationCursor: Codable, Sendable, Equatable {
    public let nextCursor: String?
    public let hasMore: Bool

    public init(nextCursor: String?, hasMore: Bool) {
        self.nextCursor = nextCursor
        self.hasMore = hasMore
    }
}
