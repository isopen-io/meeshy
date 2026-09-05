import XCTest
@testable import MeeshyUI

/// La géométrie du rognage (#4657) — tout ce que le composant décide, décidé
/// hors de la vue et prouvé sans en monter une seule.
final class AudioTrimGeometryTests: XCTestCase {

    private func geo(duration: TimeInterval = 60, width: CGFloat = 300, zoom: CGFloat = 1) -> AudioTrimGeometry {
        AudioTrimGeometry(duration: duration, width: width, zoom: zoom)
    }

    // MARK: - Le repère

    func test_auZoomUn_laDureeEntiereTientDansLaLargeur() {
        let g = geo()
        XCTAssertEqual(g.contentWidth, 300)
        XCTAssertEqual(g.maximumOffset, 0, "rien à faire défiler quand tout tient")
        XCTAssertEqual(g.x(for: 0, offset: 0), 0)
        XCTAssertEqual(g.x(for: 60, offset: 0), 300)
    }

    func test_leTempsEtLAbscisseSontReciproques() {
        let g = geo(zoom: 4)
        let offset: CGFloat = 210
        for instant in stride(from: 0.0, through: 60.0, by: 7.5) {
            let x = g.x(for: instant, offset: offset)
            XCTAssertEqual(g.time(atX: x, offset: offset), instant, accuracy: 0.0001)
        }
    }

    /// **La garantie « aucun débordement hors viewport » est ARITHMÉTIQUE.**
    /// Elle ne tient pas à une valeur bien choisie mais à cette borne — un
    /// décalage plus grand laisserait du vide à droite de la bande.
    func test_leDecalageNeSortJAMAISDeSesBornes() {
        let g = geo(zoom: 3)
        XCTAssertEqual(g.maximumOffset, 600)
        XCTAssertEqual(g.clampedOffset(-500), 0)
        XCTAssertEqual(g.clampedOffset(99_999), 600)
        XCTAssertEqual(g.clampedOffset(250), 250)
    }

    func test_leZoomEstBorneDesDeuxCotes() {
        XCTAssertEqual(geo(zoom: 0.01).zoom, AudioTrimGeometry.zoomRange.lowerBound)
        XCTAssertEqual(geo(zoom: 5_000).zoom, AudioTrimGeometry.zoomRange.upperBound)
    }

    // MARK: - Le curseur au centre

    func test_lOffsetQuiCentreUnInstant_lePlaceAuMilieu() {
        let g = geo(zoom: 4)
        let offset = g.offsetCentering(30)
        XCTAssertEqual(g.time(atX: g.width / 2, offset: offset), 30, accuracy: 0.0001)
    }

    /// Aux deux extrémités, centrer est IMPOSSIBLE — la bande buterait. Le
    /// curseur cesse alors d'être au milieu, et c'est le bon comportement :
    /// l'alternative serait d'inventer du contenu avant zéro.
    func test_auxExtremites_lOffsetSAccrocheAuBordPlutotQueDInventerDuVide() {
        let g = geo(zoom: 4)
        XCTAssertEqual(g.offsetCentering(0), 0)
        XCTAssertEqual(g.offsetCentering(60), g.maximumOffset)
    }

    // MARK: - Le pincement

    /// Sans conservation du centre, pincer fait FUIR le contenu : l'auteur perd
    /// l'endroit qu'il regardait au moment même où il demande à le voir de plus
    /// près.
    func test_pincer_conserveLInstantSousLeCentre() {
        let g = geo(zoom: 2)
        let offsetDepart = g.offsetCentering(24)
        XCTAssertEqual(g.time(atX: g.width / 2, offset: offsetDepart), 24, accuracy: 0.0001)

        let (neuve, nouvelOffset) = g.zoomed(to: 8, offset: offsetDepart)

        XCTAssertEqual(neuve.zoom, 8)
        XCTAssertEqual(neuve.time(atX: neuve.width / 2, offset: nouvelOffset), 24, accuracy: 0.01)
    }

    /// « Le défilement est visuellement plus ou moins rapide selon le zoom » —
    /// le doigt parcourt les mêmes points, ils valent moins de temps.
    func test_leZoomChangeCombienDeTempsVautUnPoint() {
        XCTAssertEqual(geo(zoom: 1).pointsPerSecond, 5, accuracy: 0.0001)
        XCTAssertEqual(geo(zoom: 10).pointsPerSecond, 50, accuracy: 0.0001)
    }

    // MARK: - Les bornes du segment

    func test_leDebutNeDepasseJamaisLaFinMoinsLeMinimum() {
        let g = geo()
        XCTAssertEqual(g.movedStart(to: 50, end: 20), 20 - AudioTrimGeometry.minimumSegment, accuracy: 0.0001)
        XCTAssertEqual(g.movedStart(to: -10, end: 20), 0)
        XCTAssertEqual(g.movedStart(to: 5, end: 20), 5)
    }

    func test_laFinNeDescendJamaisSousLeDebutPlusLeMinimum() {
        let g = geo()
        XCTAssertEqual(g.movedEnd(to: 1, start: 20), 20 + AudioTrimGeometry.minimumSegment, accuracy: 0.0001)
        XCTAssertEqual(g.movedEnd(to: 999, start: 20), 60)
        XCTAssertEqual(g.movedEnd(to: 42, start: 20), 42)
    }

    func test_unIntervalleHorsPiste_estRameneDansLaPiste() {
        let g = geo()
        let borne = g.clampedRange((-5)...500)
        XCTAssertEqual(borne.lowerBound, 0)
        XCTAssertEqual(borne.upperBound, 60)
    }

    /// **Une piste plus courte que le segment minimal existe** — un bip d'un
    /// dixième de seconde. Lui imposer le minimum rendrait un intervalle qui
    /// DÉBORDE la piste : la durée entière est alors le seul segment possible.
    func test_unePisteTropCourte_rendLaDureeEntiere_jamaisUnIntervalleQuiDeborde() {
        let g = geo(duration: 0.1)
        let borne = g.clampedRange(0...0.1)
        XCTAssertEqual(borne.lowerBound, 0)
        XCTAssertEqual(borne.upperBound, 0.1, accuracy: 0.0001)
        XCTAssertLessThanOrEqual(borne.upperBound, g.duration)
    }

    // MARK: - Bornes du type lui-même

    /// Une durée nulle ferait diviser par zéro et propagerait des `NaN` que
    /// SwiftUI absorbe en silence — une bande vide qui a l'air de marcher.
    func test_uneDureeNulle_neProduitAucunNaN() {
        let g = geo(duration: 0)
        XCTAssertFalse(g.pointsPerSecond.isNaN)
        XCTAssertFalse(g.x(for: 5, offset: 0).isNaN)
        XCTAssertFalse(g.time(atX: 10, offset: 0).isNaN)
    }

    func test_laDureeParleeSeDIT_elleNeSeLitPas() {
        let dite = MeeshyAudioTrimmer.spokenDuration(72, locale: Locale(identifier: "fr_FR"))
        XCTAssertFalse(dite.contains(":"), "une horloge ne s'annonce pas — VoiceOver lirait « deux-points »")
        XCTAssertFalse(dite.isEmpty)
    }
}
