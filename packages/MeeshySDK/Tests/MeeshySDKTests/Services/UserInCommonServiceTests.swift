import XCTest
@testable import MeeshySDK

/// « En commun » sur le fil (#19377) : `GET /users/:id/in-common` (#19200). Une partie ouverte porte son nombre et sa
/// liste ; une partie verrouillée ne porte que son cercle, même si le fil en disait plus ; une partie absente vaut rien.
final class UserInCommonServiceTests: XCTestCase {

    private func makeService() -> (UserInCommonService, MockAPIClient) {
        let mock = MockAPIClient()
        return (UserInCommonService(api: mock), mock)
    }

    private let served = """
    {"success":true,"data":{"parts":{
      "communities":{"state":"open","circle":"COMMUNITY","total":3,"items":[
        {"id":"c1","identifier":"beatmakers","name":"Beatmakers Dakar","avatar":null,"isPrivate":false}]},
      "friends":{"state":"open","circle":"FRIEND","total":12,"items":[
        {"id":"f1","username":"mina.o","displayName":"Mina Okafor","avatar":null,"circle":"BLOOD"},
        {"id":"f2","username":"kwame.m","displayName":null,"avatar":null,"circle":"ATOM"}]},
      "media":{"state":"open","circle":"ACQUAINTANCE","counts":{"image":200,"video":30,"audio":12,"file":6},
        "countsCapped":false,"items":[
          {"id":"m1","kind":"image","conversationId":"k1","originalName":"alfama.jpg","mimeType":"image/jpeg",
           "fileSize":1200,"fileUrl":"https://x/m1.jpg","width":1200,"height":1600,"uploadedBy":"u2",
           "createdAt":"2026-05-06T10:00:00.000Z"},
          {"id":"m2","kind":"hologram","conversationId":"k1"},
          "garbage"],
        "pagination":{"limit":30,"hasMore":true,"nextCursor":"m1"}}}}}
    """

    func test_inCommon_asksEveryPartOfTheFicheByDefault() async throws {
        let (service, mock) = makeService()
        mock.stubWire("/users/u2/in-common", json: served)

        _ = try await service.inCommon(with: "u2", mediaKind: nil)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/u2/in-common")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        let items = mock.lastRequest?.queryItems ?? []
        XCTAssertEqual(items.first { $0.name == "parts" }?.value, "communities,friends,media,history")
        XCTAssertNil(items.first { $0.name == "mediaKind" })
    }

    func test_inCommon_aMediaFilterAsksOnlyThatKindOfMedia() async throws {
        let (service, mock) = makeService()
        mock.stubWire("/users/u2/in-common", json: served)

        _ = try await service.inCommon(with: "u2", mediaKind: .video)

        let items = mock.lastRequest?.queryItems ?? []
        XCTAssertEqual(items.first { $0.name == "parts" }?.value, "media")
        XCTAssertEqual(items.first { $0.name == "mediaKind" }?.value, "video")
    }

    func test_inCommon_readsTheOpenPartsWithTheirCountsAndLists() async throws {
        let (service, mock) = makeService()
        mock.stubWire("/users/u2/in-common", json: served)

        let common = try await service.inCommon(with: "u2", mediaKind: nil)

        XCTAssertEqual(common.id, "u2")
        XCTAssertEqual(common.communities?.access, .open)
        XCTAssertEqual(common.communities?.shownTotal, 3)
        XCTAssertEqual(common.communities?.shownItems.map(\.name), ["Beatmakers Dakar"])
        XCTAssertEqual(common.friends?.shownTotal, 12)
        XCTAssertEqual(common.friends?.shownItems.map(\.shownName), ["Mina Okafor", "kwame.m"])
        XCTAssertEqual(common.friends?.shownItems.first?.level, .blood)
        XCTAssertNil(common.friends?.shownItems.last?.level, "un cercle inconnu ne se montre pas")
        XCTAssertEqual(common.media?.countsByKind, [.image: 200, .video: 30, .audio: 12, .file: 6])
        XCTAssertEqual(common.media?.shownTotal, 248)
        XCTAssertEqual(common.media?.pagination?.hasMore, true)
    }

    func test_inCommon_anUnknownOrUnreadableMediaDoesNotDropTheOthers() async throws {
        let (service, mock) = makeService()
        mock.stubWire("/users/u2/in-common", json: served)

        let media = try await service.inCommon(with: "u2", mediaKind: nil).media

        XCTAssertEqual(media?.shownItems.map(\.id), ["m1"])
        XCTAssertEqual(media?.shownItems.first?.aspect ?? 0, 0.75, accuracy: 0.001)
    }

    func test_inCommon_aLockedPartKeepsItsCircleAndNothingElse() async throws {
        let (service, mock) = makeService()
        mock.stubWire("/users/u2/in-common", json: """
        {"success":true,"data":{"parts":{
          "friends":{"state":"locked","circle":"FRIEND","total":12,"items":[{"id":"f1","username":"mina.o"}]},
          "media":{"state":"locked","circle":"ACQUAINTANCE","counts":{"image":200},"items":[{"id":"m1","kind":"image"}]}}}}
        """)

        let common = try await service.inCommon(with: "u2", mediaKind: nil)

        XCTAssertEqual(common.friends?.access, .locked(.friend))
        XCTAssertNil(common.friends?.shownTotal)
        XCTAssertNil(common.friends?.total, "un nombre servi sous le cercle ne se garde pas")
        XCTAssertNil(common.friends?.items)
        XCTAssertEqual(common.media?.access, .locked(.acquaintance))
        XCTAssertNil(common.media?.counts)
        XCTAssertNil(common.media?.items)
        XCTAssertNil(common.media?.shownTotal)
    }

    func test_inCommon_anUnknownStateIsLocked() async throws {
        let (service, mock) = makeService()
        mock.stubWire("/users/u2/in-common", json: """
        {"success":true,"data":{"parts":{"communities":{"state":"maybe","circle":"COMMUNITY","total":3,"items":[]}}}}
        """)

        let communities = try await service.inCommon(with: "u2", mediaKind: nil).communities

        XCTAssertEqual(communities?.access, .locked(.community))
        XCTAssertNil(communities?.shownTotal)
    }

    func test_inCommon_aPartTheServerDoesNotServeIsAbsent() async throws {
        let (service, mock) = makeService()
        mock.stubWire("/users/u2/in-common", json: #"{"success":true,"data":{"parts":{"communities":{"state":"open","circle":"COMMUNITY","total":0,"items":[]}}}}"#)

        let common = try await service.inCommon(with: "u2", mediaKind: nil)

        XCTAssertNil(common.friends, "les amis restent derrière IN_COMMON_FRIENDS_ENABLED")
        XCTAssertNil(common.media)
        XCTAssertNil(common.history, "« Notre histoire » attend #19378")
    }

    func test_inCommon_readsTheHistoryWhenServedAndSkipsUnknownSteps() async throws {
        let (service, mock) = makeService()
        mock.stubWire("/users/u2/in-common", json: """
        {"success":true,"data":{"parts":{},"history":[
          {"kind":"firstMessage","at":"2026-03-06T09:00:00.000Z"},
          {"kind":"wedding","at":"2026-04-01T09:00:00.000Z"},
          {"kind":"friend","at":"2026-03-11T09:00:00Z"}]}}
        """)

        let history = try await service.inCommon(with: "u2", mediaKind: nil).history ?? []

        XCTAssertEqual(history.compactMap(\.historyKind), [.firstMessage, .friend])
        XCTAssertNotNil(history.first?.date)
    }

    func test_inCommon_roundTripsThroughTheCacheShape() throws {
        let common = UserInCommon(
            id: "u2",
            communities: InCommonListPart(access: .open, total: 1, items: [InCommonCommunity(id: "c1", name: "Lusophones")]),
            friends: InCommonListPart(access: .locked(.friend)),
            media: InCommonMediaPart(access: .open, counts: [.audio: 1],
                                     items: [InCommonMedia(id: "m1", kind: .audio, duration: 38_000)]),
            history: [InCommonHistoryStep(kind: .close, at: Date(timeIntervalSince1970: 1_780_000_000))]
        )

        let data = try MeeshyCoders.encoder(.persistence).encode(common)
        let reread = try MeeshyCoders.decoder(.persistence).decode(UserInCommon.self, from: data)

        XCTAssertEqual(reread, common)
        XCTAssertEqual(reread.friends?.access, .locked(.friend))
        XCTAssertEqual(reread.media?.shownItems.first?.duration, 38_000)
    }
}
