import Foundation
import MeeshySDK

// MARK: - Le libellé d'un filtre n'est pas son identité (#4550)
//
// `MeeshyConversationFilter` (SDK, `CoreModels.swift`) déclare ses neuf cas
// avec un `rawValue` FRANÇAIS, et les deux sites de rendu le passaient
// directement comme titre de puce. Un `rawValue` est une IDENTITÉ : il sert de
// `id` (`Identifiable`), il se compare, il se journalise. Servi comme libellé,
// il rendait deux choses vraies en même temps :
//
//  - aucune des neuf étiquettes ne pouvait être traduite — un lecteur arabe,
//    allemand, espagnol, italien, portugais ou anglais lisait « Non lus »,
//    « Ouvertes », « Globales » en français, sur les sept locales livrées ;
//  - « Privee » ne pouvait pas retrouver son accent sans que l'identité du cas
//    change au passage.
//
// C'est la forme INVERSE du défaut habituel : d'ordinaire une chaîne
// d'affichage est écrite en dur ; ici elle l'était dans un champ qui n'est pas
// fait pour ça — donc invisible à toute garde qui cherche des chaînes
// d'affichage, `LocalizationConsistencyTests` comprise, qui inspecte les
// `String(localized:)` d'un fichier et n'en trouvait aucun.
//
// La présentation vit donc ICI, côté app, où le catalogue `.main` la sert. Le
// `rawValue` reste inchangé, « Privee » compris : personne ne le lit plus pour
// le montrer.
extension ConversationFilter {

    /// Le libellé LU par le lecteur, dans sa langue.
    var displayName: String {
        switch self {
        case .all:
            return String(localized: "conversation.filter.all", defaultValue: "Tous", bundle: .main)
        case .unread:
            return String(localized: "conversation.filter.unread", defaultValue: "Non lus", bundle: .main)
        case .personnel:
            return String(localized: "conversation.filter.personnel", defaultValue: "Personnel", bundle: .main)
        case .privee:
            return String(localized: "conversation.filter.privee", defaultValue: "Privée", bundle: .main)
        case .ouvertes:
            return String(localized: "conversation.filter.ouvertes", defaultValue: "Ouvertes", bundle: .main)
        case .globales:
            return String(localized: "conversation.filter.globales", defaultValue: "Globales", bundle: .main)
        case .channels:
            return String(localized: "conversation.filter.channels", defaultValue: "Channels", bundle: .main)
        case .favoris:
            return String(localized: "conversation.filter.favoris", defaultValue: "Favoris", bundle: .main)
        case .archived:
            return String(localized: "conversation.filter.archived", defaultValue: "Archives", bundle: .main)
        }
    }
}
