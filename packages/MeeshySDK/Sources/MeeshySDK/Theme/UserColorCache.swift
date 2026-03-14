import Foundation

public actor UserColorCache {
    public static let shared = UserColorCache()

    private static let brandIndigo = "6366F1"
    private static let accentWeight: Double = 0.30
    private static let indigoWeight: Double = 0.70

    private var blendedColors: [String: String] = [:]
    private var userColors: [String: String] = [:]
    private var hitCount: Int = 0
    private var missCount: Int = 0

    public init() {}

    /// Returns hex string of blended color (conversation accent 30% + brand Indigo 70%).
    public func blendedColor(for conversationAccent: String) -> String {
        let key = conversationAccent.uppercased()
        if let cached = blendedColors[key] {
            hitCount += 1
            return cached
        }
        missCount += 1
        let result = DynamicColorGenerator.blendTwo(
            key, weight1: Self.accentWeight,
            Self.brandIndigo, weight2: Self.indigoWeight
        )
        blendedColors[key] = result
        return result
    }

    /// Returns hex string for a user's name-based color. Cached per name.
    public func colorForUser(name: String) -> String {
        if let cached = userColors[name] {
            hitCount += 1
            return cached
        }
        missCount += 1
        let result = DynamicColorGenerator.colorForName(name)
        userColors[name] = result
        return result
    }

    /// Clear all cached values (called on logout).
    public func invalidateAll() {
        blendedColors.removeAll()
        userColors.removeAll()
        hitCount = 0
        missCount = 0
    }

    /// Cache statistics for debugging/testing.
    public func stats() -> (hits: Int, misses: Int) {
        (hits: hitCount, misses: missCount)
    }
}
