import Foundation

/// **Poser ou retirer une emphase sur une sélection** (#7849) — ce que fait
/// la barre de format du compositeur. Miroir de `toggleEmphasis`
/// (`packages/shared/utils/text-format.ts`) : mêmes marqueurs, mêmes trois
/// gestes, pour qu'un message mis en forme sur iOS se lise pareil sur le web.
///
/// - sélection vide ⇒ la paire est posée, le curseur ENTRE les deux ;
/// - sélection déjà encadrée (dedans ou juste autour) ⇒ l'emphase est RETIRÉE ;
/// - sinon ⇒ la sélection est encadrée, sans ses blancs de bord (une emphase
///   qui s'ouvre ou se ferme sur un blanc n'en est pas une pour le rendu).
///
/// Les positions sont des index de `Character` : pure et sans état, elle
/// s'éprouve sans monter de champ.
nonisolated enum ComposerTextFormat {

    nonisolated enum Style: String, CaseIterable, Sendable {
        case bold, italic, underline, strikethrough

        var marker: String {
            switch self {
            case .bold: return "**"
            case .italic: return "*"
            case .underline: return "__"
            case .strikethrough: return "~~"
            }
        }
    }

    nonisolated struct Result: Equatable, Sendable {
        let text: String
        let start: Int
        let end: Int
    }

    /// Les positions rendues sont BORNÉES au texte rendu : retirer une paire de
    /// marqueurs peut souder les caractères qui l'entouraient en un seul
    /// graphème (jamo coréen, lettres-drapeaux), et le texte compte alors un
    /// caractère de moins que l'arithmétique ne le suppose — la sélection
    /// posée au-delà de la fin plantait.
    static func toggle(text: String, start: Int, end: Int, style: Style) -> Result {
        let raw = rawToggle(text: text, start: start, end: end, style: style)
        let count = raw.text.count
        let lower = min(max(0, raw.start), count)
        return Result(text: raw.text, start: lower, end: min(max(lower, raw.end), count))
    }

    private static func rawToggle(text: String, start: Int, end: Int, style: Style) -> Result {
        let chars = Array(text)
        let marker = Array(style.marker)
        let m = marker.count
        let lo = max(0, min(start, end, chars.count))
        let hi = min(chars.count, max(start, end))

        if lo == hi {
            let next = String(chars[..<lo]) + style.marker + style.marker + String(chars[lo...])
            return Result(text: next, start: lo + m, end: lo + m)
        }

        var s = lo
        var e = hi
        while s < e, chars[s].isWhitespace { s += 1 }
        while e > s, chars[e - 1].isWhitespace { e -= 1 }
        guard s < e else { return Result(text: text, start: lo, end: hi) }

        if hasOuterMarker(chars, s, e, marker) {
            let next = String(chars[..<(s - m)]) + String(chars[s..<e]) + String(chars[(e + m)...])
            return Result(text: next, start: s - m, end: e - m)
        }

        let selected = Array(chars[s..<e])
        if hasInnerMarker(selected, marker) {
            let inner = String(selected[m..<(selected.count - m)])
            let next = String(chars[..<s]) + inner + String(chars[e...])
            return Result(text: next, start: s, end: e - 2 * m)
        }

        let next = String(chars[..<s]) + style.marker + String(selected) + style.marker + String(chars[e...])
        return Result(text: next, start: s + m, end: e + m)
    }

    private static func run(_ chars: [Character], from: Int, step: Int) -> Int {
        var count = 0
        var index = from
        while index >= 0, index < chars.count, chars[index] == "*" {
            count += 1
            index += step
        }
        return count
    }

    /// L'italique ne se confond pas avec le gras : une étoile SEULE (ou trois) encadre.
    private static func hasOuterMarker(_ chars: [Character], _ s: Int, _ e: Int, _ marker: [Character]) -> Bool {
        let m = marker.count
        guard s >= m, e + m <= chars.count,
              Array(chars[(s - m)..<s]) == marker, Array(chars[e..<(e + m)]) == marker else { return false }
        guard marker == ["*"] else { return true }
        return run(chars, from: s - 1, step: -1) % 2 == 1 && run(chars, from: e, step: 1) % 2 == 1
    }

    private static func hasInnerMarker(_ selected: [Character], _ marker: [Character]) -> Bool {
        let m = marker.count
        guard selected.count > 2 * m,
              Array(selected[..<m]) == marker, Array(selected[(selected.count - m)...]) == marker else { return false }
        guard marker == ["*"] else { return true }
        return run(selected, from: 0, step: 1) % 2 == 1 && run(selected, from: selected.count - 1, step: -1) % 2 == 1
    }
}
