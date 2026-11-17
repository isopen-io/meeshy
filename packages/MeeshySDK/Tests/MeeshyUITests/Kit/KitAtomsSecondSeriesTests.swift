import Testing
import Foundation
@testable import MeeshyUI

/// La seconde série d'atomes (K33, K35, K37, K38 squelette, K51, K53) tient la même
/// loi que la première : les deux moitiés de « réduire les animations » (celle du
/// système et celle que l'app impose), et aucun mouvement posé hors de la table.
@Suite("Atomes du kit, seconde série : réduction et mouvement")
struct KitAtomsSecondSeriesTests {

    private static let views = ["MeeshyCircleScale.swift", "MeeshyWavePlayer.swift", "MeeshyWaveBars.swift",
                                "MeeshyLockedRow.swift", "MeeshyTranslationMark.swift", "MeeshyStepper.swift",
                                "MeeshySkeleton.swift"]

    @Test("chaque vue lit la réduction du système ET celle que l'app impose, et les combine")
    func reduceMotion_readsBothHalves() throws {
        for file in Self.views {
            let source = try KitAtomVectors.code(file)
            let system = source.components(separatedBy: "@Environment(\\.accessibilityReduceMotion)").count - 1
            let forced = source.components(separatedBy: "@Environment(\\.meeshyForceReduceMotion)").count - 1
            #expect(system > 0, "\(file) ne lit pas la réduction")
            #expect(system == forced, "\(file) : \(system) lecture(s) système, \(forced) lecture(s) forcée(s)")
            #expect(source.contains("MeeshyMotion.shouldReduce("), "\(file) ne combine pas les deux moitiés")
        }
    }

    @Test("aucune animation ni aucun ressort écrit à la main : tout passe par la table de mouvement")
    func motion_comesFromTheTable() throws {
        for file in Self.views {
            let source = try KitAtomVectors.code(file)
            for forbidden in [".spring(", ".easeInOut(", ".easeOut(", "withAnimation(.default", ".linear(duration"] {
                #expect(!source.contains(forbidden), "\(file) contient \(forbidden)")
            }
        }
    }

    // MARK: - Le pas-à-pas tenu : chaque pas part de la valeur COURANTE, et l'appui s'arrête avec son geste

    @Test("un toucher avance d'un pas au relâcher ; un appui qui a répété n'en ajoute aucun")
    func stepperHold_tapAndRepeat() {
        var tap = MeeshyStepperHoldLaw()
        let tapPress1 = tap.press(isActive: true)
        #expect(tapPress1)
        let tapRelease2 = tap.release(isActive: true)
        #expect(tapRelease2)
        #expect(!tap.isHeld)

        var held = MeeshyStepperHoldLaw()
        let heldPress3 = held.press(isActive: true)
        #expect(heldPress3)
        let heldPress4 = held.press(isActive: true)
        #expect(!heldPress4, "un second doigt posé ne relance pas la cadence")
        let heldRepeatTick5 = held.repeatTick(isActive: true)
        #expect(heldRepeatTick5)
        let heldRepeatTick6 = held.repeatTick(isActive: true)
        #expect(heldRepeatTick6)
        let heldRelease7 = held.release(isActive: true)
        #expect(!heldRelease7, "le relâcher d'un appui long n'ajoute pas de pas")
    }

    @Test("un appui annulé, éteint ou arrivé en butée n'avance plus, et le relâcher qui suit n'ajoute rien")
    func stepperHold_stopsWithItsGesture() {
        var cancelled = MeeshyStepperHoldLaw()
        let cancelledPress8 = cancelled.press(isActive: true)
        #expect(cancelledPress8)
        cancelled.cancel()
        #expect(!cancelled.isHeld)
        let cancelledRepeatTick9 = cancelled.repeatTick(isActive: true)
        #expect(!cancelledRepeatTick9, "une cadence orpheline continuerait d'avancer la valeur")
        let cancelledRelease10 = cancelled.release(isActive: true)
        #expect(!cancelledRelease10, "un geste annulé ne compte pas comme un toucher")

        var atBound = MeeshyStepperHoldLaw()
        let atBoundPress11 = atBound.press(isActive: true)
        #expect(atBoundPress11)
        let atBoundRepeatTick12 = atBound.repeatTick(isActive: false)
        #expect(!atBoundRepeatTick12)
        #expect(!atBound.isHeld)

        var off = MeeshyStepperHoldLaw()
        let offPress13 = off.press(isActive: false)
        #expect(!offPress13)
        let offRelease14 = off.release(isActive: false)
        #expect(!offRelease14)
    }

    @Test("la cadence fait avancer un compteur que la vue relit : le pas suivant part de la valeur remise par l'hôte")
    func stepperHold_stepsFromTheCurrentValue() throws {
        let source = try KitAtomVectors.code("MeeshyStepper.swift")
        let hold = try #require(source.range(of: "struct MeeshyStepperHold"))
        let body = String(source[hold.lowerBound...])
        let task = try #require(body.range(of: "Task { @MainActor in"))
        let close = try #require(body.range(of: "private func end()", range: task.upperBound..<body.endIndex))
        let loop = String(body[task.upperBound..<close.lowerBound])
        #expect(!loop.contains("onStep()"),
                "la tâche rappellerait la fermeture capturée au doigt posé : chaque pas repartirait de la même valeur")
        #expect(body.contains("adaptiveOnChange(of: ticks"))
        #expect(body.contains("@GestureState"), "un geste annulé laisserait la cadence tourner")
        #expect(body.contains("adaptiveOnChange(of: isActive"), "la cadence survivrait à la butée")
    }

    // MARK: - Le glissement de l'onde se ferme toujours

    @Test("le glissement commence au premier mouvement, remet sa fraction au relâcher et se ferme même refusé")
    func waveScrub_alwaysCloses() {
        var law = MeeshyWaveScrubLaw()
        let lawMove15 = law.move(to: 0.3)
        #expect(lawMove15)
        let lawMove16 = law.move(to: 0.4)
        #expect(!lawMove16, "le début ne se dit qu'une fois")
        #expect(law.fraction == 0.4)
        let done = law.finish(at: 0.5, accepts: true)
        #expect(done.commit == 0.5)
        #expect(done.ended)
        #expect(law.fraction == nil)

        var refused = MeeshyWaveScrubLaw()
        let refusedMove17 = refused.move(to: 0.2)
        #expect(refusedMove17)
        let late = refused.finish(at: 0.6, accepts: false)
        #expect(late.commit == nil)
        #expect(late.ended, "un lecteur devenu indisponible pendant le geste resterait figé en glissement")
        #expect(refused.fraction == nil)
    }

    @Test("un glissement annulé ne remet rien et dit sa fin une seule fois")
    func waveScrub_cancel() {
        var law = MeeshyWaveScrubLaw()
        let lawCancel18 = law.cancel()
        #expect(!lawCancel18)
        let lawMove19 = law.move(to: 0.7)
        #expect(lawMove19)
        let lawCancel20 = law.cancel()
        #expect(lawCancel20)
        #expect(law.fraction == nil)
        let lawCancel21 = law.cancel()
        #expect(!lawCancel21)
    }

    @Test("le lecteur passe par la loi et ferme le glissement à l'annulation du geste et au départ de la vue")
    func waveScrub_viewUsesTheLaw() throws {
        let source = try KitAtomVectors.code("MeeshyWavePlayer.swift")
        #expect(source.contains("scrubLaw.finish("))
        #expect(source.contains("@GestureState"))
        #expect(source.contains("adaptiveOnChange(of: isTouching"))
        #expect(source.contains(".onDisappear"))
    }

    // MARK: - La rangée verrouillée ne reste pas ouverte quand l'hôte la referme

    @Test("ouverte par l'hôte ou pendant son ouverture ; refermée dès que l'hôte ne dit plus ni l'un ni l'autre")
    func lockedRow_shownOpen() {
        typealias R = MeeshyLockedRowRecipe
        #expect(R.shownOpen(isOpen: true, isUnlocking: false, hasPlayed: false))
        #expect(R.shownOpen(isOpen: false, isUnlocking: true, hasPlayed: true))
        #expect(!R.shownOpen(isOpen: false, isUnlocking: true, hasPlayed: false))
        #expect(!R.shownOpen(isOpen: false, isUnlocking: false, hasPlayed: true),
                "une ouverture jouée une fois laisserait la rangée ouverte après que l'accès a été retiré")
    }

    @Test("la rangée lit la loi et oublie l'ouverture jouée quand l'hôte cesse de l'ouvrir")
    func lockedRow_viewUsesTheLaw() throws {
        let source = try KitAtomVectors.code("MeeshyLockedRow.swift")
        #expect(source.contains("MeeshyLockedRowRecipe.shownOpen("))
        #expect(!source.contains("isOpen || hasUnlocked"))
    }

    // MARK: - La marque mesure la place offerte, pas son propre contenu

    @Test("la marque à bascule occupe la largeur offerte avant de la mesurer : elle ne se replie que faute de place")
    func translationMark_measuresTheOfferedWidth() throws {
        let source = try KitAtomVectors.code("MeeshyTranslationMark.swift")
        let measured = try #require(source.range(of: "MeeshyTranslationMarkWidthKey.self, value:"))
        let before = String(source[..<measured.lowerBound].suffix(400))
        #expect(before.contains("maxWidth: recipe.showsToggle ? .infinity : nil"),
                "mesurée sur son contenu, la ligne (≈ 240 pt) passerait toujours sous 320 et replierait sa bascule")
    }

    // MARK: - L'échelle ne fait vibrer que le choix

    @Test("le tic part d'un choix qui change de niveau, jamais d'un niveau remis par l'hôte")
    func circleScale_hapticOnlyOnChoice() throws {
        typealias R = MeeshyCircleScaleRecipe
        #expect(R.playsHaptic(.onChange, chosen: 3, current: 1, reduceMotion: false))
        #expect(!R.playsHaptic(.onChange, chosen: 1, current: 1, reduceMotion: false))
        #expect(!R.playsHaptic(.none, chosen: 3, current: 1, reduceMotion: false))
        #expect(!R.playsHaptic(.onChange, chosen: 3, current: 1, reduceMotion: true))
        #expect(R.playsHaptic(.onChange, chosen: 0, current: nil, reduceMotion: false))
        let source = try KitAtomVectors.code("MeeshyCircleScale.swift")
        #expect(!source.contains("adaptiveOnChange(of: current)"),
                "le profil chargé, ou un niveau changé ailleurs, ferait vibrer le téléphone")
    }
}
