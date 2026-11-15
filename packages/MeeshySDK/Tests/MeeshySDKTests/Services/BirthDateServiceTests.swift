import XCTest
@testable import MeeshySDK

/// #9929 — l'âge se déclare UNE fois, par `PUT /me/birth-date`. Chaque refus
/// du contrat devient un cas que l'écran sait traiter : étape faite (409),
/// Meeshy fermé (422), date refusée (400), passerelle trop ancienne (404).
final class BirthDateServiceTests: XCTestCase {

    private static let path = "/me/birth-date"
    private static let paris = TimeZone(identifier: "Europe/Paris")!

    private func makeSUT() -> (service: BirthDateService, api: MockAPIClient) {
        let api = MockAPIClient()
        return (BirthDateService(api: api, timeZone: Self.paris), api)
    }

    private func day(_ year: Int, _ month: Int, _ day: Int, hour: Int = 12) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = Self.paris
        return calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour))!
    }

    private func rejection(_ statusCode: Int, code: String?) -> MeeshyError {
        .rejected(APIRejection(statusCode: statusCode, code: code, message: "refus"))
    }

    // MARK: - Écriture

    func test_setBirthDate_putsTheCivilDayAtTheSingleAddress() async throws {
        let (service, api) = makeSUT()
        api.stub(Self.path, result: APIResponse<APIBirthDateDeclaration>(
            success: true, data: APIBirthDateDeclaration(ageClass: .adult, viewerWriteRestrictionGlobal: false), error: nil))

        let declaration = try await service.setBirthDate(day(1990, 3, 7))

        XCTAssertEqual(api.lastRequest?.endpoint, Self.path)
        XCTAssertEqual(api.lastRequest?.method, "PUT")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["birthDate"] as? String, "1990-03-07")
        XCTAssertEqual(declaration, APIBirthDateDeclaration(ageClass: .adult, viewerWriteRestrictionGlobal: false))
    }

    func test_wireDay_justAfterLocalMidnight_keepsTheLocalDay() {
        XCTAssertEqual(BirthDateService.wireDay(day(2010, 1, 2, hour: 0), timeZone: Self.paris), "2010-01-02")
    }

    func test_wireDay_padsEveryPart() {
        XCTAssertEqual(BirthDateService.wireDay(day(2009, 9, 5), timeZone: Self.paris), "2009-09-05")
    }

    // MARK: - Les refus du contrat

    func test_setBirthDate_alreadySet409_throwsAlreadySet() async {
        let (service, api) = makeSUT()
        api.errorToThrow = rejection(409, code: "BIRTH_DATE_ALREADY_SET")

        await assertThrows(.alreadySet) { try await service.setBirthDate(self.day(1990, 1, 1)) }
    }

    func test_setBirthDate_belowMinimum422_throwsBelowMinimumAge() async {
        let (service, api) = makeSUT()
        api.errorToThrow = rejection(422, code: "AGE_BELOW_MINIMUM")

        await assertThrows(.belowMinimumAge) { try await service.setBirthDate(self.day(2020, 1, 1)) }
    }

    func test_setBirthDate_invalid400_throwsInvalidDate() async {
        let (service, api) = makeSUT()
        api.errorToThrow = rejection(400, code: "VALIDATION_ERROR")

        await assertThrows(.invalidDate) { try await service.setBirthDate(self.day(1800, 1, 1)) }
    }

    func test_setBirthDate_unknownRoute404_throwsUnsupported() async {
        let (service, api) = makeSUT()
        api.errorToThrow = rejection(404, code: nil)

        await assertThrows(.unsupported) { try await service.setBirthDate(self.day(1990, 1, 1)) }
    }

    func test_setBirthDate_networkFailure_throwsUnavailable() async {
        let (service, api) = makeSUT()
        api.errorToThrow = URLError(.notConnectedToInternet)

        await assertThrows(.unavailable) { try await service.setBirthDate(self.day(1990, 1, 1)) }
    }

    // MARK: - Décodage

    func test_decode_minorDeclaration_readsTheRestriction() throws {
        let json = #"{"ageClass":"minor","viewerWriteRestrictionGlobal":true}"#
        let decoded = try JSONDecoder().decode(APIBirthDateDeclaration.self, from: Data(json.utf8))

        XCTAssertEqual(decoded, APIBirthDateDeclaration(ageClass: .minor, viewerWriteRestrictionGlobal: true))
    }

    func test_decode_unknownAgeClass_isKept() throws {
        let json = #"{"ageClass":"senior","viewerWriteRestrictionGlobal":false}"#
        let decoded = try JSONDecoder().decode(APIBirthDateDeclaration.self, from: Data(json.utf8))

        XCTAssertEqual(decoded.ageClass, .unknown("senior"))
    }

    func test_endpoint_declaresStructuredRejections() {
        XCTAssertEqual(MeEndpoint.birthDate.rejectionPolicy, .structured)
        XCTAssertEqual(MeEndpoint.birthDate.path, "/api/v1/me/birth-date")
    }

    // MARK: - Helper

    private func assertThrows(
        _ expected: BirthDateDeclarationError,
        file: StaticString = #filePath,
        line: UInt = #line,
        _ operation: () async throws -> APIBirthDateDeclaration
    ) async {
        do {
            _ = try await operation()
            XCTFail("expected \(expected)", file: file, line: line)
        } catch {
            XCTAssertEqual(error as? BirthDateDeclarationError, expected, file: file, line: line)
        }
    }
}
