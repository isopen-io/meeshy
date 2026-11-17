import XCTest
@testable import MeeshySDK

/// ios-systeme-7 (#19104) — **une révocation reçue pendant que l'extension prépare la bannière
/// doit survivre jusqu'à sa livraison.**
///
/// Bob envoie une photo et la supprime aussitôt. La NSE d'Alice télécharge encore la pièce
/// jointe quand le push silencieux `notification_revoked` arrive dans l'app : rien n'est livré,
/// donc rien à retirer. La NSE livre ensuite « Bob : 📷 Photo » pour un message qui n'existe
/// plus. La révocation s'inscrit donc dans un fichier du groupe d'apps que la NSE relit juste
/// avant de livrer, et que les balayages relisent pour retirer ce qui aurait passé entre-temps.
final class PendingBannerRevocationsTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    private func makeFileURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("pending-revocations-\(UUID().uuidString)", isDirectory: true)
            .appendingPathComponent(PendingBannerRevocations.fileName)
    }

    private func makeSUT(
        fileURL: URL? = nil,
        ttl: TimeInterval = PendingBannerRevocations.ttl,
        capacity: Int = PendingBannerRevocations.capacity
    ) -> PendingBannerRevocations {
        PendingBannerRevocations(fileURL: fileURL ?? makeFileURL(), ttl: ttl, capacity: capacity)
    }

    private func banner(_ notificationId: String?) -> [AnyHashable: Any] {
        guard let notificationId else { return ["type": "call_missed"] }
        return ["type": "new_message", "notificationId": notificationId]
    }

    // MARK: - La règle

    func test_recordedId_isRevokedWithinTheWindow() {
        let sut = makeSUT()

        sut.record(["n1"], now: t0)

        XCTAssertTrue(sut.isRevoked(banner("n1"), now: t0.addingTimeInterval(5)))
    }

    func test_anotherNotification_isNotRevoked() {
        let sut = makeSUT()
        sut.record(["n1"], now: t0)

        XCTAssertFalse(sut.isRevoked(banner("n2"), now: t0.addingTimeInterval(5)))
    }

    func test_afterTheTimeToLive_theRevocationIsForgotten() {
        let sut = makeSUT()
        sut.record(["n1"], now: t0)

        XCTAssertTrue(sut.isRevoked(banner("n1"), now: t0.addingTimeInterval(PendingBannerRevocations.ttl)))
        XCTAssertFalse(sut.isRevoked(banner("n1"), now: t0.addingTimeInterval(PendingBannerRevocations.ttl + 1)))
    }

    func test_aBannerWithoutNotificationId_isNeverRevoked() {
        let sut = makeSUT()
        sut.record(["", "n1"], now: t0)

        XCTAssertFalse(sut.isRevoked(banner(nil), now: t0), "un appel, un ancien format : jamais retiré par erreur")
        XCTAssertFalse(sut.isRevoked(["notificationId": ""], now: t0), "une entrée vide n'apparie aucune bannière")
    }

    func test_revokedIdentifiers_returnsOnlyTheDeliveredBannersThatWereRevoked() {
        let sut = makeSUT()
        sut.record(["n1"], now: t0)
        let delivered: [(id: String, userInfo: [AnyHashable: Any])] = [
            (id: "req-1", userInfo: banner("n1")),
            (id: "req-2", userInfo: banner("n2")),
            (id: "req-3", userInfo: banner(nil)),
        ]

        let revoked = sut.revokedIdentifiers(from: delivered, now: t0.addingTimeInterval(30))

        XCTAssertEqual(revoked, ["req-1"])
    }

    // MARK: - Le partage entre processus

    /// L'app écrit, la NSE lit : deux instances sur le même fichier, comme deux processus.
    func test_aSecondInstanceOnTheSameFile_readsWhatTheFirstRecorded() {
        let url = makeFileURL()
        makeSUT(fileURL: url).record(["n1", "n2"], now: t0)

        let reader = makeSUT(fileURL: url)

        XCTAssertTrue(reader.isRevoked(banner("n2"), now: t0.addingTimeInterval(1)))
    }

    func test_recordingTwice_keepsBothBatches() {
        let sut = makeSUT()

        sut.record(["n1"], now: t0)
        sut.record(["n2"], now: t0.addingTimeInterval(10))

        XCTAssertTrue(sut.isRevoked(banner("n1"), now: t0.addingTimeInterval(11)))
        XCTAssertTrue(sut.isRevoked(banner("n2"), now: t0.addingTimeInterval(11)))
    }

    func test_recordingAgain_refreshesTheTimestampOfAKnownId() {
        let sut = makeSUT()
        sut.record(["n1"], now: t0)
        sut.record(["n1"], now: t0.addingTimeInterval(400))

        XCTAssertTrue(sut.isRevoked(banner("n1"), now: t0.addingTimeInterval(400 + PendingBannerRevocations.ttl)))
    }

    // MARK: - Les bornes

    func test_theFileIsBoundedToTheCapacity_keepingTheNewest() {
        let sut = makeSUT(capacity: 3)

        sut.record(["a", "b", "c", "d", "e"], now: t0)

        XCTAssertFalse(sut.isRevoked(banner("a"), now: t0))
        XCTAssertFalse(sut.isRevoked(banner("b"), now: t0))
        XCTAssertTrue(sut.isRevoked(banner("c"), now: t0))
        XCTAssertTrue(sut.isRevoked(banner("e"), now: t0))
    }

    func test_expiredEntriesArePrunedOnTheNextRecord() throws {
        let url = makeFileURL()
        let sut = makeSUT(fileURL: url)
        sut.record(["old"], now: t0)

        sut.record(["fresh"], now: t0.addingTimeInterval(PendingBannerRevocations.ttl + 60))

        let raw = try String(contentsOf: url, encoding: .utf8)
        XCTAssertFalse(raw.contains("old"))
        XCTAssertTrue(raw.contains("fresh"))
    }

    // MARK: - Fail-soft

    func test_withoutAContainer_nothingIsRecordedAndNothingIsRevoked() {
        let sut = PendingBannerRevocations(fileURL: nil)

        sut.record(["n1"], now: t0)

        XCTAssertFalse(sut.isRevoked(banner("n1"), now: t0))
    }

    func test_aCorruptFile_readsAsEmptyAndIsRepairedByTheNextRecord() throws {
        let url = makeFileURL()
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("pas du json".utf8).write(to: url)
        let sut = makeSUT(fileURL: url)

        XCTAssertFalse(sut.isRevoked(banner("n1"), now: t0))
        sut.record(["n1"], now: t0)

        XCTAssertTrue(sut.isRevoked(banner("n1"), now: t0.addingTimeInterval(1)))
    }
}
