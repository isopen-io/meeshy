import XCTest
@testable import MeeshySDK

/// IL5 (#11283) — la session réseau des médias est typée vidéo, respecte le
/// réglage de données mobiles, et rend discrétionnaires les transferts différés
/// (paliers prime / idle de la fenêtre de préchargement des réels).
final class MediaTransferProfileTests: XCTestCase {

    private func configuration(for profile: MediaTransferProfile) -> URLSessionConfiguration {
        profile.configured(from: URLSessionConfiguration.ephemeral)
    }

    private func profile(for tier: ReelPreloadWindow.Tier, allowsExpensive: Bool = true) -> MediaTransferProfile {
        MediaTransferProfile(priority: MediaTransferPriority(reelTier: tier), allowsExpensiveNetworkAccess: allowsExpensive)
    }

    func test_everyMediaProfile_isTypedAsVideoTraffic() {
        let profiles = [
            profile(for: .play),
            profile(for: .prime, allowsExpensive: false),
        ]
        XCTAssertEqual(profiles.map { configuration(for: $0).networkServiceType }, [.video, .video])
    }

    func test_playDecodeAndMount_areNotDiscretionary() {
        let tiers: [ReelPreloadWindow.Tier] = [.play, .decode, .mount]
        XCTAssertEqual(tiers.map { configuration(for: profile(for: $0)).isDiscretionary }, [false, false, false])
    }

    func test_primeAndIdle_areDiscretionary() {
        let tiers: [ReelPreloadWindow.Tier] = [.prime, .idle]
        XCTAssertEqual(tiers.map { configuration(for: profile(for: $0)).isDiscretionary }, [true, true])
    }

    func test_dataSavingOn_forbidsExpensiveNetworkAccess() {
        XCTAssertFalse(configuration(for: profile(for: .play, allowsExpensive: false)).allowsExpensiveNetworkAccess)
    }

    func test_dataSavingOff_allowsExpensiveNetworkAccess() {
        XCTAssertTrue(configuration(for: profile(for: .prime, allowsExpensive: true)).allowsExpensiveNetworkAccess)
    }

    func test_standardProfile_keepsTheFormerTransferBehaviour() {
        let standard = configuration(for: .standard)
        XCTAssertFalse(standard.isDiscretionary)
        XCTAssertTrue(standard.allowsExpensiveNetworkAccess)
    }

    func test_configured_leavesTheBaseConfigurationUntouched() {
        let base = URLSessionConfiguration.ephemeral
        base.networkServiceType = .default
        base.isDiscretionary = false
        base.allowsExpensiveNetworkAccess = true
        _ = profile(for: .idle, allowsExpensive: false).configured(from: base)
        XCTAssertEqual(base.networkServiceType, .default)
        XCTAssertFalse(base.isDiscretionary)
        XCTAssertTrue(base.allowsExpensiveNetworkAccess)
    }
}
