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
        installed: @escaping @Sendable @concurrent (PackDomain) async -> [ShopPack]? = { _ in nil },
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

    // MARK: - Les cadres de bannière (#10936)

    func test_load_offersTheFramesOfInstalledAndOwnedPacksOnly() async {
        let model = model(installed: { domain in
            domain == .bannerFrame ? [
                ShopPack(slug: "cadres-celte", name: "x", installed: true),
                ShopPack(slug: "cadres-grec", name: "x", installed: true, price: 40, owned: false),
            ] : nil
        })
        // #11165 (5ffd59ef35) : deux packs de cadres sont installés d'office
        // (haussmannien, ancestral) ; liste non lue, ce sont eux, et eux seuls.
        let parDefaut = BannerFrameCatalog.shared.framePacks.filter(\.installedByDefault).map(\.slug)
        XCTAssertFalse(parDefaut.isEmpty)
        XCTAssertEqual(model.frames.map(\.pack), parDefaut, "liste non lue : les packs de cadres installés d'office")

        await model.load()

        XCTAssertEqual(ProfileDecorOptions.flattened(model.frames).map(\.id), ["cadres-celte/celte", "cadres-celte/celte-anime"])
    }

    func test_equip_aFrame_writesOnlyTheFrameSide() async {
        let service = StubService()
        let served = ServedProfileDecor(banner: item("bannieres-essentielles", "aurore"), bannerFrame: item("cadres-celte", "celte"))
        service.result = .success(served)
        let model = model(decor: ServedProfileDecor(banner: item("bannieres-essentielles", "aurore")), service: service)

        await model.equip(ProfileDecorRef(pack: "cadres-celte", item: "celte"), side: .bannerFrame)

        XCTAssertEqual(service.writes, [ProfileDecorWrite(side: .bannerFrame, choice: ProfileDecorRef(pack: "cadres-celte", item: "celte"))])
        XCTAssertEqual(model.current(.bannerFrame), ProfileDecorRef(pack: "cadres-celte", item: "celte"))
        XCTAssertEqual(model.current(.banner), ProfileDecorRef(pack: "bannieres-essentielles", item: "aurore"))
    }

    func test_ownBanner_anEquippedBuiltinFrame_isDrawnOverThePhoto() {
        let user = MeeshyUser(id: "u1", username: "alice", banner: "https://cdn/b.jpg",
                              profileDecor: ServedProfileDecor(bannerFrame: item("cadres-haussmannien", "haussmannien-anime")))

        XCTAssertEqual(ProfileOwnBanner.frame(of: user)?.key, "haussmannien-anime")
        XCTAssertEqual(ProfileOwnBanner.paint(of: user), .photo("https://cdn/b.jpg"), "le cadre se pose SUR la photo, jamais à sa place")
    }

    /// Des réponses qui se croisent : chaque écriture attend que le test la libère.
    private final class GatedService: ProfileDecorProviding, @unchecked Sendable {
        private let lock = NSLock()
        private var gates: [CheckedContinuation<Result<ServedProfileDecor, Error>, Never>] = []

        var pending: Int { lock.withLock { gates.count } }

        func update(_ write: ProfileDecorWrite) async throws -> ServedProfileDecor {
            let result = await withCheckedContinuation { continuation in
                lock.withLock { gates.append(continuation) }
            }
            return try result.get()
        }

        func release(_ index: Int, with result: Result<ServedProfileDecor, Error>) {
            let gate = lock.withLock { gates[index] }
            gate.resume(returning: result)
        }
    }

    private func waitUntil(_ condition: () -> Bool) async {
        for _ in 0..<200 where !condition() { await Task.yield() }
    }

    func test_equip_twoQuickChoices_theOlderAnswerArrivingLastDoesNotWin() async {
        let service = GatedService()
        let model = ProfileDecorModel(decor: .empty, service: service, installedPacks: { _ in nil }, userId: { "moi" }, publish: { _ in }, center: NotificationCenter())
        let filet = ProfileDecorRef(pack: "contours-essentiels", item: "filet")
        let perle = ProfileDecorRef(pack: "contours-essentiels", item: "perle")

        let first = Task { await model.equip(filet, side: .avatarRing) }
        await waitUntil { service.pending == 1 }
        let second = Task { await model.equip(perle, side: .avatarRing) }
        await waitUntil { service.pending == 2 }

        service.release(1, with: .success(ServedProfileDecor(avatarRing: item("contours-essentiels", "perle"))))
        await second.value
        service.release(0, with: .success(ServedProfileDecor(avatarRing: item("contours-essentiels", "filet"))))
        await first.value

        XCTAssertEqual(model.current(.avatarRing), perle, "le dernier choix reste affiché : une réponse plus ancienne ne l'écrase pas")
        XCTAssertFalse(model.failed)
    }

    func test_equip_anOlderChoiceRefusedLast_doesNotRollBackTheNewerOne() async {
        let service = GatedService()
        let model = ProfileDecorModel(decor: .empty, service: service, installedPacks: { _ in nil }, userId: { "moi" }, publish: { _ in }, center: NotificationCenter())
        let filet = ProfileDecorRef(pack: "contours-essentiels", item: "filet")
        let perle = ProfileDecorRef(pack: "contours-essentiels", item: "perle")

        let first = Task { await model.equip(filet, side: .avatarRing) }
        await waitUntil { service.pending == 1 }
        let second = Task { await model.equip(perle, side: .avatarRing) }
        await waitUntil { service.pending == 2 }

        service.release(1, with: .success(ServedProfileDecor(avatarRing: item("contours-essentiels", "perle"))))
        await second.value
        service.release(0, with: .failure(Refused()))
        await first.value

        XCTAssertEqual(model.current(.avatarRing), perle)
        XCTAssertFalse(model.failed, "l'échec d'un choix déjà remplacé ne s'annonce pas")
    }

    func test_equip_theNewerChoiceRefused_returnsToWhatTheServerAcceptedLast() async {
        let service = GatedService()
        let model = ProfileDecorModel(decor: .empty, service: service, installedPacks: { _ in nil }, userId: { "moi" }, publish: { _ in }, center: NotificationCenter())
        let filet = ProfileDecorRef(pack: "contours-essentiels", item: "filet")
        let perle = ProfileDecorRef(pack: "contours-essentiels", item: "perle")

        let first = Task { await model.equip(filet, side: .avatarRing) }
        await waitUntil { service.pending == 1 }
        let second = Task { await model.equip(perle, side: .avatarRing) }
        await waitUntil { service.pending == 2 }

        service.release(0, with: .success(ServedProfileDecor(avatarRing: item("contours-essentiels", "filet"))))
        await first.value
        service.release(1, with: .failure(Refused()))
        await second.value

        XCTAssertEqual(model.current(.avatarRing), filet, "le serveur a gardé « filet » : le refus de « perle » y revient")
        XCTAssertTrue(model.failed)
    }

    // MARK: - Mes autres appareils, feuille fermée

    func test_decorEvent_ofMyAccount_repaintsMyUser() {
        let user = MeeshyUser(id: "moi", username: "alice")
        let decor = ServedProfileDecor(banner: item("bannieres-essentielles", "aurore"))

        let repainted = ProfileDecorEntry.user(user, applying: ProfileDecorUpdatedEvent(userId: "moi", decor: decor))

        XCTAssertEqual(repainted?.profileDecor, decor)
        XCTAssertEqual(repainted?.username, "alice")
    }

    func test_decorEvent_ofAnotherAccount_changesNothing() {
        let user = MeeshyUser(id: "moi", username: "alice")

        XCTAssertNil(ProfileDecorEntry.user(user, applying: ProfileDecorUpdatedEvent(userId: "autre", decor: .empty)))
        XCTAssertNil(ProfileDecorEntry.user(nil, applying: ProfileDecorUpdatedEvent(userId: "moi", decor: .empty)))
    }

    func test_event_ofMyOtherDeviceRepaintsTheDecor() async {
        let center = NotificationCenter()
        let model = ProfileDecorModel(decor: .empty, service: StubService(), installedPacks: { _ in nil }, userId: { "moi" }, publish: { _ in }, center: center)
        let decor = ServedProfileDecor(avatarRing: item("contours-essentiels", "laurier"))

        center.post(name: .profileDecorUpdated, object: ProfileDecorUpdatedEvent(userId: "moi", decor: decor))
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(model.state.decor, decor)
    }

    // MARK: - La tuile « Image » de la bannière (#11165)

    func test_bannerChoice_withAPhoto_theImageTileIsSelectedAndNoDesignIs() {
        let aurore = ProfileDecorRef(pack: "bannieres-essentielles", item: "aurore")
        let choice = ProfileBannerChoice(photo: "https://cdn/b.jpg", design: aurore)

        XCTAssertTrue(choice.imageSelected, "la photo gagne toujours : c'est elle qui se voit (#10933)")
        XCTAssertFalse(choice.isSelected(aurore), "un design équipé derrière la photo ne se voit pas : il n'est pas montré choisi")
        XCTAssertTrue(choice.photoHidesDesigns)
        XCTAssertEqual(choice.imagePreview, "https://cdn/b.jpg", "la tuile montre la bannière actuelle")
    }

    func test_bannerChoice_withoutPhoto_theEquippedDesignIsSelected() {
        let aurore = ProfileDecorRef(pack: "bannieres-essentielles", item: "aurore")
        let choice = ProfileBannerChoice(photo: nil, design: aurore)

        XCTAssertFalse(choice.imageSelected)
        XCTAssertTrue(choice.isSelected(aurore))
        XCTAssertFalse(choice.photoHidesDesigns)
        XCTAssertNil(choice.imagePreview, "sans photo, la tuile montre un glyphe d'image")
    }

    func test_bannerChoice_anEmptyPhotoIsNoPhoto() {
        let choice = ProfileBannerChoice(photo: "", design: nil)

        XCTAssertTrue(choice.imageSelected, "ni photo ni design : la tuile Image est le choix courant")
        XCTAssertNil(choice.imagePreview)
        XCTAssertFalse(choice.photoHidesDesigns)
    }

    // MARK: - La photo de bannière gagne toujours sur le design (#10933)

    func test_openablePhoto_aPhotoAndAnEquippedDesign_thePhotoWinsAndOpens() {
        let user = MeeshyUser(id: "u1", username: "alice", banner: "https://cdn/b.jpg", profileDecor: ServedProfileDecor(banner: item("bannieres-essentielles", "aurore")))

        XCTAssertEqual(ProfileOwnBanner.paint(of: user), .photo("https://cdn/b.jpg"), "la photo gagne toujours sur le design (#10933)")
        XCTAssertEqual(ProfileOwnBanner.openablePhoto(of: user), "https://cdn/b.jpg")
    }

    func test_paint_aDesignWithoutPhoto_paintsTheDesignAndNothingOpens() {
        let user = MeeshyUser(id: "u1", username: "alice", profileDecor: ServedProfileDecor(banner: item("bannieres-essentielles", "aurore")))

        guard case .design(let design) = ProfileOwnBanner.paint(of: user) else { return XCTFail("sans photo, le design se peint") }
        XCTAssertEqual(design.key, "aurore")
        XCTAssertNil(ProfileOwnBanner.openablePhoto(of: user))
    }

    func test_paint_neitherPhotoNorDesign_isPlain() {
        XCTAssertEqual(ProfileOwnBanner.paint(of: MeeshyUser(id: "u1", username: "alice")), .plain)
    }

    func test_openablePhoto_withoutDesign_isTheBannerPhoto() {
        let user = MeeshyUser(id: "u1", username: "alice", banner: "https://cdn/b.jpg")

        XCTAssertEqual(ProfileOwnBanner.openablePhoto(of: user), "https://cdn/b.jpg")
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
