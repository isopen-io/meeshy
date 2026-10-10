import QuartzCore

/// Horloge de tick du lecteur de scène (#9702).
///
/// La tête de lecture avançait de `targetTimestamp − timestamp` : la durée
/// NOMINALE d'une frame. Une image perdue (hitch, rebuild lourd) était donc du
/// temps perdu pour la timeline mais pas pour l'audio, qui joue sur son propre
/// fil — la scène prenait du retard sur le son, image perdue après image
/// perdue. Elle avance désormais du temps RÉEL écoulé entre deux ticks.
nonisolated struct PlayheadTickClock {

    /// Au-delà, l'écart n'est plus une image perdue mais une suspension
    /// (arrière-plan, link en pause) : on n'avance que d'une frame.
    static let maxTickGap: CFTimeInterval = 0.25

    /// Cadence du contrôle de dérive des vidéos : assez lente pour ne rien
    /// coûter, assez rapide pour qu'une dérive ne s'entende pas longtemps.
    static let driftCheckInterval: CFTimeInterval = 0.5

    private(set) var lastTick: CFTimeInterval?
    private(set) var lastDriftCheck: CFTimeInterval?

    static func elapsed(previous: CFTimeInterval?,
                        now: CFTimeInterval,
                        nominal: CFTimeInterval,
                        maxGap: CFTimeInterval = maxTickGap) -> CFTimeInterval {
        let frame = nominal.isFinite ? max(0, nominal) : 0
        guard let previous, previous.isFinite, now.isFinite else { return frame }
        let delta = now - previous
        guard delta > 0 else { return 0 }
        return delta > maxGap ? frame : delta
    }

    mutating func advance(now: CFTimeInterval, nominal: CFTimeInterval) -> CFTimeInterval {
        let elapsed = Self.elapsed(previous: lastTick, now: now, nominal: nominal)
        lastTick = now
        return elapsed
    }

    /// Une pause « douce » gèle le link : le premier tick de la reprise ne doit
    /// pas compter la durée de la pause.
    mutating func reset() {
        lastTick = nil
    }

    mutating func isDriftCheckDue(now: CFTimeInterval) -> Bool {
        guard let last = lastDriftCheck else {
            lastDriftCheck = now
            return false
        }
        guard now - last >= Self.driftCheckInterval else { return false }
        lastDriftCheck = now
        return true
    }
}
