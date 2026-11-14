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
    }

    static let empty = SharedLocationRoster(entries: [:])

    private let entries: [String: Entry]
    /// Les personnes retirées que le serveur peut encore servir, et jusqu'à quand il le pourrait au plus.
    private let withdrawals: [String: Date]

    private init(entries: [String: Entry], withdrawals: [String: Date] = [:]) {
        self.entries = entries
        self.withdrawals = withdrawals.filter { entries[$0.key] == nil }
    }

    private enum CodingKeys: String, CodingKey { case entries, withdrawals }

    /// Une liste gardée avant #18204 n'a pas de retraits en attente.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            entries: try c.decode([String: Entry].self, forKey: .entries),
            withdrawals: try c.decodeIfPresent([String: Date].self, forKey: .withdrawals) ?? [:]
        )
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(entries, forKey: .entries)
        if !withdrawals.isEmpty { try c.encode(withdrawals, forKey: .withdrawals) }
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
        var next = entries
        next[userId.lowercased()] = Entry(precision: precision, until: now.addingTimeInterval(duration.interval))
        return SharedLocationRoster(entries: next, withdrawals: withdrawals)
    }

    func removing(userId: String) -> SharedLocationRoster {
        var next = entries
        next.removeValue(forKey: userId.lowercased())
        return SharedLocationRoster(entries: next, withdrawals: withdrawals)
    }

    /// « Arrêter » n'a pas pu partir : la personne sort de la liste et son retrait attend le réseau, au plus jusqu'au
    /// terme le plus long qu'un partage serveur puisse avoir encore. Une personne absente de la liste ne change rien.
    func withdrawing(userId: String, now: Date) -> SharedLocationRoster {
        let id = userId.lowercased()
        guard entries[id] != nil else { return self }
        var pending = withdrawals
        pending[id] = now.addingTimeInterval(SharedLocationShareDuration.eightHours.interval)
        return SharedLocationRoster(entries: entries.filter { $0.key != id }, withdrawals: pending)
    }

    /// La liste que le serveur doit recevoir : la même, sans retrait en attente — l'envoyer les solde tous.
    var settled: SharedLocationRoster { SharedLocationRoster(entries: entries) }

    /// Ceux de cette liste ET de `other`, `other` l'emportant pour une même personne : quand on ne sait pas laquelle des
    /// deux listes le serveur sert (accusé perdu), on garde « Arrêter » pour toutes les personnes qu'il peut servir.
    /// Un retrait en attente d'une des deux listes le reste, sauf pour une personne que l'autre liste partage de nouveau.
    func union(_ other: SharedLocationRoster) -> SharedLocationRoster {
        SharedLocationRoster(
            entries: entries.merging(other.entries) { _, theirs in theirs },
            withdrawals: withdrawals.merging(other.withdrawals) { max($0, $1) }
        )
    }

    /// Sans ceux dont l'échéance est passée, ni les retraits que plus aucun partage serveur ne peut servir.
    func pruned(now: Date) -> SharedLocationRoster {
        SharedLocationRoster(entries: entries.filter { $0.value.until > now }, withdrawals: withdrawals.filter { $0.value > now })
    }

    /// Ce que le serveur sert est-il exactement ce que je veux : aucune échéance passée, aucun retrait en attente ?
    func isSettled(now: Date) -> Bool { pruned(now: now).settled == self }

    /// La plus proche des échéances : le moment où la liste change d'elle-même.
    var nextDeadline: Date? { entries.values.map(\.until).min() }

    /// La durée à demander au serveur : la plus courte qui couvre la plus lointaine des échéances.
    func serverDuration(now: Date) -> SharedLocationShareDuration {
        let farthest = entries.values.map(\.until).max() ?? now
        return farthest.timeIntervalSince(now) <= SharedLocationShareDuration.oneHour.interval ? .oneHour : .eightHours
    }

    /// La liste telle que le serveur la reçoit, avec l'échéance de chaque personne qui tombe AVANT le terme du partage :
    /// la passerelle la tient, même app tuée (#18205), iso `rosterOps.deadlinedRecipients` du web. Arrondie à la seconde
    /// au-dessus, jamais nulle ; une personne échue pendant l'attente d'un relevé ne part plus du tout.
    func deadlinedRecipients(now: Date) -> [SharedLocationRecipient] {
        let live = pruned(now: now)
        let term = now.addingTimeInterval(live.serverDuration(now: now).interval)
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
