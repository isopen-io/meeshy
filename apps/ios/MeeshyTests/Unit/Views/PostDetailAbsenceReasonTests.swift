import XCTest
@testable import Meeshy
import MeeshySDK

/// **« Ce contenu n'est plus disponible » n'est pas une réponse à un échec
/// réseau** (#4903) — **et « vérifiez votre connexion » n'est pas une réponse à
/// un échec serveur** (#6508).
///
/// `PostDetailView` prenait sa branche d'indisponibilité dès que
/// `displayPost == nil` sans chargement en cours — que la cible n'existe plus
/// OU que la requête ait échoué. #4903 a séparé les deux ; mais « échec » y
/// voulait dire « tout sauf 404 », si bien qu'un 500 affichait « vérifiez votre
/// connexion » à des utilisateurs parfaitement connectés (#6503).
///
/// La loi distingue désormais QUATRE causes, que l'écran rend en trois états.
final class PostDetailAbsenceReasonTests: XCTestCase {

    func test_unEchecReseau_ditLaConnexion() {
        XCTAssertEqual(PostDetailAbsenceReason.resolve(hasPost: false, isLoading: false, failure: .network),
                       .networkFailed)
    }

    /// Le défaut de #6508 : le serveur a répondu 500, l'écran accusait le réseau.
    func test_unEchecServeur_neParleJamaisDeConnexion() {
        XCTAssertEqual(PostDetailAbsenceReason.resolve(hasPost: false, isLoading: false, failure: .server),
                       .serverFailed)
    }

    /// Un 403 (contenu privé, hors audience) et un 404 sont des RÉPONSES :
    /// réessayer échouerait identiquement.
    func test_interditEtIntrouvable_disentLIndisponibilite() {
        XCTAssertEqual(PostDetailAbsenceReason.resolve(hasPost: false, isLoading: false, failure: .forbidden),
                       .unavailable)
        XCTAssertEqual(PostDetailAbsenceReason.resolve(hasPost: false, isLoading: false, failure: .notFound),
                       .unavailable)
    }

    /// Sans échec, l'absence est bien une absence.
    func test_sansEchec_lAbsence_resteUneDisparition() {
        XCTAssertEqual(PostDetailAbsenceReason.resolve(hasPost: false, isLoading: false, failure: nil),
                       .unavailable)
    }

    /// **Un chargement en cours n'est aucun des verdicts.** Sans ce cas,
    /// l'écran afficherait une cause ANCIENNE pendant que la réponse arrive.
    func test_pendantLeChargement_aucunVerdict() {
        XCTAssertEqual(PostDetailAbsenceReason.resolve(hasPost: false, isLoading: true, failure: nil),
                       .stillLoading)
        XCTAssertEqual(PostDetailAbsenceReason.resolve(hasPost: false, isLoading: true, failure: .server),
                       .stillLoading)
    }

    /// **Un post présent gagne sur un échec résiduel.** `refreshPost` ne remet
    /// pas la cause à `nil` en cas de succès : « ai-je quelque chose à
    /// montrer ? » se pose AVANT « qu'est-ce qui a échoué ? ».
    func test_unPostPresent_gagneSurUnEchecResiduel() {
        XCTAssertEqual(PostDetailAbsenceReason.resolve(hasPost: true, isLoading: false, failure: .network),
                       .present)
    }
}
