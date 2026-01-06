//
//  FirstLaunchManager.swift
//  Meeshy
//
//  Manages first launch detection and walkthrough state
//

import Foundation

/// Manages first launch detection and onboarding/walkthrough state
/// Uses UserDefaults for persistence
final class FirstLaunchManager {

    // MARK: - Singleton

    static let shared = FirstLaunchManager()

    // MARK: - Keys

    private enum Keys {
        static let hasLaunchedBefore = "com.meeshy.hasLaunchedBefore"
        static let hasCompletedWalkthrough = "com.meeshy.hasCompletedWalkthrough"
        static let hasCompletedOnboarding = "hasCompletedOnboarding" // Legacy key for compatibility
        static let lastLaunchVersion = "com.meeshy.lastLaunchVersion"
        static let installDate = "com.meeshy.installDate"
    }

    // MARK: - Properties

    private let defaults = UserDefaults.standard

    /// True if this is the very first launch of the app
    var isFirstLaunch: Bool {
        !defaults.bool(forKey: Keys.hasLaunchedBefore)
    }

    /// True if user has completed the walkthrough
    var hasCompletedWalkthrough: Bool {
        // Check both new and legacy keys for compatibility
        defaults.bool(forKey: Keys.hasCompletedWalkthrough) ||
        defaults.bool(forKey: Keys.hasCompletedOnboarding)
    }

    /// True if walkthrough should be shown
    /// Shows if first launch OR user hasn't completed walkthrough
    var shouldShowWalkthrough: Bool {
        isFirstLaunch || !hasCompletedWalkthrough
    }

    /// The app version when last launched
    var lastLaunchVersion: String? {
        defaults.string(forKey: Keys.lastLaunchVersion)
    }

    /// The current app version
    var currentVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }

    /// True if app was updated since last launch
    var isAppUpdate: Bool {
        guard let lastVersion = lastLaunchVersion else { return false }
        return lastVersion != currentVersion
    }

    /// Date when app was first installed
    var installDate: Date? {
        defaults.object(forKey: Keys.installDate) as? Date
    }

    // MARK: - Initialization

    private init() {
        // Record install date on first launch
        if isFirstLaunch && installDate == nil {
            defaults.set(Date(), forKey: Keys.installDate)
        }
    }

    // MARK: - State Management

    /// Mark that the app has been launched (call after splash completes)
    func markAsLaunched() {
        defaults.set(true, forKey: Keys.hasLaunchedBefore)
        defaults.set(currentVersion, forKey: Keys.lastLaunchVersion)
    }

    /// Mark walkthrough as complete
    func markWalkthroughComplete() {
        defaults.set(true, forKey: Keys.hasCompletedWalkthrough)
        defaults.set(true, forKey: Keys.hasCompletedOnboarding) // Legacy support
        markAsLaunched()
    }

    /// Reset first launch state (for testing)
    func resetFirstLaunchState() {
        defaults.removeObject(forKey: Keys.hasLaunchedBefore)
        defaults.removeObject(forKey: Keys.hasCompletedWalkthrough)
        defaults.removeObject(forKey: Keys.hasCompletedOnboarding)
        defaults.removeObject(forKey: Keys.lastLaunchVersion)
    }

    /// Check if we should show "What's New" for an update
    func shouldShowWhatsNew() -> Bool {
        guard isAppUpdate else { return false }

        // Only show What's New for major or minor version changes
        guard let lastVersion = lastLaunchVersion else { return false }

        let lastComponents = lastVersion.split(separator: ".").compactMap { Int($0) }
        let currentComponents = currentVersion.split(separator: ".").compactMap { Int($0) }

        guard lastComponents.count >= 2, currentComponents.count >= 2 else { return false }

        // Show if major or minor version changed
        return lastComponents[0] != currentComponents[0] || // Major version
               lastComponents[1] != currentComponents[1]    // Minor version
    }

    /// Mark What's New as viewed
    func markWhatsNewViewed() {
        defaults.set(currentVersion, forKey: Keys.lastLaunchVersion)
    }
}
