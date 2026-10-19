import CoreGraphics
import Foundation

// MARK: - Story Keyframe (Timeline V2)

/// Single keyframe for animating an object's position / scale / opacity over time.
/// `time` is the offset (seconds) relative to the owning object's `startTime`.
/// All transform fields are optional — only non-nil fields are interpolated.
///
/// Note de déviation par rapport au spec §2.1 : `time` est `var` (mutable) et non
/// `let`, car `MoveKeyframeCommand` (Task 19) doit pouvoir muter ce champ pour
/// l'undo/redo. `id` reste `let`. Aucune propagation visible côté consumer car
/// `StoryKeyframe` reste un value type (les copies sont indépendantes).
public struct StoryKeyframe: Codable, Identifiable, Sendable {
    public let id: String
    public var time: Float
    public var x: CGFloat?
    public var y: CGFloat?
    public var scale: CGFloat?
    public var opacity: CGFloat?
    /// Volume du clip à cet instant, dans `0...StoryVolume.maxGain`.
    ///
    /// 5ᵉ canal optionnel : un point « volume seul » laisse les quatre autres
    /// à `nil` et l'interpolation les ignore alors, exactement comme un point
    /// de position ignore le volume.
    public var volume: Float?
    public var easing: StoryEasing?

    public init(id: String = UUID().uuidString,
                time: Float,
                x: CGFloat? = nil,
                y: CGFloat? = nil,
                scale: CGFloat? = nil,
                opacity: CGFloat? = nil,
                volume: Float? = nil,
                easing: StoryEasing? = nil) {
        self.id = id
        self.time = time
        self.x = x
        self.y = y
        self.scale = scale
        self.opacity = opacity
        self.volume = volume
        self.easing = easing
    }

    enum CodingKeys: String, CodingKey {
        case id, time, x, y, scale, opacity, volume, easing
    }

    /// Un keyframe écrit par le convertisseur gateway (TS `Keyframe`) ne porte
    /// pas d'`id` — fixture gelée `v1-legacy-full.json`. On en génère un
    /// plutôt que de jeter tout l'objet porteur au décodage lossy.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        time = try c.decode(Float.self, forKey: .time)
        x = try c.decodeIfPresent(CGFloat.self, forKey: .x)
        y = try c.decodeIfPresent(CGFloat.self, forKey: .y)
        scale = try c.decodeIfPresent(CGFloat.self, forKey: .scale)
        opacity = try c.decodeIfPresent(CGFloat.self, forKey: .opacity)
        volume = try c.decodeIfPresent(Float.self, forKey: .volume)
        easing = try c.decodeIfPresent(StoryEasing.self, forKey: .easing)
    }
}
