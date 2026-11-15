import CryptoKit
import Foundation
import GRDB
import XCTest
@testable import MeeshyE2EE

/// L'app et l'extension de notification déchiffrent pour le MÊME appareil, sur
/// la même base du groupe d'apps (spec § 4.4). Ce témoin simule les deux
/// processus : deux connexions distinctes au même fichier, deux descripteurs
/// sur le même fichier de verrou, deux stores. Ils déchiffrent EN MÊME TEMPS le
/// flux d'Alice. La session ne doit jamais bifurquer : chaque message s'ouvre
/// exactement une fois, aucun ne se rouvre, et la session continue après.
final class E2EEProcessLockConcurrencyTests: XCTestCase {
    private let alice = String(repeating: "a1", count: 12)
    private let bob = String(repeating: "b2", count: 12)

    func test_twoProcessesDecryptingUnderTheFileLock_neverForkTheSession() throws {
        let databasePath = E2EETestDevice.temporaryPath("sqlite")
        let lockPath = E2EETestDevice.temporaryPath("lock")
        let sealingKey = SymmetricKey(size: .bits256)
        let bobIdentity = E2EELocalIdentity.generate()
        let app = try E2EETestDevice.make(userId: bob, identity: bobIdentity, writer: DatabasePool(path: databasePath), sealingKey: sealingKey, lockPath: lockPath)
        let extensionProcess = try E2EETestDevice.make(userId: bob, identity: bobIdentity, writer: DatabasePool(path: databasePath), sealingKey: sealingKey, lockPath: lockPath)
        let aliceDevice = try E2EETestDevice.make(userId: alice)

        let enrollment = try app.factory.enrollment(userId: bob, platform: .ios, label: nil, now: Date())
        try aliceDevice.cipher.startSession(with: E2EETestDirectory.bundle(of: enrollment, deviceId: 1), of: bob)
        let opening = try aliceDevice.cipher.encrypt(Data("ouverture".utf8), for: app.address)
        _ = try app.cipher.decrypt(opening, from: aliceDevice.address)
        let reply = try app.cipher.encrypt(Data("ok".utf8), for: aliceDevice.address)
        _ = try aliceDevice.cipher.decrypt(reply, from: app.address)

        let stream = try (0..<60).map { index in try aliceDevice.cipher.encrypt(Data("m\(index)".utf8), for: app.address) }
        let opened = OpenedLedger()
        DispatchQueue.concurrentPerform(iterations: stream.count * 2) { iteration in
            let device = iteration.isMultiple(of: 2) ? app : extensionProcess
            let message = stream[iteration / 2]
            if let plain = try? device.cipher.decrypt(message, from: aliceDevice.address) {
                opened.record(String(decoding: plain, as: UTF8.self))
            }
        }

        XCTAssertEqual(opened.counts.values.filter { $0 > 1 }.count, 0, "aucun message ne s'ouvre deux fois")
        XCTAssertEqual(Set(opened.counts.keys), Set((0..<60).map { "m\($0)" }), "chaque message s'ouvre une fois")
        let next = try aliceDevice.cipher.encrypt(Data("après".utf8), for: app.address)
        XCTAssertEqual(String(decoding: try extensionProcess.cipher.decrypt(next, from: aliceDevice.address), as: UTF8.self), "après")
    }

    func test_theLockExcludesTwoHoldersOfTheSameFile() throws {
        let path = E2EETestDevice.temporaryPath("lock")
        let first = E2EEProcessLock(path: path)
        let second = E2EEProcessLock(path: path)
        let inside = OpenedLedger()

        DispatchQueue.concurrentPerform(iterations: 40) { iteration in
            let lock = iteration.isMultiple(of: 2) ? first : second
            try? lock.withLock {
                inside.enter()
                usleep(500)
                inside.leave()
            }
        }

        XCTAssertEqual(inside.maximumConcurrency, 1)
    }

    /// Un fichier dont le verrou n'exclut personne (deux fils sur un même
    /// descripteur) : seul le verrou intra-processus tient encore les fils.
    func test_theLocalLockExcludesThreadsWhenTheFileLockDoesNot() throws {
        let lock = E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"), fileLock: NonExcludingFileLock())
        let inside = OpenedLedger()

        DispatchQueue.concurrentPerform(iterations: 40) { _ in
            try? lock.withLock {
                inside.enter()
                usleep(500)
                inside.leave()
            }
        }

        XCTAssertEqual(inside.maximumConcurrency, 1)
    }

    func test_aNestedTakeOfTheSameLock_throwsInsteadOfDeadlocking() throws {
        let lock = E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"))
        var innerRan = false

        XCTAssertThrowsError(try lock.withLock { try lock.withLock { innerRan = true } }) { error in
            XCTAssertEqual(error as? E2EEProcessLockError, .reentrant)
        }
        XCTAssertFalse(innerRan)
        XCTAssertEqual(try lock.withLock { 7 }, 7, "le verrou se reprend après le refus")
    }

    func test_aNestedTakeThroughAnotherInstanceOfTheSameFile_throwsInsteadOfDeadlocking() throws {
        let path = E2EETestDevice.temporaryPath("lock")
        let outer = E2EEProcessLock(path: path)
        let inner = E2EEProcessLock(path: path)

        XCTAssertThrowsError(try outer.withLock { try inner.withLock {} }) { error in
            XCTAssertEqual(error as? E2EEProcessLockError, .reentrant)
        }
    }

    /// Le marqueur de prise vit dans le dictionnaire du FIL, et un fil du pool
    /// coopératif sert des tâches les unes après les autres : 200 tâches qui
    /// prennent le verrou ne lisent jamais le marqueur d'une autre comme le leur.
    func test_twoHundredTasksOfTheCooperativePool_neverSeeAFalseReentrant() async {
        let lock = E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"))
        let inside = OpenedLedger()

        let refusals = await withTaskGroup(of: E2EEProcessLockError?.self) { group in
            for _ in 0..<200 {
                group.addTask {
                    do {
                        try lock.withLock {
                            inside.enter()
                            usleep(50)
                            inside.leave()
                        }
                        return nil
                    } catch {
                        return error as? E2EEProcessLockError ?? .cannotLock(errno: -1)
                    }
                }
            }
            return await group.reduce(into: [E2EEProcessLockError]()) { refused, outcome in
                if let outcome { refused.append(outcome) }
            }
        }

        XCTAssertEqual(refusals, [], "aucune tâche ne se voit refuser le verrou")
        XCTAssertEqual(inside.maximumConcurrency, 1)
    }

    /// Un corps qui lève libère le marqueur : le même fil, puis une autre
    /// instance du même fichier, reprennent le verrou sans faux `.reentrant`.
    func test_aBodyThatThrows_releasesTheMarker() throws {
        struct Boom: Error {}
        let path = E2EETestDevice.temporaryPath("lock")
        let lock = E2EEProcessLock(path: path)

        XCTAssertThrowsError(try lock.withLock { () throws -> Int in throw Boom() }) { error in
            XCTAssertTrue(error is Boom, "l'erreur du corps remonte telle quelle")
        }

        XCTAssertEqual(try lock.withLock { 7 }, 7, "même fil : le marqueur est retiré")
        XCTAssertEqual(try E2EEProcessLock(path: path).withLock { 8 }, 8, "même fichier, autre instance")
    }

    func test_twoLocksOfDifferentFiles_nest() throws {
        let outer = E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"))
        let inner = E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"))

        XCTAssertEqual(try outer.withLock { try inner.withLock { "ok" } }, "ok")
    }

    func test_shared_servesOneInstancePerAppGroup() throws {
        let directory = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(UUID().uuidString)
        let group = "group.test.\(UUID().uuidString)"

        let first = try E2EEProcessLock.shared(appGroup: group) { _ in directory }
        let second = try E2EEProcessLock.shared(appGroup: group) { _ in directory }
        let other = try E2EEProcessLock.shared(appGroup: group) { _ in directory.appendingPathComponent("autre") }

        XCTAssertTrue(first === second)
        XCTAssertFalse(first === other)
    }

    func test_shared_withoutAnAppGroupContainer_throws() {
        XCTAssertThrowsError(try E2EEProcessLock.shared(appGroup: "group.absent") { _ in nil })
    }
}

private struct NonExcludingFileLock: E2EEFileLocking {
    func hold<T>(_ path: String, _ body: () throws -> T) throws -> T { try body() }
}

private final class OpenedLedger: @unchecked Sendable {
    private let lock = NSLock()
    private var opened: [String: Int] = [:]
    private var current = 0
    private var maximum = 0

    func record(_ text: String) { lock.withLock { opened[text, default: 0] += 1 } }
    var counts: [String: Int] { lock.withLock { opened } }

    func enter() { lock.withLock { current += 1; maximum = max(maximum, current) } }
    func leave() { lock.withLock { current -= 1 } }
    var maximumConcurrency: Int { lock.withLock { maximum } }
}
