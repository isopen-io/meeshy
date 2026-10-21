import Foundation

// MARK: - Revenir sur un réel le reprend à l'instant (#10354)

/// **Où se pose la tête de lecture d'un lecteur qu'on retrouve.**
///
/// Mesuré sur l'iPhone 16 Pro Max (build Release, 2026-10-12) : revenir sur un
/// réel déjà commencé le reprenait au même endroit en PLUSIEURS secondes. Le
/// lecteur sortant était rendu au pool la tête ramenée à ZÉRO
/// (`SharedAVPlayerManager.recycle`) ; au retour, la page le faisait jouer
/// depuis le début pendant le geste, puis le moteur, une fois posé, le
/// replaçait par un `seek` PRÉCIS (tolérance nulle : décodage depuis l'image-clé
/// précédente) sur un lecteur qui jouait déjà, et le son repartait de zéro
/// avant de sauter.
///
/// La loi :
/// - un lecteur rendu au pool GARDE sa position quand elle est reprenable — la
///   même règle que le magasin de positions (`isResumable`) ; sinon il revient
///   au début ;
/// - un lecteur retrouvé dont la tête est déjà sur la reprise, ou au-delà
///   (il a joué pendant le geste), ne bouge pas : c'est seulement `play()` ;
/// - sinon un seul `seek` TOLÉRANT (au plus `tolerance` de part et d'autre),
///   posé AVANT la lecture.
public nonisolated enum PlaybackResumeLaw {

    /// Écart toléré entre la reprise mémorisée et la tête du lecteur : une
    /// image-clé suffit, aucun décodage depuis l'image-clé précédente.
    public static let tolerance: TimeInterval = 0.5

    public nonisolated enum Action: Equatable, Sendable {
        /// La tête est déjà au bon endroit : `play()` seulement.
        case none
        /// Un `seek` tolérant vers cette position, avant `play()`.
        case seek(to: TimeInterval)
    }

    /// Ce que le moteur fait de la tête d'un lecteur qu'il vient d'adopter ou
    /// de créer, vu la reprise mémorisée (`nil` : rien à reprendre).
    ///
    /// Une tête au-delà de la reprise ne recule jamais : le lecteur a continué
    /// depuis elle pendant le geste, et la ramener en arrière rejouerait ce que
    /// l'utilisateur vient de voir.
    public static func action(saved: TimeInterval?, current: TimeInterval) -> Action {
        guard let saved, saved.isFinite else { return .none }
        let head = current.isFinite ? max(0, current) : 0
        return head >= saved - tolerance ? .none : .seek(to: saved)
    }

    /// La position à laquelle ramener un lecteur rendu au pool, `nil` : il
    /// garde la sienne. Même règle que la reprise mémorisée, pour que la tête
    /// du lecteur et le magasin de positions disent toujours la même chose.
    public static func recycledHead(
        position: TimeInterval,
        duration: TimeInterval,
        isResumable: (TimeInterval, TimeInterval) -> Bool
    ) -> TimeInterval? {
        guard position.isFinite, duration.isFinite else { return 0 }
        return isResumable(position, duration) ? nil : 0
    }
}

// MARK: - Le pool garde les voisins du réel affiché (#10354)

/// **Quel lecteur le pool rend quand il déborde.**
///
/// Le pool évinçait dans l'ordre d'arrivée : un préchauffage tardif chassait
/// le lecteur du réel qu'on venait de quitter, et le retour en arrière
/// repartait à froid. Quand l'écran déclare la distance de chaque lecteur au
/// réel affiché, le plus LOIN part d'abord — un lecteur dont la distance est
/// inconnue passe avant tout voisin déclaré — et, à distance égale, le plus
/// ancien. Sans déclaration, l'ordre d'arrivée reste la règle.
public nonisolated enum PlayerPoolEviction {

    public static func victim(order: [String], distances: [String: Int]) -> String? {
        guard !order.isEmpty else { return nil }
        let rank: (String) -> Int = { distances[$0].map(abs) ?? Int.max }
        return order.enumerated().max { lhs, rhs in
            let left = rank(lhs.element), right = rank(rhs.element)
            return left == right ? lhs.offset > rhs.offset : left < right
        }?.element
    }
}
