import XCTest
@testable import MeeshySDK

/// IL5 (#11283) — la session réseau des médias est typée vidéo, applique le
/// droit au réseau facturé qu'on lui passe, et rend discrétionnaires les
/// transferts différés. Quel palier, quel réglage : politique côté app
/// (`ReelTransferPolicy`, témoins `ReelTransferPolicyTests`).
final class MediaTransferProfileTests: XCTestCase {

    private func configuration(for profile: MediaTransferProfile) -> URLSessionConfiguration {
        profile.configured(from: URLSessionConfiguration.ephemeral)
    }

    private func profile(_ priority: MediaTransferPriority, allowsExpensive: Bool = true) -> MediaTransferProfile {
        MediaTransferProfile(priority: priority, allowsExpensiveNetworkAccess: allowsExpensive)
    }

    func test_everyMediaProfile_isTypedAsVideoTraffic() {
        let profiles = [
            profile(.immediate),
            profile(.deferrable, allowsExpensive: false),
        ]
        XCTAssertEqual(profiles.map { configuration(for: $0).networkServiceType }, [.video, .video])
    }

    func test_immediatePriority_isNotDiscretionary() {
        XCTAssertFalse(configuration(for: profile(.immediate)).isDiscretionary)
    }

    func test_deferrablePriority_isDiscretionary() {
        XCTAssertTrue(configuration(for: profile(.deferrable)).isDiscretionary)
    }

    func test_dataSavingOn_forbidsExpensiveNetworkAccess() {
        XCTAssertFalse(configuration(for: profile(.immediate, allowsExpensive: false)).allowsExpensiveNetworkAccess)
    }

    func test_dataSavingOff_allowsExpensiveNetworkAccess() {
        XCTAssertTrue(configuration(for: profile(.deferrable, allowsExpensive: true)).allowsExpensiveNetworkAccess)
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
        _ = profile(.deferrable, allowsExpensive: false).configured(from: base)
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
}
