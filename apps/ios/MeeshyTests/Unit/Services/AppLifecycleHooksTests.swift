import XCTest
import Combine
import UIKit
@testable import Meeshy

/// **Fermer la fenêtre principale d'un iPad n'emporte plus les crochets de
/// l'application.**
///
/// Arrière-plan (suspension de la base et des sockets, #7059), retour, et
/// démontage de session (clés E2EE, VoIP, notifications) vivaient dans
/// `MainWindowGate`. Une conversation détachée restée seule à l'écran laissait
/// l'app passer en arrière-plan sans rien suspendre, et une session expirée
/// sans rien démonter. Ces témoins tournent SANS AUCUNE VUE : c'est la
/// situation de la fenêtre principale fermée.
@MainActor
final class AppLifecycleHooksTests: XCTestCase {

    private final class Recorder {
        var active: [Bool] = []
        var background = 0
        var sessions: [Bool] = []
    }

    private func makeHooks(
        center: NotificationCenter,
        subject: PassthroughSubject<Bool, Never>,
        isAuthenticated: @escaping @MainActor () -> Bool,
        recorder: Recorder
    ) -> AppLifecycleHooks {
        let hooks = AppLifecycleHooks()
        hooks.install(
            center: center,
            authentication: subject.eraseToAnyPublisher(),
            isAuthenticated: isAuthenticated,
            handlers: .init(
                becameActive: { recorder.active.append($0) },
                enteredBackground: { recorder.background += 1 },
                authenticationChanged: { recorder.sessions.append($0) }
            )
        )
        return hooks
    }

    private func drainMainQueue() {
        let drained = expectation(description: "main queue drained")
        DispatchQueue.main.async { drained.fulfill() }
        wait(for: [drained], timeout: 2)
    }

    func test_backgroundThenActive_withoutAnyWindow_runsEachHookOnce_andRearmsOnlyAfterARealBackground() {
        let center = NotificationCenter()
        let recorder = Recorder()
        let hooks = makeHooks(center: center, subject: .init(), isAuthenticated: { true }, recorder: recorder)

        // Un aller-retour `.inactive` (centre de contrôle) : rien à réarmer.
        center.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        center.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
        center.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        center.post(name: UIApplication.didBecomeActiveNotification, object: nil)

        XCTAssertEqual(recorder.background, 1)
        XCTAssertEqual(recorder.active, [false, true, false])
        withExtendedLifetime(hooks) {}
    }

    func test_sessionClosed_withoutAnyWindow_runsTheTeardownOnce() {
        let center = NotificationCenter()
        let subject = PassthroughSubject<Bool, Never>()
        let recorder = Recorder()
        var authenticated = true
        let hooks = makeHooks(center: center, subject: subject, isAuthenticated: { authenticated }, recorder: recorder)

        authenticated = false
        subject.send(false)
        subject.send(false)
        drainMainQueue()

        XCTAssertEqual(recorder.sessions, [false])
        withExtendedLifetime(hooks) {}
    }

    /// Comme `onChange` : un `false` puis `true` dans le même tour n'est pas une
    /// transition — le changement de compte espace exprès les deux pour être vu.
    func test_flipAndBackInTheSameTurn_isNotATransition() {
        let center = NotificationCenter()
        let subject = PassthroughSubject<Bool, Never>()
        let recorder = Recorder()
        var authenticated = true
        let hooks = makeHooks(center: center, subject: subject, isAuthenticated: { authenticated }, recorder: recorder)

        authenticated = false
        subject.send(false)
        authenticated = true
        subject.send(true)
        drainMainQueue()

        XCTAssertEqual(recorder.sessions, [])
        withExtendedLifetime(hooks) {}
    }

    func test_secondInstall_isIgnored() {
        let center = NotificationCenter()
        let recorder = Recorder()
        let other = Recorder()
        let hooks = makeHooks(center: center, subject: .init(), isAuthenticated: { true }, recorder: recorder)
        hooks.install(
            center: center,
            authentication: Empty().eraseToAnyPublisher(),
            isAuthenticated: { true },
            handlers: .init(
                becameActive: { other.active.append($0) },
                enteredBackground: { other.background += 1 },
                authenticationChanged: { other.sessions.append($0) }
            )
        )

        center.post(name: UIApplication.didEnterBackgroundNotification, object: nil)

        XCTAssertEqual(recorder.background, 1)
        XCTAssertEqual(other.background, 0)
    }

    // MARK: - Câblage

    /// Les crochets ne vivent plus dans une fenêtre : la racine les installe
    /// depuis `init()`, et aucun `onChange` de vue ne porte plus la suspension
    /// ni le démontage de session.
    func test_meeshyApp_installsTheHooksOutsideAnyWindow() throws {
        let urls = AppSourceGuard.unitURLs("Meeshy/MeeshyApp.swift")
        func source(_ name: String) throws -> String {
            let url = try XCTUnwrap(urls.first { $0.lastPathComponent == name }, "\(name) introuvable")
            return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        }
        let root = try source("MeeshyApp.swift")
        XCTAssertTrue(root.contains("Self.installApplicationLifecycleHooks()"))
        XCTAssertFalse(root.contains(".adaptiveOnChange(of: scenePhase)"),
                       "l'arrière-plan suivi par une vue meurt avec la fenêtre principale")
        for teardown in [
            "BackgroundTransitionCoordinator.shared.enterBackground()",
            "SessionManager.shared.clearSessions()",
            "VoIPPushManager.shared.unregisterAndClearToken()",
            "BackgroundTaskManager.shared.cancelAllScheduled()",
        ] {
            XCTAssertFalse(root.contains(teardown), "\(teardown) ne doit pas dépendre d'une fenêtre")
        }

        let lifecycle = try source("MeeshyApp+Lifecycle.swift")
        XCTAssertTrue(lifecycle.contains("AppLifecycleHooks.shared.install("))
        XCTAssertTrue(lifecycle.contains("BackgroundTransitionCoordinator.shared.enterBackground()"))
        XCTAssertTrue(lifecycle.contains("SessionManager.shared.clearSessions()"))
    }
}
