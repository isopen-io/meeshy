/**
 * Le texte Swift du LECTEUR MeeshyLens (#11270), émis tel quel par
 * `generate-lens-format-swift.ts` à côté du vocabulaire déduit de `lens-format.ts`.
 * Il reproduit `parseLens` règle pour règle ; `fixtures/lens-v1/vectors.json`, rejoué par
 * vitest ET par `LensFormatVectorsTests.swift`, est ce qui l'empêche de dériver.
 *
 * Quatre fichiers, chacun sous le budget de 1 200 lignes : la valeur JSON, le modèle, le
 * lecteur du document, le lecteur des couches. Foundation seul : aucune dépendance du SDK.
 */

export const JSON_VALUE_FILE = `import Foundation

/// Une valeur JSON EXACTE : un booléen n'est jamais un nombre, null n'est jamais une absence.
/// C'est ce que JavaScript distingue ; JSONSerialization (NSNumber) ne le distingue pas partout.
public indirect enum LensJSONValue: Sendable, Equatable, Decodable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([LensJSONValue])
    case object([String: LensJSONValue])

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([LensJSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: LensJSONValue].self))
        }
    }
}
`;

export const MODEL_FILE = `import Foundation

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
`;

export const DOCUMENT_FILE = `import Foundation

public enum LensFormat {
    /// Lit un document MeeshyLens en octets JSON. Jamais d'exception : un JSON illisible est .invalid.
    public static func parse(_ data: Data) -> LensParseOutcome {
        guard let value = try? JSONDecoder().decode(LensJSONValue.self, from: data) else { return .invalid }
        return parse(value)
    }

    /// Lit un document MeeshyLens. Même ordre que parseLens (TypeScript) : version, interdits, enveloppe, couches.
    public static func parse(_ input: LensJSONValue) -> LensParseOutcome {
        guard case let .object(root) = input, !exceedsDepth(input, levelsLeft: maxDepth) else { return .invalid }
        guard case let .number(rawSchema)? = root["schema"], rawSchema == rawSchema.rounded(), rawSchema >= 1 else { return .invalid }
        if rawSchema > Double(schemaVersion) { return .updateRequired(schema: Int(exactly: rawSchema) ?? Int.max) }
        let reasons = Set(forbiddenReasons(input) + forbiddenLayerReasons(root["layers"])).sorted()
        guard reasons.isEmpty else { return .forbidden(reasons: reasons) }
        guard let envelope = readEnvelope(root) else { return .invalid }
        let layers = envelope.declaredLayers.compactMap(readLayer)
        let ids = layers.map { $0.id }
        guard layers.count <= maxLayers, Set(ids).count == ids.count else { return .invalid }
        let known = Set(ids)
        let triggers = envelope.declaredTriggers.compactMap(readTrigger).filter { known.contains($0.target) }
        guard triggers.count <= maxTriggers else { return .invalid }
        let document = LensDocument(
            id: envelope.id, name: envelope.name, names: envelope.names, credits: envelope.credits,
            surfaces: envelope.surfaces, cost: envelope.cost, window: envelope.window,
            layers: layers, triggers: triggers, fallbacks: envelope.fallbacks.map { visible($0, among: known) }
        )
        return .ok(document, ignoredLayers: envelope.declaredLayers.count - layers.count, ignoredTriggers: envelope.declaredTriggers.count - triggers.count)
    }

    private static func visible(_ fallbacks: LensFallbacks, among known: Set<String>) -> LensFallbacks {
        func tier(_ tier: LensFallbackTier?) -> LensFallbackTier? { tier.map { LensFallbackTier(hide: $0.hide.filter(known.contains)) } }
        return LensFallbacks(reduced: tier(fallbacks.reduced), minimal: tier(fallbacks.minimal))
    }

    private struct Envelope {
        let id: String
        let name: String
        let names: [String: String]
        let credits: LensCredits
        let surfaces: [LensSurface]
        let cost: LensCost
        let window: LensWindow
        let declaredLayers: [LensJSONValue]
        let declaredTriggers: [LensJSONValue]
        let fallbacks: LensFallbacks?
    }

    private static func readEnvelope(_ root: [String: LensJSONValue]) -> Envelope? {
        guard let id = slug(root["id"]), let name = text(root["name"], max: maxNameLength),
              let credits = readCredits(root["credits"]), let surfaces = readSurfaces(root["surfaces"]),
              case let .string(rawCost)? = root["cost"], let cost = LensCost(rawValue: rawCost),
              let window = readWindow(root["window"]),
              case let .array(declaredLayers)? = root["layers"], (1...maxDeclaredLayers).contains(declaredLayers.count) else { return nil }
        let names = optional(root, "names") { readNames($0) }
        let triggers = optional(root, "triggers") { value -> [LensJSONValue]? in
            guard case let .array(items) = value, items.count <= maxDeclaredTriggers else { return nil }
            return items
        }
        let fallbacks = optional(root, "fallbacks") { readFallbacks($0) }
        guard names.isValid, triggers.isValid, fallbacks.isValid else { return nil }
        return Envelope(
            id: id, name: name, names: names.value ?? [:], credits: credits, surfaces: surfaces, cost: cost, window: window,
            declaredLayers: declaredLayers, declaredTriggers: triggers.value ?? [], fallbacks: fallbacks.value
        )
    }

    private static func readCredits(_ value: LensJSONValue?) -> LensCredits? {
        guard case let .object(fields)? = value, let author = text(fields["author"], max: maxAuthorLength),
              case let .string(createdAt)? = fields["createdAt"], isISODate(createdAt) else { return nil }
        let updatedAt = optional(fields, "updatedAt") { value -> String? in
            guard case let .string(date) = value, isISODate(date) else { return nil }
            return date
        }
        guard updatedAt.isValid else { return nil }
        return LensCredits(author: author, createdAt: createdAt, updatedAt: updatedAt.value)
    }

    private static func readSurfaces(_ value: LensJSONValue?) -> [LensSurface]? {
        guard case let .array(items)? = value, !items.isEmpty else { return nil }
        let surfaces = items.compactMap { item -> LensSurface? in
            guard case let .string(raw) = item else { return nil }
            return LensSurface(rawValue: raw)
        }
        return surfaces.count == items.count && Set(surfaces).count == surfaces.count ? surfaces : nil
    }

    private static func readNames(_ value: LensJSONValue) -> [String: String]? {
        guard case let .object(fields) = value else { return nil }
        var names: [String: String] = [:]
        for language in languages where language != "fr" {
            let entry = optional(fields, language) { text($0, max: maxNameLength) }
            guard entry.isValid else { return nil }
            names[language] = entry.value
        }
        return names
    }

    private static func readWindow(_ value: LensJSONValue?) -> LensWindow? {
        guard case let .object(fields)? = value,
              case let .string(startsAt)? = fields["startsAt"], isISODateTime(startsAt),
              case let .string(endsAt)? = fields["endsAt"], isISODateTime(endsAt), endsAt > startsAt else { return nil }
        let geo = optional(fields, "geo") { value -> [String]? in
            guard case let .object(geoFields) = value else { return nil }
            return codes(geoFields["countries"], pattern: patterns.country, max: maxCountries)
        }
        let communities = optional(fields, "communities") { codes($0, pattern: patterns.community, max: maxCommunities) }
        guard geo.isValid, communities.isValid else { return nil }
        return LensWindow(startsAt: startsAt, endsAt: endsAt, countries: geo.value, communities: communities.value)
    }

    private static func codes(_ value: LensJSONValue?, pattern: String, max: Int) -> [String]? {
        guard case let .array(items)? = value, (1...max).contains(items.count) else { return nil }
        let strings = items.compactMap { item -> String? in
            guard case let .string(code) = item, matches(pattern, code) else { return nil }
            return code
        }
        return strings.count == items.count && Set(strings).count == strings.count ? strings : nil
    }

    private static func readFallbacks(_ value: LensJSONValue) -> LensFallbacks? {
        guard case let .object(fields) = value else { return nil }
        let reduced = optional(fields, "reduced") { readTier($0) }
        let minimal = optional(fields, "minimal") { readTier($0) }
        guard reduced.isValid, minimal.isValid else { return nil }
        return LensFallbacks(reduced: reduced.value, minimal: minimal.value)
    }

    private static func readTier(_ value: LensJSONValue) -> LensFallbackTier? {
        guard case let .object(fields) = value, case let .array(items)? = fields["hide"], items.count <= maxHidden else { return nil }
        let ids = items.compactMap { slug($0) }
        return ids.count == items.count ? LensFallbackTier(hide: ids) : nil
    }
}
`;

export const LAYERS_FILE = `import Foundation

/// Un champ OPTIONNEL : absent est valide, présent mais mal formé ne l'est pas (zod optional).
struct LensField<Value> {
    let isValid: Bool
    let value: Value?
}

extension LensFormat {
    static func optional<Value>(_ fields: [String: LensJSONValue], _ key: String, _ read: (LensJSONValue) -> Value?) -> LensField<Value> {
        guard let raw = fields[key] else { return LensField(isValid: true, value: nil) }
        guard let value = read(raw) else { return LensField(isValid: false, value: nil) }
        return LensField(isValid: true, value: value)
    }

    static func text(_ value: LensJSONValue?, max: Int) -> String? {
        guard case let .string(text)? = value, (1...max).contains(text.utf16.count) else { return nil }
        return text
    }

    static func slug(_ value: LensJSONValue?) -> String? {
        guard case let .string(text)? = value, text.utf16.count <= maxIdLength, matches(patterns.id, text) else { return nil }
        return text
    }

    static func number(_ value: LensJSONValue?, in range: ClosedRange<Double>) -> Double? {
        guard case let .number(number)? = value, range.contains(number) else { return nil }
        return number
    }

    static func matched(_ value: LensJSONValue?, by pattern: String) -> String? {
        guard case let .string(text)? = value, matches(pattern, text) else { return nil }
        return text
    }

    static func readLayer(_ value: LensJSONValue) -> LensLayer? {
        guard case let .object(fields) = value, case let .string(kind)? = fields["kind"], let id = slug(fields["id"]) else { return nil }
        switch kind {
        case "lut": return readLut(fields, id: id)
        case "frame": return readFrame(fields, id: id)
        case "sticker": return readSticker(fields, id: id)
        case "text": return readTextLayer(fields, id: id)
        case "particles": return readParticles(fields, id: id)
        default: return nil
        }
    }

    private static func readLut(_ fields: [String: LensJSONValue], id: String) -> LensLayer? {
        guard let asset = matched(fields["asset"], by: patterns.asset) else { return nil }
        let intensity = optional(fields, "intensity") { number($0, in: fractionRange) }
        guard intensity.isValid else { return nil }
        return .lut(LensLutLayer(id: id, asset: asset, intensity: intensity.value))
    }

    private static func readFrame(_ fields: [String: LensJSONValue], id: String) -> LensLayer? {
        guard let motif = matched(fields["motif"], by: patterns.motif) else { return nil }
        let opacity = optional(fields, "opacity") { number($0, in: fractionRange) }
        guard opacity.isValid else { return nil }
        return .frame(LensFrameLayer(id: id, motif: motif, opacity: opacity.value))
    }

    private static func readSticker(_ fields: [String: LensJSONValue], id: String) -> LensLayer? {
        guard let asset = matched(fields["asset"], by: patterns.asset), let anchor = fields["anchor"].flatMap(readAnchor),
              let size = number(fields["size"], in: stickerSizeRange) else { return nil }
        let rotation = optional(fields, "rotation") { number($0, in: rotationRange) }
        guard rotation.isValid else { return nil }
        return .sticker(LensStickerLayer(id: id, asset: asset, anchor: anchor, size: size, rotation: rotation.value))
    }

    private static func readTextLayer(_ fields: [String: LensJSONValue], id: String) -> LensLayer? {
        guard let text = readLocalizedText(fields["text"]), case let .string(rawFont)? = fields["font"], let font = LensFont(rawValue: rawFont),
              let color = matched(fields["color"], by: patterns.color), let size = number(fields["size"], in: textSizeRange),
              let anchor = fields["anchor"].flatMap(readAnchor) else { return nil }
        return .text(LensTextLayer(id: id, text: text, font: font, color: color, size: size, anchor: anchor))
    }

    private static func readParticles(_ fields: [String: LensJSONValue], id: String) -> LensLayer? {
        guard case let .string(rawPreset)? = fields["preset"], let preset = LensParticlePreset(rawValue: rawPreset),
              case let .string(rawDensity)? = fields["density"], let density = LensDensity(rawValue: rawDensity) else { return nil }
        let anchor = optional(fields, "anchor") { readAnchor($0) }
        guard anchor.isValid else { return nil }
        return .particles(LensParticlesLayer(id: id, preset: preset, density: density, anchor: anchor.value))
    }

    private static func readLocalizedText(_ value: LensJSONValue?) -> [String: String]? {
        guard case let .object(fields)? = value, let french = text(fields["fr"], max: maxTextLength) else { return nil }
        var texts = ["fr": french]
        for language in languages where language != "fr" {
            let entry = optional(fields, language) { text($0, max: maxTextLength) }
            guard entry.isValid else { return nil }
            texts[language] = entry.value
        }
        return texts
    }

    private static func readAnchor(_ value: LensJSONValue) -> LensAnchor? {
        guard case let .object(fields) = value, case let .string(type)? = fields["type"] else { return nil }
        switch type {
        case "screen":
            guard let x = number(fields["x"], in: fractionRange), let y = number(fields["y"], in: fractionRange) else { return nil }
            return .screen(x: x, y: y)
        case "face":
            guard case let .string(rawPoint)? = fields["point"], let point = LensFacePoint(rawValue: rawPoint) else { return nil }
            let dx = optional(fields, "dx") { number($0, in: offsetRange) }
            let dy = optional(fields, "dy") { number($0, in: offsetRange) }
            guard dx.isValid, dy.isValid else { return nil }
            return .face(point: point, dx: dx.value, dy: dy.value)
        default:
            return nil
        }
    }

    static func readTrigger(_ value: LensJSONValue) -> LensTrigger? {
        guard case let .object(fields) = value, case let .string(rawEvent)? = fields["on"], let event = LensTriggerEvent(rawValue: rawEvent),
              case let .string(rawAction)? = fields["action"], let action = LensTriggerAction(rawValue: rawAction),
              let target = slug(fields["target"]) else { return nil }
        let delay = optional(fields, "delay") { number($0, in: delayRange) }
        guard delay.isValid else { return nil }
        return LensTrigger(on: event, action: action, target: target, delay: delay.value)
    }
}
`;

export const SCAN_FILE = `import Foundation

/// Ce qui se mesure sans rien interpréter : la profondeur, les interdits, les URL, les dates, les motifs.
extension LensFormat {
    static func exceedsDepth(_ value: LensJSONValue, levelsLeft: Int) -> Bool {
        switch value {
        case let .array(items): return levelsLeft <= 0 || items.contains { exceedsDepth($0, levelsLeft: levelsLeft - 1) }
        case let .object(fields): return levelsLeft <= 0 || fields.values.contains { exceedsDepth($0, levelsLeft: levelsLeft - 1) }
        default: return false
        }
    }

    static func forbiddenReasons(_ value: LensJSONValue) -> [String] {
        switch value {
        case let .string(text): return containsURL(text) ? ["url"] : []
        case let .array(items): return items.flatMap(forbiddenReasons)
        case let .object(fields):
            return fields.flatMap { key, child in (forbiddenKeys.contains(key) ? ["key:" + key] : []) + forbiddenReasons(child) }
        default: return []
        }
    }

    static func forbiddenLayerReasons(_ layers: LensJSONValue?) -> [String] {
        guard case let .array(items)? = layers else { return [] }
        return items.compactMap { item in
            guard case let .object(fields) = item, case let .string(kind)? = fields["kind"], forbiddenLayerKinds.contains(kind) else { return nil }
            return "layer:" + kind
        }
    }

    // L'URL se cherche en unités UTF-16, comme JavaScript : une recherche par Character laisserait
    // passer « :// » suivi d'une marque combinante.

    private static func isASCIIWord(_ unit: UInt16) -> Bool {
        (48...57).contains(unit) || (65...90).contains(unit) || (97...122).contains(unit) || unit == 95
    }

    private static func occurrences(of needle: String, in haystack: [UInt16]) -> [Int] {
        let pattern = Array(needle.utf16)
        guard haystack.count >= pattern.count else { return [] }
        return (0...(haystack.count - pattern.count)).filter { haystack[$0..<($0 + pattern.count)].elementsEqual(pattern) }
    }

    static func containsURL(_ raw: String) -> Bool {
        let value = Array(raw.lowercased().utf16)
        if value.starts(with: Array("//".utf16)) || !occurrences(of: "://", in: value).isEmpty { return true }
        return bareUrlSchemes.contains { scheme in
            occurrences(of: scheme, in: value).contains { $0 == 0 || !isASCIIWord(value[$0 - 1]) }
        }
    }

    // Les dates : le calendrier est vérifié à la main, des deux côtés.

    private static func digits(_ units: [UInt16], _ start: Int, _ count: Int) -> Int? {
        let slice = units[start..<(start + count)]
        guard slice.allSatisfy({ (48...57).contains($0) }) else { return nil }
        return slice.reduce(0) { $0 * 10 + Int($1 - 48) }
    }

    private static func isCalendarDay(year: Int, month: Int, day: Int) -> Bool {
        guard (1...12).contains(month), day >= 1 else { return false }
        let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
        let length = month == 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].contains(month) ? 30 : 31
        return day <= length
    }

    static func isISODate(_ value: String) -> Bool {
        let units = Array(value.utf16)
        guard units.count == 10, units[4] == 45, units[7] == 45,
              let year = digits(units, 0, 4), let month = digits(units, 5, 2), let day = digits(units, 8, 2) else { return false }
        return isCalendarDay(year: year, month: month, day: day)
    }

    static func isISODateTime(_ value: String) -> Bool {
        let units = Array(value.utf16)
        guard units.count == 20, units[4] == 45, units[7] == 45, units[10] == 84, units[13] == 58, units[16] == 58, units[19] == 90,
              let year = digits(units, 0, 4), let month = digits(units, 5, 2), let day = digits(units, 8, 2),
              let hour = digits(units, 11, 2), let minute = digits(units, 14, 2), let second = digits(units, 17, 2) else { return false }
        return isCalendarDay(year: year, month: month, day: day) && hour < 24 && minute < 60 && second < 60
    }

    /// Un motif entier : les motifs générés sont ancrés (début et fin de texte absolus) (le $ d'ICU accepterait un saut de ligne final).
    static func matches(_ pattern: String, _ text: String) -> Bool {
        guard let expression = try? NSRegularExpression(pattern: pattern) else { return false }
        return expression.firstMatch(in: text, range: NSRange(location: 0, length: text.utf16.count)) != nil
    }
}
`;
