import XCTest
@testable import Meeshy

/// **Retirer le voyage, garder le sens.**
///
/// Sous Reduce Motion, une animation de STATUT ne doit pas seulement s'arrêter :
/// elle doit s'arrêter sur une valeur qui DIT encore ce qu'elle disait en
/// bougeant. C'est ce que ces tests épinglent — le profil de repos d'une forme
/// d'onde, seule des sept valeurs de repos de #4286 qui soit calculée plutôt
/// que constante.
///
/// `@MainActor` : la cible de tests compile en `SWIFT_DEFAULT_ACTOR_ISOLATION =
/// nonisolated` (sinon chaque `XCTestCase` entre en conflit avec ses propres
/// initialiseurs `nonisolated`), pendant que la cible app compile en
/// `MainActor`. Une suite qui touche du code app opte donc explicitement —
/// c'est la convention écrite dans `project.yml`.
@MainActor
final class RestingMotionTests: XCTestCase {

    // MARK: - Un trait plat se lit « cassé », pas « en cours »

    /// Le défaut que ce profil existe pour éviter : figer toutes les barres à
    /// `minHeight` rend une ligne droite. L'utilisateur qui a coupé les
    /// animations verrait un enregistreur en panne, pas un enregistreur muet.
    func test_leProfilDeReposNEstPasPlat() {
        let heights = (0..<12).map {
            RestingWaveform.height(index: $0, minHeight: 4, maxHeight: 26)
        }
        XCTAssertGreaterThan(
            Set(heights).count, 3,
            "un profil de repos à moins de 4 hauteurs distinctes se lit comme un trait plat"
        )
    }

    /// Bornes respectées : la barre de repos reste dans le gabarit que la barre
    /// animée occupe, sinon la forme d'onde change de taille en activant Reduce
    /// Motion — un mouvement, précisément ce qu'on retire.
    func test_leProfilDeReposResteDansSesBornes() {
        for index in 0..<64 {
            let h = RestingWaveform.height(index: index, minHeight: 4, maxHeight: 26)
            XCTAssertGreaterThanOrEqual(h, 4, "barre \(index) sous la borne basse")
            XCTAssertLessThanOrEqual(h, 26, "barre \(index) au-dessus de la borne haute")
        }
    }

    /// **Déterministe** — c'est ce qui distingue le repos de l'animation, dont
    /// les hauteurs sont tirées au hasard (`CGFloat.random(in:)`). Une valeur de
    /// repos qui changerait à chaque rendu ferait sautiller la forme d'onde à
    /// chaque re-évaluation de la vue : du mouvement, sous Reduce Motion.
    func test_leProfilDeReposEstDeterministe() {
        for index in 0..<32 {
            XCTAssertEqual(
                RestingWaveform.height(index: index, minHeight: 4, maxHeight: 26),
                RestingWaveform.height(index: index, minHeight: 4, maxHeight: 26),
                "la hauteur de repos de la barre \(index) doit être stable d'un appel à l'autre"
            )
        }
    }

    /// Les deux exemplaires de forme d'onde du dépôt n'ont pas le même gabarit
    /// (`4…26` au composeur, `minHeight…26` en média) : le profil se dérive des
    /// bornes qu'on lui donne, il ne les suppose pas.
    func test_leProfilSuitLesBornesQuOnLuiDonne() {
        let etroit = (0..<12).map { RestingWaveform.height(index: $0, minHeight: 2, maxHeight: 6) }
        XCTAssertTrue(etroit.allSatisfy { $0 >= 2 && $0 <= 6 })
        XCTAssertGreaterThan(Set(etroit).count, 1, "un gabarit étroit garde du relief")
    }

    /// Un index négatif ou géant ne doit pas sortir du gabarit : les barres sont
    /// indexées par un `ForEach` dont la borne a déjà changé une fois.
    func test_leProfilTientSurUnIndexAberrant() {
        for index in [-7, -1, 999, Int.max / 2] {
            let h = RestingWaveform.height(index: index, minHeight: 4, maxHeight: 26)
            XCTAssertGreaterThanOrEqual(h, 4, "index \(index)")
            XCTAssertLessThanOrEqual(h, 26, "index \(index)")
        }
    }
}
