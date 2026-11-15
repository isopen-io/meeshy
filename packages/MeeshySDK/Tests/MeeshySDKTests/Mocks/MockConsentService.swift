import Foundation
@testable import MeeshySDK

final class MockConsentService: ConsentServiceProviding, @unchecked Sendable {
    struct SetConsentCall: Equatable {
        let purpose: ConsentPurpose
        let granted: Bool
    }

    var setConsentError: Error?
    var consentsResult: Result<[ConsentEntry], Error> = .success([])
    private(set) var setConsentCalls: [SetConsentCall] = []
    private(set) var consentsCallCount = 0

    func consents() async throws -> [ConsentEntry] {
        consentsCallCount += 1
        return try consentsResult.get()
    }

    func setConsent(_ purpose: ConsentPurpose, granted: Bool) async throws -> ConsentEntry {
        setConsentCalls.append(SetConsentCall(purpose: purpose, granted: granted))
        if let setConsentError { throw setConsentError }
        return ConsentEntry(
            purpose: purpose.rawValue,
            granted: granted,
            grantedAt: granted ? "2026-09-15T10:00:00.000Z" : nil,
            policyVersion: ConsentPolicy.defaultVersion
        )
    }
}

/// Une passerelle qui répond 200 sans accorder ce qui était demandé.
final class RefusingConsentService: ConsentServiceProviding, @unchecked Sendable {
    func consents() async throws -> [ConsentEntry] { [] }

    func setConsent(_ purpose: ConsentPurpose, granted: Bool) async throws -> ConsentEntry {
        ConsentEntry(purpose: purpose.rawValue, granted: false, grantedAt: nil, policyVersion: ConsentPolicy.defaultVersion)
    }
}
