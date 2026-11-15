// GÉNÉRÉ — ne pas éditer; source: packages/shared/types/lens-format.ts
// Régénérer : `cd packages/shared && bun run generate:lens-format`.
// Fraîcheur gardée par packages/shared/__tests__/lens-format-swift.test.ts ;
// comportement gardé par packages/shared/fixtures/lens-v1/vectors.json (vitest ET Swift).

import Foundation

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
