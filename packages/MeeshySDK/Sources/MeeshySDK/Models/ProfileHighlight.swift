import Foundation

/// **Un album « À la une »** d'une personne (#19394) : des stories qu'elle a mises en avant, sous un titre et un glyphe.
/// La passerelle ne le sert pas encore : tant qu'aucun album n'arrive, la fiche n'a pas de rail « À la une ».
public struct ProfileHighlight: Identifiable, Equatable, Sendable, Decodable {
    public let id: String
    public let title: String
    public let glyph: String?
    public let coverUrl: String?
    public let storyIds: [String]

    public init(id: String, title: String, glyph: String? = nil, coverUrl: String? = nil, storyIds: [String]) {
        self.id = id
        self.title = title
        self.glyph = glyph
        self.coverUrl = coverUrl
        self.storyIds = storyIds
    }

    private enum CodingKeys: String, CodingKey {
        case id, title, glyph, coverUrl, storyIds
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
        glyph = try container.decodeIfPresent(String.self, forKey: .glyph)
        coverUrl = try container.decodeIfPresent(String.self, forKey: .coverUrl)
        storyIds = try container.decodeIfPresent([String].self, forKey: .storyIds) ?? []
    }

    /// Ce que le rail montre : un album sans story ou sans titre ne se montre pas ; rien de servi ⇒ aucun album.
    public static func shown(_ highlights: [ProfileHighlight]?) -> [ProfileHighlight] {
        (highlights ?? []).filter {
            !$0.storyIds.isEmpty && !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }
}
