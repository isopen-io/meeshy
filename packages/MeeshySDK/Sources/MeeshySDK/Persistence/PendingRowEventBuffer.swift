import Foundation

struct PendingTombstone: Sendable {
    let deletedAt: Date
    let sparingOpenedViewOnce: Bool
    let expired: Bool
    /// Lancée sur cet appareil, pas encore acceptée par le serveur (#13001).
    var awaitingConfirmation = false
}

struct PendingEdit: Sendable {
    let newContent: String
    let editedAt: Date
    let marksEdited: Bool
    let noticeJson: Data?
    var authorship: EditAuthorship = .untouched
}

typealias PendingReactionChange = @Sendable ([MeeshyReaction]) -> [MeeshyReaction]?

/// Ce qui attend une ligne, dans l'ordre où cela se rejoue : la
/// modification, les réactions, puis la suppression, qui l'emporte.
struct PendingRowEvents: Sendable {
    let rememberedAt: Date
    var edit: PendingEdit?
    var reactions: [PendingReactionChange] = []
    var tombstone: PendingTombstone?
}

/// Mémoire des événements arrivés avant leur message, bornée en NOMBRE (le plus
/// ancien part) et en DURÉE : ceux d'un message qu'on ne recevra jamais — hors
/// de la fenêtre chargée — ne s'accumulent pas. Valeur pure : l'acteur la possède
/// et l'applique, elle ne touche ni la base ni l'horloge.
struct PendingRowEventBuffer: Sendable {
    static let cap = 512
    static let lifetime: TimeInterval = 300
    static let reactionCapPerRow = 32

    private var events: [String: PendingRowEvents] = [:]
    private var order: [String] = []

    var isEmpty: Bool { events.isEmpty }
    var count: Int { events.count }
    subscript(id: String) -> PendingRowEvents? { events[id] }

    mutating func remember(_ id: String, now: Date, _ update: (inout PendingRowEvents) -> Void) {
        dropExpired(now: now)
        var current = events[id] ?? PendingRowEvents(rememberedAt: now)
        if events[id] == nil { order.append(id) }
        update(&current)
        if current.reactions.count > Self.reactionCapPerRow {
            current.reactions.removeFirst(current.reactions.count - Self.reactionCapPerRow)
        }
        events[id] = current
        while order.count > Self.cap {
            events.removeValue(forKey: order.removeFirst())
        }
    }

    /// L'ordre de mémoire est celui des dates : les échus sont en tête.
    mutating func dropExpired(now: Date) {
        while let oldest = order.first,
              let current = events[oldest],
              now.timeIntervalSince(current.rememberedAt) > Self.lifetime {
            order.removeFirst()
            events.removeValue(forKey: oldest)
        }
    }

    mutating func take(_ id: String) -> PendingRowEvents? {
        guard let taken = events.removeValue(forKey: id) else { return nil }
        order.removeAll { $0 == id }
        return taken
    }
}
