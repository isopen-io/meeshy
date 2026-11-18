import XCTest
import MeeshySDK
@testable import Meeshy

/// Les gestes de la face Liens qui modifient un lien ou une adresse : ce qu'ils écrivent dans le cache, ce qu'un refus
/// défait (ce geste seulement), et ce qu'une réponse servie à un AUTRE compte n'écrit jamais.
@MainActor
final class ProfileLinksMutationsTests: XCTestCase {

    // MARK: - Fabriques

    private func shareLink(_ id: String, name: String = "Studio", active: Bool = true) -> MyShareLink {
        MyShareLink(id: id, linkId: "mshy_\(id)", identifier: nil, name: name, isActive: active, currentUses: 23,
                    maxUses: 50, expiresAt: nil, createdAt: Date(timeIntervalSince1970: 0), conversationTitle: nil)
    }

    private func address(_ id: String) -> ProfileAddress {
        ProfileAddress(id: id, title: id.capitalized, url: "https://\(id).io", glyph: .site, circle: .public, isShown: true)
    }

    private func arrival(_ id: String) -> ShareLinkArrivalStats.Arrival {
        ShareLinkArrivalStats.Arrival(participantId: id, displayName: id, isAnonymous: false,
                                      joinedAt: Date(timeIntervalSince1970: 0))
    }

    // MARK: - Liens créés : le cache suit le détail

    /// Supprimé ou modifié depuis son détail, le lien ne revient pas quand la face relit un cache encore frais.
    func test_removedShareLink_staysRemoved_whenTheFaceReloadsAFreshCache() async {
        let store = LinksCacheRecorder(ProfileLinksSnapshot(share: [shareLink("a"), shareLink("b")], tracking: [],
                                                            community: [], referral: [], isFresh: true))
        let model = ProfileLinksFaceModel(sources: store.sources)
        await model.load()

        model.remove(shareLinkId: "a")
        model.replace(shareLink("b", name: "Renommé"))
        await model.pendingSave?.value
        await model.load()

        XCTAssertEqual(model.snapshot.share?.map(\.id), ["b"])
        XCTAssertEqual(model.snapshot.share?.first?.name, "Renommé")
    }

    /// Un refus ne défait que l'interrupteur, sur l'exemplaire COURANT : un renommage reçu pendant l'attente tient.
    func test_refusedSwitch_undoesOnlyTheSwitch_onTheCurrentLink() async {
        let store = LinksCacheRecorder(ProfileLinksSnapshot(share: [shareLink("a", active: false)], isFresh: true))
        let gate = SwitchGate()
        let switches = ProfileLinksSwitches(share: { _, _ in try await gate.waitThenRefuse() }, tracking: { _, _ in })
        let model = ProfileLinksFaceModel(sources: store.sources, switches: switches)
        await model.load()

        let gesture = Task { await model.setActive(true, ticketId: "share:a") }
        try? await waitForCondition { gate.isWaiting }
        model.replace(shareLink("a", name: "Renommé", active: true))
        gate.release()
        let accepted = await gesture.value

        XCTAssertFalse(accepted)
        XCTAssertEqual(model.shareLink(id: "share:a")?.name, "Renommé", "l'édition reçue pendant l'attente tient")
        XCTAssertEqual(model.shareLink(id: "share:a")?.isActive, false, "seul l'interrupteur se défait")
    }

    // MARK: - Mes adresses

    /// Deux gestes rapprochés : le premier refusé ne défait pas le second, que le serveur a accepté.
    func test_addresses_aRefusedGesture_doesNotUndoANeighbourAcceptedMeanwhile() async throws {
        let service = GatedAddressService(listed: [address("a"), address("b")])
        service.holdsId = "a"
        service.refusedIds = ["a"]
        let store = ProfileAddressesStore(service: service, cache: AddressCacheRecorder(), owner: { "me" })
        await store.load()

        let first = Task { await store.setShown(false, for: "a") }
        try await waitForCondition { service.isHolding }
        await store.rename("Bee", for: "b")
        service.release()
        await first.value

        XCTAssertEqual(store.addresses.first { $0.id == "b" }?.title, "Bee", "le geste accepté reste visible")
        XCTAssertEqual(store.addresses.first { $0.id == "a" }?.isShown, true, "le geste refusé est défait")
    }

    func test_addresses_aRefusedRemoval_comesBackAtItsPlace() async {
        let service = GatedAddressService(listed: [address("a"), address("b"), address("c")])
        service.refusedIds = ["b"]
        let store = ProfileAddressesStore(service: service, cache: AddressCacheRecorder(), owner: { "me" })
        await store.load()

        await store.remove(id: "b")

        XCTAssertEqual(store.addresses.map(\.id), ["a", "b", "c"])
        XCTAssertNotNil(store.refusal)
    }

    /// Une liste demandée sous A et servie après le passage à B n'est ni montrée ni gardée chez B.
    func test_addresses_servedAfterAnAccountChange_areNeitherShownNorSaved() async {
        let account = AccountBox("A")
        let service = GatedAddressService(listed: [address("secret")])
        service.onList = { account.value = "B" }
        let cache = AddressCacheRecorder()
        let store = ProfileAddressesStore(service: service, cache: cache, owner: { account.value })

        await store.load()

        XCTAssertTrue(store.addresses.isEmpty)
        XCTAssertTrue(cache.saved.isEmpty)
    }

    // MARK: - Arrivants d'un lien de partage

    /// Deux retraits, le premier refusé : seul lui revient, le second (accepté) reste retiré.
    func test_restoringArrival_bringsBackOnlyTheRefusedOne_onTheCurrentStats() {
        let stats = ShareLinkArrivalStats(visits: 9, arrivals: 2, anonymousArrivals: 0, arrivalsByLanguage: [],
                                          arrivalsByCountry: [], recentArrivals: [arrival("x"), arrival("y")])
        let bothRemoved = stats.removingArrival("x").removingArrival("y")

        let undone = bothRemoved.restoringArrival(arrival("x"), at: 0)

        XCTAssertEqual(undone.recentArrivals.map(\.participantId), ["x"])
        XCTAssertEqual(undone.arrivals, 1)
    }

    // MARK: - Le détail survit au billet

    func test_linkDetail_isHostedByTheList_neverByTheTicket() throws {
        let ticket = try AppSourceGuard.unit("Meeshy/Features/Profile/Faces/ProfileCreatedLinkTicket.swift")
        let body = try XCTUnwrap(ticket.components(separatedBy: "struct ProfileCreatedLinkTicket: View").last)
        XCTAssertFalse(body.contains(".navigationDestination("), "un billet qui change de section referme son détail")
        for list in ["Meeshy/Features/Profile/Faces/ProfileLinksFaceSections.swift",
                     "Meeshy/Features/Links/Views/LinksPageTickets.swift"] {
            XCTAssertTrue(try AppSourceGuard.unit(list).contains(".modifier(ProfileCreatedLinkDetailHost(opened: $opened))"),
                          list)
        }
        let face = try AppSourceGuard.unit("Meeshy/Features/Profile/Faces/ProfileLinksFaceSections.swift")
        XCTAssertTrue(face.contains("onDeleted: { model.remove(trackingLinkId: $0) }"), "le détail de suivi renvoie à la face")
    }

    /// Les tuiles fantômes des vides viennent du kit (K38 `ghostTiles`), légendées : aucune redessinée sur place.
    func test_emptyGhostTiles_areTheKits_withTheirCaptions() throws {
        let posts = try AppSourceGuard.unit("Meeshy/Features/Profile/Faces/ProfilePublicationsSection.swift")
        let addresses = try AppSourceGuard.unit("Meeshy/Features/Profile/Links/MyAddressesView.swift")
        XCTAssertTrue(posts.contains("art: .ghostTiles(ProfilePublicationsCopy.emptyGhostTiles)"))
        XCTAssertTrue(addresses.contains("art: .ghostTiles(MyAddressesCopy.emptyGhostTiles)"))
        XCTAssertFalse(posts.contains("dash: [4, 3]") || addresses.contains("dash: [4, 3]"), "aucun pointillé sur place")
        XCTAssertEqual(ProfilePublicationsCopy.emptyGhostTiles.map(\.caption),
                       [ProfilePublicationsCopy.reel, ProfilePublicationsCopy.photo, ProfilePublicationsCopy.story])
        XCTAssertEqual(MyAddressesCopy.emptyGhostTiles.count, 3)
    }
}

// MARK: - Doubles

/// Un cache de liens qui rend ce qu'on lui a écrit : la face qui relit voit ses propres écritures.
@MainActor
private final class LinksCacheRecorder {
    private var stored: ProfileLinksSnapshot

    init(_ initial: ProfileLinksSnapshot) { stored = initial }

    var sources: ProfileLinksSources {
        ProfileLinksSources(cached: { self.stored }, fetch: { .none },
                            save: { partial in self.stored = self.stored.merging(partial).withFreshness(true) })
    }
}

private extension ProfileLinksSnapshot {
    func withFreshness(_ isFresh: Bool) -> ProfileLinksSnapshot {
        ProfileLinksSnapshot(share: share, tracking: tracking, community: community, referral: referral, isFresh: isFresh)
    }
}

/// Un interrupteur qui attend qu'on le libère, puis refuse.
@MainActor
private final class SwitchGate {
    private var continuation: CheckedContinuation<Void, Never>?
    var isWaiting: Bool { continuation != nil }

    func waitThenRefuse() async throws {
        await withCheckedContinuation { continuation = $0 }
        throw URLError(.badServerResponse)
    }

    func release() {
        continuation?.resume()
        continuation = nil
    }
}

@MainActor
private final class AccountBox {
    var value: String?
    init(_ value: String?) { self.value = value }
}

@MainActor
private final class AddressCacheRecorder: ProfileAddressCaching {
    private(set) var saved: [[ProfileAddress]] = []

    func load() async -> CacheResult<[ProfileAddress]> { .empty }
    func save(_ addresses: [ProfileAddress]) async { saved.append(addresses) }
}

/// Mes adresses sur le fil : une mise à jour peut être retenue jusqu'à ce qu'on la libère, un refus se commande par id.
@MainActor
private final class GatedAddressService: ProfileAddressProviding {
    var listed: [ProfileAddress]
    var holdsId: String?
    var refusedIds: Set<String> = []
    var onList: () -> Void = {}
    private var gate: CheckedContinuation<Void, Never>?
    var isHolding: Bool { gate != nil }

    init(listed: [ProfileAddress]) { self.listed = listed }

    func release() {
        gate?.resume()
        gate = nil
    }

    func list() async throws -> [ProfileAddress] {
        onList()
        return listed
    }

    func create(_ draft: ProfileAddressDraft) async throws -> ProfileAddress {
        ProfileAddress(id: "new", title: draft.title ?? "", url: draft.url ?? "")
    }

    func update(id: String, _ draft: ProfileAddressDraft) async throws -> ProfileAddress {
        if id == holdsId { await withCheckedContinuation { gate = $0 } }
        if refusedIds.contains(id) { throw URLError(.badServerResponse) }
        return listed.first { $0.id == id } ?? ProfileAddress(id: id, title: "", url: "")
    }

    func remove(id: String) async throws {
        if refusedIds.contains(id) { throw URLError(.badServerResponse) }
    }

    func reorder(ids: [String]) async throws -> [ProfileAddress] {
        ids.compactMap { id in listed.first { $0.id == id } }
    }
}
