import Combine
import Foundation
import MeeshySDK

/// Le parcours sans contact vivant (#19484) : il relie le transport pair à pair, la passerelle (jeton, acceptation)
/// et la machine d'états. Rien ne part tant que je n'ai pas appuyé sur « Donner » : le bonjour ne porte que mon nom
/// et mon pseudo, et le jeton n'encode que ce que j'ai choisi.
@MainActor
final class ContactlessExchangeModel: ObservableObject {
    typealias AskFriend = @Sendable (_ userId: String) async throws -> Void

    @Published private(set) var state = ContactlessExchangeState()

    private let me: ContactlessHello?
    private let service: ContactExchangeProviding
    private let transport: ContactlessTransporting
    private let askFriend: AskFriend
    private var started = false
    private var accepting = false

    init(me: ContactlessHello?,
         service: ContactExchangeProviding = ContactExchangeService.shared,
         transport: ContactlessTransporting = MultipeerContactlessTransport(),
         askFriend: @escaping AskFriend = { userId in
             _ = try await FriendService.shared.sendFriendRequest(receiverId: userId, message: nil)
         }) {
        self.me = me
        self.service = service
        self.transport = transport
        self.askFriend = askFriend
    }

    nonisolated deinit {}

    // MARK: - Cycle de vie

    func start() {
        guard !started else { return }
        guard me != nil else {
            apply(.transportFailed)
            return
        }
        started = true
        transport.start(onEvent: { [weak self] event in self?.handle(event) })
    }

    func stop() {
        guard started else { return }
        started = false
        transport.stop()
    }

    // MARK: - Gestes

    func toggle(_ gift: ContactlessGift) {
        apply(.toggled(gift))
    }

    func give() async {
        guard state.canGive else { return }
        let offers = state.chosenOffers
        apply(.giveStarted)
        do {
            let issued = try await service.issue(offers: offers)
            transport.send(ContactlessWire.token(issued.token).encoded())
            apply(.gave(issued.offers))
        } catch {
            apply(.giveFailed(unavailable: (error as? ContactExchangeError) == .unavailable))
        }
    }

    /// « Demander à être amis » depuis le reçu : appliqué aussitôt, défait sur un refus.
    func askToBeFriends() async {
        guard let issuer = state.theirs?.issuer, state.offersFriendAsk, !state.friendAsked else { return }
        apply(.friendAsked)
        do {
            try await askFriend(issuer.id)
        } catch {
            apply(.friendAskFailed)
        }
    }

    // MARK: - Le fil

    func handle(_ event: ContactlessTransportEvent) {
        switch event {
        case .connected:
            if let me { transport.send(ContactlessWire.hello(me).encoded()) }
        case .disconnected:
            apply(.peerLost)
        case .failed:
            apply(.transportFailed)
        case .received(let data):
            guard let wire = ContactlessWire.decode(data) else { return }
            receive(wire)
        }
    }

    private func receive(_ wire: ContactlessWire) {
        switch wire {
        case .hello(let hello):
            apply(.peerFound(hello))
        case .token(let token):
            guard state.peer != nil, state.theirs == nil, !accepting else { return }
            accepting = true
            Task { await accept(token) }
        case .received(let offers):
            apply(.acknowledged(offers))
        }
    }

    private func accept(_ token: String) async {
        defer { accepting = false }
        guard let accepted = try? await service.accept(token: token) else { return }
        apply(.received(accepted))
        transport.send(ContactlessWire.received(accepted.offers).encoded())
    }

    private func apply(_ event: ContactlessExchangeState.Event) {
        state = state.reduced(event)
    }
}
