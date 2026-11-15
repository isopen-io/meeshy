import XCTest
@testable import Meeshy

/// **Le warm-up ne REND plus rien — il ne fait que pré-résoudre, à pile plate.**
///
/// L'étage retiré montait un `UIHostingController(rootView: ConversationView(…))`
/// dans une fenêtre invisible et forçait l'évaluation du body par
/// `layoutIfNeeded()`. Il ne pouvait pas aboutir : matérialiser toute la chaîne
/// de types de `ConversationView` en une passe ne tient pas dans les 1008 Ko du
/// thread principal. Mesuré sur appareil réel (iPhone 16 Pro Max, iOS 26.6.1) :
/// `signal 11` dans la page de garde à CHAQUE lancement — huit rapports le
/// 2026-09-03 entre 14:12 et 17:45, l'app inutilisable.
///
/// **Ce qui rend cette garde nécessaire plutôt qu'un simple commit.** La frame
/// fautive se DÉPLAÇAIT à chaque correctif : d'abord
/// `ConversationViewModel.ephemeralDuration.getter` (keypath `@Published` non
/// pré-chauffé), puis `composerPickersAndSheets` (matérialisation du type du
/// maillon). Deux correctifs justes, tous deux inutiles — parce que le budget
/// était dépassé GLOBALEMENT, pas par un maillon coupable. Sur les 91 trames,
/// `bodyContent.getter` apparaît QUATRE fois et les 72 trames non-démangleur
/// consomment ~685 Ko : ce sont les getters de body eux-mêmes qui portent de
/// grosses frames.
///
/// > Quand la frame fautive se déplace à chaque correctif, arrêter de corriger
/// > la frame : c'est le BUDGET qui est dépassé, pas le maillon qui est mauvais.
///
/// La dette de fond — découper `ConversationView` en structs `View` NOMINALES,
/// chacune créant un nœud d'attribut où SwiftUI déroule la pile — reste
/// ouverte. Cette garde interdit de réintroduire un rendu de warm-up avant
/// qu'elle soit payée, parce que ce rendu n'est pas une optimisation : c'est un
/// crash au lancement.
final class ConversationWarmupHasNoRenderStageTests: XCTestCase {

    private static let warmupPath =
        "Meeshy/Features/Main/Services/ConversationFirstRenderWarmup.swift"

    private func warmupSource() throws -> String {
        let source = try AppSourceGuard.unit(Self.warmupPath)
        XCTAssertFalse(source.isEmpty, "Source du warm-up introuvable")
        return AppSourceGuard.stripComments(source)
    }

    func test_leWarmup_neMonteAucunHostingController() throws {
        let source = try warmupSource()
        for interdit in ["UIHostingController", "UIWindow", "layoutIfNeeded"] {
            XCTAssertFalse(
                source.contains(interdit),
                """
                Le warm-up utilise `\(interdit)` : il REND `ConversationView`, \
                et cette passe déborde les 1008 Ko du thread principal — \
                `signal 11` au lancement sur appareil réel. Le warm-up doit se \
                limiter à des accès à PILE PLATE (getters `@Published`, \
                contrôleurs), qui pré-résolvent les métadonnées sans construire \
                d'arbre de vues.
                """
            )
        }
    }

    func test_leWarmup_conserveSesEtagesAPilePlate() throws {
        let source = try warmupSource()
        for attendu in ["warmUpViewModelKeyPaths", "warmUpReadingModeController"] {
            XCTAssertTrue(
                source.contains(attendu),
                """
                L'étage `\(attendu)` a disparu. Ce sont les étages qui PAYENT : \
                ils résolvent les patterns de keypath depuis une pile plate, et \
                le cache de métadonnées étant global au process, le rendu réel \
                les retrouve chauds. Retirer le rendu du warm-up ne doit pas \
                emporter ce qui marchait.
                """
            )
        }
    }
}
