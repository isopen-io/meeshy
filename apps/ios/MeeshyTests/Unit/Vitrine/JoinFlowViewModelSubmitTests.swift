import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

@MainActor
final class JoinFlowViewModelSubmitTests: XCTestCase {

    func test_init_preselectsTheDeviceLanguage() {
        let sut = JoinFlowViewModel(identifier: "mshy_link", deviceLanguages: ["en-US"], links: MockJoinFlowLinks())

        XCTAssertEqual(sut.language, "en")
    }

    func test_loadLinkInfo_echec404_poseLePhaseErreurAvecLeMessageDuCatalogue() async {
        let links = MockJoinFlowLinks()
        links.linkInfoResult = .failure(MeeshyError.server(statusCode: 404, message: "x"))
        let sut = JoinFlowViewModel(identifier: "absent", links: links)

        await sut.loadLinkInfo()

        guard case .error(let message) = sut.phase else { return XCTFail("phase \(sut.phase)") }
        XCTAssertFalse(message.isEmpty)
        XCTAssertEqual(sut.errorMessage, message)
    }

    func test_submitJoin_succes_passeEnPhaseSuccess() async throws {
        let links = MockJoinFlowLinks()
        links.linkInfoResult = .success(try Self.info())
        links.joinResult = .success(try Self.joinResponse())
        let sut = JoinFlowViewModel(identifier: "lisboa", links: links)
        await sut.loadLinkInfo()
        sut.firstName = "Aiko"
        sut.lastName = "Tanaka"

        await sut.submitJoin()

        XCTAssertEqual(sut.phase, .success)
        XCTAssertEqual(sut.joinResult?.participant.username, "guest_1234")
        XCTAssertEqual(links.joinCallCount, 1)
        XCTAssertFalse(sut.isSubmitting)
    }

    func test_submitJoin_429_poseLeMessageTropDUtilisateurs() async throws {
        let links = MockJoinFlowLinks()
        links.linkInfoResult = .success(try Self.info())
        links.joinResult = .failure(MeeshyError.server(statusCode: 429, message: "x"))
        let sut = JoinFlowViewModel(identifier: "lisboa", links: links)
        await sut.loadLinkInfo()
        sut.firstName = "Aiko"
        sut.lastName = "Tanaka"

        await sut.submitJoin()

        XCTAssertEqual(sut.errorMessage, JoinFlowCopy.joinFailure(MeeshyError.server(statusCode: 429, message: "x")))
        XCTAssertNotEqual(sut.phase, .success)
        XCTAssertFalse(sut.isSubmitting)
    }

    func test_submitJoin_formulaireInvalide_neTouchePasLeReseau() async throws {
        let links = MockJoinFlowLinks()
        links.linkInfoResult = .success(try Self.info())
        let sut = JoinFlowViewModel(identifier: "lisboa", links: links)
        await sut.loadLinkInfo()

        await sut.submitJoin()

        XCTAssertEqual(links.joinCallCount, 0)
    }

    private static func info() throws -> ShareLinkInfo {
        let json = #"{"id":"l1","linkId":"lisboa","conversation":{"id":"c1","type":"group","createdAt":"2026-09-30T12:00:00.000Z"},"creator":{"id":"u1","username":"aiko.t"},"stats":{"totalParticipants":6,"memberCount":6,"anonymousCount":0,"languageCount":5,"spokenLanguages":["ja","pt","en","ko","es"]}}"#
        return try MeeshyCoders.decoder(.api).decode(ShareLinkInfo.self, from: Data(json.utf8))
    }

    private static func joinResponse() throws -> AnonymousJoinResponse {
        let json = #"{"sessionToken":"tok","participant":{"id":"anon1","username":"guest_1234","displayName":"Guest","firstName":"Guest","lastName":"User","avatar":null,"banner":null,"language":"fr","isMeeshyer":false,"canSendMessages":true,"canSendFiles":false,"canSendImages":false},"conversation":{"id":"conv1","title":"Public Chat","type":"group","allowViewHistory":true},"linkId":"lisboa","id":"join1"}"#
        return try JSONDecoder().decode(AnonymousJoinResponse.self, from: Data(json.utf8))
    }
}

final class MockJoinFlowLinks: JoinFlowLinkProviding, @unchecked Sendable {
    var linkInfoResult: Result<ShareLinkInfo, Error> = .failure(MeeshyError.server(statusCode: 500, message: "unset"))
    var joinResult: Result<AnonymousJoinResponse, Error> = .failure(MeeshyError.server(statusCode: 500, message: "unset"))
    private(set) var joinCallCount = 0

    func getLinkInfo(identifier: String) async throws -> ShareLinkInfo {
        try linkInfoResult.get()
    }

    func joinAnonymously(linkId: String, request: AnonymousJoinRequest) async throws -> AnonymousJoinResponse {
        joinCallCount += 1
        return try joinResult.get()
    }
}
