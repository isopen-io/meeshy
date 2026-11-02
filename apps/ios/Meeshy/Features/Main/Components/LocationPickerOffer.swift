import CoreLocation
import MeeshySDK

/// **Après un refus de localisation, la carte ne propose aucun lieu** (#13839,
/// L3). Sans position, elle s'ouvre sur une région neutre, et son centre devenait
/// un lieu prêt à confirmer : un endroit que l'auteur n'avait ni cherché ni
/// visé. Le lieu n'existe qu'une fois la carte déplacée ou un résultat choisi.
///
/// « Déplacée » se lit au CENTRE de la carte, éloigné de celui de l'ouverture :
/// le signal de geste (`onInteractionChange`) n'existe pas sous iOS 16, et sous
/// iOS 17+ il part aussi pour la caméra que la carte pose elle-même.
nonisolated enum LocationPickerOffer {
    static let openingCenter = CLLocationCoordinate2D(latitude: 20, longitude: 0)
    static let tolerance: CLLocationDegrees = 1e-4

    static func place(_ candidate: SharedPlace?, refused: Bool, searched: Bool,
                      opening: CLLocationCoordinate2D = openingCenter) -> SharedPlace? {
        guard refused, !searched, let candidate else { return candidate }
        let immobile = abs(candidate.latitude - opening.latitude) < tolerance
            && abs(candidate.longitude - opening.longitude) < tolerance
        return immobile ? nil : candidate
    }
}
