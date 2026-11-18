import Foundation
import MeeshySDK

/// À qui je montre ma position, à quelle précision et jusqu'à quand (#16983). Le serveur ne connaît qu'UN partage, dont
/// la durée vaut pour toute la liste (1 h ou 8 h) ; la liste garde l'échéance que j'ai choisie pour CHAQUE personne, et le
/// centre retire la personne du partage serveur à SON échéance. Le terme serveur n'est jamais plus court que la plus
/// lointaine des échéances, et c'est lui qui coupe tout si l'appareil se tait.
///
/// Un « Arrêter » qui n'a pas pu partir (hors ligne, accusé perdu) devient un RETRAIT EN ATTENTE (#18204) : la personne
/// sort de la liste, son identifiant reste gardé jusqu'à ce que le serveur ait reçu une liste sans elle, au plus huit
/// heures (aucun partage serveur ne court plus longtemps qu'un `start` de 8 h). Le doigt ne se rejoue jamais : c'est le
/// centre qui rejoue l'intention.
struct SharedLocationRoster: Equatable, Codable {

    struct Entry: Equatable, Codable {
        let precision: SharedLocationPrecision
        let until: Date

        init(precision: SharedLocationPrecision, until: Date) {
            self.precision = precision
            self.until = until
        }

        private enum CodingKeys: String, CodingKey { case precision, until }

        /// Une précision inconnue se relit comme la ville : on ouvre plus, jamais l'inverse.
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            precision = SharedLocationPrecision(rawValue: try c.decode(String.self, forKey: .precision)) ?? .city
            until = try c.decode(Date.self, forKey: .until)
        }

        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(precision.rawValue, forKey: .precision)
            try c.encode(until, forKey: .until)
        }

        /// « Jusqu'à ce que j'arrête » (#19616) : aucune échéance, seul « Arrêter » retire la personne.
        var isOpenEnded: Bool { SharedLocationShareTerm.isOpenEnded(until) }
    }

    static let empty = SharedLocationRoster(entries: [:])

    private let entries: [String: Entry]
    /// Les personnes retirées que le serveur peut encore servir, et jusqu'à quand il le pourrait au plus.
    private let withdrawals: [String: Date]
    /// « Partager aussi ma batterie » (#19204, #19476) : l'accord vaut pour le partage en cours, et s'éteint avec lui.
    let sharesBattery: Bool
    /// Le partage montre un point choisi à la main sur la carte (#19558) : l'appareil n'est jamais suivi, et une liste
    /// réduite se republie avec ce point, jamais avec un relevé. Gardé au lancement SANS le point : faute de lui, on
    /// arrête plutôt que de demander la position à l'appareil.
    let isFixedPoint: Bool

    private init(entries: [String: Entry], withdrawals: [String: Date] = [:], battery: Bool = false, fixedPoint: Bool = false) {
        self.entries = entries
        self.withdrawals = withdrawals.filter { entries[$0.key] == nil }
        self.sharesBattery = battery && !entries.isEmpty
        self.isFixedPoint = fixedPoint && !entries.isEmpty
    }

    private enum CodingKeys: String, CodingKey { case entries, withdrawals, battery, fixedPoint }

    /// Une liste gardée avant #18204 n'a pas de retraits en attente ; avant #19476, pas de batterie ; avant #19558, pas de
    /// point choisi.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            entries: try c.decode([String: Entry].self, forKey: .entries),
            withdrawals: try c.decodeIfPresent([String: Date].self, forKey: .withdrawals) ?? [:],
            battery: (try? c.decodeIfPresent(Bool.self, forKey: .battery)) ?? false,
            fixedPoint: (try? c.decodeIfPresent(Bool.self, forKey: .fixedPoint)) ?? false
        )
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(entries, forKey: .entries)
        if !withdrawals.isEmpty { try c.encode(withdrawals, forKey: .withdrawals) }
        if sharesBattery { try c.encode(true, forKey: .battery) }
        if isFixedPoint { try c.encode(true, forKey: .fixedPoint) }
    }

    /// La même liste, la batterie accordée ou retirée.
    func withBattery(_ on: Bool) -> SharedLocationRoster {
        SharedLocationRoster(entries: entries, withdrawals: withdrawals, battery: on, fixedPoint: isFixedPoint)
    }

    /// La même liste, montrant un point choisi à la main, ou de nouveau la position de l'appareil.
    func withFixedPoint(_ on: Bool) -> SharedLocationRoster {
        SharedLocationRoster(entries: entries, withdrawals: withdrawals, battery: sharesBattery, fixedPoint: on)
    }

    /// Rien à garder : personne à qui montrer ma position, aucun retrait à faire partir.
    var isEmpty: Bool { entries.isEmpty && withdrawals.isEmpty }

    /// Au moins une personne voit ma position : c'est seulement alors que l'appareil a des relevés à envoyer.
    var hasRecipients: Bool { !entries.isEmpty }

    /// Un retrait demandé que le serveur n'a pas encore reçu.
    var hasPendingWithdrawals: Bool { !withdrawals.isEmpty }

    func isWithdrawalPending(for userId: String) -> Bool { withdrawals[userId.lowercased()] != nil }

    func entry(for userId: String) -> Entry? { entries[userId.lowercased()] }

    /// Ajouter une personne, ou changer sa précision et son échéance : `now + durée`.
    func adding(userId: String, precision: SharedLocationPrecision, duration: SharedLocationShareDuration, now: Date) -> SharedLocationRoster {
        adding(userId: userId, precision: precision, term: .bounded(duration), now: now)
    }

    /// Ajouter une personne pour un terme : `now + durée`, ou sans échéance (« jusqu'à ce que j'arrête », #19616).
    func adding(userId: String, precision: SharedLocationPrecision, term: SharedLocationShareTerm, now: Date) -> SharedLocationRoster {
        let until: Date = switch term {
        case .bounded(let duration): now.addingTimeInterval(duration.interval)
        case .untilStopped: SharedLocationShareTerm.openEndedDeadline
        }
        var next = entries
        next[userId.lowercased()] = Entry(precision: precision, until: until)
        return SharedLocationRoster(entries: next, withdrawals: withdrawals, battery: sharesBattery, fixedPoint: isFixedPoint)
    }

    /// Au moins une personne voit ma position sans échéance : le partage serveur part sans terme.
    var isOpenEnded: Bool { entries.values.contains { $0.isOpenEnded } }

    func removing(userId: String) -> SharedLocationRoster {
        var next = entries
        next.removeValue(forKey: userId.lowercased())
        return SharedLocationRoster(entries: next, withdrawals: withdrawals, battery: sharesBattery, fixedPoint: isFixedPoint)
    }

    /// « Arrêter » n'a pas pu partir : la personne sort de la liste et son retrait attend le réseau, au plus jusqu'au
    /// terme le plus long qu'un partage serveur puisse avoir encore — jamais lâché pour une personne sans échéance
    /// (#19616) : le serveur la servirait sans fin. Une personne absente de la liste ne change rien.
    func withdrawing(userId: String, now: Date) -> SharedLocationRoster {
        let id = userId.lowercased()
        guard let entry = entries[id] else { return self }
        var pending = withdrawals
        pending[id] = max(now.addingTimeInterval(SharedLocationShareDuration.eightHours.interval), entry.until)
        return SharedLocationRoster(entries: entries.filter { $0.key != id }, withdrawals: pending, battery: sharesBattery,
                                    fixedPoint: isFixedPoint)
    }

    /// La liste que le serveur doit recevoir : la même, sans retrait en attente — l'envoyer les solde tous.
    var settled: SharedLocationRoster { SharedLocationRoster(entries: entries, battery: sharesBattery, fixedPoint: isFixedPoint) }

    /// Ceux de cette liste ET de `other`, `other` l'emportant pour une même personne : quand on ne sait pas laquelle des
    /// deux listes le serveur sert (accusé perdu), on garde « Arrêter » pour toutes les personnes qu'il peut servir.
    /// Un retrait en attente d'une des deux listes le reste, sauf pour une personne que l'autre liste partage de nouveau.
    func union(_ other: SharedLocationRoster) -> SharedLocationRoster {
        SharedLocationRoster(
            entries: entries.merging(other.entries) { _, theirs in theirs },
            withdrawals: withdrawals.merging(other.withdrawals) { max($0, $1) },
            battery: sharesBattery || other.sharesBattery,
            fixedPoint: other.isFixedPoint
        )
    }

    /// La liste que la passerelle SERT au compte (#18389, #18578, iso `rosterOps.withServed` du web) : elle fait foi pour
    /// chacun des appareils du compte. Ses personnes et leurs échéances remplacent les miennes ; un retrait en attente
    /// d'ici GAGNE (la personne reste hors de la liste, son retrait se rejoue) tant que la passerelle la sert encore, et
    /// s'éteint dès qu'elle ne la sert plus. Une personne servie dont l'échéance est passée ou l'identifiant illisible
    /// n'entre pas.
    func withServed(_ served: SharedLocationOwnSnapshot, now: Date) -> SharedLocationRoster {
        let readable = served.recipients.compactMap { recipient -> (String, SharedLocationOwnRecipient)? in
            let id = recipient.userId.lowercased()
            return Self.isObjectId(id) ? (id, recipient) : nil
        }
        let servedIds = Set(readable.map(\.0))
        let next = readable.reduce(into: [String: Entry]()) { kept, pair in
            let (id, recipient) = pair
            guard recipient.expiresAt > now, withdrawals[id] == nil else { return }
            kept[id] = Entry(precision: recipient.precision, until: recipient.expiresAt)
        }
        return SharedLocationRoster(entries: next, withdrawals: withdrawals.filter { servedIds.contains($0.key) },
                                    battery: served.shareBattery ?? sharesBattery, fixedPoint: isFixedPoint)
    }

    /// L'écart que l'horloge de l'appareil, celle de la passerelle et l'arrondi à la seconde peuvent creuser entre deux
    /// échéances d'un même partage.
    static let clockSlack: TimeInterval = 5 * 60

    /// Cette liste montre-t-elle PLUS que `before` (#18580, iso `rosterOps.gainedOver` du web) : une personne de plus,
    /// une autre précision, une échéance repoussée au-delà du jeu des horloges ? Seul un « Partager » le fait — un retrait
    /// ou une échéance passe par la liste seule. Lu sur la liste servie, c'est le signe qu'un autre appareil a partagé
    /// après celui-ci, et que c'est lui qui publie.
    func gained(over before: SharedLocationRoster) -> Bool {
        entries.contains { id, entry in
            guard let kept = before.entries[id] else { return true }
            return kept.precision != entry.precision || entry.until.timeIntervalSince(kept.until) > Self.clockSlack
        }
    }

    private static func isObjectId(_ id: String) -> Bool {
        id.count == 24 && id.allSatisfy { $0.isHexDigit }
    }

    /// Sans ceux dont l'échéance est passée, ni les retraits que plus aucun partage serveur ne peut servir.
    func pruned(now: Date) -> SharedLocationRoster {
        SharedLocationRoster(entries: entries.filter { $0.value.until > now }, withdrawals: withdrawals.filter { $0.value > now },
                             battery: sharesBattery, fixedPoint: isFixedPoint)
    }

    /// Ce que le serveur sert est-il exactement ce que je veux : aucune échéance passée, aucun retrait en attente ?
    func isSettled(now: Date) -> Bool { pruned(now: now).settled == self }

    /// La plus proche des échéances : le moment où la liste change d'elle-même. Une personne sans échéance n'en a pas.
    var nextDeadline: Date? { entries.values.filter { !$0.isOpenEnded }.map(\.until).min() }

    /// La durée à demander au serveur : la plus courte qui couvre la plus lointaine des échéances bornées (un partage
    /// sans fin part avec `untilStopped`, la durée ne restant que pour le schéma).
    func serverDuration(now: Date) -> SharedLocationShareDuration {
        let farthest = entries.values.filter { !$0.isOpenEnded }.map(\.until).max() ?? now
        return farthest.timeIntervalSince(now) <= SharedLocationShareDuration.oneHour.interval ? .oneHour : .eightHours
    }

    /// La liste telle que le serveur la reçoit, avec l'échéance de chaque personne qui tombe AVANT le terme du partage :
    /// la passerelle la tient, même app tuée (#18205), iso `rosterOps.deadlinedRecipients` du web. Arrondie à la seconde
    /// au-dessus, jamais nulle ; une personne échue pendant l'attente d'un relevé ne part plus du tout.
    func deadlinedRecipients(now: Date) -> [SharedLocationRecipient] {
        let live = pruned(now: now)
        let term = live.isOpenEnded
            ? SharedLocationShareTerm.openEndedDeadline
            : now.addingTimeInterval(live.serverDuration(now: now).interval)
        return live.recipients.map { recipient in
            guard let until = live.entries[recipient.userId]?.until, until < term else { return recipient }
            let seconds = max(1, Int(until.timeIntervalSince(now).rounded(.up)))
            return SharedLocationRecipient(userId: recipient.userId, precision: recipient.precision, expiresInSeconds: seconds)
        }
    }

    /// La liste telle que le serveur la reçoit, dans un ordre stable.
    var recipients: [SharedLocationRecipient] {
        entries.keys.sorted().compactMap { id in entries[id].map { SharedLocationRecipient(userId: id, precision: $0.precision) } }
    }
}
