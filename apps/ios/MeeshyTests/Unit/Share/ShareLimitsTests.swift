import XCTest

/// Les plafonds de B.1 ne sont pas des préférences : ils sont IMPOSÉS par le
/// rate limiting réel (seau global 300 req/min PAR IP — Fastify tourne sans
/// `trustProxy` derrière Traefik, c'est donc un seau PLATEFORME ; seau message
/// 20/min/utilisateur). Le composer in-app conserve 199 pièces jointes ; le
/// partage, non.
final class ShareLimitsTests: XCTestCase {

    func test_limits_matchTheRateLimitingBudget() {
        XCTAssertEqual(ShareLimits.maxFiles, 20)
        XCTAssertEqual(ShareLimits.maxTargets, 10)
        XCTAssertEqual(ShareLimits.maxTotalBytes, 524_288_000)
    }

    func test_canSelectMore_belowCap_isAllowed() {
        XCTAssertTrue(ShareLimits.canSelectMore(selectedCount: 9, isAlreadySelected: false))
    }

    func test_canSelectMore_atCap_isRefused() {
        XCTAssertFalse(
            ShareLimits.canSelectMore(selectedCount: 10, isAlreadySelected: false),
            "la 11e cible dépasserait le seau message de 20/minute/utilisateur"
        )
    }

    /// Décocher une cible déjà sélectionnée ne consomme rien : le refuser
    /// enfermerait l'utilisateur dans une sélection qu'il ne peut plus défaire.
    func test_canSelectMore_atCap_forAnAlreadySelectedTarget_isAllowed() {
        XCTAssertTrue(ShareLimits.canSelectMore(selectedCount: 10, isAlreadySelected: true))
    }

    func test_fitsFileCount_atAndBeyondCap() {
        XCTAssertTrue(ShareLimits.fitsFileCount(20))
        XCTAssertFalse(ShareLimits.fitsFileCount(21))
    }

    func test_fitsByteBudget_atAndBeyondCap() {
        XCTAssertTrue(ShareLimits.fitsByteBudget(524_288_000))
        XCTAssertFalse(ShareLimits.fitsByteBudget(524_288_001))
    }
}
