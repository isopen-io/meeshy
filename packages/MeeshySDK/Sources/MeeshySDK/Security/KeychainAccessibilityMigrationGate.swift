import Foundation

/// Ne rejoue une migration que tant qu'aucune passe COMPLÈTE n'a eu lieu (#11558).
struct KeychainAccessibilityMigrationGate {
    static let completedKey = "meeshy.keychain.afterFirstUnlock.migrated.v1"

    let defaults: UserDefaults

    /// `migrate` rend `true` quand sa passe est complète.
    func runOnce(_ migrate: () -> Bool) {
        guard !defaults.bool(forKey: Self.completedKey) else { return }
        if migrate() { defaults.set(true, forKey: Self.completedKey) }
    }
}
