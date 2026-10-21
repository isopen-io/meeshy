import XCTest
@testable import Meeshy
import MeeshySDK

/// #10006 — l'écran de connexion ouvre World Wide SANS compte : nom → langue →
/// fil, par la clé que `GET /world` SERT (jamais écrite en dur), et la session
/// invité qui en sort porte les familles de pièces jointes du lien (#10001).
@MainActor
final class WorldGuestEntryViewModelTests: XCTestCase {

    // MARK: - Doubles

    final class MockWorldEntryProvider: WorldEntryProviding, @unchecked Sendable {
        var fetchResult: Result<WorldEntry, Error> = .success(WorldGuestEntryViewModelTests.servedEntry)
        private(set) var fetchCallCount = 0

        func fetchWorldEntry() async throws -> WorldEntry {
            fetchCallCount += 1
            return try fetchResult.get()
        }
    }

    final class MockGuestLinkJoiner: GuestLinkJoining, @unchecked Sendable {
        var joinResult: Result<LinkMembershipResponse, Error> = .success(WorldGuestEntryViewModelTests.guestJoin())
        private(set) var joinCallCount = 0
        private(set) var lastKey: String?
        private(set) var lastNickname: String?
        private(set) var lastLanguage: String?

        func joinAsGuest(key: String, nickname: String, language: String) async throws -> LinkMembershipResponse {
            joinCallCount += 1
            lastKey = key
            lastNickname = nickname
            lastLanguage = language
            return try joinResult.get()
        }
    }

    // MARK: - Fabriques

    nonisolated static let servedEntry = WorldEntry(
        identifier: "world", title: "World Wide", shareLinkIdentifier: "cle-servie",
        memberCount: 199, memberCountCapped: true
    )

    nonisolated static func guestJoin(kinds: String = #"["text","audio"]"#, token: String? = "anon_tok") -> LinkMembershipResponse {
        let tokenField = token.map { "\"sessionToken\":\"\($0)\"," } ?? ""
        let json = """
        {\(tokenField)"conversationId":"conv-world","participantId":"part-1",
         "entry":{"outcome":"new","canViewHistory":false,
          "rights":{"canSendMessages":true,"canSendFiles":false,"canSendImages":false,"canSendVideos":false,
                    "canSendAudios":true,"canSendLocations":false,"canSendLinks":false,"canViewHistory":false},
          "allowedAttachmentKinds":\(kinds)}}
        """
        // swiftlint:disable:next force_try
        return try! JSONDecoder().decode(LinkMembershipResponse.self, from: Data(json.utf8))
    }

    private func makeSUT(
        deviceLanguage: String? = "fr",
        stored: [String: AnonymousSessionContext] = [:]
    ) -> (sut: WorldGuestEntryViewModel, world: MockWorldEntryProvider, joiner: MockGuestLinkJoiner) {
        let world = MockWorldEntryProvider()
        let joiner = MockGuestLinkJoiner()
        let sut = WorldGuestEntryViewModel(
            world: world,
            joiner: joiner,
            deviceLanguage: deviceLanguage,
            storedSession: { stored[$0] }
        )
        return (sut, world, joiner)
    }

    private func makeStoredContext(linkId: String) -> AnonymousSessionContext {
        AnonymousSessionContext(
            sessionToken: "ancien", participantId: "p0", permissions: ParticipantPermissions(),
            linkId: linkId, conversationId: "conv-world"
        )
    }

    // MARK: - Disponibilité

    func test_load_worldOpen_availabilityIsOpen() async {
        let (sut, world, _) = makeSUT()

        let resumed = await sut.load()

        XCTAssertNil(resumed)
        XCTAssertEqual(world.fetchCallCount, 1)
        XCTAssertEqual(sut.availability, .open(Self.servedEntry))
    }

    func test_load_worldUnavailable_availabilityIsUnavailable() async {
        let (sut, world, _) = makeSUT()
        world.fetchResult = .failure(MeeshyError.server(statusCode: 404, message: "WORLD_UNAVAILABLE"))

        _ = await sut.load()

        XCTAssertEqual(sut.availability, .unavailable)
    }

    func test_load_storedSessionForServedKey_resumesWithoutAskingAgain() async {
        let stored = makeStoredContext(linkId: "cle-servie")
        let (sut, _, joiner) = makeSUT(stored: ["cle-servie": stored])

        let resumed = await sut.load()

        XCTAssertEqual(resumed?.sessionToken, "ancien")
        XCTAssertEqual(joiner.joinCallCount, 0)
    }

    // MARK: - Langue proposée depuis l'appareil

    func test_init_deviceLanguageAmongTheSeven_isProposed() {
        let (sut, _, _) = makeSUT(deviceLanguage: "es")
        XCTAssertEqual(sut.language, "es")
    }

    func test_init_regionalDeviceLanguage_isNormalized() {
        let (sut, _, _) = makeSUT(deviceLanguage: "pt-BR")
        XCTAssertEqual(sut.language, "pt")
    }

    func test_init_deviceLanguageOutsideTheSeven_fallsBackToFrench() {
        let (sut, _, _) = makeSUT(deviceLanguage: "ja-JP")
        XCTAssertEqual(sut.language, "fr")
    }

    func test_languages_areTheSevenInterfaceLanguages_inPlancheOrder() {
        let (sut, _, _) = makeSUT()
        XCTAssertEqual(sut.languages.map(\.code), ["fr", "en", "es", "pt", "de", "it", "ar"])
    }

    // MARK: - Étapes

    func test_continueToLanguage_blankName_staysOnNameStep() {
        let (sut, _, _) = makeSUT()
        sut.name = "   "

        sut.continueToLanguage()

        XCTAssertEqual(sut.step, .name)
        XCTAssertFalse(sut.canContinue)
    }

    func test_continueToLanguage_validName_movesToLanguageStep() {
        let (sut, _, _) = makeSUT()
        sut.name = "Amina"

        sut.continueToLanguage()

        XCTAssertEqual(sut.step, .language)
    }

    func test_continueToLanguage_nameLongerThanFifty_staysOnNameStep() {
        let (sut, _, _) = makeSUT()
        sut.name = String(repeating: "a", count: 51)

        sut.continueToLanguage()

        XCTAssertEqual(sut.step, .name)
    }

    func test_back_fromLanguage_returnsToName() {
        let (sut, _, _) = makeSUT()
        sut.name = "Amina"
        sut.continueToLanguage()

        sut.back()

        XCTAssertEqual(sut.step, .name)
    }

    // MARK: - Entrée

    func test_enter_joinsServedKey_withTrimmedNameAndChosenLanguage() async {
        let (sut, _, joiner) = makeSUT()
        _ = await sut.load()
        sut.name = "  Amina  "
        sut.continueToLanguage()
        sut.language = "ar"

        _ = await sut.enter()

        XCTAssertEqual(joiner.joinCallCount, 1)
        XCTAssertEqual(joiner.lastKey, "cle-servie")
        XCTAssertEqual(joiner.lastNickname, "Amina")
        XCTAssertEqual(joiner.lastLanguage, "ar")
    }

    func test_enter_success_returnsGuestContext_carryingTheLinkKinds() async throws {
        let (sut, _, _) = makeSUT()
        _ = await sut.load()
        sut.name = "Amina"
        sut.continueToLanguage()

        let entered = await sut.enter()
        let context = try XCTUnwrap(entered)

        XCTAssertEqual(context.sessionToken, "anon_tok")
        XCTAssertEqual(context.conversationId, "conv-world")
        XCTAssertEqual(context.participantId, "part-1")
        XCTAssertEqual(context.linkId, "cle-servie")
        XCTAssertEqual(context.allowedAttachmentKinds, [.text, .audio])
        XCTAssertFalse(context.permissions.canSendImages)
        XCTAssertTrue(context.permissions.canSendAudios)
    }

    func test_enter_withoutGuestToken_failsInsteadOfOpeningAnEmptySession() async {
        let (sut, _, joiner) = makeSUT()
        joiner.joinResult = .success(Self.guestJoin(token: nil))
        _ = await sut.load()
        sut.name = "Amina"
        sut.continueToLanguage()

        let context = await sut.enter()

        XCTAssertNil(context)
        XCTAssertNotNil(sut.errorMessage)
    }

    func test_enter_failure_setsErrorAndStaysOnLanguageStep() async {
        let (sut, _, joiner) = makeSUT()
        joiner.joinResult = .failure(MeeshyError.server(statusCode: 409, message: "Ce lien a atteint sa limite d'utilisation"))
        _ = await sut.load()
        sut.name = "Amina"
        sut.continueToLanguage()

        let context = await sut.enter()

        XCTAssertNil(context)
        XCTAssertEqual(sut.errorMessage, "Ce lien a atteint sa limite d'utilisation")
        XCTAssertEqual(sut.step, .language)
        XCTAssertFalse(sut.isEntering)
    }

    func test_enter_whenWorldUnavailable_neverJoins() async {
        let (sut, world, joiner) = makeSUT()
        world.fetchResult = .failure(MeeshyError.server(statusCode: 404, message: "WORLD_UNAVAILABLE"))
        _ = await sut.load()
        sut.name = "Amina"
        sut.continueToLanguage()

        let context = await sut.enter()

        XCTAssertNil(context)
        XCTAssertEqual(joiner.joinCallCount, 0)
    }

    // MARK: - #10784 — la connexion ne propose plus World Wide

    /// Directive porteur du 2026-10-16 : l'entrée anonyme dans World Wide ne
    /// passe plus que par le QR de meeshy.me (`/world`). L'écran de connexion
    /// s'ouvre sur la connexion, sans carte en tête — comme le web et la coque.
    func test_loginView_offersNoWorldEntryCard() throws {
        let appRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // ViewModels
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
        let source = try String(
            contentsOf: appRoot.appendingPathComponent("Meeshy/Features/Main/Views/LoginView.swift"),
            encoding: .utf8
        )
        XCTAssertFalse(source.contains("WorldEntryLoginCard"))
        XCTAssertFalse(source.contains("WorldEntryCardModel"))
        XCTAssertFalse(source.contains("requestedWorldEntry"))
    }
}
