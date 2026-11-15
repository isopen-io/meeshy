import XCTest
import SwiftUI
import Combine
@testable import Meeshy

/// **Le viseur armé depuis le composer ne fait ni re-rendre le meuble à chaque trame
/// de réglage, ni survivre la caméra au composer** (#17469).
///
/// Le meuble déclarait la machine de capture en `@StateObject` : chaque publication
/// relayée de la caméra (zoom au glissé, chrono, cadenas, rangement) re-rendait le
/// composer entier. Et rien ne coupait la caméra quand le composer partait : le
/// voyant vert restait allumé.
@MainActor
final class ComposerSceneCaptureOwnerTests: XCTestCase {

    // MARK: - Factories

    private func makeOwner() -> ComposerSceneCaptureOwner {
        #if DEBUG
        let camera = CameraModel(fixture: ComposerCaptureFixtureDriver())
        #else
        let camera = CameraModel()
        #endif
        return ComposerSceneCaptureOwner(session: ComposerCaptureSession(camera: camera, gallery: MockComposerGallery()))
    }

    private final class Counter {
        var value = 0
    }

    private func publications(of owner: ComposerSceneCaptureOwner) -> (Counter, AnyCancellable) {
        let compteur = Counter()
        let abonnement = owner.objectWillChange.sink { _ in compteur.value += 1 }
        return (compteur, abonnement)
    }

    private final class StubRunning: ComposerCaptureRunning {
        var isRunning = false
        func startRunning() {}
        func stopRunning() {}
    }

    private static func settles(_ condition: () -> Bool) -> Bool {
        let fin = Date().addingTimeInterval(3)
        while Date() < fin {
            if condition() { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        }
        return condition()
    }

    private static func source(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }

    // MARK: - Le meuble n'est re-rendu que par ce qu'il lit

    func test_facts_whenTheCameraZoomsOrTicks_doNotPublish() {
        let owner = makeOwner()
        let (compteur, abonnement) = publications(of: owner)
        owner.session.camera.zoomFactor = 2
        owner.session.camera.recordingDuration = 1.5
        owner.session.lockProgress = 0.4
        owner.session.dismissDrag = 30
        XCTAssertEqual(compteur.value, 0, "une trame de réglage ne re-rend pas le composer entier")
        abonnement.cancel()
    }

    func test_facts_whenTheStageChanges_publishOnceWithTheNewStage() {
        let owner = makeOwner()
        let (compteur, abonnement) = publications(of: owner)
        owner.session.stage = .armed
        XCTAssertEqual(compteur.value, 1)
        XCTAssertEqual(owner.facts.stage, .armed)
        owner.session.stage = .armed
        XCTAssertEqual(compteur.value, 1, "la même étape ne re-rend rien")
        abonnement.cancel()
    }

    func test_facts_whenAHoldStarts_publishTheHolding() {
        let owner = makeOwner()
        owner.session.holdStartedAt = Date()
        XCTAssertTrue(owner.facts.holding, "la photothèque d'ouverture se tait pendant une tenue")
        owner.session.holdStartedAt = nil
        XCTAssertFalse(owner.facts.holding)
    }

    func test_host_ownsTheCaptureThroughTheOwner_andObservesOnlyIt() throws {
        let hote = try Self.source("Meeshy/Features/Composer/MeeshyComposerHost.swift")
        XCTAssertTrue(hote.contains("@StateObject var sceneCaptureOwner = ComposerSceneCaptureOwner()"))
        XCTAssertFalse(hote.contains("@StateObject var sceneCapture ="),
                       "observée par le meuble, la machine le re-rendait à chaque trame de zoom")
        let couches = try Self.source("Meeshy/Features/Composer/MeeshyComposerHost+Layers.swift")
        XCTAssertFalse(couches.contains("@ObservedObject var sceneCapture: ComposerCaptureSession"))
        XCTAssertTrue(couches.contains("@ObservedObject var sceneCaptureOwner: ComposerSceneCaptureOwner"))
    }

    // MARK: - La caméra part avec le composer

    func test_release_whileArmed_disarmsAndForgetsTheDelivery() {
        let owner = makeOwner()
        owner.session.arm(mode: .photo)
        owner.session.onDeliver = { _ in }
        owner.release()
        XCTAssertEqual(owner.session.stage, .off, "le composer parti, le viseur ne reste pas armé")
        XCTAssertNil(owner.session.onDeliver, "la remise retenait le composer, et la caméra avec lui")
    }

    func test_release_whenOff_cancelsAStartStillQueued() {
        let owner = ComposerSceneCaptureOwner(session: ComposerCaptureSession(camera: CameraModel(),
                                                                              gallery: MockComposerGallery()))
        owner.session.camera.sessionQueue.setRunning(true, StubRunning())
        owner.release()
        XCTAssertFalse(owner.session.camera.sessionQueue.wantsToRun, "aucun objectif ne s'allume sans composer")
    }

    func test_teardown_whenItsViewLeaves_releasesOnce() {
        final class Shown: ObservableObject { @Published var value = true }
        struct Host: View {
            @ObservedObject var shown: Shown
            let release: @MainActor () -> Void
            var body: some View {
                VStack {
                    Text(verbatim: "composer")
                    if shown.value { Color.clear.frame(width: 10, height: 10).background(ComposerCaptureTeardown(release: release)) }
                }
            }
        }
        let shown = Shown()
        let compteur = Counter()
        let ecran = RenderedScreen(Host(shown: shown, release: { compteur.value += 1 }))
        defer { ecran.dismount() }
        XCTAssertEqual(compteur.value, 0, "monté, rien ne se libère")
        shown.value = false
        XCTAssertTrue(Self.settles { compteur.value == 1 }, "démonté, le composer rend sa caméra")
        RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        XCTAssertEqual(compteur.value, 1)
    }

    func test_viewfinderMount_releasesTheCaptureWhenTheComposerLeaves() throws {
        let montage = try Self.source("Meeshy/Features/Composer/ComposerSceneViewfinderMount.swift")
        XCTAssertTrue(montage.contains("ComposerCaptureTeardown(release:"))
        XCTAssertTrue(montage.contains("release()"))
    }

    /// Fermé avant que l'ouverture n'arme, le composer n'allume pas la caméra derrière lui.
    func test_openingPlan_cancelledDuringItsDelay_armsNothing() throws {
        let code = try Self.source("Meeshy/Features/Composer/MeeshyComposerHost+ScenePicking.swift")
        XCTAssertFalse(code.contains("_ = await cancellableSleep("), "une ouverture annulée armait quand même la caméra")
        XCTAssertTrue(code.contains("guard await cancellableSleep("))
    }
}
