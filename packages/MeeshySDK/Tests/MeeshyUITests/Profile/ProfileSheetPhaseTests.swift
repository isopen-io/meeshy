import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #18873 — la fiche d'un autre rend UN écran par ce qu'elle sait : squelette sur cache vide seulement (loi 8),
/// erreur avec « Réessayer », hors ligne le cache répond, introuvable et privé se confondent (loi 9).
final class ProfileSheetPhaseTests: XCTestCase {

    private func phase(blockedByMe: Bool = false,
                       unavailable: Bool = false,
                       hasProfile: Bool = false,
                       loading: Bool = false,
                       failure: ProfileLoadFailure? = nil,
                       cachedAge: TimeInterval? = nil) -> ProfileSheetPhase {
        ProfileSheetPhase.resolve(isBlockedByMe: blockedByMe, isUnavailable: unavailable, hasProfile: hasProfile,
                                  isLoading: loading, failure: failure, cachedAge: cachedAge)
    }

    func test_resolve_emptyCacheWhileLoading_isTheSkeleton() {
        XCTAssertEqual(phase(loading: true), .skeleton)
    }

    func test_resolve_aCachedProfileWhileLoading_isNeverTheSkeleton() {
        XCTAssertEqual(phase(hasProfile: true, loading: true), .shown(fallback: nil))
    }

    func test_resolve_emptyCacheAndAFailure_isTheErrorWithItsCause() {
        XCTAssertEqual(phase(failure: .offline), .failed(.offline))
        XCTAssertEqual(phase(failure: .unreachable), .failed(.unreachable))
    }

    func test_resolve_aCachedProfileAndAFailure_servesTheCacheAndSaysItsAge() {
        XCTAssertEqual(phase(hasProfile: true, failure: .offline, cachedAge: 10_800),
                       .shown(fallback: ProfileCacheFallback(failure: .offline, age: 10_800)))
    }

    func test_resolve_unavailableWins_overACacheOrAFailure() {
        XCTAssertEqual(phase(unavailable: true, hasProfile: true, failure: .offline), .unavailable)
        XCTAssertEqual(phase(unavailable: true, loading: true), .unavailable)
    }

    func test_resolve_myOwnBlock_isTheReducedSheet() {
        XCTAssertEqual(phase(blockedByMe: true, hasProfile: true), .blockedByMe)
        XCTAssertEqual(phase(blockedByMe: true, unavailable: true), .blockedByMe)
    }

    func test_resolve_theSeedWithoutCacheNorFailure_isShown() {
        XCTAssertEqual(phase(), .shown(fallback: nil))
    }

    func test_faceSelector_onlySitsOnASheet_readOrBeingPainted() {
        XCTAssertTrue(ProfileSheetPhase.shown(fallback: nil).showsFaceSelector)
        XCTAssertTrue(ProfileSheetPhase.shown(fallback: ProfileCacheFallback(failure: .offline, age: 1)).showsFaceSelector)
        XCTAssertTrue(ProfileSheetPhase.skeleton.showsFaceSelector)
        XCTAssertFalse(ProfileSheetPhase.failed(.offline).showsFaceSelector)
        XCTAssertFalse(ProfileSheetPhase.unavailable.showsFaceSelector)
        XCTAssertFalse(ProfileSheetPhase.blockedByMe.showsFaceSelector)
    }

    func test_isOffline_onlyWhenTheNetworkIsMissing() {
        XCTAssertTrue(ProfileSheetPhase.shown(fallback: ProfileCacheFallback(failure: .offline, age: 1)).isOffline)
        XCTAssertTrue(ProfileSheetPhase.failed(.offline).isOffline)
        XCTAssertFalse(ProfileSheetPhase.shown(fallback: ProfileCacheFallback(failure: .unreachable, age: 1)).isOffline)
        XCTAssertFalse(ProfileSheetPhase.shown(fallback: nil).isOffline)
    }

    func test_fallback_neverCarriesANegativeAge() {
        XCTAssertEqual(ProfileCacheFallback(failure: .offline, age: -5).age, 0)
    }

    func test_classify_readsEveryShapeOfAMissingNetwork() {
        XCTAssertEqual(ProfileLoadFailure.classify(URLError(.notConnectedToInternet)), .offline)
        XCTAssertEqual(ProfileLoadFailure.classify(URLError(.timedOut)), .offline)
        XCTAssertEqual(ProfileLoadFailure.classify(MeeshyError.network(.noConnection)), .offline)
        XCTAssertEqual(ProfileLoadFailure.classify(MeeshyError.unknown(URLError(.networkConnectionLost))), .offline)
    }

    func test_classify_aServerThatAnswersBadly_isUnreachable() {
        XCTAssertEqual(ProfileLoadFailure.classify(MeeshyError.server(statusCode: 500, message: "boom")), .unreachable)
        XCTAssertEqual(ProfileLoadFailure.classify(MeeshyError.network(.serverUnreachable)), .unreachable)
        XCTAssertEqual(ProfileLoadFailure.classify(URLError(.badServerResponse)), .unreachable)
    }
}
