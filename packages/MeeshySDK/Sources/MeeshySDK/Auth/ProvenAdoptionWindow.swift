import Foundation

/// Ce qu'une preuve par lien a rendu, et qui attend d'être adopté (#10518).
public enum ProvenAdoptionKind: String, Sendable, CaseIterable {
    case session
    case secondFactor = "second-factor"
}

/// Le délai d'adoption d'une preuve par lien, côté appareil (#10518) — le
/// miroir de `packages/shared/utils/proven-session-adoption.ts`, tenu par la
/// garde `ProvenAdoptionWindowTests`, qui LIT ce fichier.
///
/// La passerelle sert `adoptWithinSeconds` : une DURÉE, que l'appareil applique
/// à l'instant où il a reçu la preuve, sans comparer son horloge à celle du
/// serveur. Elle ne sert qu'à une chose : ne pas ranger le compte ouvert pour
/// poser une session que la passerelle refuserait (#10513). Une fenêtre lue
/// trop longue ne prolonge aucune session — la passerelle seule adopte.
public enum ProvenAdoptionWindow {

    /// Ce que l'appareil retranche du délai servi : le trajet de la réponse,
    /// puis celui du premier appel qui adopte.
    public static let clientMargin: TimeInterval = 60

    /// La borne DURE : quoi que la réponse prétende, une preuve gardée en
    /// mémoire finit par expirer.
    public static let clientMax: TimeInterval = 30 * 60

    /// La fenêtre quand la passerelle ne sert rien de lisible. Elle ne peut
    /// être que PLUS COURTE que celle de la passerelle.
    public static func fallback(for kind: ProvenAdoptionKind) -> TimeInterval {
        switch kind {
        case .session: return 9 * 60
        case .secondFactor: return 4 * 60
        }
    }

    /// Le plus grand entier que le contrat partagé tient pour lisible
    /// (`Number.isSafeInteger`, 2^53 − 1) : au-delà, le délai vaut un délai
    /// absent, des deux côtés.
    public static let maxReadableSeconds = 9_007_199_254_740_991

    /// La fenêtre que l'appareil applique à l'instant de réception. Un délai
    /// absent, négatif ou au-delà de `maxReadableSeconds` vaut le repli ; un
    /// délai lisible est suivi, moins la marge, jusqu'à la borne dure. Zéro
    /// ferme la fenêtre.
    public static func clientWindow(for kind: ProvenAdoptionKind, adoptWithinSeconds: Int?) -> TimeInterval {
        guard let served = adoptWithinSeconds, (0...maxReadableSeconds).contains(served) else {
            return fallback(for: kind)
        }
        return bounded(TimeInterval(served) - clientMargin)
    }

    /// Une fenêtre ramenée entre zéro et la borne dure. Une valeur qui n'est
    /// pas un nombre ferme la fenêtre.
    public static func bounded(_ window: TimeInterval) -> TimeInterval {
        guard !window.isNaN else { return 0 }
        return min(max(0, window), clientMax)
    }

    /// La preuve a-t-elle passé la fenêtre où l'adopter vaut encore ? Dans le
    /// doute, oui : une fenêtre nulle est fermée, et une horloge revenue en
    /// arrière (instant de réception dans le futur) ne rouvre rien.
    public static func hasLapsed(receivedAt: Date, window: TimeInterval, now: Date) -> Bool {
        let elapsed = now.timeIntervalSince(receivedAt)
        guard window > 0, elapsed >= 0 else { return true }
        return elapsed > bounded(window)
    }
}
