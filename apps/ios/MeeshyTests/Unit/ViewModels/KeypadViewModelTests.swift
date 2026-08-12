import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class KeypadViewModelTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(
        userService: MockUserService = MockUserService()
    ) -> (sut: KeypadViewModel, userService: MockUserService) {
        let sut = KeypadViewModel(userService: userService)
        return (sut, userService)
    }

    private static let stubNameResults: [UserSearchResult] = {
        let json = """
        [
            {"id":"u1","username":"alice","displayName":"Alice","avatar":null,"isOnline":true},
            {"id":"u2","username":"alicia","displayName":"Alicia","avatar":null,"isOnline":false}
        ]
        """
        return JSONStub.decode(json)
    }()

    private static let stubPhoneUser = MeeshyUser(
        id: "phone-user",
        username: "dialed",
        displayName: "Dialed User"
    )

    private struct StubError: Error {}

    // MARK: - Input editing

    func test_append_buildsInput() {
        let (sut, _) = makeSUT()

        sut.append("0")
        sut.append("6")
        sut.append("1")

        XCTAssertEqual(sut.input, "061")
    }

    func test_deleteLast_removesTrailingCharacter() {
        let (sut, _) = makeSUT()
        sut.input = "061"

        sut.deleteLast()

        XCTAssertEqual(sut.input, "06")
    }

    func test_deleteLast_onEmptyInput_isNoOp() {
        let (sut, _) = makeSUT()

        sut.deleteLast()

        XCTAssertEqual(sut.input, "")
    }

    func test_clear_resetsInputMatchesAndState() async {
        let (sut, userService) = makeSUT()
        userService.searchUsersResult = .success(Self.stubNameResults)
        sut.input = "alice"
        await sut.search()
        XCTAssertFalse(sut.matches.isEmpty)

        sut.clear()

        XCTAssertEqual(sut.input, "")
        XCTAssertTrue(sut.matches.isEmpty)
        XCTAssertEqual(sut.loadState, .idle)
    }

    // MARK: - Classification

    func test_isPhoneNumber_forDigitsAndPlus_isTrue() {
        let (sut, _) = makeSUT()

        sut.input = "+33 6 12-34"

        XCTAssertTrue(sut.isPhoneNumber)
    }

    func test_isPhoneNumber_forName_isFalse() {
        let (sut, _) = makeSUT()

        sut.input = "alice"

        XCTAssertFalse(sut.isPhoneNumber)
    }

    func test_isPhoneNumber_forEmpty_isFalse() {
        let (sut, _) = makeSUT()

        XCTAssertFalse(sut.isPhoneNumber)
    }

    // MARK: - Phone lookup

    func test_search_withPhoneNumber_looksUpByPhone() async {
        let (sut, userService) = makeSUT()
        userService.getProfileByPhoneResult = .success(Self.stubPhoneUser)
        sut.input = "0612345678"

        await sut.search()

        XCTAssertEqual(userService.getProfileByPhoneCallCount, 1)
        XCTAssertEqual(userService.searchUsersCallCount, 0)
        XCTAssertEqual(sut.matches.count, 1)
        XCTAssertEqual(sut.matches.first?.username, "dialed")
        XCTAssertEqual(sut.loadState, .loaded)
    }

    func test_search_withUnknownPhoneNumber_yieldsEmptyButNotError() async {
        let (sut, userService) = makeSUT()
        userService.getProfileByPhoneResult = .failure(StubError())
        sut.input = "0600000000"

        await sut.search()

        XCTAssertTrue(sut.matches.isEmpty)
        // A 404 on a dialed number is a normal "no match", not an error.
        XCTAssertEqual(sut.loadState, .loaded)
    }

    func test_search_withShortPhoneNumber_doesNotHitNetwork() async {
        let (sut, userService) = makeSUT()
        sut.input = "06"

        await sut.search()

        XCTAssertEqual(userService.getProfileByPhoneCallCount, 0)
        XCTAssertTrue(sut.matches.isEmpty)
        XCTAssertEqual(sut.loadState, .idle)
    }

    // MARK: - Name search

    func test_search_withName_searchesUsers() async {
        let (sut, userService) = makeSUT()
        userService.searchUsersResult = .success(Self.stubNameResults)
        sut.input = "alice"

        await sut.search()

        XCTAssertEqual(userService.searchUsersCallCount, 1)
        XCTAssertEqual(userService.getProfileByPhoneCallCount, 0)
        XCTAssertEqual(sut.matches.count, 2)
        XCTAssertEqual(userService.lastSearchUsersQuery, "alice")
        XCTAssertEqual(sut.loadState, .loaded)
    }

    func test_search_withShortName_doesNotHitNetwork() async {
        let (sut, userService) = makeSUT()
        sut.input = "a"

        await sut.search()

        XCTAssertEqual(userService.searchUsersCallCount, 0)
        XCTAssertTrue(sut.matches.isEmpty)
    }

    func test_search_whenNameSearchFails_setsErrorState() async {
        let (sut, userService) = makeSUT()
        userService.searchUsersResult = .failure(StubError())
        sut.input = "alice"

        await sut.search()

        XCTAssertTrue(sut.matches.isEmpty)
        guard case .error = sut.loadState else {
            return XCTFail("Expected .error load state, got \(sut.loadState)")
        }
    }

    func test_search_withEmptyInput_clearsResults() async {
        let (sut, userService) = makeSUT()
        userService.searchUsersResult = .success(Self.stubNameResults)
        sut.input = "alice"
        await sut.search()
        XCTAssertFalse(sut.matches.isEmpty)

        sut.input = "   "
        await sut.search()

        XCTAssertTrue(sut.matches.isEmpty)
        XCTAssertEqual(sut.loadState, .idle)
    }
}
