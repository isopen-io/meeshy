import SwiftUI
import Combine
import MapKit
import CoreLocation
import MeeshySDK
import MeeshyUI
import os

// MARK: - Soulèvement du pin

/// Géométrie du pin central pendant le déplacement de la carte.
///
/// Valeurs pures, sans SwiftUI : la règle « de combien il monte et de combien
/// l'ombre rétrécit » est testable sans rendre quoi que ce soit.
///
/// L'ombre est ce qui fait lire le mouvement. Un pin qui grossit seul se lit
/// comme un zoom ; c'est l'ombre qui rétrécit et pâlit sous lui qui le fait
/// décoller.
nonisolated enum MapPinLift {
    struct Style: Equatable {
        let scale: Double
        /// Négatif = vers le haut de l'écran.
        let yOffset: Double
        let shadowScale: Double
        let shadowOpacity: Double
    }

    static func style(lifted: Bool) -> Style {
        lifted
            ? Style(scale: 2.0, yOffset: -18, shadowScale: 0.55, shadowOpacity: 0.18)
            : Style(scale: 1.0, yOffset: 0, shadowScale: 1.0, shadowOpacity: 0.38)
    }
}

/// **Ce que la carte cherche, et où** (#7922, directive porteur 2026-09-25 :
/// « chercher les éléments autour de soi, et un accès à la carte pour choisir
/// une adresse ou un lieu, monument nommé »).
nonisolated enum LocationSearchPlan {
    /// « Autour de moi » : les lieux nommés dans ce rayon, les plus proches
    /// d'abord.
    static let nearbyRadiusMeters: CLLocationDistance = 1_000
    /// Une recherche tapée regarde d'abord autour de l'auteur, sans s'y
    /// enfermer : un monument de la ville voisine doit rester trouvable.
    static let searchRegionMeters: CLLocationDistance = 20_000
    static let maxResults = 8
}
