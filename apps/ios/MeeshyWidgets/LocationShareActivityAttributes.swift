import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

/// **Ce que l'activité en direct d'un partage de position montre** (planche `Hors-App`, vues 1 et 2, #19524).
///
/// Une personne me partage sa position : son compte à rebours vit dans l'îlot et sur l'écran verrouillé. Compilé dans
/// les DEUX cibles (`project.yml`) : l'app l'écrit, l'extension de widgets le peint.
///
/// L'état ne porte JAMAIS une coordonnée : seulement l'échéance, le mot de la précision que l'émetteur m'a donnée et,
/// quand l'appareil l'a nommé, le lieu à cette précision (« Alfama », « Lisbonne »). Le texte arrive localisé par l'app.
nonisolated struct LocationShareActivitySnapshot: Codable, Hashable, Sendable {
    /// L'échéance du partage chez moi : le compte à rebours s'arrête là.
    var deadline: Date
    /// Le mot court de la précision servie (« quartier », « ville », « exacte »).
    var precision: String
    /// Le lieu à la précision servie, jamais plus fin ; `nil` tant que l'appareil ne l'a pas nommé.
    var place: String?
    /// La ville autour du lieu, quand elle diffère de lui.
    var city: String?
}

#if canImport(ActivityKit)
/// Qui partage : fixé à l'ouverture. Un autre partageur ouvre une autre activité.
@available(iOS 16.1, *)
nonisolated struct LocationShareActivityAttributes: ActivityAttributes, Sendable {
    typealias ContentState = LocationShareActivitySnapshot

    var sharerId: String
    var name: String
    var initials: String
    var accentHex: String
    /// Le pseudo de la vitrine que « Carte » ouvre ; `nil` : l'activité ouvre l'app.
    var username: String?
}
#endif
