import Foundation

// MARK: - L'inscription en phases vivantes (#8288)

/// Ce qui est PARU de l'inscription — monotone : un champ paru ne disparaît
/// jamais, corriger son adresse ne fait pas s'effondrer la carte sous les
/// doigts. Miroir web : `apps/web/src/lib/view/signup-phases.ts`.
///
/// | phase | ce qu'elle rend | ce qui l'ouvre |
/// |---|---|---|
/// | `phone` | le numéro en verre liquide, le pays | rien — dès l'ouverture |
/// | `email` | l'adresse | un numéro présent et PLAUSIBLE — il ne se passe plus (#9343) |
/// | `card` | la carte d'identité : nom affiché, @pseudo, refus, « Valider mon compte maintenant » | une adresse cohérente |
/// | `code` | le code à 6 chiffres, dans la carte | le compte créé par la carte |
/// | `verified` | le feu d'artifice ; « S'inscrire » devient « Parler aux autres » | le code juste, ou le lien ouvert |
nonisolated struct SignupProgress: Equatable, Sendable {
    var emailShown: Bool
    var cardShown: Bool

    static let initial = SignupProgress(emailShown: false, cardShown: false)

    func advanced(phoneGiven: Bool, emailValid: Bool) -> SignupProgress {
        let email = emailShown || phoneGiven
        return SignupProgress(emailShown: email, cardShown: cardShown || (email && emailValid))
    }
}

/// Ce que la carte sait du compte, réduit à ce que la loi lit.
nonisolated enum SignupCardStage: Equatable, Sendable {
    case editing
    /// Le compte existe et attend son code. `signedIn` : une session est tenue
    /// (inscription ordinaire, délai de grâce #8238) ; faux pour une
    /// revendication d'adresse (#8214), qui n'entre que par son code.
    case awaitingCode(signedIn: Bool)
    case verified
}

nonisolated enum SignupPhase: Equatable, Sendable {
    case phone, email, card, code, verified
}

/// « S'inscrire », actif dès la carte — l'inscription sans code est permise
/// pendant le délai de grâce (#8238) —, puis « Parler aux autres ».
nonisolated enum SignupPrimaryAction: Equatable, Sendable {
    case signUp(enabled: Bool)
    case talk
}

nonisolated enum SignupPhases {
    static func phase(progress: SignupProgress, card: SignupCardStage) -> SignupPhase {
        switch card {
        case .verified: return .verified
        case .awaitingCode: return .code
        case .editing:
            if progress.cardShown { return .card }
            return progress.emailShown ? .email : .phone
        }
    }

    static func primaryAction(progress: SignupProgress, card: SignupCardStage, formReady: Bool) -> SignupPrimaryAction {
        switch card {
        case .verified: return .talk
        case .awaitingCode(let signedIn): return .signUp(enabled: signedIn)
        case .editing: return .signUp(enabled: progress.cardShown && formReady)
        }
    }

    /// Le refus du numéro se dit-il sous le champ ? (#9343) — jamais pendant
    /// la première frappe, dès que le champ est QUITTÉ avec une saisie, qu'un
    /// envoi est tenté, ou qu'un numéro donné est effacé (l'adresse, parue, ne
    /// se referme pas). Miroir web : `phoneRefusalShown` (`signup-phases.ts`).
    static func phoneRefusalShown(refused: Bool, checked: Bool, progress: SignupProgress) -> Bool {
        refused && (checked || progress.emailShown)
    }
}
