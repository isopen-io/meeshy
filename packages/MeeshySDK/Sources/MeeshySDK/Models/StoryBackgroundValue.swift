import Foundation

/// Valeur sérialisée du fond coloré d'un slide (`StoryEffects.background`).
///
/// Deux formes (C11, 2026-07-04) :
/// - `"RRGGBB"` — couleur unie (forme historique, hex sans `#`) ;
/// - `"gradient:RRGGBB:RRGGBB"` — dégradé linéaire 2 couleurs
///   (top-leading → bottom-trailing, convention brandGradient).
///
/// Le format tient sous les caps serveur (Zod `max(64)`) et dégrade
/// gracieusement sur les clients qui ne le parsent pas encore (le web
/// retombe sur son gradient par défaut — `safeBackgroundImageUrl` W7).
/// Source de vérité UNIQUE du parsing — consommée par le canvas CALayer
/// (`StoryRenderer.renderBackground`), le composite (`StorySlideRenderer`),
/// les miniatures (`SlideMiniPreview`) et le letterbox du composer.
public enum StoryBackgroundValue: Equatable, Sendable {
    case hex(String)
    case gradient(String, String)

    private static let gradientPrefix = "gradient:"

    /// Parse tolérant : tout ce qui n'est pas un gradient bien formé est
    /// traité comme hex (le renderer retombe alors sur son fallback couleur,
    /// comportement historique pour une valeur invalide).
    public static func parse(_ raw: String) -> StoryBackgroundValue {
        guard raw.hasPrefix(gradientPrefix) else { return .hex(raw) }
        let parts = raw.dropFirst(gradientPrefix.count).split(separator: ":")
        guard parts.count == 2,
              parts.allSatisfy({ $0.count == 6 && $0.allSatisfy(\.isHexDigit) }) else {
            return .hex(raw)
        }
        return .gradient(String(parts[0]), String(parts[1]))
    }

    public var serialized: String {
        switch self {
        case .hex(let h): return h
        case .gradient(let a, let b): return "\(Self.gradientPrefix)\(a):\(b)"
        }
    }

    /// **Le dégradé de l'auteur** (#14258) : sa couleur vers le noir, dans la
    /// forme `gradient:RRGGBB:000000` qu'Android écrit sous une scène publiée
    /// sans fond choisi (#14244). `nil` quand la couleur n'est pas un hex à six
    /// chiffres : aucun sol, le lecteur garde le sien.
    public static func authorGradient(_ accentHex: String) -> StoryBackgroundValue? {
        let trimmed = accentHex.trimmingCharacters(in: .whitespaces).uppercased()
        let digits = trimmed.hasPrefix("#") ? String(trimmed.dropFirst()) : trimmed
        guard digits.count == 6, digits.allSatisfy(\.isHexDigit) else { return nil }
        return .gradient(digits, authorGradientEnd)
    }

    private static let authorGradientEnd = "000000"
}

public extension StoryEffects {
    /// Une scène qui ne déclare aucun fond se lit sur le dégradé de son auteur,
    /// jamais sur du noir (#14258) ; un fond choisi garde la main.
    func flooredOnAuthorGradient(_ accentHex: String?) -> StoryEffects {
        guard background?.isEmpty ?? true,
              let floor = accentHex.flatMap(StoryBackgroundValue.authorGradient) else { return self }
        var floored = self
        floored.background = floor.serialized
        return floored
    }
}
