import SwiftUI
import MeeshySDK

/// Les teintes de l'accent CHOISI d'une vitrine (#19391) en couleurs : le seul site qui les peint, pour que la
/// pastille d'édition (K07) et l'aperçu ne recopient pas `Color(hex:)` chacun.
public nonisolated extension ProfileAccent.Tone {
    var color: Color { Color(hex: bareHex) }
}

public nonisolated extension ProfileAccent {
    /// Le disque « Automatique » de la planche `Moi-Edition` : un dégradé de quatre teintes de la liste, qui dit
    /// « Meeshy choisit pour toi » sans en désigner une.
    /// L'accent d'un profil en couleur : la teinte choisie, sinon l'accent calculé (`hex(chosen:userId:name:)`).
    static func color(chosen: String?, userId: String?, name: String) -> Color {
        Color(hex: hex(chosen: chosen, userId: userId, name: name))
    }

    static var automaticGradient: [Color] {
        ["violet", "turquoise", "amber", "raspberry"].compactMap { key in tones.first { $0.key == key }?.color }
    }
}
