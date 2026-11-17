import SwiftUI
import MeeshySDK

// MARK: - Story Text Colors

/// `nonisolated` sur le TYPE : la palette est lue par `StoryTextAttributeCycle`,
/// qui est pur. L'isolation par défaut du package (SE-0466) la placerait sinon
/// sur le main actor et la rendrait inatteignable depuis là.
public nonisolated enum StoryTextColors {
    public static let palette: [String] = [
        "FFFFFF", "000000", "FF2E63", "08D9D6", "F8B500",
        "9B59B6", "2ECC71", "FF6B6B", "3498DB", "E91E63",
        "FF7F50", "00CED1", "A855F7", "F59E0B"
    ]
}
