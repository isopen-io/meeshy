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

    // MARK: - Bornes d'identité (#13825)

    private func loadedSUT(requireNickname: Bool) async throws -> (JoinFlowViewModel, MockJoinFlowLinks) {
        let links = MockJoinFlowLinks()
        links.linkInfoResult = .success(try Self.info(requireNickname: requireNickname))
        let sut = JoinFlowViewModel(identifier: "lisboa", links: links)
        await sut.loadLinkInfo()
        sut.firstName = "Aiko"
        sut.lastName = "Tanaka"
        return (sut, links)
    }

    func test_isFormValid_aOneCharacterFirstOrLastName_isRefused_twoAreAccepted() async throws {
        let (sut, _) = try await loadedSUT(requireNickname: false)

        sut.firstName = "A"
        XCTAssertFalse(sut.isFormValid)
        sut.firstName = "Al"
        XCTAssertTrue(sut.isFormValid)

        sut.lastName = " B "
        XCTAssertFalse(sut.isFormValid)
        sut.lastName = "Li"
        XCTAssertTrue(sut.isFormValid)
    }

    func test_isFormValid_requiredNickname_twoCharactersRefused_threeAccepted_trimmed() async throws {
        let (sut, _) = try await loadedSUT(requireNickname: true)

        sut.username = "Al"
        XCTAssertFalse(sut.isFormValid)
        sut.username = "  Al  "
        XCTAssertFalse(sut.isFormValid)
        sut.username = ""
        XCTAssertFalse(sut.isFormValid)
        sut.username = "Ali"
        XCTAssertTrue(sut.isFormValid)
    }

    func test_isFormValid_optionalNickname_emptyIsFine_butATypedOneKeepsTheBound() async throws {
        let (sut, _) = try await loadedSUT(requireNickname: false)

        sut.username = ""
        XCTAssertTrue(sut.isFormValid)
        sut.username = "Al"
        XCTAssertFalse(sut.isFormValid)
        sut.username = "Ali"
        XCTAssertTrue(sut.isFormValid)
    }

    func test_isFormValid_nickname_isMeasuredOnWhatTheGatewayKeeps() async throws {
        let (sut, _) = try await loadedSUT(requireNickname: true)

        sut.username = "Al#"
        XCTAssertFalse(sut.isFormValid)
        XCTAssertNotNil(sut.minimumLengthMessage(for: .pseudo))
        sut.username = "Zoé"
        XCTAssertFalse(sut.isFormValid)
        sut.username = "Zoe"
        XCTAssertTrue(sut.isFormValid)
    }

    func test_isFormValid_names_countVisibleCharacters() async throws {
        let (sut, _) = try await loadedSUT(requireNickname: false)

        sut.firstName = "A\u{200E}"
        XCTAssertFalse(sut.isFormValid)
        XCTAssertNotNil(sut.minimumLengthMessage(for: .firstName))
        sut.firstName = "😀😀"
        XCTAssertTrue(sut.isFormValid)
    }

    func test_submitJoin_shortIdentity_neTouchePasLeReseau() async throws {
        let (sut, links) = try await loadedSUT(requireNickname: true)
        sut.username = "Al"

        await sut.submitJoin()

        XCTAssertEqual(links.joinCallCount, 0)
    }

    func test_minimumLengthMessage_saysTheBoundOnlyForATypedShortValue() async throws {
        let (sut, _) = try await loadedSUT(requireNickname: true)

        sut.firstName = "A"
        XCTAssertEqual(sut.minimumLengthMessage(for: .firstName), SignupViewModel.minimumLengthMessage(for: .firstName))
        sut.firstName = "Al"
        XCTAssertNil(sut.minimumLengthMessage(for: .firstName))
        sut.lastName = ""
        XCTAssertNil(sut.minimumLengthMessage(for: .lastName))

        sut.username = "Al"
        XCTAssertEqual(sut.minimumLengthMessage(for: .pseudo), SignupViewModel.minimumLengthMessage(for: .pseudo))
        XCTAssertTrue(sut.minimumLengthMessage(for: .pseudo)?.contains("3") ?? false)
        sut.username = "Ali"
        XCTAssertNil(sut.minimumLengthMessage(for: .pseudo))
    }

    func test_makeRequest_sendsTheTrimmedNickname() async throws {
        let links = MockJoinFlowLinks()
        links.linkInfoResult = .success(try Self.info(requireNickname: true))
        links.joinResult = .success(try Self.joinResponse())
        let sut = JoinFlowViewModel(identifier: "lisboa", links: links)
        await sut.loadLinkInfo()
        sut.firstName = " Aiko "
        sut.lastName = "Tanaka"
        sut.username = "  Aiko_t "

        await sut.submitJoin()

        XCTAssertEqual(links.joinCallCount, 1)
        XCTAssertEqual(links.lastJoinRequest?.username, "Aiko_t")
        XCTAssertEqual(links.lastJoinRequest?.firstName, "Aiko")
    }

    private static func info(requireNickname: Bool) throws -> ShareLinkInfo {
        let json = #"{"id":"l1","linkId":"lisboa","requireNickname":\#(requireNickname),"conversation":{"id":"c1","type":"group","createdAt":"2026-09-30T12:00:00.000Z"},"creator":{"id":"u1","username":"aiko.t"},"stats":{"totalParticipants":6,"memberCount":6,"anonymousCount":0,"languageCount":5,"spokenLanguages":["ja","pt","en","ko","es"]}}"#
        return try MeeshyCoders.decoder(.api).decode(ShareLinkInfo.self, from: Data(json.utf8))
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
    private(set) var lastJoinRequest: AnonymousJoinRequest?

    func getLinkInfo(identifier: String) async throws -> ShareLinkInfo {
        try linkInfoResult.get()
    }

    func joinAnonymously(linkId: String, request: AnonymousJoinRequest) async throws -> AnonymousJoinResponse {
        joinCallCount += 1
        lastJoinRequest = request
        return try joinResult.get()
    }
}
