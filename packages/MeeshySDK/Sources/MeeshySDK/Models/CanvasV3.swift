import Foundation

// MARK: - CanvasV3 (spec §C1 — miroir Swift du Zod canvas-v3.ts, fixtures gelées A2)

public struct CanvasV3: Equatable, Codable, Sendable {
    public let v: Int
    public let scenes: [SceneV3]
    public let sound: BackgroundSoundV3?

    public init(v: Int = 3, scenes: [SceneV3], sound: BackgroundSoundV3? = nil) {
        self.v = v
        self.scenes = scenes
        self.sound = sound
    }

    private enum CodingKeys: String, CodingKey {
        case v
        case scenes
        case sound
    }

    /// `scenes` est OPTIONNEL au fil (O3) : un canvas sans aucun objet visuel
    /// n'émet pas de cadre vide, et son absence se lit `[]`. La marque `v` est
    /// acceptée à partir de 3 — un champ additif v3.x ne doit jamais renvoyer
    /// un client capable sur la branche legacy — et refusée en deçà : un
    /// document canvas n'existe pas avant v3.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let mark = try container.decode(Int.self, forKey: .v)
        guard mark >= 3 else {
            throw DecodingError.dataCorruptedError(forKey: .v, in: container,
                                                   debugDescription: "document canvas en deçà de v3 : \(mark)")
        }
        v = mark
        scenes = try container.decodeIfPresent([SceneV3].self, forKey: .scenes) ?? []
        sound = try container.decodeIfPresent(BackgroundSoundV3.self, forKey: .sound)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(v, forKey: .v)
        if !scenes.isEmpty { try container.encode(scenes, forKey: .scenes) }
        try container.encodeIfPresent(sound, forKey: .sound)
    }
}

public struct SceneV3: Equatable, Codable, Sendable {
    public let id: String
    public let objects: [ObjectV3]
    public let opening: [String: CanvasJSONValue]?
    public let closing: [String: CanvasJSONValue]?
    public let clipTransitions: [[String: CanvasJSONValue]]?
    public let timelineDuration: Double?
    /// Empreinte du canvas composite — le placeholder que quatre surfaces
    /// affichent avant l'arrivée du média.
    public let thumbHash: String?
    /// Ratio du PORTEUR d'origine, quand la scène provient d'une conversion v1
    /// (révision de S8 — miroir de `carrierAspect` dans `canvas-v3.ts`).
    ///
    /// `remapFreeAnchor` est AFFINE, donc inversible — mais seulement si l'on
    /// sait encore ce que valait le porteur. Sans ce champ, rouvrir un ancien
    /// contenu recadrait ses objets SANS RETOUR : sur du 16:9, `y = 0,90`
    /// devenait `0,6266` définitivement. `StoryDraftStore` avait déjà dû le
    /// repersister hors document, par diapositive, pour les brouillons.
    ///
    /// Optionnel : un document v3 natif n'en a pas — il n'a jamais eu d'autre
    /// porteur que sa scène.
    public let carrierAspect: Double?

    public init(id: String,
                objects: [ObjectV3],
                opening: [String: CanvasJSONValue]? = nil,
                closing: [String: CanvasJSONValue]? = nil,
                clipTransitions: [[String: CanvasJSONValue]]? = nil,
                timelineDuration: Double? = nil,
                thumbHash: String? = nil,
                carrierAspect: Double? = nil) {
        self.id = id
        self.objects = objects
        self.opening = opening
        self.closing = closing
        self.clipTransitions = clipTransitions
        self.timelineDuration = timelineDuration
        self.thumbHash = thumbHash
        self.carrierAspect = carrierAspect
    }

    private enum CodingKeys: String, CodingKey {
        case id, objects, opening, closing, clipTransitions, timelineDuration, thumbHash, carrierAspect
    }

    /// Décodage lossy PAR OBJET (miroir de `decodeLossyArrayIfPresent`,
    /// `StoryModels.swift:1812`) : un `ObjectV3` malformé — un kind neuf mal
    /// formé, une ancre au `t` inconnu — est sauté au lieu de faire tomber
    /// tout le tableau `objects`, donc la scène, donc le document entier.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        objects = container.decodeLossyArrayIfPresent([ObjectV3].self, forKey: .objects) ?? []
        opening = try container.decodeIfPresent([String: CanvasJSONValue].self, forKey: .opening)
        closing = try container.decodeIfPresent([String: CanvasJSONValue].self, forKey: .closing)
        clipTransitions = try container.decodeIfPresent([[String: CanvasJSONValue]].self, forKey: .clipTransitions)
        timelineDuration = try container.decodeIfPresent(Double.self, forKey: .timelineDuration)
        thumbHash = try container.decodeIfPresent(String.self, forKey: .thumbHash)
        carrierAspect = try container.decodeIfPresent(Double.self, forKey: .carrierAspect)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(objects, forKey: .objects)
        try container.encodeIfPresent(opening, forKey: .opening)
        try container.encodeIfPresent(closing, forKey: .closing)
        try container.encodeIfPresent(clipTransitions, forKey: .clipTransitions)
        try container.encodeIfPresent(timelineDuration, forKey: .timelineDuration)
        try container.encodeIfPresent(thumbHash, forKey: .thumbHash)
        try container.encodeIfPresent(carrierAspect, forKey: .carrierAspect)
    }
}

public struct ObjectV3: Equatable, Codable, Sendable {
    public let id: String
    public let kind: ObjectKind
    public let anchor: ObjectAnchor
    public let plane: Plane
    public let z: Int
    public let transform: TransformV3
    public let timing: TimingV3?
    public let locale: String?
    public let payload: [String: CanvasJSONValue]

    public init(id: String,
                kind: ObjectKind,
                anchor: ObjectAnchor,
                plane: Plane,
                z: Int,
                transform: TransformV3,
                timing: TimingV3? = nil,
                locale: String? = nil,
                payload: [String: CanvasJSONValue] = [:]) {
        self.id = id
        self.kind = kind
        self.anchor = anchor
        self.plane = plane
        self.z = z
        self.transform = transform
        self.timing = timing
        self.locale = locale
        self.payload = payload
    }
}

/// Les 7 kinds actifs de v1 ; tout autre kind est décodé `.reserved(raw)` et
/// ré-encodé tel quel — le SDK ne perd jamais un kind qu'un futur serveur accepterait.
public enum ObjectKind: Equatable, Codable, Sendable {
    case text
    case media
    case sticker
    case audio
    case place
    case drawing
    case mention
    case reserved(String)

    public init(from decoder: Decoder) throws {
        self = ObjectKind(wireValue: try decoder.singleValueContainer().decode(String.self))
    }

    public init(wireValue: String) {
        switch wireValue {
        case "text": self = .text
        case "media": self = .media
        case "sticker": self = .sticker
        case "audio": self = .audio
        case "place": self = .place
        case "drawing": self = .drawing
        case "mention": self = .mention
        default: self = .reserved(wireValue)
        }
    }

    public var wireValue: String {
        switch self {
        case .text: return "text"
        case .media: return "media"
        case .sticker: return "sticker"
        case .audio: return "audio"
        case .place: return "place"
        case .drawing: return "drawing"
        case .mention: return "mention"
        case .reserved(let raw): return raw
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(wireValue)
    }
}

public enum ObjectAnchor: Equatable, Codable, Sendable {
    case free(x: Double, y: Double)
    case band(Edge)

    public enum Edge: String, Codable, Sendable {
        case top
        case bottom
    }

    private enum CodingKeys: String, CodingKey {
        case t
        case x
        case y
        case edge
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let t = try container.decode(String.self, forKey: .t)
        switch t {
        case "free":
            self = .free(x: try container.decode(Double.self, forKey: .x),
                         y: try container.decode(Double.self, forKey: .y))
        case "band":
            self = .band(try container.decode(Edge.self, forKey: .edge))
        default:
            throw DecodingError.dataCorruptedError(forKey: .t, in: container,
                                                   debugDescription: "anchor.t inconnu : \(t)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .free(let x, let y):
            try container.encode("free", forKey: .t)
            try container.encode(x, forKey: .x)
            try container.encode(y, forKey: .y)
        case .band(let edge):
            try container.encode("band", forKey: .t)
            try container.encode(edge, forKey: .edge)
        }
    }
}

public enum Plane: String, Codable, Sendable {
    case bg
    case content
    case fg
}

public struct TransformV3: Equatable, Codable, Sendable {
    public let scale: Double
    public let rotation: Double
    public let opacity: Double

    public init(scale: Double = 1, rotation: Double = 0, opacity: Double = 1) {
        self.scale = scale
        self.rotation = rotation
        self.opacity = opacity
    }
}

public struct TimingV3: Equatable, Codable, Sendable {
    public let start: Double?
    public let end: Double?
    public let rate: Double?
    public let keyframes: [KeyframeV3]?

    public init(start: Double? = nil,
                end: Double? = nil,
                rate: Double? = nil,
                keyframes: [KeyframeV3]? = nil) {
        self.start = start
        self.end = end
        self.rate = rate
        self.keyframes = keyframes
    }
}

public struct KeyframeV3: Equatable, Codable, Sendable {
    public let time: Double
    public let x: Double?
    public let y: Double?
    public let scale: Double?
    public let opacity: Double?
    public let volume: Double?
    public let easing: String?

    public init(time: Double,
                x: Double? = nil,
                y: Double? = nil,
                scale: Double? = nil,
                opacity: Double? = nil,
                volume: Double? = nil,
                easing: String? = nil) {
        self.time = time
        self.x = x
        self.y = y
        self.scale = scale
        self.opacity = opacity
        self.volume = volume
        self.easing = easing
    }
}

public struct BackgroundSoundV3: Equatable, Codable, Sendable {
    public let source: Source
    public let volume: Double
    public let bounds: Bounds?
    public let variants: [Variant]?
    public let transcriptions: [Transcription]?

    public init(source: Source,
                volume: Double,
                bounds: Bounds? = nil,
                variants: [Variant]? = nil,
                transcriptions: [Transcription]? = nil) {
        self.source = source
        self.volume = volume
        self.bounds = bounds
        self.variants = variants
        self.transcriptions = transcriptions
    }

    public enum Source: Equatable, Codable, Sendable {
        case original
        case library(soundId: String)

        private enum CodingKeys: String, CodingKey {
            case t
            case soundId
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            let t = try container.decode(String.self, forKey: .t)
            switch t {
            case "original":
                self = .original
            case "library":
                self = .library(soundId: try container.decode(String.self, forKey: .soundId))
            default:
                throw DecodingError.dataCorruptedError(forKey: .t, in: container,
                                                       debugDescription: "sound.source.t inconnu : \(t)")
            }
        }

        public func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            switch self {
            case .original:
                try container.encode("original", forKey: .t)
            case .library(let soundId):
                try container.encode("library", forKey: .t)
                try container.encode(soundId, forKey: .soundId)
            }
        }
    }

    public struct Bounds: Equatable, Codable, Sendable {
        public let start: Double
        public let end: Double

        public init(start: Double, end: Double) {
            self.start = start
            self.end = end
        }
    }

    /// Variante TTS d'une piste, par langue — miroir du `backgroundAudioVariants`
    /// racine v1 (`StoryAudioVariant`), trois clés non optionnelles des deux côtés.
    public struct Variant: Equatable, Codable, Sendable {
        public let postMediaId: String
        public let language: String
        public let isAutoGenerated: Bool

        public init(postMediaId: String, language: String, isAutoGenerated: Bool) {
            self.postMediaId = postMediaId
            self.language = language
            self.isAutoGenerated = isAutoGenerated
        }
    }

    public struct Transcription: Equatable, Codable, Sendable {
        public let language: String
        public let content: String

        public init(language: String, content: String) {
            self.language = language
            self.content = content
        }
    }
}

public enum CanvasJSONValue: Equatable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case array([CanvasJSONValue])
    case object([String: CanvasJSONValue])
}

extension CanvasJSONValue: Codable {
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
            return
        }
        if let bool = try? container.decode(Bool.self) {
            self = .bool(bool)
            return
        }
        if let number = try? container.decode(Double.self) {
            self = .number(number)
            return
        }
        if let string = try? container.decode(String.self) {
            self = .string(string)
            return
        }
        if let array = try? container.decode([CanvasJSONValue].self) {
            self = .array(array)
            return
        }
        if let object = try? container.decode([String: CanvasJSONValue].self) {
            self = .object(object)
            return
        }
        throw DecodingError.dataCorruptedError(in: container,
                                               debugDescription: "Valeur JSON non représentable")
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let string): try container.encode(string)
        case .number(let number): try container.encode(number)
        case .bool(let bool): try container.encode(bool)
        case .null: try container.encodeNil()
        case .array(let array): try container.encode(array)
        case .object(let object): try container.encode(object)
        }
    }
}
