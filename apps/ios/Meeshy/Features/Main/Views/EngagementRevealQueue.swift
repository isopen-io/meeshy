import Foundation
import MeeshySDK

/// **La file des paliers à célébrer — un à l'écran, les suivants attendent (#5847).**
///
/// Un seul geste peut faire tomber DEUX succès : rejoindre sa dixième
/// conversation, qui compte justement dix membres, franchit le palier de
/// VOLUME et celui d'AMPLEUR. Ce sont deux faits distincts, et la passerelle
/// annonce les deux — en taire un pour éviter la rafale garderait un acquis
/// pour soi.
///
/// L'hôte de célébration ne peut en montrer qu'un à la fois : sans file, le
/// second écrasait le premier ou se perdait. Ici il attend, et part dès que le
/// premier se referme.
///
/// **La file est PURE et bornée**, pour deux raisons :
///  - pure, elle se teste sans monter une vue — la règle d'ordre et de
///    déduplication est ce qui peut casser, pas le `fullScreenCover` ;
///  - bornée, parce qu'une célébration qu'on ne peut pas fermer avant d'en
///    avoir vu six n'est plus une récompense mais une prise en otage. Au-delà,
///    les paliers restent ACQUIS et le tableau de bord les restitue — c'est
///    l'écran, pas la file, qui est l'inventaire.
struct EngagementRevealQueue: Equatable {

    /// Ce que la file accepte de faire attendre, célébration en cours comprise.
    static let capacité = 3

    private(set) var enCours: EngagementReveal?
    private(set) var enAttente: [EngagementReveal] = []

    var estVide: Bool { enCours == nil && enAttente.isEmpty }

    /// Enfile un palier, ou l'ignore.
    ///
    /// **Déduplication par VALEUR, pas par identifiant de notification.** Un
    /// même succès arrive par deux portes — l'événement socket en direct et le
    /// tap sur la notification qu'il vient de poser — et un succès n'est pas
    /// répétable : le voir deux fois n'aurait aucun sens. L'identifiant, lui,
    /// diffère d'une porte à l'autre et ne dédupliquerait rien.
    mutating func enfile(_ palier: EngagementReveal) {
        guard palier != enCours, !enAttente.contains(palier) else { return }
        guard (enCours == nil ? 0 : 1) + enAttente.count < Self.capacité else { return }

        if enCours == nil {
            enCours = palier
        } else {
            enAttente.append(palier)
        }
    }

    /// La célébration courante vient d'être refermée : la suivante prend sa place.
    mutating func termine() {
        enCours = enAttente.isEmpty ? nil : enAttente.removeFirst()
    }
}
