import Foundation

/// **LE TEXTE D'UNE CARTE** — couper en lignes, tronquer, lire le sens.
/// Lois pures, la mesure injectée : la vraie police en production, une règle
/// fixe dans les témoins. Miroir de `apps/web/src/lib/export/message-card-text.ts`.
public typealias MessageCardMeasure = (_ text: String, _ font: MessageCardFont) -> Double

public enum MessageCardTextDirection: Equatable, Sendable {
    case ltr, rtl
}

public enum MessageCardText {

    static let ellipsis = "…"

    private static func isRTLStrong(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.value {
        case 0x0590...0x08FF, 0xFB1D...0xFDFF, 0xFE70...0xFEFF: return true
        default: return false
        }
    }

    private static func isLTRStrong(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.value {
        case 0x41...0x5A, 0x61...0x7A, 0x00C0...0x024F, 0x0370...0x03FF, 0x0400...0x04FF: return true
        default: return false
        }
    }

    /// Le sens d'un texte — celui de son PREMIER caractère fort, comme `dir="auto"`.
    public static func direction(of text: String) -> MessageCardTextDirection {
        for scalar in text.unicodeScalars {
            if isRTLStrong(scalar) { return .rtl }
            if isLTRStrong(scalar) { return .ltr }
        }
        return .ltr
    }

    /// Coupe un texte en lignes qui tiennent dans `maxWidth`. Les sauts de
    /// ligne de l'auteur sont gardés ; un mot plus large que la ligne (une URL,
    /// un mot allemand) est coupé par graphème plutôt que de déborder.
    public static func wrap(_ text: String, maxWidth: Double, font: MessageCardFont, measure: MessageCardMeasure) -> [String] {
        func fits(_ candidate: String) -> Bool { measure(candidate, font) <= maxWidth }
        let normalized = text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        var lines: [String] = []
        for paragraph in normalized.components(separatedBy: "\n") {
            let words = paragraph.split(whereSeparator: { $0.isWhitespace }).map(String.init)
            if words.isEmpty {
                lines.append("")
                continue
            }
            var current = ""
            for word in words {
                let candidate = current.isEmpty ? word : "\(current) \(word)"
                if fits(candidate) {
                    current = candidate
                    continue
                }
                if !current.isEmpty { lines.append(current) }
                current = ""
                if fits(word) {
                    current = word
                    continue
                }
                for character in word {
                    if !current.isEmpty && !fits(current + String(character)) {
                        lines.append(current)
                        current = String(character)
                    } else {
                        current.append(character)
                    }
                }
            }
            if !current.isEmpty { lines.append(current) }
        }
        while lines.first == "" { lines.removeFirst() }
        while lines.last == "" { lines.removeLast() }
        // Deux lignes vides d'affilée n'ajoutent rien à une image : une seule suffit.
        let blank = lines
        return blank.indices.filter { !(blank[$0].isEmpty && $0 > 0 && blank[$0 - 1].isEmpty) }.map { blank[$0] }
    }

    /// Garde `count` lignes et termine la dernière par une ellipse qui tient dans la ligne.
    public static func truncate(_ lines: [String], count: Int, maxWidth: Double, font: MessageCardFont, measure: MessageCardMeasure) -> [String] {
        guard lines.count > count else { return lines }
        var kept = Array(lines.prefix(max(1, count)))
        var last = Array(kept[kept.count - 1])
        while !last.isEmpty && measure(trimmingEnd(String(last)) + ellipsis, font) > maxWidth {
            last.removeLast()
        }
        kept[kept.count - 1] = trimmingEnd(String(last)) + ellipsis
        return kept
    }

    static func trimmingEnd(_ text: String) -> String {
        var result = text
        while let last = result.last, last.isWhitespace { result.removeLast() }
        return result
    }

    static func nonBlank(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        return trimmed
    }
}
