import XCTest
@testable import MeeshySDK

/// La comète du `rainbow` — course d'un point chaud le long du contour, puis
/// pause, puis reprise.
///
/// La géométrie vit ici, hors de SwiftUI, pour une raison mécanique et pas
/// seulement pour la testabilité : une vue ne peut PAS dériver sa forme d'une
/// phase animée sans passer par `animatableData`. SwiftUI n'anime pas la phase,
/// il interpole la VALEUR PRODUITE entre son état initial et son état final —
/// c'est le piège déjà documenté pour `ShakeGeometryEffect`, et il frapperait
/// identiquement ici : le plateau de pause serait écrasé par une interpolation
/// plate, et la comète glisserait à vitesse constante sans jamais s'arrêter.
///
/// La règle rendue ici est donc parcourue pas à pas par la vue, jamais
/// interpolée entre deux bornes.
final class RainbowSweepTests: XCTestCase {

    private let tolerance: CGFloat = 1e-6

    private func totalLength(_ state: RainbowSweep.State) -> CGFloat {
        state.segments.reduce(0) { $0 + ($1.upperBound - $1.lowerBound) }
    }

    // MARK: - Pause

    func test_state_duringTheRest_drawsNothing() {
        for phase in [RainbowSweep.sweepFraction, 0.7, 0.9, 0.999] as [CGFloat] {
            let state = RainbowSweep.state(at: phase)
            XCTAssertTrue(state.segments.isEmpty,
                          "À la phase \(phase) la comète se repose : elle ne doit tracer aucun segment.")
            XCTAssertEqual(state.opacity, 0, accuracy: 1e-9)
        }
    }

    // MARK: - Course

    /// Le grief central contre le rendu précédent : un `AngularGradient` qui
    /// tourne balaie vite les côtés courts d'un rectangle et lentement les
    /// longs. Un arc défini sur le PÉRIMÈTRE avance, lui, à vitesse constante —
    /// ce qui se prouve par une longueur d'arc invariante tout au long de la
    /// course.
    func test_state_keepsAConstantArcLength_allAlongTheSweep() {
        for step in 0...110 {
            let phase = RainbowSweep.sweepFraction * CGFloat(step) / 110
            guard phase < RainbowSweep.sweepFraction else { continue }
            let state = RainbowSweep.state(at: phase)
            XCTAssertEqual(totalLength(state), RainbowSweep.arcLength, accuracy: tolerance,
                           "Longueur d'arc dérivante à la phase \(phase) — la comète s'étire ou se contracte.")
        }
    }

    /// `Shape.trim(from:to:)` ne reboucle pas : demander `from: 0.93, to: 1.05`
    /// ne trace rien au-delà de `1`. La tête qui franchit le raccord doit donc
    /// être rendue en DEUX segments, dont les longueurs somment toujours à
    /// l'arc entier.
    func test_state_splitsIntoTwoSegments_whenTheArcCrossesTheSeam() {
        let headInsideTheSeam: CGFloat = 0.05   // < arcLength ⇒ la queue est encore avant 0
        let phase = RainbowSweep.sweepFraction * headInsideTheSeam

        let state = RainbowSweep.state(at: phase)

        XCTAssertEqual(state.segments.count, 2,
                       "L'arc franchit le raccord : il lui faut deux segments, `trim` ne rebouclant pas.")
        XCTAssertEqual(totalLength(state), RainbowSweep.arcLength, accuracy: tolerance)
    }

    func test_state_awayFromTheSeam_drawsASingleSegment() {
        let state = RainbowSweep.state(at: RainbowSweep.sweepFraction * 0.5)

        XCTAssertEqual(state.segments.count, 1)
        XCTAssertEqual(totalLength(state), RainbowSweep.arcLength, accuracy: tolerance)
    }

    func test_state_neverLeavesTheUnitInterval() {
        for step in 0...200 {
            let state = RainbowSweep.state(at: CGFloat(step) / 200)
            for segment in state.segments {
                XCTAssertGreaterThanOrEqual(segment.lowerBound, 0)
                XCTAssertLessThanOrEqual(segment.upperBound, 1)
            }
        }
    }

    // MARK: - Continuité de la boucle

    /// La boucle ne doit pas sauter : le dernier état de la course et le
    /// premier de la course suivante décrivent la MÊME position. Sans ça, la
    /// pause masquerait un saut que l'œil rattraperait à chaque cycle.
    func test_state_loopsWithoutJumping() {
        let atStart = RainbowSweep.state(at: 0)
        let atEnd = RainbowSweep.state(at: RainbowSweep.sweepFraction.nextDown)

        XCTAssertEqual(atStart.segments.count, atEnd.segments.count)
        for (start, end) in zip(atStart.segments, atEnd.segments) {
            XCTAssertEqual(start.lowerBound, end.lowerBound, accuracy: 1e-3)
            XCTAssertEqual(start.upperBound, end.upperBound, accuracy: 1e-3)
        }
    }

    // MARK: - Fondu

    /// Une comète qui apparaît et disparaît net clignote. Elle s'allume sur les
    /// premiers pourcents de sa course et s'éteint sur les derniers.
    func test_state_fadesInAndOut_soTheCometNeverPopsIntoView() {
        XCTAssertEqual(RainbowSweep.state(at: 0).opacity, 0, accuracy: 1e-9)
        XCTAssertEqual(RainbowSweep.state(at: RainbowSweep.sweepFraction * 0.5).opacity, 1, accuracy: 1e-9)
        XCTAssertLessThan(RainbowSweep.state(at: RainbowSweep.sweepFraction.nextDown).opacity, 0.05)
    }

    func test_state_opacityRisesMonotonically_acrossTheFadeIn() {
        var previous: Double = -1
        for step in 0...20 {
            let t = RainbowSweep.fadeFraction * CGFloat(step) / 20
            let opacity = RainbowSweep.state(at: RainbowSweep.sweepFraction * t).opacity
            XCTAssertGreaterThanOrEqual(opacity, previous)
            previous = opacity
        }
        XCTAssertEqual(previous, 1, accuracy: 1e-9)
    }

    // MARK: - Robustesse de la phase

    /// Une animation `repeatForever` pilotée par `animatableData` peut livrer
    /// une phase légèrement hors de `[0, 1)` aux bornes du cycle. La règle la
    /// ramène dans l'intervalle plutôt que de rendre un état vide, ce qui
    /// produirait une frame noire une fois par cycle.
    func test_state_normalizesPhasesOutsideTheUnitInterval() {
        let inside = RainbowSweep.state(at: 0.2)

        for equivalent in [1.2, 2.2, -0.8] as [CGFloat] {
            let state = RainbowSweep.state(at: equivalent)
            XCTAssertEqual(state.segments.count, inside.segments.count,
                           "La phase \(equivalent) doit décrire le même état que 0.2.")
            for (lhs, rhs) in zip(state.segments, inside.segments) {
                XCTAssertEqual(lhs.lowerBound, rhs.lowerBound, accuracy: tolerance)
                XCTAssertEqual(lhs.upperBound, rhs.upperBound, accuracy: tolerance)
            }
            XCTAssertEqual(state.opacity, inside.opacity, accuracy: 1e-9)
        }
    }

    // MARK: - Cohérence des constantes

    /// Le repos doit dominer : c'est ce qui distingue un effet qui ponctue d'un
    /// effet qui tourne en boucle et que l'œil finit par subir.
    func test_theRest_isTheDominantPartOfTheCycle() {
        XCTAssertLessThan(RainbowSweep.sweepFraction, 0.6)
        XCTAssertGreaterThan(RainbowSweep.cycle, 3)
    }
}
