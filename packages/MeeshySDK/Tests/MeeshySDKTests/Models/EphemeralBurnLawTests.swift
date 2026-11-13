import Testing
import Foundation
@testable import MeeshySDK

/// La loi de la combustion d'un éphémère (#17938) — MIROIR Swift de
/// `packages/shared/utils/ephemeral-burn.ts`. Les vecteurs sont ceux de
/// `ephemeral-burn.test.ts`, à l'identique : un vecteur qui change là change ici.
@Suite("La combustion d'un éphémère — durée, vent, front, phases")
struct EphemeralBurnLawTests {

    @Test("brûle 1,2 s, et fond en 0,25 s sous « Réduire les animations »")
    func duration() {
        #expect(EphemeralBurn.fullDuration == 1.2)
        #expect(EphemeralBurn.fadeDuration == 0.25)
        #expect(EphemeralBurn.duration(reduceMotion: false) == 1.2)
        #expect(EphemeralBurn.duration(reduceMotion: true) == 0.25)
    }

    @Test("le relais d'une mort annoncée attend la combustion quand le fil est ouvert, pas sinon")
    func relayDelay() {
        #expect(EphemeralBurn.relayDelay(conversationIsOpen: false) == 0)
        #expect(EphemeralBurn.relayDelay(conversationIsOpen: true) > EphemeralBurn.fullDuration)
        #expect(EphemeralBurn.relayDelay(conversationIsOpen: true) == EphemeralBurn.fullDuration + EphemeralBurn.relayMargin)
    }

    @Test("le vent brut est absent sans capteur, et sous la zone morte")
    func rawWindAbsent() {
        #expect(EphemeralBurnLaw.windDeadZone == 0.08)
        #expect(EphemeralBurnLaw.rawWind(rollTurns: nil, lateralG: nil) == nil)
        #expect(EphemeralBurnLaw.rawWind(rollTurns: 0.01, lateralG: 0) == nil)
        #expect(EphemeralBurnLaw.rawWind(rollTurns: 0, lateralG: 0.03) == nil)
    }

    @Test("le vent brut somme le roulis (× 4) et l'accélération latérale (× 2)")
    func rawWindSum() throws {
        #expect(try #require(EphemeralBurnLaw.rawWind(rollTurns: 0.1, lateralG: 0)).isApproximately(0.4))
        #expect(try #require(EphemeralBurnLaw.rawWind(rollTurns: 0, lateralG: 0.1)).isApproximately(0.2))
        #expect(try #require(EphemeralBurnLaw.rawWind(rollTurns: 0.1, lateralG: 0.1)).isApproximately(0.6))
        #expect(try #require(EphemeralBurnLaw.rawWind(rollTurns: nil, lateralG: 0.1)).isApproximately(0.2))
    }

    @Test("le vent brut est borné à ±1")
    func rawWindClamped() {
        #expect(EphemeralBurnLaw.rawWind(rollTurns: 0.5, lateralG: 1) == 1)
        #expect(EphemeralBurnLaw.rawWind(rollTurns: -0.5, lateralG: -1) == -1)
    }

    @Test("un capteur en défaut (NaN, infini) compte comme absent")
    func rawWindNonFinite() throws {
        #expect(EphemeralBurnLaw.rawWind(rollTurns: .nan, lateralG: .infinity) == nil)
        #expect(try #require(EphemeralBurnLaw.rawWind(rollTurns: .nan, lateralG: 0.1)).isApproximately(0.2))
    }

    @Test("sans geste, le vent souffle à 0,35 vers le bord extérieur ; avec un geste, le geste gagne")
    func effectiveWind() {
        #expect(EphemeralBurnLaw.defaultWind == 0.35)
        #expect(EphemeralBurnLaw.wind(raw: nil, side: .mine) == 0.35)
        #expect(EphemeralBurnLaw.wind(raw: nil, side: .theirs) == -0.35)
        #expect(EphemeralBurnLaw.wind(raw: -0.6, side: .mine) == -0.6)
        #expect(EphemeralBurnLaw.wind(raw: 0.2, side: .theirs) == 0.2)
    }

    @Test("le feu s'allume du côté d'où vient le vent : le front suit son signe")
    func frontDirection() {
        #expect(EphemeralBurnLaw.frontDirection(wind: 0.35) == 1)
        #expect(EphemeralBurnLaw.frontDirection(wind: -0.2) == -1)
        #expect(EphemeralBurnLaw.frontDirection(wind: 0) == 1)
    }

    @Test("ignition jusqu'à 0,15, propagation jusqu'à 0,8, cendres ensuite")
    func phases() {
        #expect(EphemeralBurnLaw.phase(progress: 0) == .ignition)
        #expect(EphemeralBurnLaw.phase(progress: 0.149) == .ignition)
        #expect(EphemeralBurnLaw.phase(progress: 0.15) == .spread)
        #expect(EphemeralBurnLaw.phase(progress: 0.79) == .spread)
        #expect(EphemeralBurnLaw.phase(progress: 0.8) == .ashes)
        #expect(EphemeralBurnLaw.phase(progress: 1) == .ashes)
    }
}

private extension Double {
    func isApproximately(_ other: Double, tolerance: Double = 1e-9) -> Bool {
        abs(self - other) <= tolerance
    }
}
