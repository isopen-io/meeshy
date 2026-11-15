import XCTest
@testable import MeeshyUI

/// #4082 (vue `2d`) — **« ⟲ PIVOTER » : le champ existait, son écrivain non.**
final class StoryMediaRotationTests: XCTestCase {

    /// **Le sens du glyphe.** `⟲` tourne dans le sens antihoraire. Un quart de
    /// tour écrit `+90` produirait l'inverse — et quatre pressions ramènent au
    /// point de départ dans les DEUX cas, donc l'erreur survit à un essai
    /// distrait.
    func test_leQuartDeTour_suitLeSensDuGlyphe() {
        XCTAssertEqual(StoryMediaRotation.turned(0), 270, accuracy: 0.0001)
    }

    /// **Quatre quarts ramènent à zéro**, jamais à 360 : c'est la
    /// normalisation, et c'est ce qui empêche 1080 de se ranger dans le modèle
    /// après douze pressions. Le rendu serait correct modulo 360 — le défaut ne
    /// se verrait donc PAS ici, mais chez un décodeur plus strict ou dans une
    /// interpolation d'animation, chez les deux autres clients.
    func test_quatreQuarts_ramènentÀZéro_etNonÀ360() {
        var a: Double = 0
        for _ in 0..<4 { a = StoryMediaRotation.turned(a) }
        XCTAssertEqual(a, 0, accuracy: 0.0001)
    }

    func test_douzeQuarts_neRangentPas1080() {
        var a: Double = 0
        for _ in 0..<12 { a = StoryMediaRotation.turned(a) }
        XCTAssertEqual(a, 0, accuracy: 0.0001)
    }

    /// **Un angle négatif remonte.** `-90` et `270` sont le même angle ; seule
    /// la seconde écriture passe un décodeur qui borne aux positifs.
    func test_unAngleNégatif_remonteDansLIntervallePositif() {
        XCTAssertEqual(StoryMediaRotation.normalized(-90), 270, accuracy: 0.0001)
        XCTAssertEqual(StoryMediaRotation.normalized(-450), 270, accuracy: 0.0001)
        XCTAssertEqual(StoryMediaRotation.normalized(360), 0, accuracy: 0.0001)
    }

    /// Un angle déjà valide n'est pas touché — la normalisation ne doit pas
    /// être une occasion de perdre un réglage fin venu d'ailleurs.
    func test_unAngleDéjàValide_resteIntact() {
        XCTAssertEqual(StoryMediaRotation.normalized(37.5), 37.5, accuracy: 0.0001)
    }
}
