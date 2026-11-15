import SwiftUI
import XCTest
@testable import Meeshy

/// **En LTR, le helper doit être l'IDENTITÉ — c'est toute sa sûreté.**
///
/// Les sites de navigation gardent leurs comparaisons (`dx < -60`, `width > 70`) ;
/// seul l'opérande change. Si `readingDelta` rend exactement `width` en
/// `leftToRight`, alors le comportement actuel — celui de 99 % des sessions — est
/// préservé **par construction**, sans simulateur pour le vérifier.
///
/// C'est ce que ces tests épinglent en premier, avant même le retournement.
@MainActor
final class ReadingDirectionTests: XCTestCase {

    // MARK: - L'identité en LTR

    func test_enLectureGaucheDroiteLeDeplacementEstInchange() {
        for width in [-321.5, -70, -60.0001, -60, -1, 0, 1, 60, 60.0001, 70, 321.5] as [CGFloat] {
            XCTAssertEqual(
                ReadingDirection.readingDelta(width, layoutDirection: .leftToRight),
                width,
                "en LTR le helper doit être l'identité — c'est ce qui garantit qu'aucun "
                + "site d'appel ne change de comportement (\(width))"
            )
        }
    }

    // MARK: - Le retournement en RTL

    func test_enLectureDroiteGaucheLeDeplacementSInverse() {
        for width in [-321.5, -70, -1, 1, 70, 321.5] as [CGFloat] {
            XCTAssertEqual(
                ReadingDirection.readingDelta(width, layoutDirection: .rightToLeft),
                -width,
                "en RTL, avancer se fait vers la droite : le signe doit s'inverser (\(width))"
            )
        }
    }

    /// Zéro n'a pas de sens de lecture — et `-0.0 != 0.0` piégerait une
    /// comparaison d'égalité stricte quelque part en aval.
    func test_leDeplacementNulResteNul() {
        XCTAssertEqual(ReadingDirection.readingDelta(0, layoutDirection: .rightToLeft), 0)
        XCTAssertEqual(ReadingDirection.readingDelta(0, layoutDirection: .leftToRight), 0)
    }

    // MARK: - Ce que les sites d'appel en font vraiment

    /// Le témoin qui compte : le SEUIL du site d'appel, rejoué dans les deux sens.
    /// « `dx < -60` ⇒ groupe suivant » doit se déclencher sur un glissement vers la
    /// GAUCHE en français et vers la DROITE en arabe — sans que le site ne change
    /// sa comparaison.
    func test_leSeuilDeNavigationSeDeclencheDuBonCoteDansChaqueSens() {
        let versLaGauche: CGFloat = -80
        let versLaDroite: CGFloat = 80

        XCTAssertLessThan(
            ReadingDirection.readingDelta(versLaGauche, layoutDirection: .leftToRight), -60,
            "en français, glisser vers la gauche avance"
        )
        XCTAssertGreaterThan(
            ReadingDirection.readingDelta(versLaDroite, layoutDirection: .leftToRight), -60,
            "en français, glisser vers la droite n'avance pas"
        )
        XCTAssertLessThan(
            ReadingDirection.readingDelta(versLaDroite, layoutDirection: .rightToLeft), -60,
            "en arabe, glisser vers la DROITE avance — même comparaison, opérande retourné"
        )
        XCTAssertGreaterThan(
            ReadingDirection.readingDelta(versLaGauche, layoutDirection: .rightToLeft), -60,
            "en arabe, glisser vers la gauche n'avance pas"
        )
    }

    /// Un aller-retour est neutre : deux retournements rendent l'original. Sans quoi
    /// un site qui composerait deux appels dériverait en silence.
    func test_deuxRetournementsRendentLOriginal() {
        for width in [-140, -3.5, 3.5, 140] as [CGFloat] {
            let once = ReadingDirection.readingDelta(width, layoutDirection: .rightToLeft)
            XCTAssertEqual(ReadingDirection.readingDelta(once, layoutDirection: .rightToLeft), width)
        }
    }
}
