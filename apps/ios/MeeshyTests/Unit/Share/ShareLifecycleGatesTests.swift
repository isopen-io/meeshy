import XCTest

/// `ShareCancelPolicy` et `ShareCompletionGate` (`ShareLifecycleGates.swift`,
/// cible `MeeshyShareExtension`) — round 2 de revue (Critical).
///
/// Compilés DANS le bundle de tests (`project.yml`, même précédent que
/// `ShareLimits`/`ShareMediaStaging`/`SharePendingShare`) : l'app-extension
/// n'est pas liable depuis ici, mais ces deux types sont Foundation-only et
/// sans état UIKit/SwiftUI — leur comportement s'exécute réellement, sans
/// avoir besoin de rendre `ShareViewController`.
final class ShareLifecycleGatesTests: XCTestCase {

    // MARK: - ShareCancelPolicy

    func test_isCancelAllowed_beforeAnyAttempt_isTrue() {
        XCTAssertTrue(ShareCancelPolicy.isCancelAllowed(sendWasAttempted: false))
    }

    /// LE point du Critical : une fois qu'un envoi a été TENTÉ, Annuler ne
    /// doit plus jamais redevenir disponible.
    func test_isCancelAllowed_afterAnAttempt_isFalse() {
        XCTAssertFalse(ShareCancelPolicy.isCancelAllowed(sendWasAttempted: true))
    }

    // MARK: - ShareCompletionGate

    func test_fireOnce_firstCall_firesTheAction() {
        let gate = ShareCompletionGate()
        var firedCount = 0

        let didFire = gate.fireOnce { firedCount += 1 }

        XCTAssertTrue(didFire)
        XCTAssertEqual(firedCount, 1)
        XCTAssertTrue(gate.hasFired)
    }

    /// LE Critical, effet secondaire : `complete()` ne doit jamais atteindre
    /// `extensionContext?.completeRequest` deux fois — qu'un second appel
    /// vienne d'`onCancel` (tapé pendant la fenêtre) ou du réveil du `Task`
    /// qui appelle `onFinish()`.
    func test_fireOnce_secondCall_isANoOp() {
        let gate = ShareCompletionGate()
        var firedCount = 0

        gate.fireOnce { firedCount += 1 }
        let didFireAgain = gate.fireOnce { firedCount += 1 }

        XCTAssertFalse(didFireAgain)
        XCTAssertEqual(firedCount, 1, "complete() ne doit pouvoir être atteint qu'une seule fois")
    }

    func test_fireOnce_manyCalls_fireOnlyOnce() {
        let gate = ShareCompletionGate()
        var firedCount = 0

        for _ in 0..<10 {
            gate.fireOnce { firedCount += 1 }
        }

        XCTAssertEqual(firedCount, 1)
    }
}
