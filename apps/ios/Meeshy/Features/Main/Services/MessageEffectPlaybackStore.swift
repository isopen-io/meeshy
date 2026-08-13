import Foundation

/// Retient quels messages ont DÉJÀ joué leur effet d'apparition.
///
/// Sans cette mémoire, un effet one-shot est lié au cycle de vie de la cellule
/// qui le porte : `ThemedMessageBubble` et les lignes de commentaire vivent dans
/// des listes paresseuses qui détruisent et reconstruisent leurs vues au scroll.
/// Un `@State private var hasPlayed` repart donc à `false` à chaque retour à
/// l'écran, et le message explose en confettis une deuxième, puis une dixième
/// fois. L'effet doit se déclencher sur l'ARRIVÉE du message, pas sur l'arrivée
/// de ses pixels.
///
/// Volontairement en mémoire et non persisté : « déjà vu » se réinitialise au
/// prochain lancement, ce qui est le bon compromis — un message d'anniversaire
/// rouvert le lendemain refait sa fête une fois, mais pas à chaque scroll.
///
/// Borné en FIFO : une conversation très longue ne doit pas faire croître ce set
/// indéfiniment. Éjecter les plus anciens est sans danger — un message assez
/// vieux pour sortir de la fenêtre est hors de l'écran depuis longtemps.
@MainActor
final class MessageEffectPlaybackStore {
    static let shared = MessageEffectPlaybackStore()

    private var played: Set<String> = []
    private var insertionOrder: [String] = []
    private let limit: Int

    init(limit: Int = 500) {
        self.limit = max(1, limit)
    }

    func hasPlayed(_ messageId: String) -> Bool {
        played.contains(messageId)
    }

    /// Marque le message comme joué. Retourne `true` si c'était la première
    /// fois — l'appelant n'a pas besoin de cette valeur pour rendre, elle rend
    /// juste le comportement observable par les tests.
    @discardableResult
    func markPlayed(_ messageId: String) -> Bool {
        guard !messageId.isEmpty, played.insert(messageId).inserted else { return false }
        insertionOrder.append(messageId)
        evictOverflow()
        return true
    }

    /// Reporte la marque « déjà joué » d'un identifiant vers un autre.
    ///
    /// Un message envoyé vit d'abord sous son `clientMessageId` optimiste, puis
    /// reçoit son identifiant serveur à l'ack — et `MeeshyMessage.id` bascule de
    /// l'un à l'autre (`serverId ?? localId`). Comme la liste est indexée par
    /// cet id, SwiftUI détruit la ligne et en construit une neuve : sans ce
    /// report, l'expéditeur voit son propre effet repartir de zéro une seconde
    /// fois, une poignée de millisecondes après l'avoir vu démarrer.
    func transferPlayback(from oldId: String, to newId: String) {
        guard oldId != newId, !newId.isEmpty, played.contains(oldId) else { return }
        markPlayed(newId)
    }

    func reset() {
        played.removeAll()
        insertionOrder.removeAll()
    }

    private func evictOverflow() {
        guard insertionOrder.count > limit else { return }
        let overflow = insertionOrder.count - limit
        for id in insertionOrder.prefix(overflow) { played.remove(id) }
        insertionOrder.removeFirst(overflow)
    }
}
