import XCTest
@testable import MeeshySDK

/// Un binaire qui ne propose pas le choix du serveur n'honore pas non plus un
/// choix persisté : la préférence se lit hors du trousseau, et l'hôte qu'elle
/// nomme recevrait les jetons de chaque compte au premier appel.
final class MeeshyConfigHonoredEnvironmentTests: XCTestCase {

    func test_honoredEnvironment_withoutServerChoice_isProduction_whateverIsPersisted() {
        for persisted in ["custom", "localhost:3000", "gate.staging.meeshy.me", "gate.meeshy.me", "inconnu"] {
            XCTAssertEqual(
                MeeshyConfig.honoredEnvironment(persisted: persisted, allowsServerChoice: false),
                .production,
                persisted
            )
        }
    }

    func test_honoredEnvironment_withServerChoice_keepsThePersistedEnvironment() {
        XCTAssertEqual(MeeshyConfig.honoredEnvironment(persisted: "custom", allowsServerChoice: true), .custom)
        XCTAssertEqual(
            MeeshyConfig.honoredEnvironment(persisted: "gate.staging.meeshy.me", allowsServerChoice: true),
            .staging
        )
    }

    func test_honoredEnvironment_nothingPersisted_isProduction() {
        XCTAssertEqual(MeeshyConfig.honoredEnvironment(persisted: nil, allowsServerChoice: true), .production)
        XCTAssertEqual(MeeshyConfig.honoredEnvironment(persisted: "inconnu", allowsServerChoice: true), .production)
    }
}
