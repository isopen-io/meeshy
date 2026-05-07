import Foundation

public protocol RemoteFeatureFlagProviding: Sendable {
    nonisolated func bool(forKey: String) -> Bool
}

public struct NullRemoteFeatureFlagProvider: RemoteFeatureFlagProviding {
    public nonisolated init() {}
    public nonisolated func bool(forKey: String) -> Bool { false }
}

/// Feature flag controlling which timeline UI variant is shown.
///
/// Priority: UserDefaults local override → remote config → false (off by default).
/// Thread-safe: `UserDefaults` is internally synchronized; `@unchecked Sendable` reflects this.
public struct StoryTimelineFeatureFlag: @unchecked Sendable {

    public nonisolated static let userDefaultsKey = "story_timeline_v2"
    public nonisolated static let remoteKey = "story_timeline_v2_rollout"

    // `nonisolated(unsafe)` because UserDefaults is not Sendable but IS thread-safe.
    private nonisolated(unsafe) let defaults: UserDefaults
    private let remote: RemoteFeatureFlagProviding

    public nonisolated init(
        defaults: UserDefaults = .standard,
        remote: RemoteFeatureFlagProviding = NullRemoteFeatureFlagProvider()
    ) {
        self.defaults = defaults
        self.remote = remote
    }

    public nonisolated var isV2Enabled: Bool {
        if let local = defaults.object(forKey: Self.userDefaultsKey) as? Bool {
            return local
        }
        return remote.bool(forKey: Self.remoteKey)
    }

    public nonisolated static let shared = StoryTimelineFeatureFlag()
}
