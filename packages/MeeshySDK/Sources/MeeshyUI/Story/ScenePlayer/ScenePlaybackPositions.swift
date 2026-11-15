import Foundation

/// **Où en était la lecture d'une scène — pour la surface SUIVANTE (#6580).**
///
/// Le porteur : « lorsqu'on a un son de fond, ouverture en détail on joue le son
/// directement aligné, correctement ». La carte du fil joue la scène en boucle,
/// muette ; le doigt ouvre le plein écran ; et tout repartait de ZÉRO — la
/// vidéo comme le fond sonore.
///
/// ## Pourquoi une mémoire PARTAGÉE, et pas un fil de props
///
/// La carte et le plein écran ne sont pas dans le même arbre de vues : le
/// second naît dans un `fullScreenCover`. Faire voyager la position par les
/// props obligerait l'hôte COMMUN à la stocker — et cet hôte
/// (`FeedPostCard.swift`) est à 1 385 lignes, donc hors budget dur : « ajouter à
/// un fichier déjà hors budget est interdit ». La mémoire partagée est aussi la
/// forme que ce dépôt donne déjà aux préoccupations de lecture qui traversent
/// les surfaces — `PlaybackCoordinator.shared`, `SharedAVPlayerManager.shared`,
/// `MediaSessionCoordinator.shared`.
///
/// ## Ce qu'elle N'EST PAS
///
/// Pas une horloge : elle ne compte rien, elle MÉMORISE ce qu'un canvas a déjà
/// émis (`onPlaybackTime`). Pas une source de vérité de lecture non plus — le
/// playhead reste `StoryCanvasUIView.currentTime`, l'unique.
///
/// Deux gardes la rendent sûre :
/// - **fraîcheur** : au-delà de `freshness`, la position n'est plus « là où on
///   en était » — la surface a été quittée depuis longtemps, et y reprendre
///   ferait sauter la lecture pour rien ;
/// - **capacité** : un fil défile, et une mémoire non bornée est une fuite.
@MainActor
public final class ScenePlaybackPositions {

    // iOS 26.1 : la `deinit` synthétisée d'un type isolé MainActor (SE-0466,
    // isolation par défaut du module) double-libère à la libération hors tâche.
    // Garde : `MeeshyUIDeinitSourceGuardTests`.
    nonisolated deinit {}

    public static let shared = ScenePlaybackPositions()

    /// Une position plus vieille que ça n'est plus une reprise, c'est un saut.
    public static let freshness: TimeInterval = 10

    /// Assez pour tout ce qu'un fil garde monté, jamais assez pour fuir.
    static let capacity = 32

    private var entries: [String: (seconds: Double, at: Date)] = [:]
    /// Ordre d'arrivée — l'entrée la plus ancienne cède sa place.
    private var order: [String] = []
    private let clock: () -> Date

    init(clock: @escaping () -> Date = Date.init) {
        self.clock = clock
    }

    /// **La clé partagée par les deux surfaces** : le PORTEUR de la scène et son
    /// rang. Ni l'identité d'hôte du player (elle porte le n° de boucle, qui
    /// diffère d'une surface à l'autre) ni l'id de scène seul (le corpus legacy
    /// a gravé « s1 » partout, donc deux scènes peuvent être homonymes).
    public static func key(carrierId: String?, sceneIndex: Int) -> String? {
        guard let carrierId, !carrierId.isEmpty else { return nil }
        return "\(carrierId)#\(sceneIndex)"
    }

    public func publish(_ seconds: Double, for key: String) {
        guard seconds.isFinite, seconds >= 0 else { return }
        if entries[key] == nil {
            order.append(key)
            if order.count > Self.capacity {
                entries[order.removeFirst()] = nil
            }
        }
        entries[key] = (seconds, clock())
    }

    /// La position d'ouverture, ou `nil` — et `nil` veut dire « ouvre à zéro »,
    /// le comportement de toujours. Une position NULLE est rendue `nil` elle
    /// aussi : reprendre à zéro et ouvrir à zéro sont le même geste.
    public func position(for key: String?) -> Double? {
        guard let key, let entry = entries[key] else { return nil }
        guard clock().timeIntervalSince(entry.at) <= Self.freshness else { return nil }
        guard entry.seconds > 0 else { return nil }
        return entry.seconds
    }

    /// Vide la mémoire. Sert aux témoins, et à un hôte qui veut explicitement
    /// qu'une surface reparte de zéro.
    public func reset() {
        entries.removeAll()
        order.removeAll()
    }
}
