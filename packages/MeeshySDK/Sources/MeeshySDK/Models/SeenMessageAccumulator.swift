import Foundation

/// Traduit un flux d'apparitions/disparitions de bulles en lots de messages
/// RÉELLEMENT lus.
///
/// Un message n'est retenu que s'il est resté continûment affiché au moins
/// `dwellMs`. Sans ce seuil, défiler à travers deux cents messages en une
/// seconde les marquerait tous lus — précisément le défaut que le suivi exact
/// corrige côté serveur, qu'il serait absurde de réintroduire ici.
///
/// Aucune horloge interne : chaque méthode reçoit l'instant courant. Le type
/// reste ainsi pur, testable sans faux timers, et l'appelant maîtrise la cadence.
/// C'est aussi ce qui en fait une `struct` sans isolation : rien à synchroniser,
/// le propriétaire (`@MainActor` en pratique) en détient une copie unique.
///
/// Miroir TypeScript : `apps/web/utils/seen-message-accumulator.ts` — mêmes cas.
/// Voir `docs/superpowers/specs/2026-07-24-read-exactness-design.md`.
public struct SeenMessageAccumulator: Sendable {

    /// Présence continue minimale pour qu'un message compte comme lu.
    public let dwellMs: Int
    /// Nombre d'identifiants acquis à partir duquel un envoi vaut le coup.
    public let batchSize: Int
    /// Plafond du garde-fou anti-doublon. Une session longue ne doit pas faire
    /// croître la mémoire sans fin ; au pire, un oubli provoque un signalement
    /// redondant, sans conséquence puisque l'écriture serveur est write-once.
    public let reportedCap: Int

    /// messageId → instant de l'apparition en cours.
    private var visibleSince: [String: Int] = [:]
    /// Acquis mais pas encore rendus, dans l'ordre d'acquisition.
    private var acquired: [String] = []
    /// Déjà rendus une fois.
    private var reported: Set<String> = []

    public init(dwellMs: Int = 300, batchSize: Int = 50, reportedCap: Int = 2000) {
        self.dwellMs = dwellMs
        self.batchSize = batchSize
        self.reportedCap = reportedCap
    }

    public mutating func appeared(_ messageId: String, at now: Int) {
        guard !reported.contains(messageId) else { return }
        // Une réapparition repart de zéro : le temps passé hors écran ne se
        // cumule pas, sans quoi deux survols éclair vaudraient une lecture.
        visibleSince[messageId] = now
    }

    public mutating func disappeared(_ messageId: String, at now: Int) {
        guard let since = visibleSince.removeValue(forKey: messageId) else { return }
        if now - since >= dwellMs { acquire(messageId) }
    }

    /// `true` si assez d'identifiants sont acquis pour qu'un envoi vaille le coup.
    public mutating func isBatchReady(at now: Int) -> Bool {
        promoteVisible(at: now, minimumDwell: dwellMs)
        return acquired.count >= batchSize
    }

    /// Rend les identifiants acquis et les retire de l'état. Les bulles encore à
    /// l'écran ayant franchi le seuil sont acquises au passage, ce qui permet
    /// d'appeler cette méthode à la fermeture ou au passage en arrière-plan sans
    /// perdre une lecture en cours.
    public mutating func drain(at now: Int) -> [String] {
        promoteVisible(at: now, minimumDwell: dwellMs)
        return takeAcquired()
    }

    /// Rend TOUT ce qui est en attente — seuil franchi ou non — et vide l'état.
    ///
    /// Le seuil distingue une lecture d'un défilement, distinction qui n'a plus
    /// d'objet aux instants où l'utilisateur DÉCLARE regarder le bas : il vient
    /// d'y arriver, il l'a demandé, ou il quitte l'écran. Ce qui est affiché est
    /// alors ce qu'il a sous les yeux ; attendre 300 ms de plus ne rendrait
    /// l'accusé ni plus ni moins véridique, seulement plus tardif.
    ///
    /// Réservé à ces déclencheurs : appelée pendant un défilement, elle
    /// réintroduirait exactement le défaut que `dwellMs` corrige.
    public mutating func promoteAndDrain(at now: Int) -> [String] {
        promoteVisible(at: now, minimumDwell: 0)
        return takeAcquired()
    }

    private mutating func takeAcquired() -> [String] {
        let batch = acquired
        acquired.removeAll(keepingCapacity: true)
        for messageId in batch { markReported(messageId) }
        return batch
    }

    private mutating func promoteVisible(at now: Int, minimumDwell: Int) {
        // Trié pour que deux messages franchissant le seuil au même appel
        // sortent dans un ordre déterministe — un dictionnaire Swift n'en offre
        // aucun, et un lot non reproductible complique le diagnostic.
        let due = visibleSince
            .filter { now - $0.value >= minimumDwell }
            .sorted { ($0.value, $0.key) < ($1.value, $1.key) }
            .map(\.key)

        for messageId in due {
            visibleSince.removeValue(forKey: messageId)
            acquire(messageId)
        }
    }

    private mutating func acquire(_ messageId: String) {
        guard !reported.contains(messageId) else { return }
        guard !acquired.contains(messageId) else { return }
        acquired.append(messageId)
    }

    private mutating func markReported(_ messageId: String) {
        // `Set` n'a pas d'ordre d'insertion : plutôt que d'entretenir une file
        // parallèle pour évincer le plus ancien, on repart à vide au plafond.
        // La politique d'éviction est un détail — le contrat mirroité est
        // seulement « borné, quitte à re-signaler après oubli ».
        if reported.count >= reportedCap { reported.removeAll(keepingCapacity: true) }
        reported.insert(messageId)
    }
}
