import XCTest
import AVFoundation
import MeeshySDK
@testable import MeeshyUI

/// **L'observateur unique de la politique média (#9880)** : la chaleur et
/// l'économie d'énergie qui changent PENDANT la lecture changent les lecteurs
/// déjà vivants — pas seulement le prochain chargé.
@MainActor
final class MediaPolicyMonitorTests: XCTestCase {

    /// L'état de l'appareil, que le témoin fait bouger.
    private final class DeviceState {
        var thermal: ProcessInfo.ThermalState = .nominal
        var lowPower = false

        var policy: MediaPolicy {
            MediaPolicy(
                thermalState: thermal,
                lowPower: lowPower,
                tier: thermal == .serious || thermal == .critical ? .low : (lowPower ? .mid : .high)
            )
        }
    }

    private func makeMonitor(_ device: DeviceState, center: NotificationCenter = NotificationCenter()) -> MediaPolicyMonitor {
        let monitor = MediaPolicyMonitor(read: { device.policy })
        monitor.observeSystem(center: center)
        return monitor
    }

    private func item() -> AVPlayerItem {
        AVPlayerItem(url: URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("absent.mp4"))
    }

    /// La notification arrive sur la file principale : postée depuis elle, sa
    /// livraison peut être immédiate ou différée — le témoin accepte les deux.
    private func waitForPolicy(_ monitor: MediaPolicyMonitor, _ predicate: @escaping (MediaPolicy) -> Bool) {
        guard !predicate(monitor.policy) else { return }
        let changed = expectation(description: "politique republiée")
        let watch = monitor.$policy.sink { if predicate($0) { changed.fulfill() } }
        wait(for: [changed], timeout: 2)
        watch.cancel()
    }

    // MARK: - Un lecteur vivant suit la chaleur

    func test_adopt_appliesTheCurrentPolicy_toAWatchedItem() {
        let monitor = makeMonitor(DeviceState())
        let watched = item()
        monitor.adopt(watched, role: .watched)
        XCTAssertEqual(watched.preferredForwardBufferDuration, 2.0, accuracy: 0.0001)
    }

    func test_nominalToSerious_duringPlayback_shrinksTheLiveItemsBuffers() {
        let device = DeviceState()
        let center = NotificationCenter()
        let monitor = makeMonitor(device, center: center)
        let watched = item()
        let prerolled = item()
        monitor.adopt(watched, role: .watched)
        monitor.adopt(prerolled, role: .prerolled)

        device.thermal = .serious
        center.post(name: ProcessInfo.thermalStateDidChangeNotification, object: nil)
        waitForPolicy(monitor) { $0.thermalState == .serious }

        XCTAssertEqual(watched.preferredForwardBufferDuration, 1.0, accuracy: 0.0001)
        XCTAssertEqual(prerolled.preferredForwardBufferDuration, 0.5, accuracy: 0.0001)
    }

    func test_lowPowerMode_duringPlayback_isObserved_andCutsNeighbourAutoplay() {
        let device = DeviceState()
        let center = NotificationCenter()
        let monitor = makeMonitor(device, center: center)
        XCTAssertTrue(monitor.policy.autoplaysNeighbors)

        device.lowPower = true
        center.post(name: .NSProcessInfoPowerStateDidChange, object: nil)
        waitForPolicy(monitor) { $0.lowPower }

        XCTAssertFalse(monitor.policy.autoplaysNeighbors)
        XCTAssertEqual(monitor.policy.preparedPlayers, 2)
    }

    func test_coolingDown_restoresTheNominalBuffers() {
        let device = DeviceState()
        device.thermal = .serious
        let monitor = makeMonitor(device)
        let watched = item()
        monitor.adopt(watched, role: .watched)
        XCTAssertEqual(watched.preferredForwardBufferDuration, 1.0, accuracy: 0.0001)

        device.thermal = .fair
        monitor.refresh()
        XCTAssertEqual(watched.preferredForwardBufferDuration, 2.0, accuracy: 0.0001)
    }

    func test_refresh_withoutChange_publishesNothing() {
        let monitor = makeMonitor(DeviceState())
        var published = 0
        let watch = monitor.$policy.dropFirst().sink { _ in published += 1 }
        monitor.refresh()
        monitor.refresh()
        XCTAssertEqual(published, 0)
        watch.cancel()
    }

    // MARK: - Un élément adopté change de rôle, et n'est pas retenu

    func test_adoptingAPrerolledItemAsWatched_movesItToTheWatchedBuffer() {
        let device = DeviceState()
        let monitor = makeMonitor(device)
        let prerolled = item()
        monitor.adopt(prerolled, role: .prerolled)
        monitor.adopt(prerolled, role: .watched)

        device.thermal = .serious
        monitor.refresh()
        XCTAssertEqual(prerolled.preferredForwardBufferDuration, 1.0, accuracy: 0.0001,
                       "le lecteur préparé puis affiché suit la loi du lecteur regardé")
    }

    func test_adoptedItems_areNotRetained() {
        let monitor = makeMonitor(DeviceState())
        weak var released: AVPlayerItem?
        autoreleasepool {
            let transient = item()
            monitor.adopt(transient, role: .watched)
            released = transient
        }
        XCTAssertNil(released, "l'observateur ne garde aucun élément en vie")
    }

    /// Un lecteur en FILE (boucle, `AVPlayerLooper`) joue des copies de son
    /// élément : c'est le lecteur qu'on adopte, et chaque élément de sa file suit.
    func test_adoptQueuePlayer_appliesThePolicy_toEveryQueuedItem() {
        let device = DeviceState()
        let monitor = makeMonitor(device)
        let queued = [item(), item()]
        let player = AVQueuePlayer(items: queued)
        monitor.adopt(player, role: .watched)

        device.thermal = .serious
        monitor.refresh()
        for element in queued {
            XCTAssertEqual(element.preferredForwardBufferDuration, 1.0, accuracy: 0.0001)
        }
    }

    func test_adoptedPlayers_areNotRetained() {
        let monitor = makeMonitor(DeviceState())
        weak var released: AVPlayer?
        autoreleasepool {
            let transient = AVPlayer(playerItem: item())
            monitor.adopt(transient, role: .prerolled)
            released = transient
        }
        XCTAssertNil(released)
    }

    // MARK: - Les lecteurs vivants du SDK s'y abonnent

    func test_sharedPlayer_rearmsItsTimeObserver_atTheNewCadence() {
        let manager = SharedAVPlayerManager.shared
        let previous = manager.player
        let player = AVPlayer()
        manager.player = player
        defer {
            manager.disarmTimeObserverForTesting()
            manager.player = previous
        }

        manager.applyMediaPolicy(MediaPolicy(thermalState: .serious, lowPower: false, tier: .low))
        XCTAssertEqual(manager.armedTimeObserverInterval ?? 0, 0.5, accuracy: 0.0001)

        manager.applyMediaPolicy(MediaPolicy(thermalState: .nominal, lowPower: false, tier: .high))
        XCTAssertEqual(manager.armedTimeObserverInterval ?? 0, 0.2, accuracy: 0.0001)
    }

    func test_storyLoader_atTheCriticalStage_releasesEveryPreparedPlayer() {
        let loader = StoryMediaLoader.shared
        loader.clearPlayerCache()
        let url = URL(string: "https://example.invalid/reel.mp4")!
        loader.returnPlayer(AVPlayer(), for: url)
        XCTAssertNotNil(loader.peekCachedPlayer(for: url))

        loader.applyMediaPolicy(MediaPolicy(thermalState: .critical, lowPower: false, tier: .low))
        XCTAssertNil(loader.peekCachedPlayer(for: url), "au stade critique, aucun décodeur n'est tenu d'avance")
    }

    func test_storyLoader_underASmallerPool_returnsThePlayersInExcess() {
        let loader = StoryMediaLoader.shared
        loader.clearPlayerCache()
        var capacity = 3
        loader.setPlayerPoolCapacity { capacity }
        defer { loader.setPlayerPoolCapacity { PlayerPoolCapacity.players(for: DeviceMediaTier.current) } }
        let urls = (1...3).map { URL(string: "https://example.invalid/\($0).mp4")! }
        urls.forEach { loader.returnPlayer(AVPlayer(), for: $0) }

        capacity = 1
        loader.applyMediaPolicy(MediaPolicy(thermalState: .serious, lowPower: false, tier: .low))
        XCTAssertEqual(urls.compactMap { loader.peekCachedPlayer(for: $0) }.count, 1)
        loader.clearPlayerCache()
    }
}
