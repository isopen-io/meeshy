import Foundation
import MeeshySDK

/// **« Ce qui reste à débloquer » en une ligne** (S21 #11276, lot IC28 #11306) — les clauses viennent du
/// SDK (`PackRequirementPreview.clauses`, pures et testées), les phrases d'ici. Le nom d'un rang est celui
/// du jeu, que l'app possède : sans lui, la ligne dit la Gloire manquante. Miroir de
/// `apps/web/src/lib/packs/unlock-line.ts`.
enum PackUnlockCopy {

    static var lockedTitle: String {
        String(localized: "shop.locked", defaultValue: "À débloquer", bundle: .module)
    }

    static func line(_ preview: PackRequirementPreview, language: String,
                     rankName: ((GloryRank) -> String)?) -> String? {
        let parts = preview.clauses.map { text($0, language: language, rankName: rankName) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    static func text(_ clause: PackUnlockClause, language: String, rankName: ((GloryRank) -> String)?) -> String {
        switch clause {
        case .rank(let rank, let missing):
            guard let rankName else { return text(.glory(missing: missing), language: language, rankName: nil) }
            return String(format: String(localized: "shop.unlock.rank", defaultValue: "Rang %1$@ — Gloire manquante : %2$@", bundle: .module),
                          rankName(rank), formatCount(missing, language: language))
        case .glory(let missing):
            return String(format: String(localized: "shop.unlock.glory", defaultValue: "Gloire manquante : %@", bundle: .module),
                          formatCount(missing, language: language))
        case .trophy:
            return String(localized: "shop.unlock.trophy", defaultValue: "Se gagne avec un trophée", bundle: .module)
        case .season(let number):
            return String(format: String(localized: "shop.unlock.season", defaultValue: "Récompense de la saison %lld", bundle: .module), number)
        case .upcoming(let date):
            return String(format: String(localized: "shop.unlock.upcoming", defaultValue: "Disponible à partir du %@", bundle: .module),
                          formatDate(date, language: language))
        case .until(let date):
            return String(format: String(localized: "shop.unlock.until", defaultValue: "Disponible jusqu’au %@", bundle: .module),
                          formatDate(date, language: language))
        case .closed:
            return String(localized: "shop.unlock.closed", defaultValue: "N’est plus proposé", bundle: .module)
        }
    }

    /// Chiffres latins en arabe, comme le web (`ar-u-nu-latn`) : un nombre se lit pareil partout.
    private static func locale(_ language: String) -> Locale {
        Locale(identifier: language == "ar" ? "ar-u-nu-latn" : language)
    }

    /// Les styles de format sont mis en cache par Foundation : une rangée redessinée n'alloue aucun formateur.
    static func formatCount(_ value: Int, language: String) -> String {
        value.formatted(.number.locale(locale(language)))
    }

    static func formatDate(_ date: Date, language: String) -> String {
        date.formatted(.dateTime.day().month(.wide).locale(locale(language)))
    }
}
