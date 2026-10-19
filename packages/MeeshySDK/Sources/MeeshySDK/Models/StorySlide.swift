import CoreGraphics
import Foundation

// MARK: - Story Slide

public struct StorySlide: Identifiable, Codable, Sendable {
    public var id: String
    public var mediaURL: String?
    public var mediaData: Data?
    public var content: String?
    public var effects: StoryEffects
    public var duration: TimeInterval
    public var order: Int

    /// Pastilles de lieu posées sur cette slide. Hors timeline (pas de
    /// `startTime`/`duration`) : toujours visibles tant que la slide l'est.
    ///
    /// Simple accès ergonomique : le STOCKAGE est `effects.locationObjects`,
    /// parce que `StoryEffects` est la seule unité que le dépôt persiste
    /// (`StoryDraftStore` n'écrit que `effects_json`) et envoie au serveur
    /// (`PostService.createStory(content:storyEffects:)`). Un champ propre au
    /// `StorySlide` disparaissait à chaque enregistrement de brouillon, à la
    /// publication, et dans les cinq sites qui reconstruisent un slide depuis
    /// ses seuls `storyEffects` (édition, repost, `StoryItem.asSlide`, chargement
    /// de brouillon, cover receveur).
    public var locationObjects: [StoryLocationObject] {
        get { effects.locationObjects }
        set { effects.locationObjects = newValue }
    }

    public init(id: String = UUID().uuidString, mediaURL: String? = nil, mediaData: Data? = nil,
                content: String? = nil, effects: StoryEffects = StoryEffects(),
                duration: TimeInterval = 6, order: Int = 0) {
        self.id = id; self.mediaURL = mediaURL; self.mediaData = mediaData
        self.content = content; self.effects = effects
        self.duration = duration; self.order = order
    }

    enum CodingKeys: String, CodingKey {
        case id, mediaURL, content, effects, duration, order
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        mediaURL = try container.decodeIfPresent(String.self, forKey: .mediaURL)
        mediaData = nil
        content = try container.decodeIfPresent(String.self, forKey: .content)
        effects = try container.decodeIfPresent(StoryEffects.self, forKey: .effects) ?? StoryEffects()
        duration = try container.decodeIfPresent(TimeInterval.self, forKey: .duration) ?? 6
        order = try container.decodeIfPresent(Int.self, forKey: .order) ?? 0
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encodeIfPresent(mediaURL, forKey: .mediaURL)
        try container.encodeIfPresent(content, forKey: .content)
        try container.encode(effects, forKey: .effects)
        try container.encode(duration, forKey: .duration)
        try container.encode(order, forKey: .order)
    }
}
