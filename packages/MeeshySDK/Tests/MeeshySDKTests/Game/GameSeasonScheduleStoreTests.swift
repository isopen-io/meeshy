import Foundation
import Testing
@testable import MeeshySDK

/// Le calendrier servi, gardé HORS LIGNE (#10232) : `GET /api/v1/me/game/seasons/calendar`, lu par requête
/// conditionnelle (`If-None-Match: "season-schedule-<révision>"`), rangé sur le disque par révision. Sans réseau ni
/// copie, la constante — jamais un vide, jamais une erreur.
@Suite("Jeu Meeshy — le calendrier des saisons gardé hors ligne")
struct GameSeasonScheduleStoreTests {

    final class FakeTransport: GameSeasonScheduleTransporting, @unchecked Sendable {
        private let lock = NSLock()
        private var responses: [Result<(Int, Data, [String: String]), Error>]
        private(set) var requests: [URLRequest] = []

        init(_ responses: [Result<(Int, Data, [String: String]), Error>]) {
            self.responses = responses
        }

        var sent: [URLRequest] { lock.withLock { requests } }

        func execute(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
            let next: Result<(Int, Data, [String: String]), Error> = lock.withLock {
                requests.append(request)
                return responses.isEmpty ? .failure(URLError(.notConnectedToInternet)) : responses.removeFirst()
            }
            let (status, data, headers) = try next.get()
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
            return (data, response)
        }
    }

    private static func body(revision: Int, secondStart: String = "2027-03-01", stepPoints: Int = 150) -> Data {
        let json: [String: Any] = ["success": true, "data": ["revision": revision, "seasons": [
            ["number": 1, "startDay": "2026-12-21", "status": "scheduled", "themeKey": "language:fr", "stepPoints": 100, "copy": NSNull()],
            ["number": 2, "startDay": secondStart, "status": "scheduled", "themeKey": "language:ja", "stepPoints": stepPoints, "copy": NSNull()],
        ]]]
        return try! JSONSerialization.data(withJSONObject: json)
    }

    private static func ok(revision: Int, stepPoints: Int = 150) -> Result<(Int, Data, [String: String]), Error> {
        .success((200, body(revision: revision, stepPoints: stepPoints), ["ETag": "\"season-schedule-\(revision)\""]))
    }

    private static func tempFile() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("season-schedule-\(UUID().uuidString)", isDirectory: true)
            .appendingPathComponent("schedule.json")
    }

    private static func makeSUT(file: URL = tempFile(), _ responses: [Result<(Int, Data, [String: String]), Error>],
                                token: String? = "jeton") -> (GameSeasonScheduleStore, FakeTransport) {
        let transport = FakeTransport(responses)
        let store = GameSeasonScheduleStore(fileURL: file, transport: transport,
                                            apiBaseURL: { "https://gate.example/api/v1" }, bearerToken: { token })
        return (store, transport)
    }

    @Test("sans réseau ni copie : la constante")
    func noNetworkNoCacheIsTheConstant() async {
        let (store, _) = Self.makeSUT([.failure(URLError(.notConnectedToInternet))])
        let schedule = await store.load()
        #expect(schedule == .default)
        #expect(store.current == .default)
    }

    @Test("la lecture part sur la route servie, authentifiée, et la réponse devient le calendrier courant")
    func readsTheServedRoute() async throws {
        let (store, transport) = Self.makeSUT([Self.ok(revision: 3)])
        let schedule = await store.load()
        #expect(schedule.revision == 3)
        #expect(store.current.definition(number: 2)?.stepPoints == 150)
        let request = try #require(transport.sent.first)
        #expect(request.url?.absoluteString == "https://gate.example/api/v1/me/game/seasons/calendar")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer jeton")
        #expect(request.value(forHTTPHeaderField: "If-None-Match") == nil)
    }

    @Test("la copie survit au redémarrage, et la relecture est CONDITIONNELLE : un 304 la garde")
    func cacheSurvivesAndRevalidates() async throws {
        let file = Self.tempFile()
        let (first, _) = Self.makeSUT(file: file, [Self.ok(revision: 3)])
        _ = await first.load()

        let (second, transport) = Self.makeSUT(file: file, [.success((304, Data(), [:]))])
        let schedule = await second.load()
        #expect(schedule.revision == 3)
        #expect(schedule.definition(number: 2)?.stepPoints == 150)
        #expect(transport.sent.first?.value(forHTTPHeaderField: "If-None-Match") == "\"season-schedule-3\"")
    }

    @Test("hors ligne, la copie gardée répond ; un refus ou un corps illisible ne l'efface jamais")
    func offlineAndRefusalsKeepTheCopy() async {
        let file = Self.tempFile()
        let (first, _) = Self.makeSUT(file: file, [Self.ok(revision: 5)])
        _ = await first.load()

        let (offline, _) = Self.makeSUT(file: file, [.failure(URLError(.notConnectedToInternet))])
        #expect(await offline.load().revision == 5)
        let (refused, _) = Self.makeSUT(file: file, [.success((500, Data(), [:]))])
        #expect(await refused.load().revision == 5)
        let (garbled, _) = Self.makeSUT(file: file, [.success((200, Data("{\"success\":true,\"data\":42}".utf8), [:]))])
        #expect(await garbled.load().revision == 5)
    }

    @Test("une révision nouvelle remplace la copie, sur le disque aussi")
    func newRevisionReplacesTheCopy() async {
        let file = Self.tempFile()
        let (first, _) = Self.makeSUT(file: file, [Self.ok(revision: 3), Self.ok(revision: 4, stepPoints: 200)])
        _ = await first.load()
        #expect(await first.refresh() == .updated)
        #expect(first.current.definition(number: 2)?.stepPoints == 200)

        let (reborn, _) = Self.makeSUT(file: file, [.failure(URLError(.timedOut))])
        #expect(await reborn.load().revision == 4)
    }

    @Test("sans session, aucune requête : la copie, sinon la constante")
    func noSessionNoRequest() async {
        let (store, transport) = Self.makeSUT([Self.ok(revision: 3)], token: nil)
        #expect(await store.load() == .default)
        #expect(transport.sent.isEmpty)
    }
}
