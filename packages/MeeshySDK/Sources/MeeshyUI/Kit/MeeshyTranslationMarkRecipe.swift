import SwiftUI

/// Les trois densités : le glyphe seul devant un aperçu, la ligne sous un texte, la
/// légende de verre sur un média.
public nonisolated enum MeeshyTranslationMarkDensity: String, Sendable, Equatable, CaseIterable {
    case icon
    case line
    case legend
}

/// Les trois modes : la traduction est servie, l'original est servi, ou l'annonce d'avant l'envoi.
public nonisolated enum MeeshyTranslationMarkMode: String, Sendable, Equatable, CaseIterable {
    case translated
    case original
    case announce
}

/// **La recette de K51 en VALEURS** : mesures, graisses, bascule, fondu. Aucune
/// couleur, aucun état : l'hôte remet `isShowingOriginal`, la marque annonce ce que
/// l'hôte rend et ne résout rien.
public nonisolated struct MeeshyTranslationMarkRecipe: Sendable, Equatable {

    /// En deçà de cette largeur, le point s'en va et la bascule passe sous la mention.
    public static let narrowWidth: Double = 320
    public static let pressedScale: Double = 0.94
    public static let pressedInkOpacity: Double = 0.62

    public let glyphSize: Double
    public let textSize: Double
    public let mentionWeight: Int
    public let toggleWeight: Int
    public let separatorSpacing: Double
    public let tapTarget: Double
    public let showsMention: Bool
    public let showsToggle: Bool
    public let showsSeparator: Bool
    public let wrapsToggle: Bool
    public let glyphIsMuted: Bool
    public let toggleScale: Double
    public let toggleInkOpacity: Double
    public let toggleOpacity: Double
    public let acceptsToggle: Bool
    public let crossfadeMilliseconds: Int

    public static func resolve(density: MeeshyTranslationMarkDensity,
                               mode: MeeshyTranslationMarkMode,
                               hasToggle: Bool,
                               isPressed: Bool,
                               isPending: Bool,
                               width: Double,
                               reduceMotion: Bool) -> MeeshyTranslationMarkRecipe {
        let showsToggle = hasToggle && mode != .announce && density != .icon
        let wraps = showsToggle && width < narrowWidth
        return MeeshyTranslationMarkRecipe(
            glyphSize: 16,
            textSize: mode == .announce ? 13 : 12.5,
            mentionWeight: 400,
            toggleWeight: 700,
            separatorSpacing: 7,
            tapTarget: 44,
            showsMention: density != .icon,
            showsToggle: showsToggle,
            showsSeparator: showsToggle && !wraps,
            wrapsToggle: wraps,
            glyphIsMuted: mode == .original,
            toggleScale: showsToggle && isPressed ? pressedScale : 1,
            toggleInkOpacity: showsToggle && isPressed ? pressedInkOpacity : 1,
            toggleOpacity: isPending ? 0.5 : 1,
            acceptsToggle: showsToggle && !isPending,
            crossfadeMilliseconds: reduceMotion ? 0 : 200
        )
    }

    /// Le mode se déduit du booléen de l'hôte ; `announce` se passe explicitement.
    public static func resolveMode(_ explicit: MeeshyTranslationMarkMode?, isShowingOriginal: Bool) -> MeeshyTranslationMarkMode {
        explicit ?? (isShowingOriginal ? .original : .translated)
    }
}

/// Les mots dits : le nom de langue est donné, déjà accordé, par l'hôte ; la marque ne
/// le recompose jamais.
public nonisolated enum MeeshyTranslationMarkWords {

    /// « Traduit de l'italien » / « Original en italien » ; sans langue : « Traduit » / « Original ».
    public static func mention(mode: MeeshyTranslationMarkMode, languageName: String?,
                               bundle: Bundle? = nil, locale: Locale = .current) -> String {
        let bundle = bundle ?? .module
        let name = languageName ?? ""
        if mode == .original {
            guard !name.isEmpty else {
                return String(localized: "kit.translation_mark.original", defaultValue: "Original", bundle: bundle, locale: locale)
            }
            return String(localized: "kit.translation_mark.original_from", defaultValue: "Original \(name)", bundle: bundle, locale: locale)
        }
        guard !name.isEmpty else {
            return String(localized: "kit.translation_mark.translated", defaultValue: "Traduit", bundle: bundle, locale: locale)
        }
        return String(localized: "kit.translation_mark.translated_from", defaultValue: "Traduit \(name)", bundle: bundle, locale: locale)
    }

    /// Le verbe de la bascule : l'original quand la traduction est servie, et inversement.
    public static func toggle(mode: MeeshyTranslationMarkMode, bundle: Bundle? = nil, locale: Locale = .current) -> String {
        mode == .original
            ? String(localized: "kit.translation_mark.show_translation", defaultValue: "Voir la traduction",
                     bundle: bundle ?? .module, locale: locale)
            : String(localized: "kit.translation_mark.show_original", defaultValue: "Voir l'original",
                     bundle: bundle ?? .module, locale: locale)
    }

    /// La valeur du bouton : ce qui est affiché en ce moment.
    public static func toggleValue(mode: MeeshyTranslationMarkMode, bundle: Bundle? = nil, locale: Locale = .current) -> String {
        mode == .original
            ? String(localized: "kit.translation_mark.value_original", defaultValue: "original affiché",
                     bundle: bundle ?? .module, locale: locale)
            : String(localized: "kit.translation_mark.value_translated", defaultValue: "traduction affichée",
                     bundle: bundle ?? .module, locale: locale)
    }
}
