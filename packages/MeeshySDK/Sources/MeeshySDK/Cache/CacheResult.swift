import Foundation

public enum CacheResult<T: Sendable>: Sendable {
    case fresh(T, age: TimeInterval)
    case stale(T, age: TimeInterval)
    case expired
    case empty

    /// Returns the cached value for `.fresh` / `.stale` cases, `nil` for `.expired` / `.empty`.
    ///
    /// - Warning: Calling this in UI flows collapses the freshness signal and
    ///   defeats Stale-While-Revalidate. UI / ViewModel code must `switch` on
    ///   each case explicitly so `.stale` triggers a silent background refresh.
    ///   Use `snapshot()` only for internal cache aggregation / sync engine reads
    ///   where the caller genuinely just needs "whatever is cached right now."
    @available(*, deprecated, message: "UI code: switch on .fresh/.stale/.expired/.empty. Internal cache/sync code: use snapshot() instead.")
    public var value: T? { snapshot() }

    /// Internal-use convenience for cache aggregation and sync-engine reads
    /// where the caller wants the underlying value regardless of freshness.
    ///
    /// Returns the cached payload for `.fresh` and `.stale`; returns `nil` for
    /// `.expired` and `.empty`. Equivalent to the legacy `.value` accessor,
    /// kept under a clearer name so audit tooling (SwiftLint) can ban `.value`
    /// in UI code while permitting explicit snapshot reads in sync/cache code.
    public func snapshot() -> T? {
        switch self {
        case .fresh(let v, _), .stale(let v, _): return v
        case .expired, .empty: return nil
        }
    }
}
