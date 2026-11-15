import Foundation

/// **Ce que la peau de la Rivière LIT, construit une fois par entrée (#3946).**
///
/// `RiverStreamHost` déclarait ses deux index (`contentByMessageId`,
/// `bubbleByRank`) en propriétés calculées : deux dictionnaires de TOUT le fil,
/// reconstruits à chaque lecture. La grille les lit pour chaque rang et chaque
/// couloir réalisés, et son `body` repasse à chaque publication de cadres —
/// donc à chaque image de défilement. L'échelle du temps
/// (`RiverTimeScale.resolve`, un tri du fil entier) suivait le même chemin.
///
/// Le rendu se construit désormais à côté des contenus, sous la MÊME clé
/// (`RiverConversationMapping.ContentsKey`, traduction, présence et anneau
/// compris) : la peau ne fait plus que des lectures en temps constant.
struct RiverRendering {
    let contents: [RiverBubbleContent]
    let contentByMessageId: [String: RiverBubbleContent]
    let bubbleByRank: [Int: RiverLaneResolver.RiverBubble]
    let timeScale: RiverTimeScale?

    init(geometry: RiverLaneResolver.RiverGeometry, contents: [RiverBubbleContent]) {
        self.contents = contents
        contentByMessageId = Dictionary(
            contents.map { ($0.bubble.messageId, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        bubbleByRank = Dictionary(
            geometry.bubbles.map { ($0.rank, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        timeScale = RiverTimeScale.resolve(
            ranks: geometry.bubbles.map { RiverTimeScale.RankTime(rank: $0.rank, timeMs: $0.createdAtMs) },
            calendar: .current
        )
    }
}

/// Cache de rendu de `RiverConversationHost` — un type RÉFÉRENCE,
/// délibérément : le muter pendant l'évaluation du `body` ne doit RIEN
/// réinvalider. Un `@State` de VALEUR écrit ici déclencherait la passe
/// suivante, c'est-à-dire exactement la boucle que #3946 corrige.
final class RiverRenderingMemo {
    private var key: RiverConversationMapping.ContentsKey?
    private var cached: RiverRendering?
    private(set) var buildCount = 0

    func rendering(
        for key: RiverConversationMapping.ContentsKey,
        geometry: RiverLaneResolver.RiverGeometry,
        build: () -> [RiverBubbleContent]
    ) -> RiverRendering {
        if let cached, self.key == key { return cached }
        let rendering = RiverRendering(geometry: geometry, contents: build())
        self.key = key
        cached = rendering
        buildCount += 1
        return rendering
    }

    /// Sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, une deinit
    /// synthétisée est ISOLÉE et double-libère sur iOS 26.1 quand SwiftUI
    /// démonte la vue hors tâche (SE-0466,
    /// `MainActorDeinitSourceGuardTests`). Un corps vide n'a rien à
    /// toucher : la libération redevient non isolée.
    nonisolated deinit {}
}
