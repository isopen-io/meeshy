import Foundation

// MARK: - Le bandeau du jeu ne paraît qu'à l'OUVERTURE de l'app (#9536, directive porteur 2026-10-06)
//
// Il SUPPLANTE la règle « toujours visible » de #9494 : le bandeau s'ouvre avec l'application — au démarrage à froid,
// ou au retour au premier plan après une VRAIE absence — reste `lingers` secondes, puis s'en va lentement vers le
// haut. Changer d'onglet, ouvrir un fil, revenir : rien de tout cela ne le rouvre, et rien ne le prolonge.
//
// Une pure machine à états sur des DATES : aucune horloge, aucun minuteur, aucune notification système ici. L'hôte
// lui dit quand l'app est partie et revenue, lui demande combien de temps il reste, et dort ce temps-là. Les
// constantes (30 s, 1 s, 5 min) sont celles que le web applique à l'identique (#9536) : une divergence n'est
// jamais un « écart assumé ».

public struct GamePlayerBannerOpening: Equatable, Sendable {

    /// Le temps pendant lequel le bandeau reste, à l'ouverture.
    public static let lingers: TimeInterval = 30
    /// La sortie, lente, vers le haut : de 0,8 à 1,2 s — le milieu de la fenêtre demandée.
    public static let exitDuration: TimeInterval = 1.0
    /// Une absence est « vraie » à partir de là : un appel, le centre de contrôle ou un aller-retour de quelques
    /// secondes ne rouvrent pas le bandeau.
    public static let realAbsence: TimeInterval = 300

    /// L'instant où le bandeau s'est ouvert pour la dernière fois.
    public private(set) var openedAt: Date
    /// Depuis quand l'app est à l'arrière-plan ; `nil` tant qu'elle est au premier plan.
    public private(set) var awaySince: Date?

    /// L'application vient de s'ouvrir : le bandeau s'ouvre avec elle.
    public init(openedAt: Date) {
        self.openedAt = openedAt
        self.awaySince = nil
    }

    /// L'app passe à l'arrière-plan. Un second signal ne repousse pas l'instant du départ.
    public mutating func appWentAway(at now: Date) {
        if awaySince == nil { awaySince = now }
    }

    /// L'app revient au premier plan. `true` quand l'absence était vraie et que le bandeau se rouvre.
    @discardableResult
    public mutating func appCameBack(at now: Date) -> Bool {
        defer { awaySince = nil }
        guard let awaySince, now.timeIntervalSince(awaySince) >= Self.realAbsence else { return false }
        openedAt = now
        return true
    }

    /// Ce qu'il reste à vivre au bandeau : 30 s à l'ouverture, 0 une fois passé. Une horloge qui recule ne le
    /// prolonge pas au-delà des 30 s.
    public func remaining(at now: Date) -> TimeInterval {
        let elapsed = max(0, now.timeIntervalSince(openedAt))
        return max(0, Self.lingers - elapsed)
    }

    public func isOpen(at now: Date) -> Bool {
        remaining(at: now) > 0
    }
}
