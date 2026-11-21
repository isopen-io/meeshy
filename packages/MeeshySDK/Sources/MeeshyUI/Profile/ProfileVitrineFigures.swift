import Foundation
import MeeshySDK

/// **« En chiffres » de la Vitrine** (#18870, planche `Autre-Vitrine`) : les quatre nombres de la fiche — messages,
/// traductions, langues, jours — sont la bande du kit (K34), jamais des pastilles redessinées (loi 12).
///
/// Les valeurs arrivent déjà écrites par la langue courante (« 8 902 ») ; sans statistiques servies, aucune valeur :
/// le kit dessine son squelette pendant le chargement, et la bande ne se montre pas une fois le chargement fini.
enum ProfileVitrineFigures {

    static var messagesUnit: String {
        String(localized: "profile.stats.messagesShort", defaultValue: "Messages", bundle: .module)
    }

    static var translationsUnit: String {
        String(localized: "profile.stats.translationsShort", defaultValue: "Traductions", bundle: .module)
    }

    static var languagesUnit: String {
        String(localized: "profile.stats.languagesShort", defaultValue: "Langues", bundle: .module)
    }

    static var daysUnit: String {
        String(localized: "profile.stats.daysShort", defaultValue: "Jours", bundle: .module)
    }

    /// Ce que le lecteur d'écran dit d'un chiffre absent : le tiret du kit ne se prononce pas.
    static var emptyLabel: String {
        String(localized: "profile.stats.empty", defaultValue: "Aucune donnée", bundle: .module)
    }

    static func items(of stats: UserStats?, locale: Locale = .current) -> [MeeshyFigureItem] {
        let pairs: [(Int?, String)] = [
            (stats?.totalMessages, messagesUnit),
            (stats?.totalTranslations, translationsUnit),
            (stats?.languagesUsed, languagesUnit),
            (stats?.memberDays, daysUnit)
        ]
        return pairs.map { value, unit in
            MeeshyFigureItem(value: value.map { $0.formatted(.number.locale(locale)) }, unit: unit)
        }
    }

    static func isVisible(stats: UserStats?, isLoading: Bool) -> Bool {
        stats != nil || isLoading
    }
}
