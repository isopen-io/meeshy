import XCTest
import Foundation

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

    /// Round 3 de revue (Important) : `fireOnce` n'avait AUCUN verrou —
    /// `guard !hasFired else { return false }; hasFired = true; action()`
    /// n'est pas atomique. Ça « marchait » uniquement parce que les deux
    /// appelants réels (`ShareViewController.swift:73`/`:75`) s'exécutent
    /// tous les deux sur le MainActor — une coïncidence d'isolation, pas une
    /// garantie du type, alors que le type est délibérément `nonisolated` et
    /// qu'une extension de partage est précisément l'endroit où des
    /// callbacks arrivent sur des files arbitraires.
    ///
    /// Un simple `DispatchQueue.concurrentPerform` en boucle serrée ne suffit
    /// PAS à forcer la collision de façon fiable : la fenêtre entre le
    /// `guard` et l'écriture de `hasFired` ne dure que quelques instructions.
    /// Ce test synchronise le DÉPART de centaines de vrais threads OS via un
    /// sémaphore (technique « coup de feu de départ ») pour maximiser la
    /// probabilité qu'au moins deux d'entre eux exécutent cette fenêtre en
    /// même temps, répété sur plusieurs manches indépendantes (gate neuve à
    /// chaque manche) pour ne pas dépendre d'un seul tirage.
    ///
    /// `UnsafeGateBox` ne PROTÈGE rien — elle sert uniquement à faire
    /// traverser la frontière de vérification Sendable pour ce test : le
    /// point même du test est que `ShareCompletionGate`, avant son verrou,
    /// n'offre AUCUNE synchronisation propre.
    func test_fireOnce_underGenuineConcurrentThreads_firesTheActionExactlyOnce() {
        let rounds = 25
        let threadsPerRound = 40

        for round in 0..<rounds {
            let gate = ShareCompletionGate()
            let box = UnsafeGateBox(gate: gate)
            let counter = LockedCounter()

            let readyGroup = DispatchGroup()
            let startGate = DispatchSemaphore(value: 0)
            let doneGroup = DispatchGroup()

            for _ in 0..<threadsPerRound {
                readyGroup.enter()
                doneGroup.enter()
                Thread.detachNewThread {
                    readyGroup.leave()
                    startGate.wait()
                    box.gate.fireOnce { counter.increment() }
                    doneGroup.leave()
                }
            }

            // Attend que tous les threads soient créés et bloqués sur le
            // sémaphore AVANT de les libérer d'un coup — sans ça, les
            // threads créés en premier auraient déjà fini avant que les
            // derniers ne démarrent, et il n'y aurait plus de vraie
            // concurrence, juste une séquence rapide.
            readyGroup.wait()
            for _ in 0..<threadsPerRound { startGate.signal() }
            let waitResult = doneGroup.wait(timeout: .now() + 10)

            XCTAssertEqual(waitResult, .success, "manche \(round) : threads pas tous terminés sous 10 s")
            XCTAssertEqual(
                counter.count, 1,
                "manche \(round) : fireOnce sans verrou a laissé \(counter.count) appels "
                + "traverser le guard concurremment — la protection actuelle n'est qu'une "
                + "coïncidence d'isolation (MainActor), pas une garantie du type lui-même"
            )
        }
    }
}

/// Boîte qui ne protège RIEN — sert uniquement à faire traverser la
/// frontière de vérification Sendable pour le test de concurrence ci-dessus,
/// sans devoir modifier `ShareCompletionGate` avant d'avoir prouvé le rouge
/// contre son état actuel (non synchronisé).
private struct UnsafeGateBox: @unchecked Sendable {
    let gate: ShareCompletionGate
}

/// Compteur atomique via `NSLock`, pour observer depuis le test combien de
/// fois `action` a réellement été invoquée par des threads concurrents —
/// même idiome que `ExtractionBox`/`StagingBox` (`ShareViewController.swift`).
private final class LockedCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var value = 0

    func increment() {
        lock.lock(); defer { lock.unlock() }
        value += 1
    }

    var count: Int {
        lock.lock(); defer { lock.unlock() }
        return value
    }
}
