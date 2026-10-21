import XCTest
@testable import MeeshySDK

/// #10710 — le dernier contenu connu de la vitrine : frais, périmé (servi), expiré (non servi), absent.
final class PackShopSnapshotStoreTests: XCTestCase {

    private final class Clock: @unchecked Sendable { var date = Date(timeIntervalSince1970: 1_000_000) }

    private func makeStore(_ clock: Clock) -> PackShopSnapshotStore {
        let defaults = UserDefaults(suiteName: "pack-shop-snapshot-\(UUID().uuidString)")!
        return PackShopSnapshotStore(defaults: defaults, now: { clock.date })
    }

    private func state() -> PackShopState {
        PackShopState(sections: [PackShopSection(domain: .wallpaper, packs: [ShopPack(slug: "aurore", name: "Aurore", price: 20, owned: false)])], balance: 42)
    }

    func test_neverWritten_isEmpty() {
        guard case .empty = makeStore(Clock()).read(domains: nil) else { return XCTFail("attendu .empty") }
    }

    func test_justWritten_isFresh_andRoundTripsThePacksAndTheBalance() throws {
        let clock = Clock()
        let store = makeStore(clock)
        store.write(state(), domains: nil)
        guard case .fresh(let response, _) = store.read(domains: nil) else { return XCTFail("attendu .fresh") }
        XCTAssertEqual(response.sections.first?.packs.first?.slug, "aurore")
        XCTAssertEqual(response.balance, 42)
    }

    func test_afterTheFreshWindow_isStaleButStillServed() {
        let clock = Clock()
        let store = makeStore(clock)
        store.write(state(), domains: nil)
        clock.date.addTimeInterval(600)
        guard case .stale(let response, _) = store.read(domains: nil) else { return XCTFail("attendu .stale") }
        XCTAssertEqual(response.sections.count, 1)
    }

    func test_pastTheRetention_isExpiredAndNotServed() {
        let clock = Clock()
        let store = makeStore(clock)
        store.write(state(), domains: nil)
        clock.date.addTimeInterval(8 * 86400)
        guard case .expired = store.read(domains: nil) else { return XCTFail("attendu .expired") }
    }

    func test_eachShelfKeepsItsOwnSnapshot() {
        let store = makeStore(Clock())
        store.write(state(), domains: [.wallpaper])
        guard case .empty = store.read(domains: [.banner]) else { return XCTFail("un autre rayon ne lit pas ce cache") }
        guard case .fresh = store.read(domains: [.wallpaper]) else { return XCTFail("attendu .fresh") }
    }

    func test_aShopThatWasNeverRead_isNotWritten() {
        let store = makeStore(Clock())
        store.write(PackShopState(), domains: nil)
        guard case .empty = store.read(domains: nil) else { return XCTFail("rien à écrire") }
    }

    func test_clearAll_forgetsEveryShelf() {
        let store = makeStore(Clock())
        store.write(state(), domains: nil)
        store.write(state(), domains: [.wallpaper])
        store.clearAll()
        guard case .empty = store.read(domains: nil) else { return XCTFail("la vitrine entière est oubliée") }
        guard case .empty = store.read(domains: [.wallpaper]) else { return XCTFail("chaque rayon est oublié") }
    }
}
