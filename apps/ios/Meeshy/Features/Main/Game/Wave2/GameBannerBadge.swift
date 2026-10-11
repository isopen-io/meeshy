import SwiftUI
import MeeshySDK
import MeeshyUI

struct GameBannerBadgeModel: Equatable {
    let userId: String
    let level: Int
    let tier: LevelTierKey
    let prestige: Int
    let rank: GloryRank
    let division: GloryDivision5?
    let mythic: MythicSeatRef?

    var levelName: String { "" }
    var rankName: String { "" }
    var accessibilityLabel: String { "" }

    static func of(_ content: GameStandingContent?, userId: String) -> GameBannerBadgeModel? { nil }
}
