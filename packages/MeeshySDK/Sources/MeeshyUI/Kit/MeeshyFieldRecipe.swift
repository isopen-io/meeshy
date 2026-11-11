import SwiftUI

/// La saisie d'un champ de feuille : la table de K08, une ligne par `input`.
public nonisolated enum MeeshyFieldInput: String, Sendable, Equatable, CaseIterable {
    case search
    case token
    case sentence
    case paragraph
    case numeric
}

/// Le clavier logique ; l'hôte-vue le traduit en `UIKeyboardType` / `KeyboardType`.
public nonisolated enum MeeshyFieldKeyboard: String, Sendable, Equatable {
    case text
    case search
    case numbersAndPunctuation
}

/// La touche Retour : « Rechercher », « OK », ou une ligne de plus.
public nonisolated enum MeeshyFieldReturnKey: String, Sendable, Equatable {
    case done
    case search
    case newline
}

public nonisolated enum MeeshyFieldCapitalization: String, Sendable, Equatable {
    case none
    case sentences
}

public nonisolated enum MeeshyFieldInk: String, Sendable, Equatable {
    case onMedia
    case themeInk
}

public nonisolated enum MeeshyFieldCounterPlacement: String, Sendable, Equatable, CaseIterable {
    case inline
    case hosted
}

public nonisolated enum MeeshyFieldHaptic: String, Sendable, Equatable, CaseIterable {
    case standard
    case none
}

/// **La recette de K08 en VALEURS** : géométrie, opacités et table des `input`
/// vivent ici et nulle part ailleurs. Un `View` ne s'inspecte pas, sa recette si.
public nonisolated struct MeeshyFieldRecipe: Sendable, Equatable {
    /// Le fond du champ : l'encre à 8 %, sans bord.
    public static let fillInkOpacity: Double = MeeshyOpacity.subtle
    /// L'invite, la tête et le compteur à 70 %.
    public static let mutedOpacity: Double = MeeshyOpacity.heavy
    /// Le filet sous « augmenter le contraste ».
    public static let hairlineEmphasisOpacity: Double = 0.6
    /// Le contenu désactivé.
    public static let disabledOpacity: Double = 0.4
    /// Au-delà de cette part du plafond, le compteur passe en alerte.
    public static let nearLimitRatio: Double = 0.8
    /// Hauteur d'une ligne de saisie (planche : 45).
    public static let lineHeight: Double = 45
    /// Le fondu de la croix, de la roue et du compteur.
    public static let fadeDuration: Double = 0.15

    public let keyboard: MeeshyFieldKeyboard
    public let returnKey: MeeshyFieldReturnKey
    public let autocorrects: Bool
    public let capitalization: MeeshyFieldCapitalization
    public let lineRange: ClosedRange<Int>
    public let fillOpacity: Double
    public let contentOpacity: Double
    public let hairlineOpacity: Double?
    public let ink: MeeshyFieldInk
    public let minimumHeight: CGFloat

    public static func resolve(input: MeeshyFieldInput,
                               hasCaption: Bool,
                               tone: MeeshyGlassTone?,
                               isEnabled: Bool,
                               increasedContrast: Bool) -> MeeshyFieldRecipe {
        let row = Self.row(for: input)
        return MeeshyFieldRecipe(
            keyboard: row.keyboard,
            returnKey: row.returnKey,
            autocorrects: row.autocorrects,
            capitalization: row.capitalization,
            lineRange: row.lineRange,
            fillOpacity: fillInkOpacity,
            contentOpacity: isEnabled ? 1 : disabledOpacity,
            hairlineOpacity: increasedContrast ? hairlineEmphasisOpacity : nil,
            ink: tone == .theme ? .themeInk : .onMedia,
            minimumHeight: max(CGFloat(lineHeight), MeeshyControlSize.tapTarget)
        )
    }

    /// L'invite n'existe que champ vide et sans légende (loi 13).
    public static func showsPrompt(text: String, caption: String?) -> Bool {
        text.isEmpty && caption == nil
    }

    /// La croix n'existe que dans `search`, avec du texte, hors occupation.
    public static func showsClear(input: MeeshyFieldInput, text: String, isBusy: Bool, isEnabled: Bool) -> Bool {
        input == .search && !text.isEmpty && !isBusy && isEnabled
    }

    /// Le compteur en ligne : une limite, du texte, et le placement `inline`.
    public static func showsInlineCounter(limit: Int?, text: String, placement: MeeshyFieldCounterPlacement) -> Bool {
        limit != nil && !text.isEmpty && placement == .inline
    }

    private struct Row {
        let keyboard: MeeshyFieldKeyboard
        let returnKey: MeeshyFieldReturnKey
        let autocorrects: Bool
        let capitalization: MeeshyFieldCapitalization
        let lineRange: ClosedRange<Int>
    }

    private static func row(for input: MeeshyFieldInput) -> Row {
        switch input {
        case .search:
            return Row(keyboard: .search, returnKey: .search, autocorrects: false, capitalization: .none, lineRange: 1...1)
        case .token:
            return Row(keyboard: .text, returnKey: .done, autocorrects: false, capitalization: .none, lineRange: 1...1)
        case .sentence:
            return Row(keyboard: .text, returnKey: .done, autocorrects: true, capitalization: .sentences, lineRange: 1...1)
        case .paragraph:
            return Row(keyboard: .text, returnKey: .newline, autocorrects: true, capitalization: .sentences, lineRange: 3...6)
        case .numeric:
            return Row(keyboard: .numbersAndPunctuation, returnKey: .done, autocorrects: false, capitalization: .none, lineRange: 1...1)
        }
    }
}

/// La loi du plafond : compte en unités UTF-16, troncature sur une frontière de
/// graphème, seuil d'alerte à 80 %. Pure, sans ton ni vue.
public nonisolated enum MeeshyFieldLimit {
    public static func count(_ text: String) -> Int {
        text.utf16.count
    }

    /// Le plus long préfixe de graphèmes entiers dont le compte tient dans `limit`.
    public static func truncate(_ text: String, to limit: Int) -> String {
        var kept = ""
        var used = 0
        for grapheme in text {
            let width = String(grapheme).utf16.count
            guard used + width <= limit else { break }
            kept.append(grapheme)
            used += width
        }
        return kept
    }

    public static func isNear(count: Int, limit: Int) -> Bool {
        Double(count) >= Double(limit) * MeeshyFieldRecipe.nearLimitRatio
    }
}
