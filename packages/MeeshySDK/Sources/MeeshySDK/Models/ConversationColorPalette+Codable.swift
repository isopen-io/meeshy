import Foundation
import UIKit

extension ConversationColorPalette: Codable, Hashable {
    enum CodingKeys: String, CodingKey {
        case primary, secondary, accent, saturationBoost
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let primary = try container.decode(String.self, forKey: .primary)
        let secondary = try container.decode(String.self, forKey: .secondary)
        let accent = try container.decode(String.self, forKey: .accent)
        let saturationBoost = try container.decode(Double.self, forKey: .saturationBoost)
        self.init(primary: primary, secondary: secondary, accent: accent, saturationBoost: saturationBoost)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(primary, forKey: .primary)
        try container.encode(secondary, forKey: .secondary)
        try container.encode(accent, forKey: .accent)
        try container.encode(saturationBoost, forKey: .saturationBoost)
    }

    public func hash(into hasher: inout Hasher) {
        hasher.combine(primary)
        hasher.combine(secondary)
        hasher.combine(accent)
        hasher.combine(saturationBoost)
    }

    public static func == (lhs: ConversationColorPalette, rhs: ConversationColorPalette) -> Bool {
        lhs.primary == rhs.primary && lhs.secondary == rhs.secondary
            && lhs.accent == rhs.accent && lhs.saturationBoost == rhs.saturationBoost
    }
}
