import Foundation

/// Les libellés du rail — VoiceOver nomme chaque porte par son VERBE, jamais
/// par son glyphe (loi 7 : l'icône EST le verbe, donc le lecteur d'écran doit
/// entendre ce verbe-là).
nonisolated enum ComposerRailCopy {

    /// Ce que VoiceOver DIT d'une pastille — une phrase, jamais un chiffre nu.
    /// « 3 » annoncé seul ne dit pas ce qu'il compte ; le libellé de la porte
    /// dit déjà le verbe, la valeur dit la quantité POSÉE.
    static func badgeValue(_ count: Int) -> String {
        String(format: String(localized: "composer.rail.badge.a11y", bundle: .main), count)
    }

    static var railLabel: String {
        String(localized: "composer.rail.leading.label",
               defaultValue: "Ajouter à la scène", bundle: .main)
    }

    /// Le même rail quand un outil l'occupe (#8652) : VoiceOver annonce les
    /// réglages de l'outil, plus « Ajouter à la scène ».
    static var toolRailLabel: String {
        String(localized: "composer.rail.tool.label",
               defaultValue: "Réglages de l'outil", bundle: .main)
    }

    static func label(_ door: ComposerRailDoor) -> String {
        switch door {
        case .description:
            return String(localized: "composer.rail.description",
                          defaultValue: "Décrire", bundle: .main)
        // Le VERBE, comme les autres — et un verbe qui ne se confond pas avec
        // « Décrire », sa voisine immédiate dans la rangée. VoiceOver n'a pas le
        // glyphe pour les distinguer : c'est la phrase qui doit le faire.
        case .content:
            return String(localized: "composer.rail.content",
                          defaultValue: "Écrire le post", bundle: .main)
        case .media:
            return String(localized: "composer.rail.media",
                          defaultValue: "Ajouter un média", bundle: .main)
        case .sound:
            return String(localized: "composer.rail.sound",
                          defaultValue: "Ajouter un son", bundle: .main)
        case .sticker:
            return String(localized: "composer.rail.sticker",
                          defaultValue: "Ajouter un sticker", bundle: .main)
        case .hashtag:
            return String(localized: "composer.rail.hashtag",
                          defaultValue: "Ajouter un hashtag", bundle: .main)
        case .mention:
            return String(localized: "composer.rail.mention",
                          defaultValue: "Nommer quelqu'un", bundle: .main)
        case .place:
            return String(localized: "composer.rail.place",
                          defaultValue: "Ajouter un lieu", bundle: .main)
        case .background:
            // Le VERBE, pas le nom : « Choisir un fond », comme « Dessiner » et
            // « Décrire ». « Fond » seul nommerait la CHOSE — c'est le glyphe
            // qui la dit, et VoiceOver n'a pas le glyphe.
            return String(localized: "composer.rail.background",
                          defaultValue: "Choisir un fond", bundle: .main)
        case .drawing:
            return String(localized: "composer.rail.drawing",
                          defaultValue: "Dessiner", bundle: .main)
        case .text:
            return String(localized: "composer.rail.text",
                          defaultValue: "Ajouter du texte", bundle: .main)
        }
    }
}
