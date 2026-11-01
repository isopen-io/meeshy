import Foundation

/// Pourquoi le serveur refuserait une demande de cran — miroir de
/// `RelationRequestRefusalCode` (`packages/shared/utils/relation-request.ts`, #13933).
public enum RelationRequestRefusal: String, Sendable, Equatable {
    case phaseSkip = "RELATION_PHASE_SKIP"
    case cooldown = "RELATION_COOLDOWN"
    case notEligible = "RELATION_NOT_ELIGIBLE"
}

public enum RelationRequestVerdict: Sendable, Equatable {
    case allowed
    case refused(RelationRequestRefusal)
}

/// LA LOI D'UNE DEMANDE DE CRAN — miroir de `evaluateRelationRequest`, rejoué sur les
/// cas COMMUNS `packages/shared/fixtures/relation-request-cases.json` (#13938).
///
/// Le miroir ne décide d'AUCUNE demande : le serveur reste l'autorité. Il sert à ne pas
/// PROPOSER celle qu'il refusera. Pur, sans état, sans I/O. Les refus se disent dans
/// l'ordre du serveur : saut de phase, cool-down, éligibilité.
public enum RelationRequestRule {

    /// Le seul cran qu'une demande peut viser depuis `level` (RG-03 : jamais de saut).
    /// Miroir de `relationRungAfter` ; `nil` au sommet.
    public static func rung(after level: RelationLevel) -> RelationLevel? {
        switch level {
        case .public, .community: return .acquaintance
        case .acquaintance: return .friend
        case .friend: return .close
        case .close: return .blood
        case .blood: return nil
        }
    }

    public static func evaluate(
        target: RelationLevel,
        current: RelationLevel,
        eligibleFor: RelationLevel?,
        cooldownUntil: Date?,
        now: Date
    ) -> RelationRequestVerdict {
        guard rung(after: current) == target else { return .refused(.phaseSkip) }
        if let cooldownUntil, cooldownUntil > now { return .refused(.cooldown) }
        if requiresSeries(target), eligibleFor != target { return .refused(.notEligible) }
        return .allowed
    }

    /// Proche et Sang exigent leur série (RG-04) ; Connaissance et Ami n'en ont pas.
    private static func requiresSeries(_ target: RelationLevel) -> Bool {
        target == .close || target == .blood
    }
}
