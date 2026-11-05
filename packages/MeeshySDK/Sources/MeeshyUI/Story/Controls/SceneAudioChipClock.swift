import SwiftUI
import MeeshySDK

/// Ce que le chrono d'une puce sonore sait de sa piste (#16294) : son entrée
/// sur la scène, la longueur d'une passe (`nil` : inconnue) et sa boucle
/// déclarée.
public nonisolated struct SceneAudioChipTiming: Equatable, Sendable {
    public let startTime: TimeInterval
    public let passSeconds: TimeInterval?
    public let loop: Bool?
    public let isBackground: Bool

    public init(startTime: TimeInterval = 0, passSeconds: TimeInterval? = nil,
                loop: Bool? = nil, isBackground: Bool = false) {
        self.startTime = startTime
        self.passSeconds = passSeconds
        self.loop = loop
        self.isBackground = isBackground
    }

    public init(audio: StoryAudioPlayerObject) {
        let start = Double(audio.startTime ?? 0)
        self.init(startTime: start.isFinite ? max(0, start) : 0,
                  passSeconds: SceneAudioChipClock.passSeconds(of: audio),
                  loop: audio.loop,
                  isBackground: audio.isBackground == true)
    }

    /// La position, en secondes, que la puce affiche à `slideElapsed` ; au
    /// compositeur (`isEditPreview`), chaque son boucle — comme l'aperçu le
    /// joue.
    public func positionSeconds(slideElapsed: TimeInterval, isEditPreview: Bool = false) -> TimeInterval {
        let elapsed = slideElapsed - startTime
        guard elapsed.isFinite, elapsed > 0 else { return 0 }
        if ReaderAudioLoopPolicy.loops(declared: loop, isBackground: isBackground, isEditPreview: isEditPreview) {
            return ReaderLoopLaw.elapsedInPass(elapsed, passLength: passSeconds ?? 0)
        }
        return passSeconds.map { min(elapsed, $0) } ?? elapsed
    }
}

/// **Le chrono de la puce d'un son posé sur la scène** (#16294, jumelle
/// Android #16293) : la position dans la passe qui sonne, revenue à zéro à
/// chaque tour quand le son boucle. Le compositeur, le lecteur et l'export la
/// lisent tous (loi 6 : le player est l'aperçu).
public nonisolated enum SceneAudioChipClock {

    /// Une passe : la fenêtre de rognage de la source, sinon la durée que le
    /// son occupe ; `nil` quand rien ne la dit.
    public static func passSeconds(of audio: StoryAudioPlayerObject) -> TimeInterval? {
        let start = audio.sourceStart.flatMap { $0.isFinite && $0 > 0 ? $0 : nil } ?? 0
        if let end = audio.sourceEnd, end.isFinite, end - start > 0 { return end - start }
        guard let duration = audio.duration.map(Double.init), duration.isFinite, duration > 0 else { return nil }
        return duration
    }

    /// « M:SS », secondes tronquées : le chiffre ne devance jamais le son.
    public static func label(_ seconds: TimeInterval) -> String {
        let whole = seconds.isFinite && seconds > 0 ? Int(seconds) : 0
        return String(format: "%d:%02d", whole / 60, whole % 60)
    }
}

/// L'écoulé que lit le chrono des puces d'une surface : le playhead du lecteur,
/// l'horloge d'un `MeeshyScenePlayer`, la tête de la timeline du compositeur.
/// LU à la cadence du chrono, jamais observé — le playhead publie 30 fois par
/// seconde, le chrono change une fois.
public struct SceneAudioChipElapsed: Sendable {
    public let read: @MainActor @Sendable () -> TimeInterval?
    public let isEditPreview: Bool

    public init(isEditPreview: Bool = false, read: @escaping @MainActor @Sendable () -> TimeInterval?) {
        self.read = read
        self.isEditPreview = isEditPreview
    }
}

public extension SceneAudioChipElapsed {
    /// Au composer, le chrono lit la tête de la timeline : chaque son y boucle.
    static func composerTimeline(_ timeline: TimelineViewModel) -> SceneAudioChipElapsed {
        SceneAudioChipElapsed(isEditPreview: true) { [timeline] in Double(timeline.currentTime) }
    }
}

private struct SceneAudioChipElapsedKey: EnvironmentKey {
    static let defaultValue: SceneAudioChipElapsed? = nil
}

public extension EnvironmentValues {
    /// `nil` : la surface n'a pas d'horloge, le chrono reste à zéro.
    var sceneAudioChipElapsed: SceneAudioChipElapsed? {
        get { self[SceneAudioChipElapsedKey.self] }
        set { self[SceneAudioChipElapsedKey.self] = newValue }
    }
}

/// Le chrono « M:SS » d'une puce : relu deux fois par seconde dans sa propre
/// `TimelineView`, seul ce texte se ré-évalue — jamais la puce.
struct SceneAudioChipChronoText: View {
    let timing: SceneAudioChipTiming
    let fontSize: CGFloat
    let dimmed: Bool

    @Environment(\.sceneAudioChipElapsed) private var elapsed

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.5)) { _ in
            Text(SceneAudioChipClock.label(position))
                .font(chronoFont)
                .monospacedDigit()
                .foregroundStyle(Color.white.opacity(dimmed ? 0.5 : 0.92))
                .lineLimit(1)
                .fixedSize()
        }
        .accessibilityHidden(true)
    }

    /// Un objet de scène suit son échelle, jamais Dynamic Type : le chrono
    /// garde la taille que l'export peint (`StoryAudioChipTemplate.chrono`).
    private var chronoFont: Font {
        Font.system(size: fontSize, weight: .semibold)
    }

    private var position: TimeInterval {
        guard let elapsed, let seconds = elapsed.read() else { return 0 }
        return timing.positionSeconds(slideElapsed: seconds, isEditPreview: elapsed.isEditPreview)
    }
}
