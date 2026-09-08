import Foundation

// MARK: - Catalogue d'engagement — MIROIR de packages/shared/types/engagement.ts
//
// Les axes, les paliers et les succès des streaks & badges (#3695,
// docs/product/streaks-badges-modele.md § 6, § 7, § 8). La source de vérité
// est le catalogue TypeScript, importé par la passerelle (producteur) ; ce
// fichier en est la projection Swift, GARDÉE par
// `packages/shared/__tests__/engagement-catalog-mirror-parity.test.ts`, qui
// lit ces littéraux et rougit dès qu'un axe, un palier ou un succès diverge.
// Ne rien y ajouter que le TS ne porte déjà ; ne rien y retirer que le TS
// porte encore.

/// Un axe d'engagement — la clé stable que `EngagementCounter.axisKey` porte.
public enum EngagementAxisKey: String, CaseIterable, Codable, Sendable, Hashable {
    case audioMessage = "content.audio_message"
    case textMessage = "content.text_message"
    case post = "content.post"
    case story = "content.story"
    case reel = "content.reel"
    case audioComment = "comment.audio"
    case textComment = "comment.text"
    case privateConversation = "conversation.private"
    case publicConversation = "conversation.public"
    case communityConversation = "conversation.community"
    case sticker = "tool.sticker"
    case inAppEdit = "tool.in_app_edit"
    case directPublish = "tool.direct_publish"

    /// La famille EST le préfixe de la clé (`engagementAxisFamily`, TS) —
    /// aucune table à tenir en miroir.
    public var family: EngagementAxisFamily {
        let prefix = rawValue.split(separator: ".", maxSplits: 1).first.map(String.init) ?? ""
        return EngagementAxisFamily(rawValue: prefix) ?? .content
    }
}

/// La section du tableau de bord (§ 2) — l'ordre des cas est l'ordre d'affichage.
public enum EngagementAxisFamily: String, CaseIterable, Codable, Sendable, Hashable {
    case content
    case comment
    case conversation
    case tool
}

/// Les quatre natures de palier gravées dans `EngagementMilestone.milestoneType`.
public enum EngagementMilestoneType: String, CaseIterable, Codable, Sendable, Hashable {
    case badge
    case streak
    case level
    case achievement
}

/// Les succès composés (§ 8) — la clé EST la `milestoneKey`, sans transformation.
public enum EngagementAchievementKey: String, CaseIterable, Codable, Sendable, Hashable {
    case firstContent = "achievement.first_content"
    case allContentTypes = "achievement.all_content_types"
    case firstVoice = "achievement.first_voice"
    case editor = "achievement.editor"
    case threeConversationKinds = "achievement.three_conversation_kinds"
}

/// Les paliers — socle initial, tunable (§ 7), et les clés de palier telles
/// que `EngagementService` les grave (§ 4).
public enum EngagementCatalog {
    public static let badgeThresholds: [Int] = [1, 10, 50, 100, 500]
    public static let streakThresholds: [Int] = [3, 7, 14, 30, 60, 100]
    public static let levelThresholds: [Int] = [10, 50, 150, 400, 1000, 2500]

    public static func badgeMilestoneKey(_ axis: EngagementAxisKey, threshold: Int) -> String {
        "\(axis.rawValue):\(threshold)"
    }

    public static func streakMilestoneKey(threshold: Int) -> String {
        "streak:\(threshold)"
    }

    public static func levelMilestoneKey(threshold: Int) -> String {
        "level:\(threshold)"
    }
}
