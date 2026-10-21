import XCTest
import MeeshySDK
@testable import Meeshy

/// IL5 (#11283) — la POLITIQUE du profil réseau d'un réel vit côté app : le
/// réglage vidéo de l'utilisateur, palier par palier. Le SDK ne reçoit que le
/// profil opaque qui en résulte.
final class ReelTransferPolicyTests: XCTestCase {

    func test_profile_farTiersOnWifiOnlyVideoSetting_stayOffExpensiveNetworks() {
        let tiers: [ReelPreloadWindow.Tier] = [.prime, .idle]
        let allowed = tiers.map { ReelTransferPolicy.profile(for: $0, videoPolicy: .wifiOnly).allowsExpensiveNetworkAccess }
        XCTAssertEqual(allowed, [false, false])
        XCTAssertFalse(ReelTransferPolicy.profile(for: .prime, videoPolicy: .never).allowsExpensiveNetworkAccess)
    }

    func test_profile_farTiersOnCellularVideoSetting_mayUseExpensiveNetworks() {
        let policies: [AutoDownloadPolicy] = [.always, .wifiAndGoodCellular]
        let allowed = policies.map { ReelTransferPolicy.profile(for: .prime, videoPolicy: $0).allowsExpensiveNetworkAccess }
        XCTAssertEqual(allowed, [true, true])
    }

    func test_profile_nearTiersNeverBlockedByTheVideoSetting_soPlaybackNeverStalls() {
        let tiers: [ReelPreloadWindow.Tier] = [.play, .decode, .mount]
        let profiles = tiers.map { ReelTransferPolicy.profile(for: $0, videoPolicy: .wifiOnly) }
        XCTAssertEqual(profiles.map(\.allowsExpensiveNetworkAccess), [true, true, true])
        XCTAssertEqual(profiles.map(\.isDiscretionary), [false, false, false])
    }

    func test_profile_farTier_isDiscretionary() {
        XCTAssertTrue(ReelTransferPolicy.profile(for: .prime, videoPolicy: .always).isDiscretionary)
        XCTAssertTrue(ReelTransferPolicy.profile(for: .idle, videoPolicy: .always).isDiscretionary)
    }
}
