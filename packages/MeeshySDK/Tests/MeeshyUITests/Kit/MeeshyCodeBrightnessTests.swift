import Testing
import Foundation
@testable import MeeshyUI

/// K31 — la luminosité poussée lue comme une COMPTABILITÉ : la valeur d'avant ne
/// revient qu'au départ de la dernière carte, elle revient en arrière-plan, et le
/// retour au premier plan repousse l'écran tant qu'une carte est là. Témoin de la
/// fiche : « la luminosité revient à sa valeur à la disparition, en arrière-plan ».
@Suite("MeeshyCodeBrightness")
struct MeeshyCodeBrightnessTests {

    @Test("deux cartes à l'écran : la valeur d'avant ne revient qu'au départ de la dernière, dans un ordre comme dans l'autre")
    func twoCards_restoreTheOriginalOnlyOnce() {
        for firstToLeave in [0, 1] {
            let cards = [UUID(), UUID()]
            var ledger = MeeshyBrightnessLedger()
            #expect(ledger.acquire(cards[0], current: 0.4) == MeeshyBrightnessLedger.boosted)
            #expect(ledger.acquire(cards[1], current: MeeshyBrightnessLedger.boosted) == MeeshyBrightnessLedger.boosted)
            #expect(ledger.release(cards[firstToLeave]) == nil)
            #expect(ledger.release(cards[1 - firstToLeave]) == 0.4)
            #expect(ledger.holders.isEmpty)
        }
    }

    @Test("l'arrière-plan rend la valeur d'avant ; le retour repousse et retient la valeur choisie entre-temps")
    func background_restores_andForeground_boostsAgain() {
        let card = UUID()
        var ledger = MeeshyBrightnessLedger()
        #expect(ledger.acquire(card, current: 0.3) == MeeshyBrightnessLedger.boosted)
        #expect(ledger.suspend() == 0.3)
        #expect(ledger.resume(current: 0.5) == MeeshyBrightnessLedger.boosted)
        #expect(ledger.release(card) == 0.5)
    }

    @Test("carte retirée pendant l'arrière-plan : rien n'est rendu deux fois, le retour ne repousse rien")
    func leavingWhileSuspended_restoresNothingTwice() {
        let card = UUID()
        var ledger = MeeshyBrightnessLedger()
        _ = ledger.acquire(card, current: 0.3)
        #expect(ledger.suspend() == 0.3)
        #expect(ledger.release(card) == nil)
        #expect(ledger.resume(current: 0.3) == nil)
    }

    @Test("une carte qui arrive en arrière-plan attend le retour pour pousser")
    func acquiringWhileSuspended_waitsForTheForeground() {
        let card = UUID()
        var ledger = MeeshyBrightnessLedger()
        #expect(ledger.suspend() == nil)
        #expect(ledger.acquire(card, current: 0.6) == nil)
        #expect(ledger.resume(current: 0.6) == MeeshyBrightnessLedger.boosted)
        #expect(ledger.release(card) == 0.6)
    }

    @Test("une carte comptée deux fois ne l'est qu'une ; une carte inconnue ne rend rien")
    func acquire_isIdempotent_andUnknownReleaseIsSilent() {
        let card = UUID()
        var ledger = MeeshyBrightnessLedger()
        _ = ledger.acquire(card, current: 0.2)
        _ = ledger.acquire(card, current: MeeshyBrightnessLedger.boosted)
        #expect(ledger.release(UUID()) == nil)
        #expect(ledger.release(card) == 0.2)
        #expect(ledger.release(card) == nil)
    }

    @Test("garde de source : la carte passe par la comptabilité unique et reprend au retour au premier plan")
    func source_goesThroughTheLedger() throws {
        let source = try KitAtomVectors.code("MeeshyCodeScreenBrightness.swift")
        #expect(source.contains("MeeshyBrightnessLedger"))
        #expect(source.contains("didBecomeActiveNotification"))
        #expect(source.contains("willResignActiveNotification"))
        #expect(source.components(separatedBy: ".brightness =").count == 2,
                "un seul site écrit la luminosité de l'écran")
        try KitAssemblyGuards.assertAgnostic(["MeeshyCodeScreenBrightness.swift", "MeeshyBrightnessLedger.swift"])
    }
}
