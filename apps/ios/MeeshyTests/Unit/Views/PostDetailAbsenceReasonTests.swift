import XCTest
@testable import Meeshy
import MeeshySDK

/// **« Ce contenu n'est plus disponible » n'est pas une réponse à un échec
/// réseau** (#4903).
///
/// `PostDetailView` prenait sa branche d'indisponibilité dès que
/// `displayPost == nil` sans chargement en cours — que la cible n'existe plus
/// OU que la requête ait échoué. Le ViewModel distinguait pourtant les deux
/// (`error` est posé dans le `catch` de `refreshPost`) ; l'écran ne lisait pas
/// ce champ.
///
/// Ce que cela coûte à l'utilisateur n'est pas une nuance de formulation :
/// l'écran AFFIRME une suppression qui n'a pas eu lieu, et ne propose que
/// « Retour » — il retire la seule action qui aurait servi, réessayer. Un
/// tunnel, un Wi-Fi captif ou un serveur qui tousse deviennent « votre ami a
/// supprimé sa story ».
final class PostDetailAbsenceReasonTests: XCTestCase {

    /// Le cas nominal du défaut : rien n'est chargé ET une erreur est posée.
    func test_uneErreurPosée_estUnÉchec_pasUneDisparition() {
        let raison = PostDetailAbsenceReason.resolve(hasPost: false,
                                                     isLoading: false,
                                                     error: "The Internet connection appears to be offline.")
        XCTAssertEqual(raison, .loadFailed,
                       "Une requête qui échoue ne prouve RIEN sur l'existence de la cible.")
    }

    /// Sans erreur, l'absence est bien une absence — le message d'origine
    /// reste juste, et ce témoin empêche de le remplacer partout.
    func test_sansErreur_lAbsence_resteUneDisparition() {
        XCTAssertEqual(PostDetailAbsenceReason.resolve(hasPost: false, isLoading: false, error: nil),
                       .unavailable)
    }

    /// **Un chargement en cours n'est aucun des deux.** Sans ce cas, l'écran
    /// afficherait son verdict pendant que la réponse arrive encore — c'est le
    /// scintillement classique, et il ment une fraction de seconde.
    func test_pendantLeChargement_aucunVerdict() {
        XCTAssertEqual(PostDetailAbsenceReason.resolve(hasPost: false, isLoading: true, error: nil),
                       .stillLoading)
        XCTAssertEqual(PostDetailAbsenceReason.resolve(hasPost: false, isLoading: true, error: "boom"),
                       .stillLoading,
                       "Une erreur ANCIENNE ne doit pas trancher pendant qu'une nouvelle tentative tourne.")
    }

    /// **Un post présent gagne sur une erreur résiduelle.** `refreshPost` ne
    /// remet pas `error` à `nil` en cas de succès : un échec suivi d'une
    /// réussite laisse le champ garni. L'ordre des questions doit donc être
    /// « ai-je quelque chose à montrer ? » AVANT « qu'est-ce qui a échoué ? ».
    func test_unPostPrésent_gagneSurUneErreurRésiduelle() {
        XCTAssertEqual(PostDetailAbsenceReason.resolve(hasPost: true, isLoading: false, error: "vieille erreur"),
                       .present)
    }

    /// **Le défaut SYMÉTRIQUE, trouvé en relisant mon propre correctif.**
    ///
    /// Distinguer « échec » de « disparition » ne sert à rien si TOUTE erreur
    /// compte comme un échec : un 404 — le serveur a répondu, et il a dit non —
    /// afficherait « vérifiez votre connexion » et proposerait de réessayer une
    /// requête qui échouera identiquement. Corriger un mensonge en le
    /// retournant n'est pas le corriger.
    /// L'erreur est construite comme `APIClient` la lève — `MeeshyError`, pas
    /// `APIError` : un témoin écrit avec le mauvais type passerait au vert en
    /// gardant une règle morte.
    func test_un404_estUneRéponse_pasUnÉchec() {
        XCTAssertTrue(PostDetailAbsenceReason.isNotFound(MeeshyError.server(statusCode: 404, message: "Post not found")))
    }

    /// Tout le reste laisse la question OUVERTE — donc mérite un réessai.
    func test_lesAutresErreurs_restentDesÉchecs() {
        XCTAssertFalse(PostDetailAbsenceReason.isNotFound(MeeshyError.server(statusCode: 500, message: "boom")))
        XCTAssertFalse(PostDetailAbsenceReason.isNotFound(URLError(.notConnectedToInternet)))
    }
}
