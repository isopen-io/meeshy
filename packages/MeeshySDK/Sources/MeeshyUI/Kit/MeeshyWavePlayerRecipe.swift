import SwiftUI

/// Les deux tailles du lecteur : `row` (60 / 40) et `compact` (44 / 28).
public nonisolated enum MeeshyWavePlayerSize: String, Sendable, Equatable, CaseIterable {
    case row
    case compact
}

/// Les phases que l'hôte déclare ; la lecture et le glissement viennent des valeurs.
public nonisolated enum MeeshyWavePlayerPhase: String, Sendable, Equatable, CaseIterable {
    case ready
    case buffering
    case unavailable
}

/// Ce que la durée montre pendant la lecture. Au repos, toujours le total.
public nonisolated enum MeeshyWavePlayerClock: String, Sendable, Equatable, CaseIterable {
    case remaining
    case elapsed
    case total
}

/// Les sept états lisibles du lecteur : la forme ne change pas, le glyphe et un mot le disent.
public nonisolated enum MeeshyWavePlayerState: String, Sendable, Equatable, CaseIterable {
    case rest
    case playing
    case paused
    case buffering
    case scrubbing
    case finished
    case unavailable
}

/// **La loi des barres** (K35) : l'UNE mesure de l'onde, partagée par le lecteur des
/// vocaux, l'échantillon de voix et les sons de story. Une barre tous les 6 px au plus,
/// jamais de barre sous 3 de haut, une courbe perceptive qui relève les passages calmes.
public nonisolated enum MeeshyWaveBarsLaw {

    public static let barWidth: Double = 3
    public static let barGap: Double = 3
    public static let pitch: Double = barWidth + barGap
    public static let minimumBarHeight: Double = Double(AudioWaveformStripLayout.barMinHeight)
    static let curve: Double = AudioWaveformStripLayout.amplitudeCurve
    /// Les barres à venir : la teinte à 30 %.
    public static let upcomingOpacity: Double = 0.3

    /// Le nombre de barres : une par pas de 6 px, une au moins.
    public static func barCount(width: Double) -> Int {
        guard width.isFinite else { return 1 }
        return max(1, Int((width / pitch).rounded(.down)))
    }

    /// Les niveaux ramenés au nombre de barres, de 0 à 1. Sans niveaux : barres plates,
    /// jamais une onde inventée. Plus de niveaux que de barres : la moyenne du paquet.
    public static func resample(samples: [Float], width: Double) -> [Double] {
        let count = barCount(width: width)
        guard !samples.isEmpty else { return Array(repeating: 0, count: count) }
        return (0..<count).map { bar in
            let start = bar * samples.count / count
            let end = max(start + 1, (bar + 1) * samples.count / count)
            let bucket = samples[start..<min(end, samples.count)].map { normalized(Double($0)) }
            return bucket.reduce(0, +) / Double(bucket.count)
        }
    }

    static func normalized(_ value: Double) -> Double {
        guard value.isFinite else { return 0 }
        return min(max(value, 0), 1)
    }

    /// La hauteur d'une barre dans une bande : la courbe, jamais sous 3.
    public static func height(normalized value: Double, maxHeight: Double) -> Double {
        guard value.isFinite else { return minimumBarHeight }
        return max(minimumBarHeight, pow(normalized(value), curve) * maxHeight)
    }

    /// Les barres pleines : une barre est jouée quand son centre est atteint. À 0
    /// aucune, à 1 toutes ; le nombre ne dépend que de `progress`.
    public static func filledBars(count: Int, progress: Double) -> Int {
        guard count > 0 else { return 0 }
        let clamped = normalized(progress)
        return min(count, Int((clamped * Double(count) + 0.5 + 1e-9).rounded(.down)))
    }

    /// Pendant un glissement l'onde suit le doigt et ignore le `progress` reçu.
    public static func displayedProgress(progress: Double, scrubFraction: Double?) -> Double {
        normalized(scrubFraction ?? progress)
    }

    /// La fraction visée : bornée de 0 à 1, reflétée en lecture de droite à gauche.
    public static func scrubFraction(locationX: Double, width: Double, isRightToLeft: Bool) -> Double {
        guard width > 0, locationX.isFinite else { return 0 }
        let fraction = min(max(locationX, 0), width) / width
        return isRightToLeft ? 1 - fraction : fraction
    }
}

/// **La loi du glissement** : il commence au premier mouvement, remet sa fraction au
/// relâcher, et se FERME toujours — même quand le lecteur a cessé d'accepter le geste
/// en cours de route, même quand le geste est annulé ou la vue quittée. Sans cela
/// l'onde resterait figée sous le doigt et l'hôte croirait le glissement en cours.
public nonisolated struct MeeshyWaveScrubLaw: Sendable, Equatable {
    public private(set) var fraction: Double?

    public init() {}

    /// Le doigt glisse : `true` au premier mouvement (le glissement commence).
    public mutating func move(to fraction: Double) -> Bool {
        let began = self.fraction == nil
        self.fraction = MeeshyWaveBarsLaw.normalized(fraction)
        return began
    }

    /// Le doigt se lève : la fraction à remettre si le lecteur l'accepte encore, et
    /// `ended` quand un glissement était en cours.
    public mutating func finish(at fraction: Double, accepts: Bool) -> (commit: Double?, ended: Bool) {
        let ended = self.fraction != nil
        self.fraction = nil
        return (accepts ? MeeshyWaveBarsLaw.normalized(fraction) : nil, ended)
    }

    /// Geste annulé ou vue quittée : rien n'est remis ; `true` si un glissement se ferme.
    public mutating func cancel() -> Bool {
        let ended = fraction != nil
        fraction = nil
        return ended
    }
}

/// **La recette de K35 en VALEURS** : disque, glyphe, onde, écart, état lisible,
/// échelles, opacités. Aucune couleur : la teinte est celle de l'hôte.
public nonisolated struct MeeshyWavePlayerRecipe: Sendable, Equatable {

    public let phaseState: MeeshyWavePlayerState
    public let discDiameter: Double
    public let glyphSize: Double
    public let waveHeight: Double
    public let rowHeight: Double
    public let gap: Double
    public let glyph: String
    public let showsRing: Bool
    public let acceptsToggle: Bool
    public let acceptsScrub: Bool
    public let scrubZoneHeight: Double
    public let pressedScale: Double
    public let scrubScale: Double
    public let upcomingOpacity: Double
    public let restBarOpacity: Double
    public let barsAreLive: Bool
    public let opacity: Double

    public static func resolve(size: MeeshyWavePlayerSize,
                               phase: MeeshyWavePlayerPhase,
                               isPlaying: Bool,
                               progress: Double,
                               isScrubbing: Bool,
                               isEnabled: Bool,
                               reduceMotion: Bool) -> MeeshyWavePlayerRecipe {
        let state = resolveState(phase: phase, isPlaying: isPlaying, progress: progress, isScrubbing: isScrubbing)
        let acts = isEnabled && phase == .ready
        let isRow = size == .row
        return MeeshyWavePlayerRecipe(
            phaseState: state,
            discDiameter: isRow ? 60 : 44,
            glyphSize: isRow ? 22 : 18,
            waveHeight: isRow ? 40 : 28,
            rowHeight: isRow ? 60 : 44,
            gap: isRow ? 14 : 10,
            glyph: glyph(for: state),
            showsRing: phase == .buffering,
            acceptsToggle: acts,
            acceptsScrub: acts,
            scrubZoneHeight: 44,
            pressedScale: 0.94,
            scrubScale: 1.12,
            upcomingOpacity: MeeshyWaveBarsLaw.upcomingOpacity,
            restBarOpacity: 1,
            barsAreLive: isPlaying && !reduceMotion && phase == .ready,
            opacity: phase == .unavailable || !isEnabled ? 0.4 : 1
        )
    }

    private static func resolveState(phase: MeeshyWavePlayerPhase, isPlaying: Bool, progress: Double,
                              isScrubbing: Bool) -> MeeshyWavePlayerState {
        switch phase {
        case .unavailable: return .unavailable
        case .buffering: return .buffering
        case .ready:
            if isScrubbing { return .scrubbing }
            if isPlaying { return .playing }
            if progress >= 1 { return .finished }
            return progress > 0 ? .paused : .rest
        }
    }

    private static func glyph(for state: MeeshyWavePlayerState) -> String {
        switch state {
        case .playing: return "pause.fill"
        case .finished: return "arrow.counterclockwise"
        default: return "play.fill"
        }
    }

    /// Le texte de la durée : le temps restant en lecture, le total au repos, « –:–– »
    /// sans durée connue.
    /// Le glyphe du disque garde sa taille quel que soit le Dynamic Type : le disque est fixe.
    public static func glyphFont(size: Double) -> Font {
        Font.system(size: size, weight: .bold)
    }

    public static func clockText(duration: Double, progress: Double, isPlaying: Bool, clock: MeeshyWavePlayerClock) -> String {
        guard duration.isFinite, duration > 0 else { return "–:––" }
        let fraction = MeeshyWaveBarsLaw.normalized(progress)
        guard isPlaying else { return minutesAndSeconds(duration.rounded()) }
        switch clock {
        case .remaining: return minutesAndSeconds((duration * (1 - fraction)).rounded(.up))
        case .elapsed: return minutesAndSeconds((duration * fraction).rounded())
        case .total: return minutesAndSeconds(duration.rounded())
        }
    }

    static func minutesAndSeconds(_ seconds: Double) -> String {
        let total = Int(max(seconds, 0))
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

/// Les mots dits : le disque est un bouton nommé, l'onde une valeur « 0:05 sur 0:09 ».
public enum MeeshyWavePlayerWords {

    public static func toggleLabel(label: String, isPlaying: Bool,
                                   bundle: Bundle? = nil, locale: Locale = .current) -> String {
        let verb = isPlaying
            ? String(localized: "kit.wave_player.pause", defaultValue: "Mettre en pause", bundle: bundle ?? .module, locale: locale)
            : String(localized: "kit.wave_player.play", defaultValue: "Lire", bundle: bundle ?? .module, locale: locale)
        return "\(verb), \(label)"
    }

    public static func position(duration: Double, progress: Double,
                                bundle: Bundle? = nil, locale: Locale = .current) -> String {
        let elapsed = MeeshyWavePlayerRecipe.clockText(duration: duration, progress: progress, isPlaying: true, clock: .elapsed)
        let total = MeeshyWavePlayerRecipe.clockText(duration: duration, progress: progress, isPlaying: false, clock: .total)
        return String(localized: "kit.wave_player.position", defaultValue: "\(elapsed) sur \(total)",
                      bundle: bundle ?? .module, locale: locale)
    }

    /// Le mot d'un état que la forme ne dit pas seule ; `nil` quand le glyphe suffit.
    public static func stateWord(_ state: MeeshyWavePlayerState,
                                 bundle: Bundle? = nil, locale: Locale = .current) -> String? {
        switch state {
        case .buffering:
            return String(localized: "kit.wave_player.buffering", defaultValue: "Chargement", bundle: bundle ?? .module, locale: locale)
        case .unavailable:
            return String(localized: "kit.wave_player.unavailable", defaultValue: "Indisponible", bundle: bundle ?? .module, locale: locale)
        case .finished:
            return String(localized: "kit.wave_player.replay", defaultValue: "Rejouer", bundle: bundle ?? .module, locale: locale)
        default:
            return nil
        }
    }
}
