import CoreGraphics
import Foundation
import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// #11301 — **les déclencheurs simples animent une lens** : bouche ouverte,
/// sourcils, sourire, clignement, toucher, temps, parole. Un geste se lit sur des
/// RATIOS de repères avec hystérésis ; un déclencheur part sur le FRONT montant
/// du geste, jamais tant qu'il dure. Fixtures, faux positifs compris.
final class LensTriggerEngineTests: XCTestCase {

    // MARK: - Les gestes, avec hystérésis

    func test_mouthOpen_entersAboveTheOpenRatio_andLeavesOnlyBelowTheCloseRatio() {
        let lu = Self.read([0.05, 0.36, 0.30, 0.36, 0.20, 0.40].map { Self.face(mouth: $0) })

        XCTAssertEqual(lu.map { $0.contains(.mouthOpen) }, [false, true, true, true, false, true])
    }

    /// Parler ouvre la bouche entre 0,2 et 0,33 : ce n'est pas « bouche ouverte ».
    func test_talking_isNotAnOpenMouth() {
        let lu = Self.read([0.22, 0.31, 0.28, 0.33, 0.26, 0.32].map { Self.face(mouth: $0) })

        XCTAssertFalse(lu.contains { $0.contains(.mouthOpen) })
    }

    /// Une gigue autour du seuil ne déclenche qu'UNE fois.
    func test_jitterAroundTheThreshold_firesOnce() {
        let edges = Self.edges(of: .mouthOpen, over: [0.34, 0.36, 0.34, 0.36, 0.34, 0.36].map { Self.face(mouth: $0) })

        XCTAssertEqual(edges, 1)
    }

    func test_blink_needsBothEyes_aWinkIsNot() {
        XCTAssertFalse(Self.read([Self.face(leftEye: 0.05, rightEye: 0.3)]).last?.contains(.blink) ?? true)
        XCTAssertTrue(Self.read([Self.face(leftEye: 0.05, rightEye: 0.05)]).last?.contains(.blink) ?? false)
    }

    func test_blink_staysClosedUntilAnEyeReallyReopens() {
        let lu = Self.read([0.3, 0.1, 0.18, 0.25].map { Self.face(leftEye: $0, rightEye: $0) })

        XCTAssertEqual(lu.map { $0.contains(.blink) }, [false, true, true, false])
    }

    func test_smile_isAWideMouth_withHysteresis() {
        let lu = Self.read([0.40, 0.52, 0.46, 0.42].map { Self.face(mouthWidth: $0) })

        XCTAssertEqual(lu.map { $0.contains(.smile) }, [false, true, true, false])
    }

    func test_browRaise_isTheGapBetweenBrowsAndEyes_withHysteresis() {
        let lu = Self.read([0.10, 0.17, 0.13, 0.11].map { Self.face(browGap: $0) })

        XCTAssertEqual(lu.map { $0.contains(.browRaise) }, [false, true, true, false])
    }

    /// De profil, les ratios mentent : aucun geste du visage n'est lu tête tournée.
    func test_turnedHead_readsNoFaceGesture() {
        let profil = Self.face(mouth: 0.6, leftEye: 0.05, rightEye: 0.05, mouthWidth: 0.6, browGap: 0.2, yaw: 0.6)

        XCTAssertEqual(Self.read([profil]).last, [])
    }

    func test_withoutFace_noFaceGestureSurvives() {
        let lu = LensGestureReader.read(LensSignals(face: nil, seconds: 1), previous: [.mouthOpen, .smile, .speaking])

        XCTAssertEqual(lu, [])
    }

    func test_speaking_followsTheVoiceLevel_withHysteresis() {
        let niveaux = [0.02, 0.15, 0.08, 0.03]
        let lu = niveaux.reduce(into: [Set<LensGesture>]()) { suite, niveau in
            suite.append(LensGestureReader.read(LensSignals(face: nil, voiceLevel: niveau, seconds: 0), previous: suite.last ?? []))
        }

        XCTAssertEqual(lu.map { $0.contains(.speaking) }, [false, true, true, false])
    }

    // MARK: - Les déclencheurs

    /// Une couche qu'un déclencheur MONTRE (ou fait jaillir, ou joue) attend son déclencheur ;
    /// une couche qu'il cache est visible d'abord.
    func test_initialState_hidesWhatATriggerReveals() {
        let state = LensTriggerState.initial(for: Self.aurore())

        XCTAssertEqual(LensTriggerEngine.hiddenLayers(state, at: 0), ["neige"])
    }

    func test_onTap_hidesItsTarget() {
        let lens = Self.aurore()
        let state = LensTriggerEngine.step(.initial(for: lens), lens: lens, signals: LensSignals(face: nil, tapped: true, seconds: 1))

        XCTAssertEqual(LensTriggerEngine.hiddenLayers(state, at: 1), ["neige", "etoile"])
    }

    func test_onSmile_burstsItsParticles_forABurstOnly() {
        let lens = Self.aurore()
        let neutre = LensTriggerEngine.step(.initial(for: lens), lens: lens, signals: LensSignals(face: Self.face(), seconds: 1))
        let sourire = LensTriggerEngine.step(neutre, lens: lens, signals: LensSignals(face: Self.face(mouthWidth: 0.55), seconds: 2))

        XCTAssertFalse(LensTriggerEngine.hiddenLayers(sourire, at: 2).contains("neige"))
        XCTAssertFalse(LensTriggerEngine.hiddenLayers(sourire, at: 2 + LensTriggerEngine.burstDuration - 0.1).contains("neige"))
        XCTAssertTrue(LensTriggerEngine.hiddenLayers(sourire, at: 2 + LensTriggerEngine.burstDuration + 0.1).contains("neige"))
    }

    /// Un sourire qui DURE ne relance pas la rafale à chaque image.
    func test_aHeldSmile_burstsOnce() {
        let lens = Self.aurore()
        let frames = (0..<10).map { LensSignals(face: Self.face(mouthWidth: 0.55), seconds: Double($0) * 0.5) }
        let state = frames.reduce(LensTriggerState.initial(for: lens)) { LensTriggerEngine.step($0, lens: lens, signals: $1) }

        XCTAssertTrue(LensTriggerEngine.hiddenLayers(state, at: 4.5).contains("neige"))
    }

    func test_onTime_firesOnceItsDelayHasPassed() {
        let lens = Self.lens(triggers: [LensTrigger(on: .onTime, action: .show, target: "etoile", delay: 2)])
        let avant = LensTriggerEngine.step(.initial(for: lens), lens: lens, signals: LensSignals(face: nil, seconds: 1.9))
        let apres = LensTriggerEngine.step(avant, lens: lens, signals: LensSignals(face: nil, seconds: 2.1))

        XCTAssertTrue(LensTriggerEngine.hiddenLayers(avant, at: 1.9).contains("etoile"))
        XCTAssertFalse(LensTriggerEngine.hiddenLayers(apres, at: 2.1).contains("etoile"))
    }

    func test_delay_postponesTheAction() {
        let lens = Self.lens(triggers: [LensTrigger(on: .onTap, action: .show, target: "etoile", delay: 1)])
        let touche = LensTriggerEngine.step(.initial(for: lens), lens: lens, signals: LensSignals(face: nil, tapped: true, seconds: 3))
        let tot = LensTriggerEngine.step(touche, lens: lens, signals: LensSignals(face: nil, seconds: 3.5))
        let tard = LensTriggerEngine.step(tot, lens: lens, signals: LensSignals(face: nil, seconds: 4.1))

        XCTAssertTrue(LensTriggerEngine.hiddenLayers(tot, at: 3.5).contains("etoile"))
        XCTAssertFalse(LensTriggerEngine.hiddenLayers(tard, at: 4.1).contains("etoile"))
    }

    func test_playAndStop_startAndStopALayer() {
        let lens = Self.lens(triggers: [LensTrigger(on: .onMouthOpen, action: .play, target: "neige", delay: nil),
                                        LensTrigger(on: .onBlink, action: .stop, target: "neige", delay: nil)])
        let ouvert = LensTriggerEngine.step(.initial(for: lens), lens: lens, signals: LensSignals(face: Self.face(mouth: 0.5), seconds: 1))
        let cligne = LensTriggerEngine.step(ouvert, lens: lens, signals: LensSignals(face: Self.face(leftEye: 0.05, rightEye: 0.05), seconds: 2))

        XCTAssertFalse(LensTriggerEngine.hiddenLayers(ouvert, at: 1).contains("neige"))
        XCTAssertTrue(LensTriggerEngine.hiddenLayers(cligne, at: 2).contains("neige"))
    }

    func test_browRaiseAndSpeaking_triggerOnTheirRisingEdge() {
        let lens = Self.lens(triggers: [LensTrigger(on: .onBrowRaise, action: .show, target: "etoile", delay: nil),
                                        LensTrigger(on: .onSpeaking, action: .show, target: "neige", delay: nil)])
        let sourcils = LensTriggerEngine.step(.initial(for: lens), lens: lens, signals: LensSignals(face: Self.face(browGap: 0.2), seconds: 1))
        let parole = LensTriggerEngine.step(sourcils, lens: lens, signals: LensSignals(face: Self.face(), voiceLevel: 0.3, seconds: 2))

        XCTAssertEqual(LensTriggerEngine.hiddenLayers(sourcils, at: 1), ["neige"])
        XCTAssertEqual(LensTriggerEngine.hiddenLayers(parole, at: 2), [])
    }

    /// Le plan ne pose pas une couche que les déclencheurs ont masquée.
    func test_plan_leavesOutTheHiddenLayers() {
        let lens = Self.aurore()
        let plan = LensPlan.plan(LensPlanInput(lens: lens, frame: CGSize(width: 1280, height: 720), face: nil, languages: ["fr"],
                                               level: .full, milliseconds: 0, hidden: ["etoile", "neige"]))

        XCTAssertEqual(plan.map(\.id), ["grade", "cadre", "legende"])
    }

    // MARK: - Fabriques

    private static func read(_ faces: [LensFaceFrame]) -> [Set<LensGesture>] {
        faces.reduce(into: [Set<LensGesture>]()) { suite, face in
            suite.append(LensGestureReader.read(LensSignals(face: face, seconds: 0), previous: suite.last ?? []))
        }
    }

    private static func edges(of gesture: LensGesture, over faces: [LensFaceFrame]) -> Int {
        zip([[]] + read(faces), read(faces)).filter { !$0.0.contains(gesture) && $0.1.contains(gesture) }.count
    }

    /// Un visage de face, repères normalisés à sa boîte : chaque ratio se règle seul.
    private static func face(mouth: CGFloat = 0.05, leftEye: CGFloat = 0.3, rightEye: CGFloat = 0.3,
                             mouthWidth: CGFloat = 0.40, browGap: CGFloat = 0.10, yaw: Double? = 0) -> LensFaceFrame {
        let eye = { (x: CGFloat, opening: CGFloat) in [CGPoint(x: x - 0.06, y: 0.6), CGPoint(x: x + 0.06, y: 0.6 + 0.12 * opening)] }
        let gauche = eye(0.67, leftEye)
        let droit = eye(0.33, rightEye)
        let eyesY = (gauche + droit).map(\.y).reduce(0, +) / 4
        let brow = { (x: CGFloat) in [CGPoint(x: x - 0.08, y: eyesY + browGap), CGPoint(x: x + 0.08, y: eyesY + browGap)] }
        return LensFaceFrame(boundingBox: CGRect(x: 0.3, y: 0.3, width: 0.4, height: 0.4), points: [],
                             leftEye: gauche, rightEye: droit,
                             innerLips: [CGPoint(x: 0.4, y: 0.25), CGPoint(x: 0.6, y: 0.25 + 0.2 * mouth)],
                             outerLips: [CGPoint(x: 0.5 - mouthWidth / 2, y: 0.22), CGPoint(x: 0.5 + mouthWidth / 2, y: 0.3)],
                             leftEyebrow: brow(0.67), rightEyebrow: brow(0.33),
                             yaw: yaw, roll: 0, pitch: 0)
    }

    private static func lens(triggers: [LensTrigger]) -> LensDocument {
        let base = aurore()
        return LensDocument(id: base.id, name: base.name, names: base.names, credits: base.credits, surfaces: base.surfaces,
                            cost: base.cost, window: base.window, layers: base.layers, triggers: triggers, fallbacks: nil)
    }

    /// La lens des vecteurs partagés : `onSmile → burst neige`, `onTap → hide etoile`.
    private static func aurore() -> LensDocument {
        let layers: [LensLayer] = [
            .lut(LensLutLayer(id: "grade", asset: "aaaaaaaaaaaaaaaa.png", intensity: 0.8)),
            .frame(LensFrameLayer(id: "cadre", motif: "elegant.art-deco", opacity: 0.9)),
            .sticker(LensStickerLayer(id: "etoile", asset: "cccccccccccccccc.png", anchor: .screen(x: 0.85, y: 0.12), size: 0.15, rotation: nil)),
            .text(LensTextLayer(id: "legende", text: ["fr": "Bonne année"], font: .fraunces, color: "#FFFFFF", size: 0.07, anchor: .screen(x: 0.5, y: 0.9))),
            .particles(LensParticlesLayer(id: "neige", preset: .snow, density: .mid, anchor: nil)),
        ]
        return LensDocument(id: "aurore-polaire", name: "Aurore polaire", names: [:],
                            credits: LensCredits(author: "Studio Nord", createdAt: "2026-10-01", updatedAt: nil),
                            surfaces: [.capture, .live], cost: .standard,
                            window: LensWindow(startsAt: "2026-12-01T00:00:00Z", endsAt: "2026-12-31T23:59:59Z", countries: nil, communities: nil),
                            layers: layers,
                            triggers: [LensTrigger(on: .onSmile, action: .burst, target: "neige", delay: nil),
                                       LensTrigger(on: .onTap, action: .hide, target: "etoile", delay: nil)],
                            fallbacks: nil)
    }
}
