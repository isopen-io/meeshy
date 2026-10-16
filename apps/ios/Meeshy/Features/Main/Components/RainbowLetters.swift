import SwiftUI
import MeeshySDK

/// **L'arc-en-ciel du mode Script** : pas de contour — la rangée plate n'a pas de bulle à entourer —, mais
/// chaque lettre d'une couleur tirée au hasard.
///
/// Le hasard est GRAINÉ par l'id du message : la même lettre garde la même couleur d'un rendu à l'autre
/// (sinon le texte clignoterait à chaque reconfiguration de cellule), et deux messages ne se ressemblent pas.
/// Deux voisines ne prennent jamais la même teinte, pour que l'effet se lise comme tel.
///
/// Les palettes sont choisies pour la LECTURE : nuances profondes sur fond clair, claires sur fond sombre,
/// chacune à au moins 4,5:1 contre le fond de son thème (`RainbowLettersTests`). Les couleurs choisies par
/// l'auteur (`rainbowColors`) habillent le contour d'une bulle ; posées sur des lettres, rien ne garantirait
/// qu'elles restent lisibles.
nonisolated enum RainbowLetters {

    static func paletteHex(isDark: Bool) -> [String] {
        isDark
            ? ["#A5B4FC", "#F0ABFC", "#FDA4AF", "#FCD34D", "#6EE7B7", "#7DD3FC"]
            : ["#4338CA", "#A21CAF", "#BE123C", "#92400E", "#047857", "#0369A1"]
    }

    /// `count` indices de palette, déterministes pour `seed`, sans deux voisins égaux.
    static func colorIndices(count: Int, seed: String, paletteSize: Int) -> [Int] {
        guard count > 0, paletteSize > 0 else { return [] }
        var state = fnv1a(seed)
        var indices: [Int] = []
        indices.reserveCapacity(count)
        for _ in 0..<count {
            state = splitMix(state)
            var index = Int(state % UInt64(paletteSize))
            if paletteSize > 1, let previous = indices.last, previous == index {
                index = (index + 1 + Int((state >> 32) % UInt64(paletteSize - 1))) % paletteSize
            }
            indices.append(index)
        }
        return indices
    }

    /// Colore les lettres ORDINAIRES (encre `baseColor`, sans lien) ; mentions, hashtags, liens et espaces
    /// gardent leur rendu. Le texte ne change pas.
    static func painting(_ text: AttributedString, baseColor: Color, seed: String, isDark: Bool) -> AttributedString {
        let palette = paletteHex(isDark: isDark).map { Color(hex: $0) }
        var painted = text
        var letters: [Range<AttributedString.Index>] = []
        for run in text.runs where run.foregroundColor == baseColor && run.link == nil {
            var index = run.range.lowerBound
            while index < run.range.upperBound {
                let next = text.characters.index(after: index)
                if !text.characters[index].isWhitespace { letters.append(index..<next) }
                index = next
            }
        }
        let indices = colorIndices(count: letters.count, seed: seed, paletteSize: palette.count)
        for (range, colorIndex) in zip(letters, indices) {
            painted[range].foregroundColor = palette[colorIndex]
        }
        return painted
    }

    /// La rangée plate n'a pas de bulle : l'arc-en-ciel n'y trace aucun contour — il passe aux lettres.
    static func rowEffects(_ effects: MessageEffects) -> MessageEffects {
        var withoutOutline = effects
        withoutOutline.flags.remove(.rainbow)
        return withoutOutline
    }

    /// La graine des lettres d'un message arc-en-ciel (son id), `nil` sinon.
    static func seed(for effects: MessageEffects, messageId: String) -> String? {
        effects.flags.contains(.rainbow) ? messageId : nil
    }

    private static func fnv1a(_ text: String) -> UInt64 {
        var hash: UInt64 = 0xcbf29ce484222325
        for byte in text.utf8 { hash = (hash ^ UInt64(byte)) &* 0x100000001b3 }
        return hash
    }

    private static func splitMix(_ x: UInt64) -> UInt64 {
        var z = x &+ 0x9E3779B97F4A7C15
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
        z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        return z ^ (z >> 31)
    }
}
