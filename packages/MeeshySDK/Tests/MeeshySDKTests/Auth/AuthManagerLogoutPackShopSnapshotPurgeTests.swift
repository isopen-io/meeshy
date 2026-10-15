import XCTest
@testable import MeeshySDK

/// #10710 — l'instantané de la vitrine porte le solde de Meeshes et les packs POSSÉDÉS du
/// compte qui l'a lu. Non scopé par compte, il doit partir avec la session : sans purge, le
/// compte suivant ouvrirait la vitrine sur le solde et les achats du précédent.
@MainActor
final class AuthManagerLogoutPackShopSnapshotPurgeTests: XCTestCase {

    override func tearDown() async throws {
        PackShopSnapshotStore.shared.clearAll()
    }

    func test_logout_forgetsTheShopSnapshot() async {
        let state = PackShopState(
            sections: [PackShopSection(domain: .wallpaper, packs: [ShopPack(slug: "aurore", name: "Aurore", price: 20, owned: true)])],
            balance: 42
        )
        PackShopSnapshotStore.shared.write(state, domains: nil)
        guard case .fresh = PackShopSnapshotStore.shared.read(domains: nil) else { return XCTFail("précondition : un instantané frais") }

        await AuthManager.shared.logout()

        guard case .empty = PackShopSnapshotStore.shared.read(domains: nil) else {
            return XCTFail("la vitrine du compte sortant ne survit pas à sa session")
        }
    }
}
