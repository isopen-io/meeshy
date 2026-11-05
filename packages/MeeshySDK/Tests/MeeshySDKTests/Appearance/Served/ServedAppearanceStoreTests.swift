import Combine
import XCTest
@testable import MeeshySDK

/// #16264 — iOS charge le contrat `<sha16>.json` d'un pack d'apparence NON embarqué, en vérifie
/// l'empreinte, le garde (cache d'abord, hors ligne compris) et le rend aux résolveurs.
final class ServedAppearanceStoreTests: XCTestCase {

    private typealias F = ServedAppearanceFixtures

    private func store(bytes: FakeContractBytes, details: FakePackDetails = FakePackDetails(),
                       defaults: UserDefaults = F.defaults()) -> ServedAppearanceStore {
        ServedAppearanceStore(bytes: bytes, detail: { try await details.fetch(domain: $0, slug: $1) }, defaults: defaults)
    }

    // MARK: Le contrat

    func test_contract_decodesTheFourDomains() throws {
        XCTAssertEqual(ServedAppearanceContract(data: F.wallpaper.data)?.domain, .wallpaper)
        XCTAssertEqual(ServedAppearanceContract(data: F.banner.data)?.domain, .banner)
        XCTAssertEqual(ServedAppearanceContract(data: F.ring.data)?.domain, .avatarRing)
        XCTAssertEqual(ServedAppearanceContract(data: F.frame.data)?.domain, .bannerFrame)
        XCTAssertEqual(ServedAppearanceContract(data: F.wallpaper.data)?.appearanceDesigns.count, 4)
        XCTAssertEqual(ServedAppearanceContract(data: F.ring.data)?.rings.map(\.key), ["grec", "grec-anime"])
        XCTAssertEqual(ServedAppearanceContract(data: F.frame.data)?.frames.map(\.key), ["grec", "grec-anime"])
    }

    func test_contract_failsClosed_onUnknownDomainEmptyOrGarbage() {
        XCTAssertNil(ServedAppearanceContract(data: Data(#"{"domain":"sticker","designs":[]}"#.utf8)))
        XCTAssertNil(ServedAppearanceContract(data: Data(#"{"domain":"wallpaper","designs":[]}"#.utf8)))
        XCTAssertNil(ServedAppearanceContract(data: Data(#"{"domain":"wallpaper","designs":[{"key":"x"}]}"#.utf8)))
        XCTAssertNil(ServedAppearanceContract(data: Data("pas du json".utf8)))
    }

    // MARK: L'empreinte

    func test_load_refusesBytesThatDoNotCarryTheAnnouncedDigest() async {
        let honest = F.wallpaper
        let bytes = FakeContractBytes(network: [honest.src: Data(#"{"domain":"wallpaper","designs":[]}"#.utf8)])
        let sut = store(bytes: bytes)
        let loaded = await sut.load(src: honest.src)
        XCTAssertNil(loaded)
        XCTAssertNil(sut.contract(src: honest.src))
        XCTAssertTrue(bytes.stored.isEmpty, "un octet altéré ne s'écrit pas")
    }

    func test_load_refusesAnAddressThatIsNotContentAddressed() async {
        let sut = store(bytes: FakeContractBytes())
        let loaded = await sut.load(src: "../../etc/passwd")
        XCTAssertNil(loaded)
    }

    func test_contract_refusesTamperedBytesFoundOnDisk() {
        let honest = F.wallpaper
        let bytes = FakeContractBytes(disk: [honest.src: F.banner.data])
        XCTAssertNil(store(bytes: bytes).contract(src: honest.src))
    }

    // MARK: Cache d'abord, hors ligne

    func test_load_downloadsOnce_thenServesFromMemoryWithoutTheNetwork() async {
        let contract = F.ring
        let bytes = FakeContractBytes(network: [contract.src: contract.data])
        let sut = store(bytes: bytes)
        XCTAssertNil(sut.contract(src: contract.src), "rien sur l'appareil : rien à peindre, jamais une erreur")
        let first = await sut.load(src: contract.src)
        let second = await sut.load(src: contract.src)
        XCTAssertEqual(first?.domain, .avatarRing)
        XCTAssertEqual(second, first)
        XCTAssertEqual(bytes.fetches, [contract.src])
        XCTAssertEqual(sut.contract(src: contract.src), first)
    }

    func test_aContractSeenOnce_isReadSynchronouslyFromDiskByAFreshStoreOffline() {
        let contract = F.frame
        let bytes = FakeContractBytes(disk: [contract.src: contract.data])
        let sut = store(bytes: bytes)
        XCTAssertEqual(sut.contract(src: contract.src)?.frames.first?.key, "grec")
        XCTAssertTrue(bytes.fetches.isEmpty)
    }

    // MARK: Les packs installés

    func test_prepare_readsTheContractOfEachInstalledServedPack_only() async {
        let wallpaper = F.wallpaper
        let bytes = FakeContractBytes(network: [wallpaper.src: wallpaper.data])
        let details = FakePackDetails(["wallpaper/fonds-servis": F.detail("fonds-servis", contract: wallpaper)])
        let sut = store(bytes: bytes, details: details)
        await sut.prepare(domain: .wallpaper, installed: [
            F.installed("fonds-servis"),
            F.installed("essentiels", builtin: true),
            F.installed("pas-installe", installed: false),
            F.installed("pas-paye", owned: false),
        ])
        XCTAssertEqual(details.calls, ["wallpaper/fonds-servis"], "ni l'embarqué, ni le non-installé, ni l'impayé")
        XCTAssertEqual(sut.contractSource(domain: .wallpaper, slug: "fonds-servis"), wallpaper.src)
        XCTAssertEqual(sut.contract(domain: .wallpaper, slug: "fonds-servis")?.appearanceDesigns.count, 4)
    }

    func test_prepare_keepsTheLastValidContract_whenTheDetailFailsOffline() async {
        let banner = F.banner
        let defaults = F.defaults()
        let bytes = FakeContractBytes(network: [banner.src: banner.data])
        let details = FakePackDetails(["banner/bannieres-servies": F.detail("bannieres-servies", contract: banner)])
        await store(bytes: bytes, details: details, defaults: defaults).prepare(domain: .banner, installed: [F.installed("bannieres-servies")])

        bytes.goOffline()
        details.goOffline()
        let relaunched = store(bytes: bytes, details: details, defaults: defaults)
        await relaunched.prepare(domain: .banner, installed: [F.installed("bannieres-servies")])
        XCTAssertEqual(relaunched.contract(domain: .banner, slug: "bannieres-servies")?.appearanceDesigns.map(\.key),
                       ServedAppearanceContract(data: banner.data)?.appearanceDesigns.map(\.key))
    }

    func test_contractOfTheWrongDomain_isNeverServedForASlug() async {
        let ring = F.ring
        let bytes = FakeContractBytes(network: [ring.src: ring.data])
        let details = FakePackDetails(["wallpaper/piege": F.detail("piege", contract: ring)])
        let sut = store(bytes: bytes, details: details)
        await sut.prepare(domain: .wallpaper, installed: [F.installed("piege")])
        XCTAssertNil(sut.contract(domain: .wallpaper, slug: "piege"))
        XCTAssertNil(sut.wallpaper(pack: "piege", design: "grec"))
    }

    func test_prepareSlug_readsTheDetailOfAPackChosenElsewhere() async {
        let wallpaper = F.wallpaper
        let bytes = FakeContractBytes(network: [wallpaper.src: wallpaper.data])
        let details = FakePackDetails(["wallpaper/fonds-servis": F.detail("fonds-servis", contract: wallpaper)])
        let sut = store(bytes: bytes, details: details)
        let key = try? XCTUnwrap(ServedAppearanceContract(data: wallpaper.data)?.appearanceDesigns.first?.key)
        XCTAssertNil(sut.wallpaper(pack: "fonds-servis", design: key ?? ""))
        await sut.prepare(domain: .wallpaper, slug: "fonds-servis")
        XCTAssertEqual(sut.wallpaper(pack: "fonds-servis", design: key ?? "")?.key, key)
    }

    func test_load_announcesAChange_soThatOpenScreensRepaint() async {
        let contract = F.ring
        let sut = store(bytes: FakeContractBytes(network: [contract.src: contract.data]))
        let announced = expectation(description: "changement annoncé")
        let subscription = sut.changes.sink { announced.fulfill() }
        _ = await sut.load(src: contract.src)
        await fulfillment(of: [announced], timeout: 1)
        subscription.cancel()
    }

    // MARK: Équiper un modèle servi

    func test_servedItem_carriesTheContractOfAServedPack_andStaysBuiltinOtherwise() async {
        let ring = F.ring
        let bytes = FakeContractBytes(network: [ring.src: ring.data])
        let details = FakePackDetails(["avatar-ring/contours-servis": F.detail("contours-servis", contract: ring)])
        let sut = store(bytes: bytes, details: details)
        await sut.prepare(domain: .avatarRing, installed: [F.installed("contours-servis")])
        XCTAssertEqual(sut.servedItem(ProfileDecorRef(pack: "contours-servis", item: "grec"), side: .avatarRing),
                       ServedProfileDecorItem(pack: "contours-servis", item: "grec", origin: .official, contract: ring.src))
        XCTAssertEqual(sut.servedItem(ProfileDecorRef(pack: "contours-essentiels", item: "aurore"), side: .avatarRing),
                       ServedProfileDecorItem(pack: "contours-essentiels", item: "aurore", origin: .builtin, contract: nil))
    }

    // MARK: Le résumé d'un pack porte son contrat

    func test_shopPack_decodesItsContract_andToleratesItsAbsence() throws {
        let ref = F.wallpaper.ref
        let json = #"{"slug":"p","contract":{"src":"\#(ref.src)","bytes":\#(ref.bytes),"sha256":"\#(ref.sha256)"}}"#
        XCTAssertEqual(try JSONDecoder().decode(ShopPack.self, from: Data(json.utf8)).contract, ref)
        XCTAssertNil(try JSONDecoder().decode(ShopPack.self, from: Data(#"{"slug":"p"}"#.utf8)).contract)
        XCTAssertNil(try JSONDecoder().decode(ShopPack.self, from: Data(#"{"slug":"p","contract":{"src":"x"}}"#.utf8)).contract)
    }
}
