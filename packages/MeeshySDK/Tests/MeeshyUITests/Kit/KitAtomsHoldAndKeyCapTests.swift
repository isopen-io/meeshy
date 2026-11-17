import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// La troisième revue du lot #18864 : le maintien qui devient indisponible sous
/// un doigt immobile, les ondes et les retours du maintien en émission, la
/// lèvre de la touche de raccourci, son enfoncement et l'ordre de frappe d'une
/// combinaison en écriture de droite à gauche, et la légende retournée deux fois.
@Suite("Atomes du kit : maintien, touche de raccourci et légende")
struct KitAtomsHoldAndKeyCapTests {

    // MARK: - Le maintien qui devient indisponible

    @Test("un maintien éteint ou occupé sous un doigt immobile se relâche, et ce toucher ne réarme plus")
    func holdLaw_revokeWhileTouching() {
        var law = MeeshyButtonHoldLaw()
        #expect(law.track(isInside: true, isEnabled: true) == true)
        #expect(law.revoke(isTouching: true) == false)
        #expect(!law.isHeld)
        #expect(law.track(isInside: true, isEnabled: true) == nil)
        #expect(law.endTouch() == nil)
        #expect(law.track(isInside: true, isEnabled: true) == true)
    }

    @Test("sans doigt posé (maintien du lecteur d'écran), la révocation relâche sans gâcher le toucher suivant")
    func holdLaw_revokeWithoutTouch() {
        var law = MeeshyButtonHoldLaw()
        #expect(law.revoke(isTouching: false) == nil)
        #expect(law.toggle(isEnabled: true) == true)
        #expect(law.revoke(isTouching: false) == false)
        #expect(law.track(isInside: true, isEnabled: true) == true)
    }

    @Test("la vue relâche le maintien dès que le bouton cesse d'être disponible, sans attendre que le doigt bouge")
    func hold_viewRevokesWhenUnavailable() throws {
        let source = try KitAtomVectors.code("MeeshyButton.swift")
        #expect(source.contains("adaptiveOnChange(of: isHoldAvailable)"))
        #expect(source.contains("holdLaw.revoke(isTouching: isTouching)"))
        #expect(source.contains("holdLaw.toggle(isEnabled: isHoldAvailable)"))
    }

    // MARK: - Le maintien en émission

    @Test("deux ondes partent tant que l'hôte dit « en émission » ; sous réduction, un anneau plein de 6")
    func holdDecor_followsTheHoldState() {
        typealias D = MeeshyButtonHoldDecor
        #expect(D.resolve(holdState: .live, reduceMotion: false) == D(waveCount: 2, showsStillRing: false))
        #expect(D.resolve(holdState: .live, reduceMotion: true) == D(waveCount: 0, showsStillRing: true))
        for state in [MeeshyButtonHoldState.idle, .held, .refused] {
            #expect(D.resolve(holdState: state, reduceMotion: false) == D(waveCount: 0, showsStillRing: false))
            #expect(D.resolve(holdState: state, reduceMotion: true) == D(waveCount: 0, showsStillRing: false))
        }
        #expect(D.stillRingWidth == 6)
        #expect(D.wavePeriodSeconds == 2.6)
    }

    @Test("une onde part du disque à 0,75 et s'éteint à 1,85 fois ; la seconde a 1,3 s de décalage")
    func holdDecor_waves() {
        typealias D = MeeshyButtonHoldDecor
        let start = D.wave(index: 0, count: 2, elapsed: 0)
        #expect(start.scale == 1)
        #expect(start.opacity == D.waveStartOpacity)
        let late = D.wave(index: 0, count: 2, elapsed: D.wavePeriodSeconds * 0.999)
        #expect(abs(late.scale - D.waveEndScale) < 0.01)
        #expect(late.opacity < 0.01)
        let second = D.wave(index: 1, count: 2, elapsed: 0)
        let first = D.wave(index: 0, count: 2, elapsed: 1.3)
        #expect(abs(second.scale - first.scale) < 1e-9)
        #expect(D.wave(index: 0, count: 2, elapsed: .nan) == start)
    }

    @Test("un tic ferme à l'ouverture et à la fermeture de l'émission, une erreur au refus, rien sinon")
    func holdDecor_feedback() {
        typealias D = MeeshyButtonHoldDecor
        #expect(D.feedback(from: .held, to: .live) == .firm)
        #expect(D.feedback(from: .live, to: .idle) == .firm)
        #expect(D.feedback(from: .held, to: .refused) == .error)
        #expect(D.feedback(from: .idle, to: .held) == nil)
        #expect(D.feedback(from: .live, to: .live) == nil)
        #expect(D.feedback(from: .refused, to: .refused) == nil)
    }

    @Test("la vue dessine les ondes du maintien et joue ses retours au changement d'état remis par l'hôte")
    func hold_viewDrawsWavesAndFeedback() throws {
        let source = try KitAtomVectors.code("MeeshyButton.swift")
        #expect(source.contains("MeeshyButtonHoldDecor.resolve(holdState: holdState"))
        #expect(source.contains("MeeshyButtonHoldDecor.wave("))
        #expect(source.contains("adaptiveOnChange(of: holdState)"))
        #expect(source.contains("MeeshyButtonHoldDecor.feedback(from:"))
    }

    // MARK: - La jauge en écriture de droite à gauche

    @Test("en arabe, le dégradé de la jauge part du bord de début, comme son remplissage")
    func meter_gradientFollowsTheFill() throws {
        #expect(MeeshyMeterRecipe.gradientPoints(isRightToLeft: false) == [.leading, .trailing])
        #expect(MeeshyMeterRecipe.gradientPoints(isRightToLeft: true) == [.trailing, .leading])
        let source = try KitAtomVectors.code("MeeshyMeter.swift")
        #expect(source.contains("isRightToLeft: layoutDirection == .rightToLeft"))
    }

    // MARK: - La touche de raccourci

    @Test("enfoncée, la touche descend de 1,5 ; sous réduction elle ne bouge pas")
    func keyHint_pressDepth() {
        #expect(MeeshyKeyHintRecipe.resolve(size: .regular, isPressed: true, reduceMotion: false).pressOffset == 1.5)
        #expect(MeeshyKeyHintRecipe.resolve(size: .compact, isPressed: true, reduceMotion: false).pressOffset == 1.5)
        #expect(MeeshyKeyHintRecipe.resolve(size: .regular, isPressed: true, reduceMotion: true).pressOffset == 0)
    }

    @Test("le bord de la touche : un filet de 1 sur trois côtés, la lèvre en bas ; la face reste vide")
    func keyCap_rimDrawsTheLip() {
        let rect = CGRect(x: 0, y: 0, width: 26, height: 26)
        let path = MeeshyKeyCapRim(cornerRadius: 8, edge: 1, lip: 2.5).path(in: rect)
        #expect(path.contains(CGPoint(x: 13, y: 24.5), eoFill: true), "la lèvre ne se voit pas")
        #expect(path.contains(CGPoint(x: 13, y: 0.5), eoFill: true), "le filet du haut manque")
        #expect(path.contains(CGPoint(x: 0.5, y: 13), eoFill: true), "le filet du bord manque")
        #expect(!path.contains(CGPoint(x: 13, y: 13), eoFill: true), "la lèvre recouvre la face")
        #expect(!path.contains(CGPoint(x: 13, y: 22.5), eoFill: true), "la lèvre est plus épaisse que sa mesure")
    }

    @Test("enfoncée, la face prend l'accent ; au repos elle garde la surface de son hôte")
    @MainActor
    func keyCap_pressedFaceTakesTheAccent() {
        let pressed = MeeshyKeyHintColors.face(surface: .auto, isPressed: true, isDark: false)
        let rest = MeeshyKeyHintColors.face(surface: .auto, isPressed: false, isDark: false)
        #expect(pressed == MeeshyKeyHintColors.pressedFace)
        #expect(rest == MeeshyColors.surfaceFill(isDark: false))
        #expect(MeeshyKeyHintColors.face(surface: .onGlass, isPressed: true, isDark: true) == MeeshyKeyHintColors.pressedFace)
    }

    @Test("la lèvre reste quand la touche s'enfonce : seule la face descend, et la lèvre n'est plus cachée sous elle")
    func keyCap_viewKeepsTheLip() throws {
        let source = try KitAtomVectors.code("MeeshyKeyHint.swift")
        #expect(source.contains("MeeshyKeyCapRim("))
        #expect(!source.contains(".background(shape.fill(MeeshyKeyHintColors.lip"),
                "une lèvre peinte sous la face la remplit entière : elle ne dit plus « touche »")
    }

    @Test("en arabe, l'ordre de frappe d'une combinaison ne s'inverse pas : la rangée de touches reste de gauche à droite")
    func keyHint_comboKeepsTypingOrder() throws {
        let source = try KitAtomVectors.code("MeeshyKeyHint.swift")
        #expect(source.contains(".environment(\\.layoutDirection, .leftToRight)"))
    }

    @Test("la légende se pose depuis son début : SwiftUI la retourne en RTL, un second retournement la remettait à l'endroit")
    func legend_isMirroredOnceBySwiftUI() throws {
        let source = try KitAtomVectors.code("MeeshyKeyHint.swift")
        let flow = try #require(source.range(of: "private struct MeeshyKeyFlowLayout"))
        let body = source[flow.lowerBound...]
        #expect(!body.contains("isRightToLeft"))
        #expect(!body.contains("bounds.maxX - x"))
    }
}
