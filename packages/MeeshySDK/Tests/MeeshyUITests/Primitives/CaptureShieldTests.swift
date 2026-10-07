import XCTest
import SwiftUI
import UIKit
import AVFoundation
import MeeshySDK
@testable import MeeshyUI

/// **Un contenu protégé ne se rend que dans la couche sécurisée du système,
/// ou pas du tout** (#9574).
///
/// Ce que ces témoins prouvent sans appareil : quelle surface est sécurisée
/// pour quel verdict, que le repli est FERMÉ quand la couche est introuvable,
/// que le contenu vit bien SOUS la toile sécurisée, que la vidéo d'un contenu
/// protégé ne sort ni par AirPlay ni par le PiP, et que la technique tient
/// encore sur le runtime qui exécute la suite.
///
/// Ce qu'ils ne prouvent PAS : qu'une capture réelle soit noire. Le simulateur
/// ne reproduit pas fidèlement l'exclusion de la couche sécurisée — la preuve
/// est la procédure sur iPhone réel de la décision
/// `apps/ios/decisions/2026-10-07-une-capture-d-ecran-d-un-contenu-qui-disparait-rend-du-noir.md`.
@MainActor
final class CaptureShieldTests: XCTestCase {

    // MARK: - Fournisseurs de toile

    private struct RefusingLayer: SecureCaptureLayerProviding {
        var isAvailable: Bool { false }
        func makeCanvas() -> SecureCaptureCanvas? { nil }
    }

    @MainActor private final class CountingLayer: SecureCaptureLayerProviding {
        nonisolated deinit {}
        private(set) var made = 0
        var isAvailable: Bool { true }
        func makeCanvas() -> SecureCaptureCanvas? {
            made += 1
            let container = UIView()
            let canvas = UIView()
            container.addSubview(canvas)
            return SecureCaptureCanvas(container: container, canvas: canvas)
        }
    }

    private func window(holding view: UIView) -> UIWindow {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
        let root = UIViewController()
        window.rootViewController = root
        window.makeKeyAndVisible()
        view.frame = CGRect(x: 0, y: 0, width: 300, height: 120)
        root.view.addSubview(view)
        return window
    }

    private func host(_ layer: any SecureCaptureLayerProviding) -> SecureCaptureHostView {
        SecureCaptureHostView(layer: layer, root: AnyView(Text(verbatim: "secret")))
    }

    // MARK: - La règle : quelle surface pour quel verdict

    func test_rendering_unprotected_isPlain_evenWithoutALayer() {
        XCTAssertEqual(CaptureShieldRendering.resolve(isProtected: false, layerAvailable: true), .plain)
        XCTAssertEqual(CaptureShieldRendering.resolve(isProtected: false, layerAvailable: false), .plain)
    }

    func test_rendering_protected_isShielded_whenTheLayerExists() {
        XCTAssertEqual(CaptureShieldRendering.resolve(isProtected: true, layerAvailable: true), .shielded)
    }

    func test_rendering_protected_withoutLayer_isSealed_neverPlain() {
        XCTAssertEqual(CaptureShieldRendering.resolve(isProtected: true, layerAvailable: false), .sealed,
                       "fermé par défaut : sans couche sécurisée, le placeholder — jamais le contenu en clair")
    }

    func test_scope_none_shieldsNothing() {
        XCTAssertFalse(CaptureShieldScope.none.shields("a1"))
        XCTAssertFalse(CaptureShieldScope.none.shields(nil))
    }

    func test_scope_allExcept_shieldsEveryUnknownPiece() {
        let scope = CaptureShieldScope.allExcept(["free"])
        XCTAssertFalse(scope.shields("free"))
        XCTAssertTrue(scope.shields("flame"))
        XCTAssertTrue(scope.shields(nil), "une pièce sans identifiant n'est pas prouvée libre")
    }

    func test_scope_all_shieldsEverything() {
        XCTAssertTrue(CaptureShieldScope.all.shields("a1"))
        XCTAssertTrue(CaptureShieldScope.all.shields(nil))
    }

    func test_environment_defaults() {
        XCTAssertFalse(EnvironmentValues().isCaptureShielded)
        XCTAssertEqual(EnvironmentValues().captureShieldScope, CaptureShieldScope.none)
    }

    // MARK: - La toile : le contenu vit SOUS la couche sécurisée

    func test_host_beforeWindow_rendersNothing() {
        let view = host(CountingLayer())
        XCTAssertNil(view.hosting.view.superview, "rien n'est affiché avant que la toile soit posée")
        XCTAssertEqual(view.placement, .detached)
    }

    func test_host_inWindow_placesTheContentInsideTheSecureCanvas() {
        let layer = CountingLayer()
        let view = host(layer)
        let window = window(holding: view)
        defer { window.isHidden = true }

        XCTAssertEqual(view.placement, .secured)
        XCTAssertEqual(layer.made, 1)
        XCTAssertTrue(view.hosting.view.superview === view.secureCanvas?.canvas)
        XCTAssertTrue(view.secureCanvas?.container.superview === view)
    }

    @MainActor private final class Journal {
        nonisolated deinit {}
        var reports: [String] = []
        var refused = false
    }

    func test_host_refusedLayer_neverMountsTheContent_andReports() {
        let journal = Journal()
        CaptureShieldDiagnostics.reporter = { journal.reports.append($0) }
        CaptureShieldDiagnostics.resetForTesting()
        defer { CaptureShieldDiagnostics.reporter = nil }

        let view = host(RefusingLayer())
        view.onRefused = { journal.refused = true }
        let window = window(holding: view)
        defer { window.isHidden = true }

        XCTAssertEqual(view.placement, .refused)
        XCTAssertNil(view.hosting.view.superview, "jamais de repli silencieux vers un rendu capturable")
        XCTAssertTrue(journal.refused, "l'hôte SwiftUI bascule sur le placeholder")
        XCTAssertEqual(journal.reports.count, 1, "un signalement de diagnostic part")
    }

    func test_host_insideAnotherShield_reusesItsCanvas() {
        let layer = CountingLayer()
        let outer = host(layer)
        let window = window(holding: outer)
        defer { window.isHidden = true }

        let inner = host(layer)
        outer.hosting.view.addSubview(inner)

        XCTAssertEqual(inner.placement, .inherited)
        XCTAssertEqual(layer.made, 1, "un bouclier dans un bouclier ne crée pas de seconde toile")
        XCTAssertTrue(inner.hosting.view.superview === inner)
    }

    func test_host_isCountedWhileVisible() {
        let before = SecureCaptureRegistry.visibleCount
        let view = host(CountingLayer())
        let window = window(holding: view)
        XCTAssertEqual(SecureCaptureRegistry.visibleCount, before + 1)
        XCTAssertTrue(SecureCaptureRegistry.holdsProtectedContent)
        view.removeFromSuperview()
        XCTAssertEqual(SecureCaptureRegistry.visibleCount, before)
        window.isHidden = true
    }

    func test_host_isAttachedToTheNearestViewController() {
        let view = host(CountingLayer())
        let window = window(holding: view)
        defer { window.isHidden = true }
        XCTAssertTrue(view.hosting.parent === window.rootViewController,
                      "les présentations (feuilles, plein écran) partent d'un contrôleur rattaché")
        view.removeFromSuperview()
        XCTAssertNil(view.hosting.parent)
    }

    func test_host_hidesTheTextFieldFromVoiceOver_andLetsTheContentSpeak() {
        let view = host(SystemSecureCaptureLayer())
        let window = window(holding: view)
        defer { window.isHidden = true }
        guard view.placement == .secured, let field = view.secureCanvas?.container else {
            return XCTFail("la couche système doit être disponible sur ce runtime")
        }
        XCTAssertFalse(field.isAccessibilityElement, "VoiceOver ne s'arrête pas sur un champ de saisie fantôme")
        XCTAssertFalse(field.canBecomeFirstResponder, "aucun clavier ne s'ouvre")
        XCTAssertEqual(view.accessibilityElements?.count, 1)
        XCTAssertTrue(view.accessibilityElements?.first as AnyObject === view.hosting.view)
    }

    // MARK: - Le témoin de casse : la technique tient sur CE runtime

    /// Rouge le jour où un iOS déplace la toile sécurisée du champ de saisie :
    /// l'application rendrait alors le placeholder partout (fermé), et ce
    /// témoin le dit avant la sortie.
    func test_systemLayer_resolvesASecureCanvasOnThisRuntime() {
        let layer = SystemSecureCaptureLayer()
        XCTAssertTrue(layer.isAvailable)
        let canvas = layer.makeCanvas()
        XCTAssertNotNil(canvas)
        XCTAssertTrue((canvas?.container as? UITextField)?.isSecureTextEntry == true)
        XCTAssertTrue(canvas?.canvas.superview === canvas?.container)
    }

    func test_systemLayer_refusesAFieldWithoutCanvas() {
        let field = UITextField()
        field.isSecureTextEntry = true
        let stranger = UIView()
        field.addSubview(stranger)
        XCTAssertNil(SystemSecureCaptureLayer.secureCanvas(in: field, candidates: []))
        XCTAssertNil(SystemSecureCaptureLayer.secureCanvas(in: field, candidates: [stranger]),
                     "une vue quelconque n'est pas la toile sécurisée")
    }

    func test_systemLayer_refusesAFieldThatIsNotSecure() {
        let field = UITextField()
        field.layoutIfNeeded()
        XCTAssertNil(SystemSecureCaptureLayer.secureCanvas(in: field, candidates: field.subviews),
                     "la toile d'un champ ordinaire n'est pas exclue des captures")
    }

    // MARK: - La vidéo d'un contenu protégé ne sort pas de l'appareil

    func test_playback_protected_refusesAirPlayPipAndMirroringRoutes() {
        let policy = ProtectedPlaybackPolicy.of(isCaptureShielded: true)
        XCTAssertFalse(policy.allowsExternalPlayback)
        XCTAssertFalse(policy.allowsPictureInPicture)
        XCTAssertEqual(policy.permitted([.playPause, .pip, .airplay, .mute]), [.playPause, .mute])
    }

    func test_playback_ordinary_keepsEveryRoute() {
        let policy = ProtectedPlaybackPolicy.of(isCaptureShielded: false)
        XCTAssertTrue(policy.allowsExternalPlayback)
        XCTAssertTrue(policy.allowsPictureInPicture)
        XCTAssertEqual(policy.permitted([.pip, .airplay]), [.pip, .airplay])
    }

    func test_playback_protectedSurface_turnsExternalPlaybackOff() {
        let player = AVPlayer()
        ProtectedPlaybackPolicy.of(isCaptureShielded: true).apply(to: player)
        XCTAssertFalse(player.allowsExternalPlayback)
        XCTAssertFalse(player.usesExternalPlaybackWhileExternalScreenIsActive)
        ProtectedPlaybackPolicy.of(isCaptureShielded: false).apply(to: player)
        XCTAssertTrue(player.allowsExternalPlayback)
    }

    // MARK: - Les sites d'application

    private func source(_ relative: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Primitives/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent("Sources/MeeshyUI/\(relative)")
        let text = try String(contentsOf: url, encoding: .utf8)
        XCTAssertGreaterThan(text.count, 400, "\(relative) introuvable — ce témoin ne mesurerait rien")
        return text.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    func test_videoSurface_appliesThePolicyOfItsEnvironment() throws {
        let code = try source("Media/MeeshyVideoSurface.swift")
        XCTAssertTrue(code.contains("ProtectedPlaybackPolicy.of(isCaptureShielded:context.environment.isCaptureShielded)"))
        XCTAssertTrue(code.contains("policy.apply(to:player)"))
        XCTAssertTrue(code.contains("ifenablesPip,policy.allowsPictureInPicture{"),
                      "aucune fenêtre PiP ne se configure pour un contenu protégé")
    }

    func test_viewers_reshieldWhatTheyPresent() throws {
        for viewer in ["Media/ImageViewerView.swift", "Media/CodeViewerView.swift", "Media/DocumentViewerView.swift"] {
            let code = try source(viewer)
            XCTAssertTrue(code.contains("@Environment(\\.isCaptureShielded)privatevarisCaptureShielded"), viewer)
            XCTAssertTrue(code.contains(".contentExitGate(exitGate).captureShield(isCaptureShielded)"),
                          "\(viewer) : une présentation quitte la toile de l'hôte — le plein écran se protège à son tour")
        }
    }

    func test_videoControls_dropPipAndAirPlayUnderAShield() throws {
        let player = try source("Media/MeeshyVideoPlayer.swift")
        XCTAssertTrue(player.contains("ProtectedPlaybackPolicy.of(isCaptureShielded:isCaptureShielded).permitted(controls)"))
        let transport = try source("Media/VideoTransportControls.swift")
        XCTAssertTrue(transport.contains("ProtectedPlaybackPolicy.of(isCaptureShielded:isCaptureShielded).permitted(requestedControls)"))
    }
}
