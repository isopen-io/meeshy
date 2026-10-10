import Foundation

// MARK: - La carte « âge » (#9929)
//
// Décision porteur 2026-10-10 (#9926) : l'âge se demande pendant l'onboarding,
// et l'étape se passe (âge inconnu = aucune restriction). Sous 13 ans, Meeshy
// n'est pas ouvert ; de 13 à 17 ans, Global se lit sans s'écrire. La passerelle
// décide de tout depuis la date — la carte ne fait que la recueillir.

/// Où en est la déclaration de la date de naissance.
nonisolated enum OnboardingAgeState: Equatable {
    case idle
    case sending
    /// 400 : la passerelle refuse la date. On peut en choisir une autre.
    case invalid
    /// Réseau ou serveur : rien n'est écrit, on peut réessayer ou passer.
    case failed
    /// 422 : moins de 13 ans. Meeshy n'est pas ouvert, la session se ferme.
    case refused
}

/// Les bornes du sélecteur. Elles ne décident pas de l'âge minimum — c'est la
/// passerelle qui refuse sous 13 ans : elles retirent seulement les dates que
/// le contrat déclare invalides (future, plus de 120 ans).
nonisolated enum OnboardingAgeRules {
    static let oldestAge = 120
    /// Le point de départ de la roue : il n'est jamais envoyé tel quel, la
    /// confirmation attend que l'utilisateur ait choisi. Jamais un âge MAJEUR :
    /// une roue à peine effleurée ne doit pas ouvrir Global en écriture à un
    /// mineur — elle part de l'âge minimum, l'erreur possible est du côté qui
    /// protège.
    static let initialAge = 13

    static func range(now: Date, calendar: Calendar = .current) -> ClosedRange<Date> {
        let oldest = calendar.date(byAdding: .year, value: -oldestAge, to: now) ?? now
        return oldest...now
    }

    static func initialBirthDate(now: Date, calendar: Calendar = .current) -> Date {
        calendar.date(byAdding: .year, value: -initialAge, to: now) ?? now
    }
}
