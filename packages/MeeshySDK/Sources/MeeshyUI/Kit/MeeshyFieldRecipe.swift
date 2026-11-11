import SwiftUI

/// La saisie d'un champ de feuille : la table de K08, une ligne par `input`.
public nonisolated enum MeeshyFieldInput: String, Sendable, Equatable, CaseIterable {
    case search
    case token
    case sentence
    case paragraph
    case numeric
}

/// Le clavier logique ; la vue le traduit en `UIKeyboardType`.
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

/// L'encre du champ : blanche sur le média et le verre (`plain`, `deep`),
/// sombre sur un verre clair (`onLight`), celle du thème hors média (`theme`).
public nonisolated enum MeeshyFieldInk: String, Sendable, Equatable, CaseIterable {
    case onMedia
    case onLight
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
    /// L'invite, la tête, la légende et le compteur à 70 %.
    public static let mutedOpacity: Double = MeeshyOpacity.heavy
    /// Le filet sous « augmenter le contraste ».
    public static let hairlineEmphasisOpacity: Double = 0.6
    /// Le contenu désactivé.
    public static let disabledOpacity: Double = 0.4
    /// À partir de cette part du plafond, le compteur passe en alerte.
    public static let nearLimitRatio: Double = 0.8
    /// Hauteur d'une ligne de saisie (planche : 45).
    public static let lineHeight: Double = 45
    /// Hauteur minimale d'un paragraphe (O9 : 110).
    public static let paragraphMinimumHeight: Double = 110
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
    public let verticalPadding: CGFloat
    public let horizontalPadding: CGFloat
    public let captionSpacing: CGFloat
    public let valueSize: CGFloat
    public let valueIsBold: Bool
    public let offersClear: Bool

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
            ink: Self.ink(for: tone),
            minimumHeight: input == .paragraph
                ? CGFloat(paragraphMinimumHeight)
                : max(CGFloat(lineHeight), MeeshyControlSize.tapTarget),
            verticalPadding: input == .numeric ? MeeshySpacing.smPlus : MeeshySpacing.md,
            horizontalPadding: MeeshySpacing.mdPlus,
            captionSpacing: hasCaption ? (input == .numeric ? MeeshySpacing.xxs : MeeshySpacing.xsPlus) : 0,
            valueSize: input == .numeric ? MeeshyFont.title3Size : MeeshyFont.bodySize,
            valueIsBold: input == .numeric,
            offersClear: input == .search
        )
    }

    /// L'encre d'un ton : `onLight` fonce l'encre, `theme` prend celle du thème,
    /// tout autre ton garde l'encre du média.
    public static func ink(for tone: MeeshyGlassTone?) -> MeeshyFieldInk {
        switch tone {
        case .onLight: return .onLight
        case .theme: return .themeInk
        case .plain, .deep, nil: return .onMedia
        }
    }

    public func inkColor(isDark: Bool) -> Color {
        switch ink {
        case .onMedia: return MeeshyColors.onMedia
        case .onLight: return MeeshyColors.textPrimary(isDark: false)
        case .themeInk: return MeeshyColors.textPrimary(isDark: isDark)
        }
    }

    /// L'alerte du compteur : `error` sur une encre claire, `errorStrong` sur
    /// une encre sombre, où `error` tombe sous 4,5:1.
    public func alertColor(isDark: Bool) -> Color {
        switch ink {
        case .onMedia: return MeeshyColors.error
        case .onLight: return MeeshyColors.errorStrong
        case .themeInk: return isDark ? MeeshyColors.error : MeeshyColors.errorStrong
        }
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

/// Un franchissement du plafond : l'entrée dans les 80 %, ou le plafond atteint.
public nonisolated enum MeeshyFieldLimitCrossing: String, Sendable, Equatable, CaseIterable {
    case near
    case reached
}

/// La loi du plafond : compte en unités UTF-16, troncature sur une frontière de
/// graphème, seuil d'alerte à 80 %. Pure, sans ton ni vue.
public nonisolated enum MeeshyFieldLimit {
    public static func count(_ text: String) -> Int {
        text.utf16.count
    }

    /// Le plus long préfixe de graphèmes entiers dont le compte tient dans `limit`.
    public static func truncate(_ text: String, to limit: Int) -> String {
        guard count(text) > limit else { return text }
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

    /// Le franchissement MONTANT entre deux comptes : une fois par passage,
    /// jamais en redescendant ; le plafond l'emporte sur les 80 %.
    public static func crossing(from previous: Int, to next: Int, limit: Int) -> MeeshyFieldLimitCrossing? {
        if previous < limit, next >= limit { return .reached }
        if !isNear(count: previous, limit: limit), isNear(count: next, limit: limit) { return .near }
        return nil
    }
}

/// Une frappe lue par le registre : la valeur que le champ doit montrer, si elle
/// a été coupée au plafond, si elle part chez l'hôte, et le franchissement.
public nonisolated struct MeeshyFieldEdit: Sendable, Equatable {
    public let value: String
    public let wasTruncated: Bool
    public let emits: Bool
    public let crossing: MeeshyFieldLimitCrossing?

    public init(value: String, wasTruncated: Bool, emits: Bool, crossing: MeeshyFieldLimitCrossing?) {
        self.value = value
        self.wasTruncated = wasTruncated
        self.emits = emits
        self.crossing = crossing
    }
}

/// **L'état du brouillon en VALEURS** : ce que le champ a rendu à l'hôte
/// (`emitted`) et ce qu'il a validé (`committed`). La vue garde le texte affiché
/// et le curseur ; ce registre décide qui parle et quand.
///
/// - `receive` : une frappe ; l'écho de ce qu'on vient d'émettre ne rappelle rien,
///   une frappe au-delà du plafond est coupée sans rien émettre de neuf.
/// - `resync` : un `text` venu de l'hôte (annulation, normalisation) remplace le
///   brouillon, et n'est pas un pas d'annulation à rendre.
/// - `commit` : une seule fois par valeur changée depuis le dernier commit.
public nonisolated struct MeeshyFieldLedger: Sendable, Equatable {
    public private(set) var emitted: String
    public private(set) var committed: String

    public init(_ text: String) {
        emitted = text
        committed = text
    }

    public mutating func receive(_ next: String, limit: Int?) -> MeeshyFieldEdit? {
        guard next != emitted else { return nil }
        let bounded = limit.map { MeeshyFieldLimit.truncate(next, to: $0) } ?? next
        let wasTruncated = bounded != next
        guard bounded != emitted else {
            return MeeshyFieldEdit(value: bounded, wasTruncated: wasTruncated, emits: false, crossing: nil)
        }
        let crossing = limit.flatMap {
            MeeshyFieldLimit.crossing(from: MeeshyFieldLimit.count(emitted), to: MeeshyFieldLimit.count(bounded), limit: $0)
        }
        emitted = bounded
        return MeeshyFieldEdit(value: bounded, wasTruncated: wasTruncated, emits: true, crossing: crossing)
    }

    public mutating func resync(external: String) -> Bool {
        guard external != emitted else { return false }
        emitted = external
        committed = external
        return true
    }

    public mutating func commit(_ draft: String) -> String? {
        guard draft != committed else { return nil }
        committed = draft
        return draft
    }
}

/// Les mots du champ : la croix, le compteur écrit et dit, le plafond,
/// l'occupation. `bundle` choisit la table, `locale` ses règles et ses chiffres.
public enum MeeshyFieldWords {

    /// « 17 / 60 » : l'écriture de la planche, dans les chiffres du lecteur.
    public nonisolated static func counter(count: Int, limit: Int, locale: Locale = .current) -> String {
        let style = IntegerFormatStyle<Int>(locale: locale).grouping(.never)
        return "\(style.format(count)) / \(style.format(limit))"
    }

    /// « 17 caractères sur 60 », nombres dans les chiffres du lecteur.
    public static func spokenCount(count: Int, limit: Int, bundle: Bundle? = nil, locale: Locale = .current) -> String {
        let style = IntegerFormatStyle<Int>(locale: locale).grouping(.never)
        let current = style.format(count)
        let ceiling = style.format(limit)
        return String(
            localized: "kit.field.count",
            defaultValue: "\(current) caractères sur \(ceiling)",
            bundle: bundle ?? .module,
            locale: locale
        )
    }

    public static func clear(bundle: Bundle? = nil, locale: Locale = .current) -> String {
        String(localized: "kit.field.clear", defaultValue: "Effacer", bundle: bundle ?? .module, locale: locale)
    }

    public static func limitReached(bundle: Bundle? = nil, locale: Locale = .current) -> String {
        String(localized: "kit.field.limit_reached", defaultValue: "Limite de caractères atteinte",
               bundle: bundle ?? .module, locale: locale)
    }

    public static func busy(bundle: Bundle? = nil, locale: Locale = .current) -> String {
        String(localized: "kit.field.busy", defaultValue: "En cours", bundle: bundle ?? .module, locale: locale)
    }

    /// Ce qu'un franchissement annonce, une fois, poliment.
    public static func announcement(for crossing: MeeshyFieldLimitCrossing,
                                    count: Int,
                                    limit: Int,
                                    bundle: Bundle? = nil,
                                    locale: Locale = .current) -> String {
        switch crossing {
        case .near: return spokenCount(count: count, limit: limit, bundle: bundle, locale: locale)
        case .reached: return limitReached(bundle: bundle, locale: locale)
        }
    }
}
