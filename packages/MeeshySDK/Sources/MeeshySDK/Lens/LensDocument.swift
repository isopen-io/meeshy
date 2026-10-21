// GÉNÉRÉ — ne pas éditer; source: packages/shared/types/lens-format.ts
// Régénérer : `cd packages/shared && bun run generate:lens-format`.
// Fraîcheur gardée par packages/shared/__tests__/lens-format-swift.test.ts ;
// comportement gardé par packages/shared/fixtures/lens-v1/vectors.json (vitest ET Swift).

import Foundation

public struct LensCredits: Sendable, Equatable {
    public let author: String
    public let createdAt: String
    public let updatedAt: String?
}

public struct LensWindow: Sendable, Equatable {
    public let startsAt: String
    public let endsAt: String
    public let countries: [String]?
    public let communities: [String]?
}

public struct LensFallbackTier: Sendable, Equatable {
    public let hide: [String]
}

public struct LensFallbacks: Sendable, Equatable {
    public let reduced: LensFallbackTier?
    public let minimal: LensFallbackTier?
}

/// Où se pose une couche : un point de l'écran (fractions) ou un point nommé du visage, décalé en largeurs de visage.
public enum LensAnchor: Sendable, Equatable {
    case screen(x: Double, y: Double)
    case face(point: LensFacePoint, dx: Double?, dy: Double?)
}

public struct LensLutLayer: Sendable, Equatable {
    public let id: String
    public let asset: String
    public let intensity: Double?
}

public struct LensFrameLayer: Sendable, Equatable {
    public let id: String
    public let motif: String
    public let opacity: Double?
}

public struct LensStickerLayer: Sendable, Equatable {
    public let id: String
    public let asset: String
    public let anchor: LensAnchor
    public let size: Double
    public let rotation: Double?
}

public struct LensTextLayer: Sendable, Equatable {
    public let id: String
    /// Le texte par langue du Prisme ; fr est toujours présent.
    public let text: [String: String]
    public let font: LensFont
    public let color: String
    public let size: Double
    public let anchor: LensAnchor
}

public struct LensParticlesLayer: Sendable, Equatable {
    public let id: String
    public let preset: LensParticlePreset
    public let density: LensDensity
    public let anchor: LensAnchor?
}

public enum LensLayer: Sendable, Equatable {
    case lut(LensLutLayer)
    case frame(LensFrameLayer)
    case sticker(LensStickerLayer)
    case text(LensTextLayer)
    case particles(LensParticlesLayer)

    public var id: String {
        switch self {
        case let .lut(layer): return layer.id
        case let .frame(layer): return layer.id
        case let .sticker(layer): return layer.id
        case let .text(layer): return layer.id
        case let .particles(layer): return layer.id
        }
    }
}

public struct LensTrigger: Sendable, Equatable {
    public let on: LensTriggerEvent
    public let action: LensTriggerAction
    public let target: String
    public let delay: Double?
}

public struct LensDocument: Sendable, Equatable {
    public let id: String
    public let name: String
    /// Le nom dans les langues où il est traduit (le français est name).
    public let names: [String: String]
    public let credits: LensCredits
    public let surfaces: [LensSurface]
    public let cost: LensCost
    public let window: LensWindow
    public let layers: [LensLayer]
    public let triggers: [LensTrigger]
    public let fallbacks: LensFallbacks?
}

public enum LensParseOutcome: Sendable, Equatable {
    /// La lens lue, avec le nombre de couches et de déclencheurs que ce client a ignorés.
    case ok(LensDocument, ignoredLayers: Int, ignoredTriggers: Int)
    /// Le schéma du document est plus récent que celui que ce client connaît : inviter à mettre à jour.
    case updateRequired(schema: Int)
    /// Shader, script, URL, réseau ou 3D : refusé en bloc. Les raisons sont triées.
    case forbidden(reasons: [String])
    case invalid
}
