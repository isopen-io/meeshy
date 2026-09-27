import Foundation

/// Qui parle, dans un appel de groupe (#3585).
///
/// Nourri des niveaux `audioLevel` (0…1) des statistiques `inbound-rtp` audio
/// de chaque connexion. Hystérésis : on entre au-dessus de `enterLevel`, on ne
/// sort qu'après `holdDuration` passé sous `exitLevel` — sans elle, le liseré
/// clignoterait entre deux syllabes. Valeur immuable : chaque relevé rend un
/// nouveau détecteur.
struct ActiveSpeakerDetector: Equatable, Sendable {
    let enterLevel: Double
    let exitLevel: Double
    let holdDuration: TimeInterval
    /// Dernier instant où chaque locuteur actif était au-dessus de `exitLevel`.
    let lastLoud: [String: Date]

    init(
        enterLevel: Double = 0.06,
        exitLevel: Double = 0.03,
        holdDuration: TimeInterval = 0.8,
        lastLoud: [String: Date] = [:]
    ) {
        self.enterLevel = enterLevel
        self.exitLevel = exitLevel
        self.holdDuration = holdDuration
        self.lastLoud = lastLoud
    }

    var speakers: Set<String> { Set(lastLoud.keys) }

    func isSpeaking(_ userId: String) -> Bool { lastLoud[userId] != nil }

    /// Un relevé : `levels` porte le niveau de chaque membre mesuré à `now`.
    /// Un membre absent du relevé garde son état jusqu'à expiration du maintien.
    func recording(_ levels: [String: Double], at now: Date) -> ActiveSpeakerDetector {
        let refreshed = levels.reduce(into: lastLoud) { state, entry in
            let (userId, level) = entry
            let threshold = state[userId] == nil ? enterLevel : exitLevel
            if level >= threshold { state[userId] = now }
        }
        let alive = refreshed.filter { now.timeIntervalSince($0.value) <= holdDuration }
        return ActiveSpeakerDetector(enterLevel: enterLevel, exitLevel: exitLevel, holdDuration: holdDuration, lastLoud: alive)
    }

    func forgetting(_ userId: String) -> ActiveSpeakerDetector {
        ActiveSpeakerDetector(
            enterLevel: enterLevel,
            exitLevel: exitLevel,
            holdDuration: holdDuration,
            lastLoud: lastLoud.filter { $0.key != userId }
        )
    }
}
