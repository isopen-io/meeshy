import XCTest
import CoreGraphics
@testable import MeeshySDK

/// **Le double tap latéral d'un média à durée, éprouvé hors de toute vue** (#6163).
///
/// Directive porteur du 2026-09-12 : *« le +10 et −10 peuvent être enlevés, ce
/// sera posé par double tap à gauche ou à droite de la scène où se trouve la
/// vidéo ! »* Les deux boutons ont quitté la barre de transport au #6162 ; la
/// règle qui les remplace est ici, pure, parce qu'un arbitrage de gestes écrit
/// dans un `body` ne s'éprouve qu'au doigt — il paraît juste tant que personne
/// n'essaie la combinaison qu'on n'avait pas en tête.
///
/// Source : `docs/superpowers/specs/2026-09-12-lecture-media-plateau-design.md`
/// § 2.2 (« les ±10 s partent ; #6163 les remplace par un geste ») et § 2.3.
final class MediaStageSeekTests: XCTestCase {

    /// La largeur d'un cadre de galerie sur iPhone 16 Pro : 390 − 2 × 12.
    private static let width: CGFloat = 366

    private func jump(atX x: CGFloat,
                      position: Double = 60,
                      duration: Double = 180) -> MediaStageSeek.Jump? {
        MediaStageSeek.resolve(x: x,
                               width: Self.width,
                               position: position,
                               duration: duration)
    }

    // MARK: - Les trois tiers

    func test_theLeftThird_stepsBackTenSeconds() {
        let recul = jump(atX: 40)

        XCTAssertEqual(recul?.zone, .backward)
        XCTAssertEqual(recul?.to, 50)
        XCTAssertEqual(recul?.seconds, -10)
    }

    func test_theRightThird_stepsForwardTenSeconds() {
        let avance = jump(atX: Self.width - 40)

        XCTAssertEqual(avance?.zone, .forward)
        XCTAssertEqual(avance?.to, 70)
        XCTAssertEqual(avance?.seconds, 10)
    }

    /// **Le centre rend `nil`, et c'est LA raison d'être de la règle.**
    ///
    /// Un double tap RETARDE le tap simple — celui-ci doit attendre que le
    /// double échoue. Le porteur a dit « à gauche ou à droite de la scène »,
    /// pas « sur la scène » : au centre, le tap garde son effet immédiat parce
    /// qu'aucun double ne l'y attend. Un `nil` ici n'est pas un cas dégénéré,
    /// c'est la moitié du contrat.
    func test_theCentre_claimsNothing_soTheSingleTapStaysImmediate() {
        XCTAssertNil(jump(atX: Self.width / 2))
        XCTAssertNil(jump(atX: Self.width / 3 + 1))
        XCTAssertNil(jump(atX: Self.width * 2 / 3 - 1))
    }

    /// Les bornes des tiers appartiennent aux zones LATÉRALES : un doigt posé
    /// exactement sur la frontière a visé le bord, pas le milieu.
    func test_theThirds_areMeasuredFromTheEdges() {
        XCTAssertEqual(MediaStageSeek.zone(x: 0, width: Self.width), .backward)
        XCTAssertEqual(MediaStageSeek.zone(x: Self.width - 1, width: Self.width), .forward)
        XCTAssertEqual(MediaStageSeek.zone(x: Self.width * 2 / 3, width: Self.width), .forward)
    }

    // MARK: - Sans durée, aucune zone

    /// **Une image n'a rien à parcourir, donc elle n'a pas de tiers.** C'est
    /// cette ligne qui empêche le geste d'entrer en collision avec le double tap
    /// de ZOOM que la page image porte déjà : une photo rend `nil` dans les trois
    /// zones, quel que soit l'hôte qui appellerait la règle.
    func test_aMediumWithoutDuration_claimsNothingAnywhere() {
        for x: CGFloat in [0, Self.width / 2, Self.width - 1] {
            XCTAssertNil(MediaStageSeek.resolve(x: x, width: Self.width,
                                                position: 0, duration: 0),
                         "aucune zone ne s'arme sans durée (x = \(x))")
        }
    }

    /// Une durée non finie — un flux dont la longueur est inconnue — n'est pas
    /// une durée : elle ne permet pas de borner le saut, donc elle n'arme rien.
    func test_anUnboundedDuration_claimsNothing() {
        XCTAssertNil(MediaStageSeek.resolve(x: 10, width: Self.width,
                                            position: 5, duration: .infinity))
    }

    /// Un cadre de largeur nulle — la page se démonte pendant que la fenêtre de
    /// rendu la re-réalise — n'a pas de tiers à distinguer.
    func test_aZeroWidthStage_hasNoThirds() {
        XCTAssertEqual(MediaStageSeek.zone(x: 0, width: 0), .center)
        XCTAssertNil(MediaStageSeek.resolve(x: 0, width: 0, position: 10, duration: 60))
    }

    // MARK: - Le saut se borne aux extrémités

    /// **Reculer avant zéro donne zéro** — jamais une position négative, que
    /// l'`AVPlayer` traduirait en un `CMTime` invalide.
    func test_steppingBackBeforeTheStart_landsOnZero() {
        let recul = jump(atX: 10, position: 4)

        XCTAssertEqual(recul?.to, 0)
        XCTAssertEqual(recul?.seconds, -4, "le saut RÉELLEMENT parcouru, pas les dix demandés")
    }

    func test_steppingForwardPastTheEnd_landsOnTheEnd() {
        XCTAssertEqual(jump(atX: Self.width - 10, position: 175, duration: 180)?.to, 180)
    }

    /// **Un saut borné à zéro reste un saut, pas un `nil`.** Les deux réponses
    /// ne disent pas la même chose : `nil` signifie « ce geste ne s'applique pas
    /// ici » — le tap simple garde son effet immédiat — tandis qu'un saut de
    /// zéro seconde signifie « il s'applique, il n'a nulle part où aller ». Les
    /// confondre priverait l'hôte de son retour haptique à l'extrémité de la
    /// piste, et ferait taire le geste exactement là où l'utilisateur insiste.
    func test_aJumpWithNowhereToGo_isStillAJump() {
        let butee = jump(atX: 10, position: 0)

        XCTAssertNotNil(butee)
        XCTAssertEqual(butee?.seconds, 0)
        XCTAssertEqual(butee?.zone, .backward)
    }

    /// Une position hors piste — le player vient de charger, ou l'horloge a
    /// rendu un `NaN` — est ramenée dans la piste AVANT le saut.
    func test_aPositionOutsideTheTrack_isBroughtBackBeforeJumping() {
        XCTAssertEqual(jump(atX: 10, position: 500, duration: 180)?.to, 170)
        XCTAssertEqual(jump(atX: 10, position: .nan, duration: 180)?.to, 0)
    }

    // MARK: - La géographie posée à l'écran et la décision sont la MÊME arithmétique

    /// **Deux projections d'un seul tiers.** L'hôte ne peut pas poser ses zones
    /// au doigt mouillé : il les dimensionne par `lateralWidth(for:)`, et la
    /// décision se prend par `zone(x:width:)`. Si les deux divergeaient, la
    /// surface armée et la surface qui répond ne coïncideraient plus — le geste
    /// serait inerte sur une bande, et personne ne rougirait. Ce témoin les lie.
    func test_theArmedZones_andTheDecision_readTheSameThird() {
        for width: CGFloat in [366, 390, 200, 1024] {
            let lateral = MediaStageSeek.lateralWidth(for: width)

            XCTAssertEqual(MediaStageSeek.zone(x: lateral - 0.5, width: width), .backward,
                           "largeur \(width) : le dernier point de la zone gauche")
            XCTAssertEqual(MediaStageSeek.zone(x: lateral + 0.5, width: width), .center)
            XCTAssertEqual(MediaStageSeek.zone(x: width - lateral, width: width), .forward,
                           "largeur \(width) : le premier point de la zone droite")
            XCTAssertEqual(MediaStageSeek.zone(x: width - lateral - 0.5, width: width), .center)
        }
    }

    /// Le pas est une constante partagée, pas un `10` recopié chez chaque hôte :
    /// les deux boutons qui viennent de partir le portaient déjà en double.
    func test_theStep_isTenSeconds() {
        XCTAssertEqual(MediaStageSeek.step, 10)
    }
}
