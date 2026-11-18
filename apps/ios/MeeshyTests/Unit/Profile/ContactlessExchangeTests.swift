import XCTest
import MeeshySDK
@testable import Meeshy

/// Le partage sans contact de téléphone à téléphone (#19484, planche `Sans-Contact`) : approche, « Sofia est là »,
/// choix de ce qu'on donne (le numéro verrouillé), « Donner » qui n'envoie que le jeton, le reçu et l'accusé.
@MainActor
final class ContactlessExchangeTests: XCTestCase {

    nonisolated private static let token = "ce1.AAAAAAAAAAAAAAAAAAAAAA.1.1795000000.BBBBBBBBBBBBBBBBBBBBBB"
    nonisolated private static let sofia = ContactExchangePerson(id: "65a1b2c3d4e5f6a7b8c9d0e1", username: "sofia.b",
                                                     displayName: "Sofia Benali", avatar: nil)

    final class FakeTransport: ContactlessTransporting {
        var sent: [ContactlessWire] = []
        var started = 0
        var stopped = 0
        var onEvent: (@MainActor @Sendable (ContactlessTransportEvent) -> Void)?

        func start(onEvent: @escaping @MainActor @Sendable (ContactlessTransportEvent) -> Void) {
            started += 1
            self.onEvent = onEvent
        }

        func send(_ data: Data) {
            if let wire = ContactlessWire.decode(data) { sent.append(wire) }
        }

        func stop() { stopped += 1 }

        nonisolated deinit {}
    }

    final class FakeService: ContactExchangeProviding, @unchecked Sendable {
        var issued: Result<ContactExchangeIssued, Error> = .success(
            ContactExchangeIssued(token: ContactlessExchangeTests.token, expiresAt: "", offers: [.vitrine]))
        var accepted: Result<ContactExchangeAccepted, Error> = .success(
            ContactExchangeAccepted(issuer: ContactlessExchangeTests.sofia, offers: [.vitrine], bio: "Programmatrice.",
                                    friendRequest: nil))
        var askedOffers: [[ContactExchangeOffer]] = []
        var acceptedTokens: [String] = []

        func issue(offers: [ContactExchangeOffer]) async throws -> ContactExchangeIssued {
            askedOffers.append(offers)
            return try issued.get()
        }

        func accept(token: String) async throws -> ContactExchangeAccepted {
            acceptedTokens.append(token)
            return try accepted.get()
        }
    }

    final class FriendAsks: @unchecked Sendable {
        var ids: [String] = []
        var fails = false
    }

    private struct Refused: Error {}

    private var me: ContactlessHello { ContactlessHello(displayName: "Aïssa Ndiaye", username: "aissa")! }
    private var sofiaHello: ContactlessHello { ContactlessHello(displayName: "Sofia Benali", username: "sofia.b")! }

    private func makeModel(service: FakeService = FakeService(), asks: FriendAsks = FriendAsks())
        -> (ContactlessExchangeModel, FakeTransport) {
        let transport = FakeTransport()
        let model = ContactlessExchangeModel(me: me, service: service, transport: transport, askFriend: { id in
            asks.ids.append(id)
            if asks.fails { throw Refused() }
        })
        return (model, transport)
    }

    private func settle(until done: () -> Bool = { false }) async {
        for _ in 0..<200 where !done() { await Task.yield() }
    }

    // MARK: - La machine d'états

    func test_start_approaches_withMyShowcaseChosen_andNothingGiven() {
        let state = ContactlessExchangeState()

        XCTAssertEqual(state.step, .approaching)
        XCTAssertEqual(state.chosenOffers, [.vitrine])
        XCTAssertFalse(state.canGive, "rien ne part tant que personne n'est là")
    }

    func test_aPhoneNearby_isFound_andTheFirstOneStays() {
        let other = ContactlessHello(displayName: "Léo", username: "leo")!
        let state = ContactlessExchangeState().reduced(.peerFound(sofiaHello)).reduced(.peerFound(other))

        XCTAssertEqual(state.step, .found)
        XCTAssertEqual(state.peer, sofiaHello)
        XCTAssertEqual(state.peerName, "Sofia Benali")
        XCTAssertTrue(state.canGive)
    }

    func test_myNumber_staysLocked_andNeverJoinsTheOffers() {
        let state = ContactlessExchangeState().reduced(.peerFound(sofiaHello)).reduced(.toggled(.phone))

        XCTAssertFalse(state.chosen.contains(.phone))
        XCTAssertTrue(ContactlessGift.phone.isLocked)
        XCTAssertEqual(state.chosenOffers, [.vitrine])
    }

    func test_nothingChosen_cannotGive() {
        let state = ContactlessExchangeState().reduced(.peerFound(sofiaHello)).reduced(.toggled(.vitrine))

        XCTAssertTrue(state.chosenOffers.isEmpty)
        XCTAssertFalse(state.canGive)
        XCTAssertEqual(state.reduced(.giveStarted), state)
    }

    func test_bothGifts_areOfferedInTheContractOrder() {
        let state = ContactlessExchangeState().reduced(.peerFound(sofiaHello)).reduced(.toggled(.friendRequest))

        XCTAssertEqual(state.chosenOffers, [.vitrine, .friendRequest])
    }

    func test_losingThePhoneBeforeGiving_goesBackToTheApproach_keepingMyChoice() {
        let state = ContactlessExchangeState().reduced(.peerFound(sofiaHello)).reduced(.toggled(.friendRequest))
            .reduced(.peerLost)

        XCTAssertEqual(state.step, .approaching)
        XCTAssertNil(state.peer)
        XCTAssertEqual(state.chosenOffers, [.vitrine, .friendRequest])
    }

    func test_aServerThatDoesNotServeTheExchange_isUnavailable_whileAPlainFailureLetsMeRetry() {
        let found = ContactlessExchangeState().reduced(.peerFound(sofiaHello)).reduced(.giveStarted)

        let unavailable = found.reduced(.giveFailed(unavailable: true))
        let retry = found.reduced(.giveFailed(unavailable: false))

        XCTAssertEqual(unavailable.step, .unavailable)
        XCTAssertEqual(retry.step, .found)
        XCTAssertTrue(retry.giveFailed)
        XCTAssertTrue(retry.canGive)
    }

    func test_theReceipt_namesThePersonTheServerReturned_notTheHello() {
        let spoofed = ContactlessHello(displayName: "Quelqu'un d'autre", username: "sofia.b")!
        let accepted = ContactExchangeAccepted(issuer: Self.sofia, offers: [.vitrine], bio: nil, friendRequest: nil)
        let state = ContactlessExchangeState().reduced(.peerFound(spoofed)).reduced(.received(accepted))

        XCTAssertTrue(state.showsReceipt)
        XCTAssertEqual(state.peerName, "Sofia Benali")
    }

    func test_whenTheyAlreadyAskedMe_IAmNotOfferedToAskThem() {
        let asked = ContactExchangeAccepted(issuer: Self.sofia, offers: [.friendRequest], bio: nil, friendRequest: .sent)
        let state = ContactlessExchangeState().reduced(.peerFound(sofiaHello)).reduced(.received(asked))

        XCTAssertFalse(state.offersFriendAsk)
        XCTAssertEqual(state.reduced(.friendAsked), state)
    }

    // MARK: - Le fil

    func test_wire_roundTripsTheHelloTheTokenAndTheAcknowledgement() {
        for wire in [ContactlessWire.hello(sofiaHello), .token(Self.token), .received([.vitrine, .friendRequest])] {
            XCTAssertEqual(ContactlessWire.decode(wire.encoded()), wire)
        }
    }

    func test_wire_refusesWhatAForeignPhoneMightSend() {
        let foreign = [
            #"{"v":2,"kind":"token","token":"\#(Self.token)"}"#,
            #"{"v":1,"kind":"token","token":"../../me"}"#,
            #"{"v":1,"kind":"hello","displayName":"X","username":"a/b"}"#,
            #"{"v":1,"kind":"phone","number":"+33600000000"}"#,
            #"{"v":1,"kind":"received","offers":["phone"]}"#,
            "not json",
        ]
        for raw in foreign {
            XCTAssertNil(ContactlessWire.decode(Data(raw.utf8)), "\(raw)")
        }
        XCTAssertNil(ContactlessWire.decode(Data(repeating: 32, count: ContactlessWire.maxBytes + 1)))
    }

    func test_hello_carriesOnlyANameAndAHandle() throws {
        let data = ContactlessWire.hello(me).encoded()
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(object.keys.sorted(), ["displayName", "kind", "username", "v"])
    }

    // MARK: - Le parcours vivant

    func test_connecting_saysHelloWithMyNameOnly() {
        let (model, transport) = makeModel()
        model.start()

        model.handle(.connected)

        XCTAssertEqual(transport.started, 1)
        XCTAssertEqual(transport.sent, [.hello(me)])
    }

    func test_give_sendsOnlyTheTokenOfWhatIChose() async {
        let service = FakeService()
        let (model, transport) = makeModel(service: service)
        model.start()
        model.handle(.received(ContactlessWire.hello(sofiaHello).encoded()))
        model.toggle(.friendRequest)

        await model.give()

        XCTAssertEqual(service.askedOffers, [[.vitrine, .friendRequest]])
        XCTAssertEqual(transport.sent, [.token(Self.token)])
        XCTAssertEqual(model.state.step, .given)
    }

    func test_give_beforeAnyoneIsThere_sendsNothing() async {
        let service = FakeService()
        let (model, transport) = makeModel(service: service)
        model.start()

        await model.give()

        XCTAssertTrue(service.askedOffers.isEmpty)
        XCTAssertTrue(transport.sent.isEmpty)
    }

    func test_give_onAServerWithoutTheExchange_fallsBackOnTheQR() async {
        let service = FakeService()
        service.issued = .failure(ContactExchangeError.unavailable)
        let (model, transport) = makeModel(service: service)
        model.start()
        model.handle(.received(ContactlessWire.hello(sofiaHello).encoded()))

        await model.give()

        XCTAssertEqual(model.state.step, .unavailable)
        XCTAssertTrue(transport.sent.isEmpty)
    }

    func test_theirToken_isAcceptedOnce_andAcknowledged() async {
        let service = FakeService()
        let (model, transport) = makeModel(service: service)
        model.start()
        model.handle(.received(ContactlessWire.hello(sofiaHello).encoded()))

        model.handle(.received(ContactlessWire.token(Self.token).encoded()))
        model.handle(.received(ContactlessWire.token(Self.token).encoded()))
        await settle(until: { transport.sent.last == .received([.vitrine]) })

        XCTAssertEqual(service.acceptedTokens, [Self.token])
        XCTAssertEqual(model.state.theirs?.issuer, Self.sofia)
        XCTAssertEqual(transport.sent.last, .received([.vitrine]))
    }

    func test_aTokenFromAPhoneThatNeverSaidHello_isIgnored() async {
        let service = FakeService()
        let (model, _) = makeModel(service: service)
        model.start()

        model.handle(.received(ContactlessWire.token(Self.token).encoded()))
        await settle()

        XCTAssertTrue(service.acceptedTokens.isEmpty)
        XCTAssertNil(model.state.theirs)
    }

    func test_theAcknowledgement_saysTheyReceivedMyShowcase() async {
        let (model, _) = makeModel()
        model.start()
        model.handle(.received(ContactlessWire.hello(sofiaHello).encoded()))
        await model.give()

        model.handle(.received(ContactlessWire.received([.vitrine]).encoded()))

        XCTAssertEqual(model.state.acknowledged, [.vitrine])
        let line = ContactlessCopy.acknowledged("Sofia", received: model.state.acknowledged)
        XCTAssertEqual(line, String(format: Bundle.main.localizedString(forKey: "profile.contactless.receivedShowcase",
                                                                        value: nil, table: nil), "Sofia"))
    }

    func test_askToBeFriends_isAppliedAtOnce_andUndoneOnARefusal() async {
        let asks = FriendAsks()
        asks.fails = true
        let (model, _) = makeModel(asks: asks)
        model.start()
        model.handle(.received(ContactlessWire.hello(sofiaHello).encoded()))
        model.handle(.received(ContactlessWire.token(Self.token).encoded()))
        await settle(until: { model.state.theirs != nil })

        await model.askToBeFriends()

        XCTAssertEqual(asks.ids, [Self.sofia.id])
        XCTAssertFalse(model.state.friendAsked)
    }

    func test_aPhoneThatCannotSearch_isUnavailable() {
        let (model, _) = makeModel()
        model.start()

        model.handle(.failed)

        XCTAssertEqual(model.state.step, .unavailable)
    }

    func test_stop_releasesTheTransport() {
        let (model, transport) = makeModel()
        model.start()

        model.stop()

        XCTAssertEqual(transport.stopped, 1)
    }
}
