import Foundation

/// **Baisser puis rendre le volume d'un lecteur Meeshy** pendant un
/// enregistrement (#11042) — la loi, sans lecteur ni effet.
///
/// Elle mémorise le volume d'AVANT, rend le volume baissé à appliquer, puis,
/// à la fin, rend EXACTEMENT le volume mémorisé. Le volume visé est celui du
/// lecteur (`AVPlayer` / `AVAudioPlayer`), jamais celui du système.
///
/// - Baisser deux fois ne baisse qu'une fois, et la restauration rend le
///   volume d'origine, pas le volume déjà baissé.
/// - Rendre sans avoir baissé ne fait rien : une fin d'enregistrement sans
///   début n'écrit aucun volume.
/// - Un volume que l'utilisateur a changé pendant l'enregistrement (coupé,
///   remonté) est le sien : il n'est pas écrasé. Un lecteur muet (`isMuted`)
///   n'est jamais rendu audible : seul `volume` est touché.
/// - Un lecteur silencieux (volume nul) n'est pas baissé.
public struct PlaybackDuckLedger: Sendable {

    /// ≈ −10 dB : le son reste audible, et capté sans couvrir la voix.
    public static let duckedFactor: Float = 0.3

    /// L'écart en deçà duquel un volume relu est celui qu'on a écrit.
    private static let tolerance: Float = 0.0005

    private struct Entry: Sendable {
        let original: Float
        let applied: Float
    }

    private var entries: [ObjectIdentifier: Entry] = [:]

    public init() {}

    public var isEmpty: Bool { entries.isEmpty }

    /// Le volume baissé à écrire, ou `nil` s'il n'y a rien à écrire.
    public mutating func duck(_ key: ObjectIdentifier, currentVolume: Float) -> Float? {
        guard entries[key] == nil, currentVolume > 0 else { return nil }
        let applied = currentVolume * Self.duckedFactor
        entries[key] = Entry(original: currentVolume, applied: applied)
        return applied
    }

    /// Le volume d'avant à réécrire, ou `nil` s'il ne faut rien écrire.
    public mutating func restore(_ key: ObjectIdentifier, currentVolume: Float) -> Float? {
        guard let entry = entries.removeValue(forKey: key) else { return nil }
        guard abs(currentVolume - entry.applied) <= Self.tolerance else { return nil }
        return entry.original
    }

    /// Le lecteur n'existe plus : il n'y a rien à lui rendre.
    public mutating func forget(_ key: ObjectIdentifier) {
        entries.removeValue(forKey: key)
    }
}
