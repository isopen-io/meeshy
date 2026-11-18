import Foundation
import MeeshySDK
import MeeshyUI

/// Mes langues du Prisme, dans leur ORDRE : la principale, le 2e choix, le 3e choix. La liste est la forme que
/// la fiche montre et réordonne ; les trois champs (`systemLanguage`, `regionalLanguage`,
/// `customDestinationLanguage`) en sont la projection, toujours réécrits ensemble et sans trou : un rang vide
/// ne reste jamais entre deux langues, et une langue n'occupe jamais deux rangs.
nonisolated struct ProfilePrismLanguages: Equatable, Sendable {
    static let capacity = 3

    let codes: [String]

    init(system: String, regional: String, custom: String) {
        codes = Self.compacted([system, regional, custom])
    }

    private init(codes: [String]) {
        self.codes = Self.compacted(codes)
    }

    var system: String { code(at: 0) }
    var regional: String { code(at: 1) }
    var custom: String { code(at: 2) }

    /// Il reste un rang libre : « Ajouter une langue » ouvre le sélecteur sur lui.
    var canAdd: Bool { codes.count < Self.capacity }

    /// Glisser (ou « monter » / « descendre ») la langue d'un rang vers un autre : les trois champs suivent.
    func moving(from: Int, to: Int) -> ProfilePrismLanguages {
        ProfilePrismLanguages(codes: MeeshyReorder.move(codes, from: from, to: to))
    }

    /// Le sélecteur rend une langue pour un rang. Une langue déjà présente ailleurs échange sa place avec celle du
    /// rang choisi ; une chaîne vide retire la langue du rang, sauf la principale, qui ne se retire pas.
    func choosing(_ code: String, at rank: Int) -> ProfilePrismLanguages {
        guard rank >= 0, rank < Self.capacity else { return self }
        if code.isEmpty {
            guard rank > 0, rank < codes.count else { return self }
            return ProfilePrismLanguages(codes: codes.enumerated().filter { $0.offset != rank }.map(\.element))
        }
        let slots = (0..<Self.capacity).map { self.code(at: $0) }
        let previous = slots[rank]
        let swapped = slots.enumerated().map { index, current -> String in
            if index == rank { return code }
            return current == code ? previous : current
        }
        return ProfilePrismLanguages(codes: swapped)
    }

    private func code(at rank: Int) -> String {
        codes.indices.contains(rank) ? codes[rank] : ""
    }

    private static func compacted(_ codes: [String]) -> [String] {
        let filled = codes.filter { !$0.isEmpty }
        let distinct = filled.enumerated().filter { !filled.prefix($0.offset).contains($0.element) }.map(\.element)
        return Array(distinct.prefix(capacity))
    }
}

/// Le rang ouvert dans le sélecteur : celui d'une rangée touchée, ou le premier rang libre.
nonisolated struct ProfilePrismRank: Identifiable, Equatable, Sendable {
    let rank: Int
    var id: Int { rank }
}

/// Ce que la fiche rend de mes langues : au repos, des puces à lire ; en édition, la liste à ordonner.
nonisolated enum ProfilePrismLanguagesMode: Equatable, Sendable {
    case chips
    case reorderable

    static func resolve(isEditing: Bool) -> ProfilePrismLanguagesMode {
        isEditing ? .reorderable : .chips
    }
}

/// Une puce de langue au repos : le nom de la langue dans la langue de l'interface, le glyphe translate sur la
/// principale seulement (planche `Main`).
nonisolated struct ProfileLanguageChip: Equatable, Sendable, Identifiable {
    let code: String
    let name: String
    let isPrimary: Bool
    var id: String { code }

    static func make(_ languages: ProfilePrismLanguages, locale: Locale) -> [ProfileLanguageChip] {
        languages.codes.enumerated().map { index, code in
            ProfileLanguageChip(code: code, name: displayName(of: code, locale: locale), isPrimary: index == 0)
        }
    }

    /// La langue dans laquelle l'app me parle : le nom d'une langue se dit dans la même langue que la fiche.
    static var interfaceLocale: Locale {
        Locale(identifier: Bundle.main.preferredLocalizations.first ?? "fr")
    }

    static func displayName(of code: String, locale: Locale) -> String {
        if let name = locale.localizedString(forLanguageCode: code), !name.isEmpty {
            return name.prefix(1).uppercased(with: locale) + name.dropFirst()
        }
        return LanguageData.info(for: code)?.nativeName ?? code
    }
}

nonisolated enum ProfilePrismCopy {
    static var title: String {
        String(localized: "profile.language.prism.title", defaultValue: "Langues du Prisme", bundle: .main)
    }

    static var chipsLabel: String {
        String(localized: "profile.language.chips.label", defaultValue: "Mes langues", bundle: .main)
    }

    static var intro: String {
        String(localized: "profile.language.intro",
               defaultValue: "Meeshy te montre tout dans ta langue principale, sinon dans la suivante.", bundle: .main)
    }

    static var add: String {
        String(localized: "profile.language.add", defaultValue: "Ajouter une langue", bundle: .main)
    }

    static func rankTag(_ rank: Int) -> String {
        switch rank {
        case 0: return String(localized: "profile.language.primary.rank", defaultValue: "Principale", bundle: .main)
        case 1: return String(localized: "profile.language.regional.rank", defaultValue: "2e choix", bundle: .main)
        default: return String(localized: "profile.language.custom.rank", defaultValue: "3e choix", bundle: .main)
        }
    }

    static func pickerTitle(_ rank: Int) -> String {
        switch rank {
        case 0: return String(localized: "profile.language.primary", defaultValue: "Langue principale", bundle: .main)
        case 1: return String(localized: "profile.language.regional", defaultValue: "Langue régionale", bundle: .main)
        default: return String(localized: "profile.language.custom", defaultValue: "Langue personnalisée", bundle: .main)
        }
    }

    static func handle(_ name: String) -> String {
        let format = String(localized: "profile.language.move", defaultValue: "Déplacer %@", bundle: .main)
        return String(format: format, name)
    }

    static var moveUp: String {
        String(localized: "profile.language.moveUp", defaultValue: "Monter", bundle: .main)
    }

    static var moveDown: String {
        String(localized: "profile.language.moveDown", defaultValue: "Descendre", bundle: .main)
    }

    static func announce(_ name: String, rank: Int, count: Int) -> String {
        let format = String(localized: "profile.language.announce", defaultValue: "%1$@, rang %2$@ sur %3$@", bundle: .main)
        return String(format: format, name, rank.formatted(), count.formatted())
    }
}
