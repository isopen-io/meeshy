// GÉNÉRÉ — ne pas éditer; source: packages/shared/types/lens-format.ts
// Régénérer : `cd packages/shared && bun run generate:lens-format`.
// Fraîcheur gardée par packages/shared/__tests__/lens-format-swift.test.ts ;
// comportement gardé par packages/shared/fixtures/lens-v1/vectors.json (vitest ET Swift).

import Foundation

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
