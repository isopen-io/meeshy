//
//  FeatureFlags.swift
//  Meeshy
//
//  Feature flags for gradual rollout and A/B testing
//

import Foundation

@propertyWrapper
struct FeatureFlag {
    let key: String
    let defaultValue: Bool

    var wrappedValue: Bool {
        UserDefaults.standard.object(forKey: key) as? Bool ?? defaultValue
    }
}

struct FeatureFlags {
    // MARK: - Singleton

    static let shared = FeatureFlags()

    // MARK: - Features

    @FeatureFlag(key: "feature.calls.enabled", defaultValue: true)
    var callsEnabled: Bool

    @FeatureFlag(key: "feature.translation.offline", defaultValue: true)
    var offlineTranslationEnabled: Bool

    @FeatureFlag(key: "feature.translation.realtime", defaultValue: true)
    var realtimeTranslationEnabled: Bool

    @FeatureFlag(key: "feature.media.compression", defaultValue: true)
    var mediaCompressionEnabled: Bool

    @FeatureFlag(key: "feature.swiftdata.enabled", defaultValue: false)
    var swiftDataEnabled: Bool // iOS 17+ only

    @FeatureFlag(key: "feature.livemessages.enabled", defaultValue: false)
    var liveMessagesEnabled: Bool // iOS 17+ only

    // MARK: - Methods

    func setFeature(_ key: String, enabled: Bool) {
        UserDefaults.standard.set(enabled, forKey: key)
    }

    func resetToDefaults() {
        let domain = Bundle.main.bundleIdentifier!
        UserDefaults.standard.removePersistentDomain(forName: domain)
    }
}
