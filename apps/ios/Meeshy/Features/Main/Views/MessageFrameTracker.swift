import CoreGraphics
import SwiftUI

/// SwiftUI `PreferenceKey` used by each bubble row to publish its screen
/// frame (in `.global` coordinates) up to `ConversationView`. The reduce step
/// merges per-cell entries; conflicting keys keep the latest value.
struct MessageFramePreferenceKey: PreferenceKey {
    static var defaultValue: [String: CGRect] = [:]

    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}

/// Tracks the most recent screen frame of each visible message bubble.
///
/// `ConversationView` owns one of these via `@State`. Each bubble row calls
/// `.preference(key: MessageFramePreferenceKey.self, ...)` in its
/// `.background(GeometryReader)`. The parent receives the aggregated map in
/// `.onPreferenceChange` and feeds it into `update(_:)`.
///
/// At long-press time the overlay reads `frame(for: messageId)` once and
/// freezes the value — the bubble must stay clued to its source position
/// even if the underlying list scrolls. See spec section 4.6.
///
/// Memory: an LRU cap of 200 entries protects against unbounded growth in
/// long-lived group conversations (see spec section 4.4 / 4.7). Recently
/// observed messages are kept; the least-recently-published frame is evicted
/// on overflow.
struct MessageFrameTracker: Equatable {
    private(set) var frames: [String: CGRect] = [:]
    private(set) var accessOrder: [String] = []

    let maxEntries: Int

    init(maxEntries: Int = 200) {
        self.maxEntries = maxEntries
    }

    /// Merge a batch of new frames. Existing IDs are updated in place and
    /// promoted to MRU; new IDs are appended; LRU eviction kicks in past the
    /// configured cap.
    mutating func update(_ newFrames: [String: CGRect]) {
        for (id, rect) in newFrames {
            if frames[id] == nil {
                accessOrder.append(id)
            } else if let idx = accessOrder.firstIndex(of: id) {
                accessOrder.remove(at: idx)
                accessOrder.append(id)
            }
            frames[id] = rect
        }
        while accessOrder.count > maxEntries {
            let evicted = accessOrder.removeFirst()
            frames.removeValue(forKey: evicted)
        }
    }

    func frame(for messageId: String) -> CGRect? {
        frames[messageId]
    }

    /// Targeted cleanup invoked on dismiss when the underlying message has
    /// been deleted between the long-press start and the overlay close.
    mutating func removeFrame(for messageId: String) {
        frames.removeValue(forKey: messageId)
        accessOrder.removeAll(where: { $0 == messageId })
    }
}

/// **La boîte qui empêche la mesure de réveiller la racine.**
///
/// `MessageFrameTracker` est une VALEUR, et une valeur tenue en `@State`
/// invalide le body de son propriétaire à chaque mutation. Or son propriétaire
/// est `ConversationView` — la racine du fil. En Bulles/Script/Focal la
/// question ne se posait pas : la publication de préférence a été retirée du
/// pont UIKit (`MessageListView`, audit fluidité 2026-08-21), donc la carte
/// restait vide et stable. **En Rivière, le lecteur est un sous-arbre SwiftUI
/// PUR** : chaque bulle publie sa frame, la préférence remonte jusqu'à la
/// racine, `update(_:)` invalide `ConversationView`, qui reconstruit le pane,
/// qui relayoute, qui republie — une boucle de rétroaction qui ne se referme
/// jamais, et le mode le plus coûteux à l'idle du fil (mesures #3940 :
/// +5,9 points de CPU sur Bulles, conversation INACTIVE).
///
/// La boîte casse la boucle sans rien retirer : une référence tenue en `@State`
/// garde son identité, donc la muter ne réévalue AUCUN body. Et la lecture
/// reste juste, parce qu'elle n'a jamais eu besoin de l'invalidation — la
/// frame est lue au moment du GESTE (`overlayMenuContent`, sous
/// `overlayState.showOverlayMenu`), et c'est ce drapeau-là qui provoque la
/// passe de body où la valeur est relue. La carte est aussi fraîche qu'avant ;
/// elle a cessé d'être une source de rendu.
///
/// C'est le principe « Zero Unnecessary Re-render » appliqué à une donnée qui
/// est ÉCRITE à chaque frame et LUE une fois par geste : un tel couple ne doit
/// jamais passer par l'invalidation.
///
/// La loi LRU reste dans la valeur, où elle est testée
/// (`MessageFrameTrackerTests`) : la boîte ne fait que la porter.
@MainActor
final class MessageFrameBox {
    private var tracker: MessageFrameTracker

    init(maxEntries: Int = 200) {
        tracker = MessageFrameTracker(maxEntries: maxEntries)
    }

    /// La cible app compile sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` :
    /// sans cette ligne, la `deinit` synthétisée est ISOLÉE et double-libère sur
    /// iOS 26.1. Elle manquait ici depuis #3946 — la boîte est née après le
    /// balayage qui avait posé la règle partout ailleurs, et c'est exactement le
    /// genre d'oubli qu'une classe NEUVE fait passer : la garde existait, rien
    /// dans l'écriture d'un nouveau type ne la rappelle.
    nonisolated deinit {}

    func update(_ newFrames: [String: CGRect]) {
        tracker.update(newFrames)
    }

    func frame(for messageId: String) -> CGRect? {
        tracker.frame(for: messageId)
    }

    func removeFrame(for messageId: String) {
        tracker.removeFrame(for: messageId)
    }
}
