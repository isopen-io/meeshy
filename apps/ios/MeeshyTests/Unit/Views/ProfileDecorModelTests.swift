import XCTest
@testable import Meeshy
import MeeshySDK

/// #10632 — équiper un contour ou une bannière depuis le profil : optimiste, la réponse du
/// serveur fait foi, un refus rétablit le seul côté touché, et le sélecteur ne liste que ce
/// qui est possédé et installé.
@MainActor
final class ProfileDecorModelTests: XCTestCase {

    private final class StubService: ProfileDecorProviding, @unchecked Sendable {
        var result: Result<ServedProfileDecor, Error> = .success(.empty)
        private(set) var writes: [ProfileDecorWrite] = []
        func update(_ write: ProfileDecorWrite) async throws -> ServedProfileDecor {
            writes.append(write)
            return try result.get()
        }
    }

    private struct Refused: Error {}

    private func item(_ pack: String, _ key: String) -> ServedProfileDecorItem {
        ServedProfileDecorItem(pack: pack, item: key, origin: .builtin)
    }

    private func model(
        decor: ServedProfileDecor? = .empty,
        service: StubService = StubService(),
        installed: @escaping @Sendable (PackDomain) async -> [ShopPack]? = { _ in nil },
        published: @escaping @MainActor (ServedProfileDecor) -> Void = { _ in }
    ) -> ProfileDecorModel {
        ProfileDecorModel(decor: decor, service: service, installedPacks: installed, userId: { "moi" }, publish: published, center: NotificationCenter())
    }

    func test_equip_writesTheChoiceAtOnceThenTheServerAnswerIsTheTruth() async {
        let service = StubService()
        let served = ServedProfileDecor(avatarRing: item("contours-essentiels", "perle"), banner: nil)
        service.result = .success(served)
        var seen: [ServedProfileDecor] = []
        let model = model(service: service, published: { seen.append($0) })

        await model.equip(ProfileDecorRef(pack: "contours-essentiels", item: "perle"), side: .avatarRing)

        XCTAssertEqual(seen.first?.avatarRing?.item, "perle", "le choix est publié avant la réponse du serveur")
        XCTAssertEqual(model.state.decor, served)
        XCTAssertFalse(model.failed)
        XCTAssertEqual(service.writes, [ProfileDecorWrite(side: .avatarRing, choice: ProfileDecorRef(pack: "contours-essentiels", item: "perle"))])
    }

    func test_equip_whenRefused_restoresOnlyTheTouchedSide() async {
        let service = StubService()
        service.result = .failure(Refused())
        let start = ServedProfileDecor(avatarRing: item("contours-essentiels", "filet"), banner: item("bannieres-essentielles", "aurore"))
        let model = model(decor: start, service: service)

        await model.equip(ProfileDecorRef(pack: "contours-essentiels", item: "perle"), side: .avatarRing)

        XCTAssertEqual(model.state.decor, start)
        XCTAssertTrue(model.failed)
    }

    func test_equip_theChoiceAlreadyEquipped_sendsNothing() async {
        let service = StubService()
        let model = model(decor: ServedProfileDecor(avatarRing: item("contours-essentiels", "filet")), service: service)

        await model.equip(ProfileDecorRef(pack: "contours-essentiels", item: "filet"), side: .avatarRing)

        XCTAssertTrue(service.writes.isEmpty)
    }

    func test_equip_none_clearsTheSide() async {
        let service = StubService()
        let model = model(decor: ServedProfileDecor(banner: item("bannieres-essentielles", "aurore")), service: service)

        await model.equip(nil, side: .banner)

        XCTAssertEqual(service.writes, [ProfileDecorWrite(side: .banner, choice: nil)])
    }

    func test_load_listsOnlyInstalledAndOwnedPacks() async {
        let model = model(installed: { domain in
            domain == .avatarRing ? [ShopPack(slug: "contours-essentiels", name: "x", installed: true, price: 50, owned: false)] : nil
        })

        await model.load()

        XCTAssertTrue(model.rings.isEmpty, "un pack payant non possédé ne se propose pas")
        XCTAssertFalse(model.banners.isEmpty, "liste non lue : les packs installés d'office")
    }

    func test_event_ofMyOtherDeviceRepaintsTheDecor() async {
        let center = NotificationCenter()
        let model = ProfileDecorModel(decor: .empty, service: StubService(), installedPacks: { _ in nil }, userId: { "moi" }, publish: { _ in }, center: center)
        let decor = ServedProfileDecor(avatarRing: item("contours-essentiels", "laurier"))

        center.post(name: .profileDecorUpdated, object: ProfileDecorUpdatedEvent(userId: "moi", decor: decor))
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(model.state.decor, decor)
    }

    // MARK: - Le décor survit aux copies de MeeshyUser

    func test_mergingServerUser_aServerAnswerWithoutDecor_keepsTheLocalDecor() {
        let decor = ServedProfileDecor(avatarRing: item("contours-essentiels", "laurier"), banner: item("bannieres-essentielles", "maille"))
        let local = MeeshyUser(id: "u1", username: "alice", profileDecor: decor)
        let server = MeeshyUser(id: "u1", username: "alice", displayName: "Alice B")

        let merged = ProfileView.mergingServerUser(server, onto: local)

        XCTAssertEqual(merged.profileDecor, decor, "une route self-only ne sert pas le décor : le local survit")
        XCTAssertEqual(merged.displayName, "Alice B")
    }

    func test_mergingServerUser_aServerAnswerWithDecor_wins() {
        let local = MeeshyUser(id: "u1", username: "alice", profileDecor: ServedProfileDecor(avatarRing: item("contours-essentiels", "filet")))
        let served = ServedProfileDecor(avatarRing: item("contours-essentiels", "perle"))
        let server = MeeshyUser(id: "u1", username: "alice", profileDecor: served)

        XCTAssertEqual(ProfileView.mergingServerUser(server, onto: local).profileDecor, served)
    }

    func test_profileEdits_carryTheDecorOver() {
        let decor = ServedProfileDecor(banner: item("bannieres-essentielles", "aurore"))
        let user = MeeshyUser(id: "u1", username: "alice", banner: "data:image/png;base64,AAAA", profileDecor: decor)

        XCTAssertEqual(user.droppingDataURIImages().profileDecor, decor)
        XCTAssertEqual(user.withProfileChanges(displayName: "A").profileDecor, decor)
    }
}
