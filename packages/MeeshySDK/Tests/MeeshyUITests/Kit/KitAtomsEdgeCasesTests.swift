import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// La seconde revue du lot #18864 : un maintien qui ne se relâchait ni au doigt
/// sorti ni au geste annulé par le système, une paire dont le libellé débordait
/// sur son voisin au lieu de s'empiler, une jauge qui dépassait sa valeur (et sa
/// piste) en rebondissant, et une jauge sans valeur qui se disait « 0 % ».
@Suite("Atomes du kit : maintien, paire et jauge aux bords")
struct KitAtomsEdgeCasesTests {

    // MARK: - Le maintien se relâche au doigt sorti et au geste annulé

    @Test("le doigt qui sort de la cible relâche une fois ; y revenir ne réarme pas ce toucher")
    func holdLaw_exitReleasesAndDoesNotRearm() {
        var law = MeeshyButtonHoldLaw()
        #expect(law.track(isInside: true, isEnabled: true) == true)
        #expect(law.track(isInside: true, isEnabled: true) == nil)
        #expect(law.track(isInside: false, isEnabled: true) == false)
        #expect(!law.isHeld)
        #expect(law.track(isInside: true, isEnabled: true) == nil)
        #expect(law.track(isInside: false, isEnabled: true) == nil)
        #expect(law.endTouch() == nil)
        #expect(law.track(isInside: true, isEnabled: true) == true)
    }

    @Test("le geste annulé par le système relâche ce qui tient, et le toucher suivant repart de zéro")
    func holdLaw_cancelledGestureReleases() {
        var law = MeeshyButtonHoldLaw()
        #expect(law.track(isInside: true, isEnabled: true) == true)
        #expect(law.endTouch() == false)
        #expect(law.endTouch() == nil)
        #expect(law.track(isInside: true, isEnabled: true) == true)
    }

    @Test("un toucher posé sur un maintien éteint ne s'arme jamais, même si le bouton s'allume sous le doigt")
    func holdLaw_disabledTouchNeverArms() {
        var law = MeeshyButtonHoldLaw()
        #expect(law.track(isInside: true, isEnabled: false) == nil)
        #expect(law.track(isInside: true, isEnabled: true) == nil)
        #expect(!law.isHeld)
        #expect(law.endTouch() == nil)
        #expect(law.track(isInside: true, isEnabled: true) == true)
        #expect(law.track(isInside: true, isEnabled: false) == false)
    }

    @Test("dedans : le disque et sa marge de tolérance ; dehors : au-delà, dans les coins compris")
    func holdLaw_inside() {
        let diameter = MeeshyButtonRecipe.holdDiameter
        let center = diameter / 2
        let slop = MeeshyButtonHoldLaw.exitSlop
        #expect(MeeshyButtonHoldLaw.isInside(x: center, y: center, diameter: diameter))
        #expect(MeeshyButtonHoldLaw.isInside(x: center, y: -slop + 0.5, diameter: diameter))
        #expect(!MeeshyButtonHoldLaw.isInside(x: center, y: -slop - 0.5, diameter: diameter))
        #expect(!MeeshyButtonHoldLaw.isInside(x: diameter + slop + 1, y: center, diameter: diameter))
        #expect(!MeeshyButtonHoldLaw.isInside(x: -slop, y: -slop, diameter: diameter))
        #expect(!MeeshyButtonHoldLaw.isInside(x: .nan, y: center, diameter: diameter))
    }

    @Test("la vue suit le doigt par la loi, et relâche sur la remise à zéro de l'état du geste")
    func hold_viewTracksTheFingerAndTheCancellation() throws {
        let source = try KitAtomVectors.code("MeeshyButton.swift")
        #expect(source.contains("holdLaw.track(isInside:"), "le doigt sorti ne relâcherait pas")
        #expect(source.contains(".updating($isTouching)"), "un geste annulé laisserait le maintien armé")
        #expect(source.contains("adaptiveOnChange(of: isTouching)"))
        #expect(source.contains("holdLaw.endTouch()"))
    }

    @Test("le maintien dit sa raison quand il est éteint et « en cours » quand il est occupé, comme la capsule")
    func hold_speaksItsState() throws {
        let source = try KitAtomVectors.code("MeeshyButton.swift")
        let hold = try #require(source.range(of: "private var holdControl"))
        let end = try #require(source.range(of: "private func recipeValue", range: hold.upperBound..<source.endIndex))
        #expect(source[hold.upperBound..<end.lowerBound].contains("MeeshyButtonSpokenState("))
    }

    // MARK: - La paire s'empile quand un libellé ne tient pas dans sa part

    @Test("la largeur qu'il faut : chaque bouton dans sa part de 1,6 ou de 1, plus l'écart")
    func pair_neededWidth() {
        typealias Law = MeeshyButtonPairLaw
        let needed = Law.neededWidth(primaryIdeal: 160, secondaryIdeal: 80)
        #expect(abs(needed - (160 * 2.6 / 1.6 + Law.spacing)) < 1e-9)
        let widths = Law.widths(total: needed)
        #expect(widths.primary >= 160 - 1e-9)
        #expect(widths.secondary >= 80 - 1e-9)
        let secondaryBound = Law.neededWidth(primaryIdeal: 100, secondaryIdeal: 120)
        #expect(abs(secondaryBound - (120 * 2.6 + Law.spacing)) < 1e-9)
    }

    @Test("elle reste en ligne quand tout tient ; elle s'empile quand un libellé déborde ou aux très grandes polices")
    func pair_stacksWhenALabelDoesNotFit() {
        typealias Law = MeeshyButtonPairLaw
        #expect(!Law.stacks(isAccessibilitySize: false, total: 343, primaryIdeal: 150, secondaryIdeal: 90))
        #expect(Law.stacks(isAccessibilitySize: false, total: 343, primaryIdeal: 150, secondaryIdeal: 180))
        #expect(Law.stacks(isAccessibilitySize: false, total: 343, primaryIdeal: 260, secondaryIdeal: 60))
        #expect(Law.stacks(isAccessibilitySize: true, total: 343, primaryIdeal: 50, secondaryIdeal: 50))
        let exact = Law.neededWidth(primaryIdeal: 150, secondaryIdeal: 90)
        #expect(!Law.stacks(isAccessibilitySize: false, total: exact, primaryIdeal: 150, secondaryIdeal: 90))
    }

    @Test("la mise en page de la paire mesure les libellés avant de choisir la ligne ou la pile")
    func pair_layoutMeasuresTheLabels() throws {
        let source = try KitAtomVectors.code("MeeshyButton.swift")
        #expect(source.contains("MeeshyButtonPairLaw.stacks(isAccessibilitySize: isAccessibilitySize, total:"))
    }

    // MARK: - La jauge ne dépasse jamais sa valeur

    @Test("l'entrée de la jauge suit la réponse de rise sans rebond : le remplissage ne déborde pas la piste")
    func meter_entryNeverOvershoots() {
        #expect(MeeshyMeterRecipe.entryDamping >= 1)
        #expect(MeeshyMeterRecipe.entryResponse == MeeshyMotionRecipe.resolve(token: .rise).response)
        #expect(MeeshyMeterRecipe.entryAnimation(reduce: false, animatesOnAppear: true) != nil)
        #expect(MeeshyMeterRecipe.entryAnimation(reduce: true, animatesOnAppear: true) == nil)
    }

    @Test("une jauge sans valeur ne se dit pas « 0 % » ; le texte de l'hôte reste dit")
    func meter_indeterminateSpeaksNoPercent() {
        let locale = Locale(identifier: "fr")
        #expect(MeeshyMeterRecipe.spokenValue(spoken: nil, fraction: nil, locale: locale) == nil)
        #expect(MeeshyMeterRecipe.spokenValue(spoken: "", fraction: nil, locale: locale) == nil)
        #expect(MeeshyMeterRecipe.spokenValue(spoken: "Chargement", fraction: nil, locale: locale) == "Chargement")
        #expect(MeeshyMeterRecipe.spokenValue(spoken: nil, fraction: 0, locale: locale) != nil)
    }

    @Test("deux repères égaux ne se disputent pas une identité")
    func meter_marksAreKeyedByPosition() throws {
        let source = try KitAtomVectors.code("MeeshyMeter.swift")
        #expect(!source.contains("ForEach(shownMarks, id: \\.self)"))
    }
}
