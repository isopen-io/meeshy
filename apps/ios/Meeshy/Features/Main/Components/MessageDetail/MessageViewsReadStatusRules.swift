import Foundation
import MeeshySDK

/// Les règles PURES du statut de lecture de la fiche « Vu par »
/// (`MessageViewsDetailView`) : **faut-il repartir au réseau**, et **le
/// spinner a-t-il le droit de remplacer ce qui est déjà à l'écran**.
///
/// Elles vivent ici, hors de la vue, pour deux raisons. La première est de
/// budget : la fiche touchait le plafond de 1 200 lignes (directive
/// 2026-09-02), et une règle pure est exactement ce qui en sort le mieux — on
/// l'éprouve sans monter SwiftUI. La seconde est qu'elles forment UNE paire :
/// tant que la fiche ne se chargeait qu'à `onAppear` (I3, #7349), « une
/// requête part » et « il n'y a rien à montrer » étaient le même instant, et
/// la vue pouvait brancher son rendu sur son seul drapeau de chargement. Le
/// rechargement en direct sépare les deux — les garder côte à côte rend la
/// séparation lisible plutôt qu'accidentelle.
enum MessageViewsReadStatusRules {

    /// `force` est ce qui permet à un `read-status:updated` vivant de
    /// rafraîchir une fiche qui a DÉJÀ ses données ; sans lui, elle ne
    /// pourrait charger qu'une fois, à l'ouverture, et resterait figée tant
    /// qu'elle est visible.
    static func shouldFetch(
        hasExisting: Bool, isLoading: Bool, force: Bool, hasServerId: Bool
    ) -> Bool {
        guard hasServerId, !isLoading else { return false }
        return force || !hasExisting
    }

    /// Stale-while-revalidate : le spinner n'appartient QU'AU démarrage à
    /// froid. Sans cette règle, chaque `read-status:updated` de la
    /// conversation remplaçait une fiche déjà remplie par un indicateur
    /// d'attente avant de la rendre à nouveau — un clignotement par lecteur,
    /// sur l'écran même qui sert à regarder les lecteurs arriver. « Jamais de
    /// spinner sur un cache non vide » (Instant App, § Cache-First).
    static func showsSpinner(isLoading: Bool, hasExisting: Bool) -> Bool {
        isLoading && !hasExisting
    }

    /// #7365 — le palier affiché par le badge de la fiche (-1 échec, 0 envoi
    /// en cours, 1 envoyé, 2 distribué, 3 lu), résolu via
    /// `DeliveryStatusResolver` plutôt que lu sur `message.deliveryStatus`
    /// BRUT. Le brut promeut `.read` dès qu'UN destinataire sur N a lu
    /// (`readCount > 0`, `MessageRecord+ToMessage.swift`) — juste pour une
    /// conversation directe, faux dans un groupe. `recipientCount` est le
    /// dénominateur porté par le message lui-même (même champ que lit
    /// `ConversationSocketHandler+MediaEvents.swift`) ; `<= 1` fait confiance
    /// au statut stocké tel quel (`DeliveryStatusResolver` documente cette
    /// règle).
    static func deliveryStatusLevel(for message: MeeshyMessage) -> Int {
        switch DeliveryStatusResolver.resolve(
            status: message.deliveryStatus,
            deliveredCount: message.deliveredCount,
            readCount: message.readCount,
            recipientCount: message.recipientCount,
            deliveredToAllAt: message.deliveredToAllAt,
            readByAllAt: message.readByAllAt
        ) {
        case .failed: return -1
        case .sending, .invisible, .clock, .slow: return 0
        case .sent: return 1
        case .delivered: return 2
        case .read: return 3
        }
    }
}
