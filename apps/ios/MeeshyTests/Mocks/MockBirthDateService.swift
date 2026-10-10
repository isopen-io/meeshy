import Foundation
import MeeshySDK
@testable import Meeshy

final class MockBirthDateService: BirthDateServiceProviding, @unchecked Sendable {
    var setBirthDateResult: Result<APIBirthDateDeclaration, Error> = .success(
        APIBirthDateDeclaration(ageClass: .adult, viewerWriteRestrictionGlobal: false)
    )

    private(set) var setBirthDateCallCount = 0
    private(set) var lastBirthDate: Date?

    func setBirthDate(_ birthDate: Date) async throws -> APIBirthDateDeclaration {
        setBirthDateCallCount += 1
        lastBirthDate = birthDate
        return try setBirthDateResult.get()
    }

    func reset() {
        setBirthDateResult = .success(APIBirthDateDeclaration(ageClass: .adult, viewerWriteRestrictionGlobal: false))
        setBirthDateCallCount = 0
        lastBirthDate = nil
    }
}
