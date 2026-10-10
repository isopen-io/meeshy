import Foundation

/// Les mots de l'entrée sans compte dans World Wide (#10006) — ceux de la
/// planche « Login » et « Onboarding », mêmes étapes et mêmes mots que le web.
/// Le titre de la conversation n'est jamais écrit ici : il vient de `GET /world`.
enum WorldGuestEntryCopy {

    static func enterTitle(_ worldTitle: String) -> String {
        String(format: String(localized: "worldEntry.enter", defaultValue: "Entrer dans %@", bundle: .main), worldTitle)
    }

    static var cardSubtitle: String {
        String(localized: "worldEntry.card.subtitle", defaultValue: "Sans compte · votre nom et votre langue", bundle: .main)
    }

    static var withAccountDivider: String {
        String(localized: "worldEntry.card.divider", defaultValue: "ou avec votre compte", bundle: .main)
    }

    static var namePrompt: String {
        String(localized: "worldEntry.name.prompt", defaultValue: "Comment doit-on vous appeler ?", bundle: .main)
    }

    static var nameLabel: String {
        String(localized: "worldEntry.name.label", defaultValue: "Votre nom", bundle: .main)
    }

    static var namePlaceholder: String {
        String(localized: "worldEntry.name.placeholder", defaultValue: "Ex. Amina", bundle: .main)
    }

    static var continueAction: String {
        String(localized: "worldEntry.continue", defaultValue: "Continuer", bundle: .main)
    }

    static func greeting(_ name: String) -> String {
        String(format: String(localized: "worldEntry.language.greeting", defaultValue: "Bonjour %@, vous lirez tout en…", bundle: .main), name)
    }

    static var languageHint: String {
        String(localized: "worldEntry.language.hint", defaultValue: "Proposée depuis votre appareil.", bundle: .main)
    }

    static var languageGroup: String {
        String(localized: "worldEntry.language.group", defaultValue: "Langue principale", bundle: .main)
    }

    static func step(_ index: Int, of total: Int) -> String {
        String(format: String(localized: "worldEntry.step", defaultValue: "Étape %1$lld sur %2$lld", bundle: .main), Int64(index), Int64(total))
    }

    static var back: String {
        String(localized: "worldEntry.back", defaultValue: "Retour", bundle: .main)
    }

    static var close: String {
        String(localized: "worldEntry.close", defaultValue: "Fermer", bundle: .main)
    }

    static var unavailable: String {
        String(localized: "worldEntry.unavailable", defaultValue: "L'entrée sans compte n'est pas ouverte pour le moment.", bundle: .main)
    }

    static var enterFailed: String {
        String(localized: "worldEntry.error.enter", defaultValue: "Impossible d'entrer pour le moment. Réessayez.", bundle: .main)
    }

    static var offline: String {
        String(localized: "worldEntry.error.offline", defaultValue: "Pas de connexion. Réessayez une fois en ligne.", bundle: .main)
    }
}
