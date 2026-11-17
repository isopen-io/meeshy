import Foundation
import MeeshySDK

/// Les mots de « Mes adresses » (#18871, planche `Mes-Adresses`).
nonisolated enum MyAddressesCopy {
    static var intro: String {
        String(localized: "profile.addresses.intro", defaultValue: "Ces adresses apparaissent sur ta vitrine. Tu choisis qui les voit.", bundle: .main)
    }
    static func summary(count: Int, clicks: Int) -> String {
        let format = String(localized: "profile.addresses.summary", defaultValue: "%1$@ adresses · %2$@ clics", bundle: .main)
        return String(format: format, count.formatted(), clicks.formatted())
    }
    static var emptyTitle: String {
        String(localized: "profile.addresses.empty.title", defaultValue: "Ajoute ton site, ta musique, tes photos", bundle: .main)
    }
    static var show: String {
        String(localized: "profile.addresses.show", defaultValue: "Afficher sur ma vitrine", bundle: .main)
    }
    static var whoSees: String {
        String(localized: "profile.addresses.whoSees", defaultValue: "Qui la voit", bundle: .main)
    }
    static func clicks(_ count: Int) -> String {
        let format = String(localized: "profile.addresses.clicks", defaultValue: "%@ clics", bundle: .main)
        return String(format: format, count.formatted())
    }
    static var remove: String { String(localized: "profile.addresses.remove", defaultValue: "Retirer", bundle: .main) }
    static func removeConfirm(_ title: String) -> String {
        let format = String(localized: "profile.addresses.removeConfirm", defaultValue: "Retirer « %@ » de ta vitrine ?", bundle: .main)
        return String(format: format, title)
    }
    static var titleField: String {
        String(localized: "profile.addresses.titleField", defaultValue: "Titre de l'adresse", bundle: .main)
    }
    static var addTitle: String {
        String(localized: "profile.addresses.add.title", defaultValue: "Ajouter une adresse", bundle: .main)
    }
    static var urlLabel: String { String(localized: "profile.addresses.add.url", defaultValue: "Adresse", bundle: .main) }
    static var urlPrompt: String {
        String(localized: "profile.addresses.add.urlPrompt", defaultValue: "ton-site.com", bundle: .main)
    }
    static var urlInvalid: String {
        String(localized: "profile.addresses.add.urlInvalid", defaultValue: "Une adresse web publique, en http ou https", bundle: .main)
    }
    static var titleLabel: String { String(localized: "profile.addresses.add.titleLabel", defaultValue: "Titre", bundle: .main) }
    static var glyphLabel: String { String(localized: "profile.addresses.add.glyph", defaultValue: "Icône", bundle: .main) }
    static var countClicks: String {
        String(localized: "profile.addresses.add.count", defaultValue: "Compter les clics", bundle: .main)
    }
    static var countClicksDetail: String {
        String(localized: "profile.addresses.add.countDetail", defaultValue: "Crée un lien de suivi meeshy.me/l/…", bundle: .main)
    }
    static var limitReached: String {
        String(localized: "profile.addresses.add.limit", defaultValue: "12 adresses au plus", bundle: .main)
    }
    static var leaving: String {
        String(localized: "profile.addresses.leaving", defaultValue: "Les visiteurs voient un avertissement avant de quitter Meeshy.", bundle: .main)
    }
    static func handle(_ title: String) -> String {
        let format = String(localized: "profile.addresses.move", defaultValue: "Déplacer l'adresse %@", bundle: .main)
        return String(format: format, title)
    }
    static var moveUp: String { String(localized: "profile.addresses.moveUp", defaultValue: "Monter", bundle: .main) }
    static var moveDown: String { String(localized: "profile.addresses.moveDown", defaultValue: "Descendre", bundle: .main) }
    static func announce(_ title: String, rank: Int, count: Int) -> String {
        let format = String(localized: "profile.addresses.announce", defaultValue: "%1$@, rang %2$@ sur %3$@", bundle: .main)
        return String(format: format, title, rank.formatted(), count.formatted())
    }
    static var listLabel: String {
        String(localized: "profile.addresses.list", defaultValue: "Mes adresses, dans l'ordre de ma vitrine", bundle: .main)
    }
}
