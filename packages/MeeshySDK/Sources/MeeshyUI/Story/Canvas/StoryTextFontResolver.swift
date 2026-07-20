import UIKit
import MeeshySDK

/// Source unique de résolution `UIFont` pour le rendu canvas d'un
/// `StoryTextObject`. Extraite de `StoryTextLayer` pour être partagée avec
/// `StoryInlineTextEditor` sans dupliquer la logique de style. Le pendant
/// SwiftUI `storyFont(for:size:)` (`StoryFont.swift`) reste séparé : il
/// renvoie un `Font` SwiftUI ; ce resolver n'unifie que le côté UIKit.
public enum StoryTextFontResolver {

    /// Résout la `UIFont` d'un `StoryTextObject` : police custom (`fontFamily`)
    /// prioritaire, sinon dérivée du `textStyle`. Si `fontWeight` est défini, il
    /// remplace le poids dérivé du style (design rounded/serif/mono conservé).
    public static func resolveFont(forTextObject text: StoryTextObject,
                                   size: CGFloat) -> UIFont {
        let base = baseFont(forTextObject: text, size: size)
        return applyingWeightOverride(base, override: text.parsedFontWeight, size: size)
    }

    private static func baseFont(forTextObject text: StoryTextObject,
                                 size: CGFloat) -> UIFont {
        if text.fontFamily != "system",
           let custom = UIFont(name: text.fontFamily, size: size) {
            return custom
        }
        switch text.parsedTextStyle {
        case .bold:
            return UIFont.systemFont(ofSize: size, weight: .black)
        case .neon:
            let base = UIFont.systemFont(ofSize: size, weight: .semibold)
            let descriptor = base.fontDescriptor.withDesign(.rounded) ?? base.fontDescriptor
            return UIFont(descriptor: descriptor, size: size)
        case .typewriter:
            return UIFont.monospacedSystemFont(ofSize: size, weight: .regular)
        case .handwriting, .calligraphy, .cartoon, .futuristic, .fantasy, .curve, .tag:
            // Styles à famille nommée (SnellRoundhand, Zapfino, ChalkboardSE,
            // Futura, Papyrus, Savoye LET, MarkerFelt) — toutes embarquées iOS.
            // Fallback : system serif au poids dérivé du style si la police
            // manque sur le device (ne devrait pas arriver, gardé par sûreté).
            if let name = text.parsedTextStyle.fontName,
               let custom = UIFont(name: name, size: size) {
                return custom
            }
            let weight: UIFont.Weight = text.parsedTextStyle.fontWeight >= 700 ? .bold : .regular
            let base = UIFont.systemFont(ofSize: size, weight: weight)
            let descriptor = base.fontDescriptor.withDesign(.serif) ?? base.fontDescriptor
            return UIFont(descriptor: descriptor, size: size)
        case .classic:
            let base = UIFont.systemFont(ofSize: size, weight: .medium)
            let descriptor = base.fontDescriptor.withDesign(.serif) ?? base.fontDescriptor
            return UIFont(descriptor: descriptor, size: size)
        }
    }

    /// Re-derives `base` at an explicit weight while preserving its design
    /// family (rounded / serif / monospaced live in the descriptor, not the
    /// weight trait). No-op when `override` is `nil`, so legacy text keeps the
    /// exact weight derived from its style.
    ///
    /// Familles NOMMÉES (Georgia, Futura, ChalkboardSE, MarkerFelt, …) : poser
    /// le trait `.weight` en attribut ne change PAS la face rendue — UIKit
    /// garde le même fichier de police et le canvas restait identique quand
    /// l'utilisateur tapait fin / semi-gras / gras. Pour elles on repasse par
    /// le font matching CoreText au niveau famille, qui sélectionne la face
    /// concrète la plus proche du poids demandé (Futura-Medium ↔ Futura-Bold,
    /// MarkerFelt-Thin ↔ MarkerFelt-Wide, ChalkboardSE-Light ↔ -Bold, …) —
    /// changement immédiatement visible sur le canvas. Les polices système
    /// (fontName préfixé ".") gardent le chemin par traits qui préserve le
    /// design rounded / serif / monospaced.
    private static func applyingWeightOverride(_ base: UIFont,
                                               override: StoryTextWeight?,
                                               size: CGFloat) -> UIFont {
        guard let override else { return base }
        if !base.fontName.hasPrefix(".") {
            let familyDescriptor = UIFontDescriptor(fontAttributes: [
                .family: base.familyName,
                .traits: [UIFontDescriptor.TraitKey.weight: override.uiFontWeight.rawValue]
            ])
            return UIFont(descriptor: familyDescriptor, size: size)
        }
        let traits: [UIFontDescriptor.TraitKey: Any] = [.weight: override.uiFontWeight.rawValue]
        let descriptor = base.fontDescriptor.addingAttributes([.traits: traits])
        return UIFont(descriptor: descriptor, size: size)
    }
}

extension StoryTextWeight {
    /// UIKit weight for this story weight. `fin`→thin, `gras`→bold.
    var uiFontWeight: UIFont.Weight {
        switch self {
        case .thin: return .thin
        case .normal: return .regular
        case .semibold: return .semibold
        case .bold: return .bold
        }
    }
}
