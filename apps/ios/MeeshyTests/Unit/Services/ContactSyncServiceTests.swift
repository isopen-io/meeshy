import XCTest
import Contacts
@testable import Meeshy
import MeeshySDK

// MARK: - Doublures

private enum StubSyncError: Error, Equatable {
    case network
}

/// Carnet de l'appareil injecté : la découpe en lots doit s'éprouver sur des
/// milliers de fiches, ce qu'aucun test ne peut obtenir d'un `CNContactStore`.
private final class StubContactBook: DeviceContactBookReading, @unchecked Sendable {
    var status: CNAuthorizationStatus = .authorized
    var accessGranted = true
    var contacts: [DeviceContact] = []
    private(set) var readCallCount = 0

    func authorizationStatus() -> CNAuthorizationStatus { status }

    func requestAccess() async -> Bool { accessGranted }

    func readContacts() async throws -> [DeviceContact] {
        readCallCount += 1
        return contacts
    }
}

/// Répertoire serveur qui CAPTURE chaque requête : c'est la suite des requêtes,
/// pas le bilan rendu, qui dit si le contrat de lots est respecté.
private final class RecordingDirectoryService: ContactDirectoryServiceProviding, @unchecked Sendable {
    private(set) var requests: [DirectorySyncRequest] = []
    /// `nil` simule une gateway qui ignore le contrat de lots.
    var serverClock: String? = "2026-08-25T10:00:00.000Z"
    /// Rang (1-based) de l'appel qui doit échouer.
    var failOnCall: Int?
    var removedOnFinal = 9

    func sync(_ request: DirectorySyncRequest) async throws -> DirectorySyncResult {
        requests.append(request)
        if let failOnCall, requests.count == failOnCall { throw StubSyncError.network }
        return DirectorySyncResult(
            totalContacts: request.contacts.count,
            processedContacts: request.contacts.count,
            syncedCount: request.contacts.count,
            matchedCount: 1,
            removedCount: request.isFinalBatch == true ? removedOnFinal : 0,
            syncStartedAt: serverClock
        )
    }

    func list(
        offset: Int,
        limit: Int,
        filter: DirectoryFilter,
        query: String?
    ) async throws -> OffsetPaginatedAPIResponse<[DirectoryContact]> {
        OffsetPaginatedAPIResponse(success: true, data: [], pagination: nil, error: nil)
    }

    func clear() async throws -> DirectoryClearResult {
        DirectoryClearResult(removedCount: 0)
    }
}

private final class RecordingMatchService: ContactMatchServiceProviding, @unchecked Sendable {
    private(set) var requests: [ContactMatchRequest] = []
    /// Identifiants rendus, lot par lot.
    var matchedUserIdsPerCall: [[String]] = []

    func match(_ request: ContactMatchRequest) async throws -> ContactMatchResponse {
        requests.append(request)
        let index = requests.count - 1
        let ids = index < matchedUserIdsPerCall.count ? matchedUserIdsPerCall[index] : []
        return try Self.decodeResponse(userIds: ids, totalContacts: request.contacts.count)
    }

    /// `ContactMatchResponse` est `Decodable` SEUL — son init mémberwise reste
    /// interne au SDK. La seule façon d'en fabriquer une depuis un autre module
    /// est de la décoder, ce qui éprouve au passage la forme réelle du fil.
    private static func decodeResponse(userIds: [String], totalContacts: Int) throws -> ContactMatchResponse {
        let matches = userIds
            .map { "{\"user\":{\"id\":\"\($0)\",\"username\":\"u-\($0)\"},\"matchedBy\":\"phone\"}" }
            .joined(separator: ",")
        let json = "{\"matches\":[\(matches)],\"totalContacts\":\(totalContacts),\"matchedCount\":\(userIds.count)}"
        return try JSONDecoder().decode(ContactMatchResponse.self, from: Data(json.utf8))
    }
}

// MARK: - Tests

/// Synchronisation du carnet PAR LOTS (2026-08-25) — le carnet part en entier,
/// découpé, et la purge n'a lieu qu'au dernier lot.
@MainActor
final class ContactSyncServiceTests: XCTestCase {

    // MARK: - Factories

    private func makeContacts(_ count: Int) -> [DeviceContact] {
        (0..<count).map { index in
            DeviceContact(
                displayName: "Contact \(index)",
                phoneNumbers: ["+22177000\(index)"],
                emails: [],
                usernames: []
            )
        }
    }

    private func makeSUT(
        contactCount: Int,
        batchSize: Int = 3
    ) -> (sut: ContactSyncService, book: StubContactBook, directory: RecordingDirectoryService, match: RecordingMatchService) {
        let book = StubContactBook()
        book.contacts = makeContacts(contactCount)
        let directory = RecordingDirectoryService()
        let match = RecordingMatchService()
        let sut = ContactSyncService(
            book: book,
            matchService: match,
            directoryService: directory,
            batchSize: batchSize
        )
        return (sut, book, directory, match)
    }

    // MARK: - Lecture du carnet

    func test_readEntries_bookLargerThanABatch_returnsEveryContact_noTruncation() async throws {
        let (sut, _, _, _) = makeSUT(contactCount: 2_500, batchSize: 2_000)

        let entries = try await sut.readEntries()

        XCTAssertEqual(entries.count, 2_500, "plus aucune fenêtre : le carnet part en entier")
    }

    func test_readEntries_contactWithoutAnyIdentifier_isDropped() async throws {
        let (sut, book, _, _) = makeSUT(contactCount: 0)
        book.contacts = [
            DeviceContact(displayName: "Joignable", phoneNumbers: ["+221771234567"], emails: [], usernames: []),
            DeviceContact(displayName: "Fantôme", phoneNumbers: [], emails: [], usernames: [])
        ]

        let entries = try await sut.readEntries()

        XCTAssertEqual(entries.count, 1)
        XCTAssertEqual(entries.first?.displayName, "Joignable")
    }

    func test_readEntries_accessDenied_throwsAccessDenied() async {
        let (sut, book, _, _) = makeSUT(contactCount: 3)
        book.status = .denied

        do {
            _ = try await sut.readEntries()
            XCTFail("un accès refusé doit remonter, jamais rendre un carnet vide")
        } catch let error as ContactSyncError {
            XCTAssertEqual(error.localizedDescription, ContactSyncError.accessDenied.localizedDescription)
        } catch {
            XCTFail("erreur inattendue : \(error)")
        }
    }

    // MARK: - Découpe pure

    func test_batches_splitsWithoutLosingAnyEntry() {
        let entries = (0..<7).map { ContactMatchEntry(displayName: "c\($0)") }

        let batches = ContactSyncService.batches(of: entries, size: 3)

        XCTAssertEqual(batches.map(\.count), [3, 3, 1])
        XCTAssertEqual(batches.flatMap { $0 }.count, 7)
    }

    func test_batches_emptyBook_yieldsOneEmptyBatch_neverZeroBatch() {
        let batches = ContactSyncService.batches(of: [], size: 3)

        XCTAssertEqual(batches.count, 1, "c'est CE lot, marqué final, qui dit au serveur que l'appareil n'a plus rien")
        XCTAssertTrue(batches[0].isEmpty)
    }

    // MARK: - Synchronisation par lots

    func test_syncDirectory_bookOfNTimesTheBatchPlusOne_sendsOneRequestPerBatch() async throws {
        let (sut, _, directory, _) = makeSUT(contactCount: 7, batchSize: 3)

        _ = try await sut.syncDirectory(mode: .replace)

        XCTAssertEqual(directory.requests.count, 3)
        XCTAssertEqual(directory.requests.map(\.contacts.count), [3, 3, 1])
    }

    func test_syncDirectory_severalBatches_readsTheDeviceBookOnlyOnce() async throws {
        let (sut, book, _, _) = makeSUT(contactCount: 7, batchSize: 3)

        _ = try await sut.syncDirectory(mode: .replace)

        XCTAssertEqual(book.readCallCount, 1, "une lecture par SYNCHRONISATION, jamais une par lot")
    }

    func test_syncDirectory_batchesAfterTheFirst_repeatTheServerToken() async throws {
        let (sut, _, directory, _) = makeSUT(contactCount: 7, batchSize: 3)

        _ = try await sut.syncDirectory(mode: .replace)

        XCTAssertNil(directory.requests[0].syncStartedAt, "le premier lot n'a aucun jeton à répéter")
        XCTAssertEqual(directory.requests[1].syncStartedAt, "2026-08-25T10:00:00.000Z")
        XCTAssertEqual(directory.requests[2].syncStartedAt, "2026-08-25T10:00:00.000Z")
    }

    func test_syncDirectory_isFinalBatch_marksOnlyTheLastRequest() async throws {
        let (sut, _, directory, _) = makeSUT(contactCount: 7, batchSize: 3)

        _ = try await sut.syncDirectory(mode: .replace)

        XCTAssertNil(directory.requests[0].isFinalBatch)
        XCTAssertNil(directory.requests[1].isFinalBatch)
        XCTAssertEqual(directory.requests[2].isFinalBatch, true)
    }

    /// Contre-épreuve de la purge : un lot d'une découpe qui voyagerait en
    /// `.replace` ferait effacer au serveur tout ce qui n'est pas dans CE lot.
    func test_syncDirectory_severalBatches_noneTravelsInReplaceMode() async throws {
        let (sut, _, directory, _) = makeSUT(contactCount: 7, batchSize: 3)

        _ = try await sut.syncDirectory(mode: .replace)

        XCTAssertEqual(directory.requests.map(\.mode), [.merge, .merge, .merge])
    }

    func test_syncDirectory_singleBatch_isFirstAndFinal_withoutAnyToken() async throws {
        let (sut, _, directory, _) = makeSUT(contactCount: 2, batchSize: 3)

        _ = try await sut.syncDirectory(mode: .replace)

        XCTAssertEqual(directory.requests.count, 1)
        XCTAssertNil(directory.requests[0].syncStartedAt)
        XCTAssertEqual(directory.requests[0].isFinalBatch, true)
        XCTAssertEqual(directory.requests[0].mode, .replace, "envoi unique : le mode historique suffit à une gateway antérieure")
    }

    func test_syncDirectory_emptyBook_stillSendsOneFinalBatch() async throws {
        let (sut, _, directory, _) = makeSUT(contactCount: 0, batchSize: 3)

        _ = try await sut.syncDirectory(mode: .replace)

        XCTAssertEqual(directory.requests.count, 1)
        XCTAssertTrue(directory.requests[0].contacts.isEmpty)
        XCTAssertEqual(directory.requests[0].isFinalBatch, true)
    }

    /// Contre-épreuve du contrat de `.merge` : « n'efface jamais rien ». Un
    /// `isFinalBatch` posé là déclencherait la purge par filigrane.
    func test_syncDirectory_mergeRequested_neverMarksAFinalBatch() async throws {
        let (sut, _, directory, _) = makeSUT(contactCount: 7, batchSize: 3)

        _ = try await sut.syncDirectory(mode: .merge)

        XCTAssertEqual(directory.requests.count, 3)
        XCTAssertTrue(directory.requests.allSatisfy { $0.isFinalBatch == nil })
    }

    func test_syncDirectory_aggregatesEveryCount_andKeepsTheFinalRemovedCount() async throws {
        let (sut, _, directory, _) = makeSUT(contactCount: 7, batchSize: 3)
        directory.removedOnFinal = 9

        let result = try await sut.syncDirectory(mode: .replace)

        XCTAssertEqual(result.totalContacts, 7)
        XCTAssertEqual(result.processedContacts, 7)
        XCTAssertEqual(result.syncedCount, 7)
        XCTAssertEqual(result.matchedCount, 3, "un rapprochement par lot, additionnés")
        XCTAssertEqual(result.removedCount, 9, "la purge n'a lieu qu'au lot final : c'est SON compte")
        XCTAssertEqual(result.syncStartedAt, "2026-08-25T10:00:00.000Z")
    }

    func test_syncDirectory_failureOnTheSecondBatch_propagates_andNoFinalBatchIsSent() async {
        let (sut, _, directory, _) = makeSUT(contactCount: 7, batchSize: 3)
        directory.failOnCall = 2

        do {
            _ = try await sut.syncDirectory(mode: .replace)
            XCTFail("une interruption réseau doit remonter à l'appelant")
        } catch {
            XCTAssertEqual(error as? StubSyncError, StubSyncError.network)
        }

        XCTAssertEqual(directory.requests.count, 2, "la découpe s'arrête net")
        XCTAssertTrue(
            directory.requests.allSatisfy { $0.isFinalBatch == nil },
            "aucune purge n'a eu lieu : le répertoire reste intact"
        )
    }

    // MARK: - Gateway antérieure au contrat de lots

    func test_syncDirectory_gatewayWithoutServerClock_fallsBackToATruncatedMerge_neverToADestructiveReplace() async throws {
        let (sut, _, directory, _) = makeSUT(contactCount: 7, batchSize: 3)
        directory.serverClock = nil

        let result = try await sut.syncDirectory(mode: .replace)

        XCTAssertEqual(directory.requests.count, 2, "le premier lot, puis le repli — jamais la suite de la découpe")
        let fallback = directory.requests[1]
        XCTAssertEqual(fallback.contacts.count, 3)
        XCTAssertEqual(
            fallback.mode, .merge,
            "un envoi tronqué ne doit JAMAIS purger : le gateway ne rétrograde qu'au-delà de 2000, pas à 2000"
        )
        XCTAssertNil(fallback.syncStartedAt)
        XCTAssertNil(fallback.isFinalBatch)
        XCTAssertEqual(result.syncedCount, 3)
    }

    func test_syncDirectory_gatewayWithoutServerClock_singleBatch_staysASingleRequest() async throws {
        let (sut, _, directory, _) = makeSUT(contactCount: 2, batchSize: 3)
        directory.serverClock = nil

        _ = try await sut.syncDirectory(mode: .replace)

        XCTAssertEqual(directory.requests.count, 1, "un seul lot n'a rien à replier")
    }

    // MARK: - Rapprochement par lots

    func test_findFriendsFromContacts_concatenatesTheMatchesOfEveryBatch() async throws {
        let (sut, _, _, match) = makeSUT(contactCount: 7, batchSize: 3)
        match.matchedUserIdsPerCall = [["a"], ["b", "c"], []]

        let matches = try await sut.findFriendsFromContacts()

        XCTAssertEqual(match.requests.count, 3)
        XCTAssertEqual(match.requests.map(\.contacts.count), [3, 3, 1])
        XCTAssertEqual(matches.map(\.user.id), ["a", "b", "c"])
    }

    func test_findFriendsFromContacts_emptyBook_sendsNothing() async throws {
        let (sut, _, _, match) = makeSUT(contactCount: 0, batchSize: 3)

        let matches = try await sut.findFriendsFromContacts()

        XCTAssertTrue(matches.isEmpty)
        XCTAssertTrue(match.requests.isEmpty, "rien à rapprocher : aucune requête")
    }
}
