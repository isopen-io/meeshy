import Foundation

// MARK: - Emoji Usage Tracker

struct EmojiUsageTracker {
    private static let key = "com.meeshy.emojiUsageCount"

    static func recordUsage(emoji: String) {
        var counts = getCounts()
        counts[emoji, default: 0] += 1
        UserDefaults.standard.set(counts, forKey: key)
    }

    static func topEmojis(count: Int, defaults: [String]) -> [String] {
        let counts = getCounts()

        // Deterministic total ordering. `Dictionary` has no specified
        // iteration order, so `counts.sorted { $0.value > $1.value }` left
        // equal-score emojis to the dictionary's whim — they reshuffled on
        // every recomputation (i.e. every quick-bar re-render). We sort the
        // keys with an explicit tie-break: usage count desc, then the emoji's
        // canonical rank (its index in `defaults`, unknowns last), then the
        // emoji string itself. The result is identical across calls for a
        // given usage table, so the bar's emoji order stays fixed while the
        // user interacts with the screen.
        let canonicalRank: [String: Int] = Dictionary(
            uniqueKeysWithValues: defaults.enumerated().map { ($0.element, $0.offset) }
        )
        func rank(_ emoji: String) -> Int { canonicalRank[emoji] ?? Int.max }

        let trackedSorted = counts.keys.sorted { lhs, rhs in
            let lhsCount = counts[lhs] ?? 0
            let rhsCount = counts[rhs] ?? 0
            if lhsCount != rhsCount { return lhsCount > rhsCount }
            let lhsRank = rank(lhs)
            let rhsRank = rank(rhs)
            if lhsRank != rhsRank { return lhsRank < rhsRank }
            return lhs < rhs
        }

        var result: [String] = []
        var seen = Set<String>()
        for emoji in trackedSorted where result.count < count {
            if seen.insert(emoji).inserted { result.append(emoji) }
        }
        for emoji in defaults where result.count < count {
            if seen.insert(emoji).inserted { result.append(emoji) }
        }
        return result
    }

    private static func getCounts() -> [String: Int] {
        UserDefaults.standard.dictionary(forKey: key) as? [String: Int] ?? [:]
    }
}
