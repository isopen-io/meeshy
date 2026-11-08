import Combine
import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #16264 — le décor servi d'autrui (ou le mien) charge le contrat qui lui manque, et l'écran qui
/// le montre se repeint à son arrivée. Aucun réseau : le magasin est un double.
@MainActor
final class ServedDecorRepaintTests: XCTestCase {

    private final class MockServedAppearance: ServedAppearanceProviding, @unchecked Sendable {
        private let lock = NSLock()
        private var available: [String: ServedAppearanceContract] = [:]
        private var requested: [String] = []
        let subject = PassthroughSubject<Void, Never>()
        let onDevice: [String: ServedAppearanceContract]

        init(onDevice: [String: ServedAppearanceContract] = [:]) {
            self.onDevice = onDevice
        }

        var loads: [String] { lock.withLock { requested } }
        var changes: AnyPublisher<Void, Never> { subject.eraseToAnyPublisher() }
        func contract(src: String) -> ServedAppearanceContract? { lock.withLock { available[src] } }
        func contractSource(domain: PackDomain, slug: String) -> String? { nil }
        func load(src: String) async -> ServedAppearanceContract? {
            let contract = lock.withLock { () -> ServedAppearanceContract? in
                requested.append(src)
                available[src] = onDevice[src]
                return onDevice[src]
            }
            if contract != nil { subject.send(()) }
            return contract
        }
        func prepare(domain: PackDomain, installed: [ShopPack]) async {}
        func prepare(domain: PackDomain, slug: String) async -> ServedAppearanceContract? { nil }
    }

    private static let ringSource = "0123456789abcdef.json"
    private static let rings = ["grec"].compactMap { AvatarRingCatalog.shared.ring(pack: "contours-grec", item: $0) }

    private func servedDecor() -> ServedProfileDecor {
        ServedProfileDecor(
            avatarRing: ServedProfileDecorItem(pack: "contours-servis", item: "grec", origin: .official, contract: Self.ringSource),
            banner: ServedProfileDecorItem(pack: "bannieres-essentielles", item: "aurore", origin: .builtin)
        )
    }

    private func waitUntil(_ condition: () -> Bool) async {
        for _ in 0..<200 where !condition() { try? await Task.sleep(nanoseconds: 10_000_000) }
    }

    func test_refresh_loadsOnlyTheMissingServedContracts_andRepaintsOnArrival() async {
        let served = MockServedAppearance(onDevice: [Self.ringSource: .avatarRing(Self.rings)])
        let refresh = ServedAppearanceRefresh(served: served)
        let before = refresh.revision

        await refresh.load(decor: servedDecor())
        await waitUntil { refresh.revision > before }

        XCTAssertEqual(served.loads, [Self.ringSource], "l'embarqué ne se charge jamais")
        XCTAssertGreaterThan(refresh.revision, before)
        XCTAssertEqual(ProfileDecorResolver.ring(servedDecor().avatarRing, served: served)?.key, "grec")
    }

    func test_profileSheet_loadsTheServedDecorOfTheProfileItShows() async {
        let served = MockServedAppearance(onDevice: [Self.ringSource: .avatarRing(Self.rings)])
        let loader = ProfileSheetLoader(served: served)
        var repaints = 0
        let subscription = loader.objectWillChange.sink { repaints += 1 }

        loader.repaint(MeeshyUser(id: "u-bob", username: "bob", profileDecor: servedDecor()))
        await waitUntil { served.loads == [Self.ringSource] && repaints >= 2 }

        XCTAssertEqual(served.loads, [Self.ringSource])
        XCTAssertGreaterThanOrEqual(repaints, 2, "le profil, puis l'arrivée du contrat")
        subscription.cancel()
    }
}
