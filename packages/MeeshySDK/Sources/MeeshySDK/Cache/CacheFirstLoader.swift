import Foundation
import os

// MARK: - CacheFirstLoader

/// Generic helper that implements the cache-first / stale-while-revalidate
/// pattern from the architecture bible. Wraps a `MutableCacheStore` and a
/// fetch closure so each call site can express the contract once and let
/// the helper coordinate the state transitions and persistence.
///
/// The loader:
/// 1. Reads the cache for `key` and dispatches based on `CacheResult`.
/// 2. `.fresh`: applies items immediately, sets `LoadState.cachedFresh`,
///    returns `nil` (no revalidation needed).
/// 3. `.stale`: applies cached items immediately, sets `.cachedStale`, then
///    returns a detached revalidation `Task` so callers can store and
///    cancel it on view teardown to avoid orphan work. On success the
///    fresh items are applied + saved to cache and the state moves to
///    `.loaded`. On failure the stale items remain visible (no rollback).
/// 4. `.expired` / `.empty`: sets `.loading`, awaits the fetch, applies
///    the result and sets `.loaded`, or surfaces `.offline` / `.error`.
///
/// All state mutations happen on `@MainActor` so call sites can wire the
/// closures directly to `@Published` properties without trampolines.
///
/// The helper is intentionally a `final class` rather than an actor: the
/// store, key and network monitor are all immutable, so we don't need
/// actor isolation, and avoiding it sidesteps the Swift 6 sending/Sendable
/// crossings when callers want to launch a background revalidation task
/// that captures these dependencies.
public final class CacheFirstLoader<Store: MutableCacheStore>: @unchecked Sendable {
    public typealias Items = [Store.Value]

    private let store: Store
    private let key: Store.Key
    private let networkMonitor: any NetworkMonitorProviding

    public init(
        store: Store,
        key: Store.Key,
        networkMonitor: any NetworkMonitorProviding = NetworkMonitor.shared
    ) {
        self.store = store
        self.key = key
        self.networkMonitor = networkMonitor
    }

    /// Cache-first load. Returns the in-flight revalidation `Task` for the
    /// `.stale` branch (so the caller can cancel it), `nil` otherwise.
    @discardableResult
    public func load(
        fetch: @Sendable @escaping () async throws -> Items,
        setLoadState: @MainActor @Sendable @escaping (LoadState) -> Void,
        apply: @MainActor @Sendable @escaping (Items) -> Void
    ) async -> Task<Void, Never>? {
        let result = await store.load(for: key)
        switch result {
        case .fresh(let cached, _):
            await MainActor.run {
                apply(cached)
                setLoadState(.cachedFresh)
            }
            return nil

        case .stale(let cached, _):
            await MainActor.run {
                apply(cached)
                setLoadState(.cachedStale)
            }
            let store = self.store
            let key = self.key
            let monitor = self.networkMonitor
            let keyDescription = String(describing: key)
            return Task {
                guard !Task.isCancelled else { return }
                do {
                    let fresh = try await fetch()
                    guard !Task.isCancelled else { return }
                    await MainActor.run {
                        apply(fresh)
                        setLoadState(.loaded)
                    }
                    await store.save(fresh, for: key)
                } catch {
                    Logger.cache.warning(
                        "CacheFirstLoader silent revalidate failed for \(keyDescription, privacy: .public): \(error.localizedDescription, privacy: .public)"
                    )
                    if !monitor.isOnline {
                        await MainActor.run { setLoadState(.offline) }
                    }
                }
            }

        case .expired, .empty:
            await MainActor.run { setLoadState(.loading) }
            do {
                let data = try await fetch()
                await MainActor.run {
                    apply(data)
                    setLoadState(.loaded)
                }
                await store.save(data, for: key)
            } catch {
                let isOnline = networkMonitor.isOnline
                await MainActor.run {
                    setLoadState(isOnline ? .error(error.localizedDescription) : .offline)
                }
            }
            return nil
        }
    }
}
