import Foundation
import MeeshySDK

// MARK: - Ce qu'un sticker DIT à VoiceOver (#4825)

/// Le canvas est rendu en `CALayer` : rien de ce qu'il montre n'est visible
/// d'UIAccessibility, et l'annonce de la scène doit donc être COMPOSÉE. Elle
/// disait les textes ; elle dit désormais les stickers — le nom du gabarit et
/// ses valeurs (« Cadran — 14:32 »), le glyphe d'un emoji, et le mouvement
/// d'une décoration animée (« qui bat »).
///
/// Construit À PART du dessin, comme `StickerPickerView.accessibilityLabel` :
/// une chaîne qui sert l'œil et l'oreille n'en sert qu'un.
public enum StoryStickerAccessibility {

    public static func description(for sticker: StorySticker) -> String {
        describing(base(for: sticker), motion: sticker.animation)
    }

    /// **Le site UNIQUE où un mouvement s'ajoute à une phrase** (#5000).
    ///
    /// La palette en a besoin comme la scène : une vignette animée doit se dire
    /// « Cadran — 14:32, qui palpite ». Le composer aurait pu recopier la
    /// ligne ; deux copies d'une même phrase divergent au premier libellé
    /// ajouté, chacune restant cohérente avec elle-même.
    public static func describing(_ base: String, motion: StickerAnimation?) -> String {
        withMotion(base, motion)
    }

    private static func base(for sticker: StorySticker) -> String {
        switch sticker.kind {
        case .template:
            guard let gabarit = StickerTemplateCatalog.template(id: sticker.templateId) else {
                return StickerPickerView.templateName(sticker.templateId)
            }
            return StickerPickerView.accessibilityLabel(for: gabarit, slots: sticker.slots)
        case .image:
            return String(localized: "story.sticker.library.a11y",
                          defaultValue: "Autocollant de votre bibliothèque", bundle: .module)
        case .emoji:
            return String(localized: "story.sticker.a11y",
                          defaultValue: "Autocollant \(sticker.wireEmoji)", bundle: .module)
        }
    }

    private static func withMotion(_ base: String, _ animation: StickerAnimation?) -> String {
        guard let animation else { return base }
        return "\(base), \(animation.localizedName)"
    }
}

extension StickerAnimation {
    /// Le mouvement, dit — pour VoiceOver et pour l'étiquette d'un réglage.
    /// Une clé LITTÉRALE par cas, comme les noms de gabarits.
    public var localizedName: String {
        switch self {
        case .pulse:
            return String(localized: "sticker.animation.pulse", defaultValue: "qui palpite", bundle: .module)
        case .heartbeat:
            return String(localized: "sticker.animation.heartbeat", defaultValue: "qui bat", bundle: .module)
        case .wobble:
            return String(localized: "sticker.animation.wobble", defaultValue: "qui oscille", bundle: .module)
        case .bounce:
            return String(localized: "sticker.animation.bounce", defaultValue: "qui rebondit", bundle: .module)
        case .float:
            return String(localized: "sticker.animation.float", defaultValue: "qui flotte", bundle: .module)
        case .spin:
            return String(localized: "sticker.animation.spin", defaultValue: "qui tourne", bundle: .module)
        case .blink:
            return String(localized: "sticker.animation.blink", defaultValue: "qui clignote", bundle: .module)
        case .shake:
            return String(localized: "sticker.animation.shake", defaultValue: "qui tremble", bundle: .module)
        case .swing:
            return String(localized: "sticker.animation.swing", defaultValue: "qui se balance", bundle: .module)
        case .pop:
            return String(localized: "sticker.animation.pop", defaultValue: "qui surgit", bundle: .module)
        case .tada:
            return String(localized: "sticker.animation.tada", defaultValue: "qui fait tada", bundle: .module)
        }
    }
}
