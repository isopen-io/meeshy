import Foundation

/// Le salut pré-rempli de la carte « Dis salut au monde ».
///
/// **Pas un texte fixe, huit gabarits par langue** : cent nouveaux venus qui
/// envoient le même « Salut ! » font un mur de doublons dans Meeshy Global.
/// Chaque gabarit porte un TROU PERSONNEL — le prénom, les langues parlées —
/// déjà rempli, pour que le message parte tel quel si on ne le modifie pas, et
/// reste modifiable avant l'envoi.
///
/// Les gabarits vivent au catalogue (`onboarding.greeting.1…8`, sept langues),
/// écrits en clés LITTÉRALES : une clé composée à l'exécution échapperait aux
/// gardes qui vérifient que chaque clé utilisée existe au catalogue.
enum OnboardingGreeting {
    static let templateCount = 8

    private static func template(at index: Int) -> String {
        switch index {
        case 0: return String(localized: "onboarding.greeting.1", bundle: .main)
        case 1: return String(localized: "onboarding.greeting.2", bundle: .main)
        case 2: return String(localized: "onboarding.greeting.3", bundle: .main)
        case 3: return String(localized: "onboarding.greeting.4", bundle: .main)
        case 4: return String(localized: "onboarding.greeting.5", bundle: .main)
        case 5: return String(localized: "onboarding.greeting.6", bundle: .main)
        case 6: return String(localized: "onboarding.greeting.7", bundle: .main)
        default: return String(localized: "onboarding.greeting.8", bundle: .main)
        }
    }

    /// `%1$@` = le prénom, `%2$@` = les langues parlées, déjà jointes.
    static func compose(templateIndex: Int, name: String, languageNames: [String]) -> String {
        let languages = ListFormatter.localizedString(byJoining: languageNames)
        return String(format: template(at: templateIndex), locale: interfaceLocale, name, languages)
    }

    /// La langue dans laquelle les gabarits sont RÉELLEMENT servis — celle que
    /// le bundle a résolue, pas celle du profil. C'est elle que le message
    /// déclare comme langue d'origine tant qu'il n'a pas été réécrit.
    static var contentLanguage: String {
        let resolved = Bundle.main.preferredLocalizations.first ?? "fr"
        return String(resolved.split(separator: "-").first ?? "fr")
    }

    static var interfaceLocale: Locale {
        Locale(identifier: Bundle.main.preferredLocalizations.first ?? "fr")
    }

    /// Le nom d'une langue, dans la langue de l'interface (« espagnol »,
    /// « Spanish », « الإسبانية »).
    static func languageName(for code: String) -> String {
        interfaceLocale.localizedString(forLanguageCode: code) ?? code
    }
}
