import XCTest
import MeeshySDK
@testable import Meeshy

/// IL5 (#11283) — le centre dédoublonne par clé, AVANT le funnel du store :
/// un réel préchargé au palier lointain (différé, interdit de cellulaire) qui
/// passe au palier proche, ou qu'un tap réclame, ne lançait rien — la
/// demande plus forte était avalée, et la lecture héritait de l'échec du
/// préchargement sur réseau facturé. Le centre retient désormais le profil le
/// plus fort demandé pour la clé ; le transfert qui échoue sur le réseau
/// reprend avec lui.
@MainActor
final class AttachmentDownloadCenterProfileTests: XCTestCase {

    private let restricted = MediaTransferProfile(priority: .deferrable, allowsExpensiveNetworkAccess: false)

    private func uniqueURL(_ name: String) -> String {
        "https://cdn.example.invalid/\(name)-\(UUID().uuidString).mp4"
    }

    func test_prefetch_nearTierJoiningAFarTierPrefetch_raisesTheRequestedProfile() {
        let center = AttachmentDownloadCenter(haptics: { _ in })
        let url = uniqueURL("palier")
        let key = AttachmentDownloadCenter.key(for: url)

        center.prefetch(urlString: url, expectedSize: 1000, cacheStore: .video, profile: restricted)
        center.prefetch(urlString: url, expectedSize: 1000, cacheStore: .video, profile: .standard)

        XCTAssertEqual(center.requestedProfile(for: key), .standard)
        center.cancel(key: key)
    }

    func test_start_manualTapJoiningAFarTierPrefetch_raisesTheRequestedProfile() {
        let center = AttachmentDownloadCenter(haptics: { _ in })
        let url = uniqueURL("tap")
        let key = AttachmentDownloadCenter.key(for: url)

        center.prefetch(urlString: url, expectedSize: 1000, cacheStore: .video, profile: restricted)
        center.start(urlString: url, expectedSize: 1000, cacheStore: .video, origin: .manual)

        XCTAssertEqual(center.requestedProfile(for: key), .standard)
        center.cancel(key: key)
    }

    func test_prefetch_farTierJoiningAPlayback_neverLowersTheRequestedProfile() {
        let center = AttachmentDownloadCenter(haptics: { _ in })
        let url = uniqueURL("lecture")
        let key = AttachmentDownloadCenter.key(for: url)

        center.prefetch(urlString: url, expectedSize: 1000, cacheStore: .video, profile: .standard)
        center.prefetch(urlString: url, expectedSize: 1000, cacheStore: .video, profile: restricted)

        XCTAssertEqual(center.requestedProfile(for: key), .standard)
        center.cancel(key: key)
    }

    func test_cancel_forgetsTheRequestedProfile() {
        let center = AttachmentDownloadCenter(haptics: { _ in })
        let url = uniqueURL("annule")
        let key = AttachmentDownloadCenter.key(for: url)

        center.prefetch(urlString: url, expectedSize: 1000, cacheStore: .video, profile: restricted)
        center.cancel(key: key)

        XCTAssertNil(center.requestedProfile(for: key))
    }
}
