import Foundation
import MeeshySDK

/// Ce que je peux donner en sans contact (planche `Sans-Contact`, étape 2). Le numéro reste une tuile verrouillée :
/// aucune offre du contrat ne le porte (`CONTACT_EXCHANGE_LOCKED`), donc aucune charge de ce canal non plus.
nonisolated enum ContactlessGift: String, CaseIterable, Hashable, Sendable {
    case vitrine
    case friendRequest
    case phone

    var offer: ContactExchangeOffer? {
        switch self {
        case .vitrine: return .vitrine
        case .friendRequest: return .friendRequest
        case .phone: return nil
        }
    }

    var isLocked: Bool { offer == nil }
}

/// Le bonjour pair à pair : de quoi dire « Sofia Benali est là », ce que voit le Public et rien d'autre. L'identité
/// affichée au reçu est celle que le SERVEUR rend à l'acceptation du jeton, jamais celle-ci.
nonisolated struct ContactlessHello: Equatable, Sendable {
    static let maxNameLength = 80

    let displayName: String
    let username: String

    /// Un pseudo hors motif ou un nom vide ne forment pas un bonjour : la charge vient d'un téléphone inconnu.
    init?(displayName: String?, username: String?) {
        let handle = (username ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...40).contains(handle.count),
              handle.unicodeScalars.allSatisfy({ $0.isASCII && (CharacterSet.alphanumerics.contains($0) || "._-".unicodeScalars.contains($0)) })
        else { return nil }
        let name = (displayName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        self.username = handle
        self.displayName = name.isEmpty ? handle : String(name.prefix(Self.maxNameLength))
    }
}

/// Ce qui traverse l'air, dans l'ordre : le bonjour, puis le JETON seul après « Donner », puis l'accusé quand l'autre
/// l'a accepté auprès du serveur. Toute charge illisible, trop lourde, d'une autre version ou au jeton hors motif est
/// ignorée.
nonisolated enum ContactlessWire: Equatable, Sendable {
    case hello(ContactlessHello)
    case token(String)
    case received([ContactExchangeOffer])

    static let version = 1
    static let maxBytes = 2048

    nonisolated private struct Body: Codable {
        let v: Int
        let kind: String
        var displayName: String?
        var username: String?
        var token: String?
        var offers: [String]?
    }

    func encoded() -> Data {
        let body: Body
        switch self {
        case .hello(let hello):
            body = Body(v: Self.version, kind: "hello", displayName: hello.displayName, username: hello.username)
        case .token(let token):
            body = Body(v: Self.version, kind: "token", token: token)
        case .received(let offers):
            body = Body(v: Self.version, kind: "received", offers: offers.map(\.rawValue))
        }
        return (try? JSONEncoder().encode(body)) ?? Data()
    }

    static func decode(_ data: Data) -> ContactlessWire? {
        guard !data.isEmpty, data.count <= maxBytes,
              let body = try? JSONDecoder().decode(Body.self, from: data), body.v == version else { return nil }
        switch body.kind {
        case "hello":
            return ContactlessHello(displayName: body.displayName, username: body.username).map(ContactlessWire.hello)
        case "token":
            guard let token = body.token, ContactExchangeToken.isWellFormed(token) else { return nil }
            return .token(token)
        case "received":
            let offers = ContactExchangeOffer.ordered(body.offers ?? [])
            return offers.isEmpty ? nil : .received(offers)
        default:
            return nil
        }
    }
}

/// Le parcours sans contact, sans rien d'autre que des valeurs : approche → trouvé → donné, le reçu arrivant quand
/// l'autre donne de son côté. Un téléphone qui ne peut pas (réseau local refusé, passerelle qui ne sert pas l'échange)
/// passe en `unavailable`, et l'écran garde le QR.
nonisolated struct ContactlessExchangeState: Equatable, Sendable {
    nonisolated enum Step: Equatable, Sendable {
        case approaching
        case found
        case given
        case unavailable
    }

    nonisolated enum Event: Equatable, Sendable {
        case peerFound(ContactlessHello)
        case peerLost
        case toggled(ContactlessGift)
        case giveStarted
        case gave([ContactExchangeOffer])
        case giveFailed(unavailable: Bool)
        case received(ContactExchangeAccepted)
        case acknowledged([ContactExchangeOffer])
        case friendAsked
        case friendAskFailed
        case transportFailed
    }

    var step: Step = .approaching
    var peer: ContactlessHello?
    var chosen: Set<ContactlessGift> = [.vitrine]
    var isGiving = false
    var giveFailed = false
    var given: [ContactExchangeOffer] = []
    var theirs: ContactExchangeAccepted?
    var acknowledged: [ContactExchangeOffer] = []
    var friendAsked = false

    var chosenOffers: [ContactExchangeOffer] { ContactExchangeOffer.ordered(chosen.compactMap(\.offer)) }
    var canGive: Bool { step == .found && !isGiving && !chosenOffers.isEmpty }
    var showsReceipt: Bool { step == .given || theirs != nil }
    /// « Demander à être amis » : seulement quand l'autre ne m'a pas déjà fait la demande, et une fois.
    var offersFriendAsk: Bool { theirs.map { $0.friendRequest != .sent } ?? false }
    /// Le nom à dire : celui que le serveur a rendu dès qu'il existe, sinon celui du bonjour.
    var peerName: String? { theirs?.issuer.shownName ?? peer?.displayName }

    func reduced(_ event: Event) -> ContactlessExchangeState {
        var next = self
        switch event {
        case .peerFound(let hello):
            guard step == .approaching, peer == nil else { return self }
            next.peer = hello
            next.step = .found
        case .peerLost:
            guard step == .found, theirs == nil else { return self }
            next = ContactlessExchangeState()
            next.chosen = chosen
        case .toggled(let gift):
            guard step == .found, !isGiving, !gift.isLocked else { return self }
            next.chosen = chosen.symmetricDifference([gift])
        case .giveStarted:
            guard canGive else { return self }
            next.isGiving = true
            next.giveFailed = false
        case .gave(let offers):
            next.isGiving = false
            next.given = offers
            next.step = .given
        case .giveFailed(let unavailable):
            next.isGiving = false
            next.giveFailed = !unavailable
            if unavailable { next.step = .unavailable }
        case .received(let accepted):
            guard peer != nil, theirs == nil, step != .unavailable else { return self }
            next.theirs = accepted
        case .acknowledged(let offers):
            guard step == .given else { return self }
            next.acknowledged = offers
        case .friendAsked:
            guard offersFriendAsk else { return self }
            next.friendAsked = true
        case .friendAskFailed:
            next.friendAsked = false
        case .transportFailed:
            guard step == .approaching else { return self }
            next.step = .unavailable
        }
        return next
    }
}
