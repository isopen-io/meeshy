import XCTest

/// **Le lecteur de story affiche ses propres retours** (#4876).
///
/// Il en lève six — deux confirmations et **quatre refus** — et il est présenté
/// en `fullScreenCover`. L'hôte qui les rend était monté sur la racine, qu'un
/// `fullScreenCover` recouvre : les six se levaient derrière l'écran.
///
/// > Un refus muet ne se lit pas « ça a échoué » mais « le bouton ne marche
/// > pas » — et l'utilisateur recommence. Le geste était juste, à la bonne
/// > place, avec sa raison écrite ; c'est la couche d'AFFICHAGE qui le rendait
/// > sans effet.
///
/// Ce témoin garde le LIEN, pas le message. Un toast levé par un site que plus
/// personne n'affiche ne rougit nulle part : le manager reçoit l'appel, la vue
/// existe, et rien ne se voit.
final class StoryViewerToastHostGuardTests: XCTestCase {

    private static let containerPath = "Meeshy/Features/Main/Views/StoryViewerContainer.swift"
    private static let viewerPath = "Meeshy/Features/Main/Views/StoryViewerView.swift"

    func test_leConteneurMonteLHoteDesRetours() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.containerPath))
        XCTAssertTrue(
            source.contains(".feedbackToastOverlay()"),
            "`StoryViewerContainer` doit monter l'hôte des toasts : il est le point de montage UNIQUE "
                + "du lecteur, et un `fullScreenCover` recouvre l'overlay de la racine (#4876)."
        )
    }

    /// **Garde d'aveuglement, et elle porte la RAISON du témoin ci-dessus.**
    ///
    /// Si le lecteur cessait un jour de lever des toasts, le modificateur
    /// deviendrait inutile et sa disparition serait légitime. Tant qu'il en
    /// lève, elle ne l'est pas. Le témoin mesure donc les deux moitiés du lien —
    /// sans quoi il garderait un modificateur sans savoir pourquoi.
    func test_leLecteurLeveBienDesRetoursAAfficher() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.viewerPath))
        let appels = source.components(separatedBy: "FeedbackToastManager.shared").count - 1
        XCTAssertGreaterThan(
            appels, 0,
            "Le lecteur ne lève plus aucun retour — si c'est voulu, `feedbackToastOverlay()` peut "
                + "partir avec, et ce témoin doit être retiré en connaissance de cause."
        )
    }
}
