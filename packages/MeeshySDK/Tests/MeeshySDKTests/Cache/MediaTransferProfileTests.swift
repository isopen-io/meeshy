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

    // MARK: - La session réellement ouverte par le téléchargeur

    func test_downloader_opensItsSessionWithTheProfileConfiguration() {
        let downloader = MediaFileDownloader(configuration: .ephemeral)
        defer { downloader.invalidate() }
        let deferred = MediaTransferProfile(priority: .deferrable, allowsExpensiveNetworkAccess: false)

        let configuration = downloader.session(for: deferred).configuration

        XCTAssertEqual(configuration.networkServiceType, .video)
        XCTAssertTrue(configuration.isDiscretionary)
        XCTAssertFalse(configuration.allowsExpensiveNetworkAccess)
    }

    func test_downloader_reusesOneSessionPerProfile_andSeparatesProfiles() {
        let downloader = MediaFileDownloader(configuration: .ephemeral)
        defer { downloader.invalidate() }
        let deferred = MediaTransferProfile(priority: .deferrable, allowsExpensiveNetworkAccess: false)

        XCTAssertTrue(downloader.session(for: .standard) === downloader.session(for: .standard))
        XCTAssertFalse(downloader.session(for: .standard) === downloader.session(for: deferred))
    }

    // MARK: - Le réglage vidéo de l'utilisateur, par palier

    func test_farTiers_onWifiOnlyVideoSetting_stayOffExpensiveNetworks() {
        let tiers: [ReelPreloadWindow.Tier] = [.prime, .idle]
        let allowed = tiers.map { MediaTransferProfile(reelTier: $0, videoPolicy: .wifiOnly).allowsExpensiveNetworkAccess }
        XCTAssertEqual(allowed, [false, false])
        XCTAssertFalse(MediaTransferProfile(reelTier: .prime, videoPolicy: .never).allowsExpensiveNetworkAccess)
    }

    func test_farTiers_onCellularVideoSetting_mayUseExpensiveNetworks() {
        let policies: [AutoDownloadPolicy] = [.always, .wifiAndGoodCellular]
        let allowed = policies.map { MediaTransferProfile(reelTier: .prime, videoPolicy: $0).allowsExpensiveNetworkAccess }
        XCTAssertEqual(allowed, [true, true])
    }

    func test_nearTiers_neverBlockedByTheVideoSetting_soPlaybackNeverStalls() {
        let tiers: [ReelPreloadWindow.Tier] = [.play, .decode, .mount]
        let profiles = tiers.map { MediaTransferProfile(reelTier: $0, videoPolicy: .wifiOnly) }
        XCTAssertEqual(profiles.map(\.allowsExpensiveNetworkAccess), [true, true, true])
        XCTAssertEqual(profiles.map(\.isDiscretionary), [false, false, false])
    }

    func test_farTier_profile_isDiscretionary() {
        XCTAssertTrue(MediaTransferProfile(reelTier: .prime, videoPolicy: .always).isDiscretionary)
    }
}
