import SwiftUI
import MeeshySDK

/// Annonce du fond audio (deux plans, B3.3) — provenance (B3.4) et
/// existence (B3.5). `.none` sans piste ; `.original` si et seulement si la
/// piste est propre (♫〰) ; `.credit` pour une piste de bibliothèque, dont les
/// métadonnées peuvent être `nil` (cache froid) SANS jamais faire dégénérer
/// la forme crédit vers `.original` — mentir sur la provenance.
public nonisolated enum BackgroundAudioAnnouncement: Equatable, Sendable {
    case none
    case original
    case credit(title: String?, username: String?, duration: TimeInterval?)
}

/// Contenu de la chip audio, à droite de la note (reader ET preview).
///
/// Directive user 2026-08-02 : un son EMPRUNTÉ à la bibliothèque s'annonce —
/// façon crédit — par un défilement « titre · @pseudo » ; sans titre, le
/// @pseudo défile seul. La PREMIÈRE publication d'un son garde la sinusoïde,
/// même si la capture a versé ce son à la bibliothèque ensuite : le
/// discriminant est `soundId` (l'emprunt), jamais l'existence du son en
/// bibliothèque.
public nonisolated enum AudioChipDisplay: Equatable, Sendable {
    case waveform
    case marquee(text: String)

    /// Adapte le vocabulaire `soundId` (emprunté ⇔ non-nil) en piste v3 —
    /// SOURCE UNIQUE de cette conversion pour les appelants qui interrogent
    /// `backgroundAnnouncement` (`AudioForegroundChip`).
    public static func borrowedSound(soundId: String?) -> BackgroundSoundV3? {
        soundId.map { BackgroundSoundV3(source: .library(soundId: $0), volume: 1) }
    }

    /// Traduit l'annonce PURE (B3.4 provenance, B3.5 existence) en forme
    /// d'affichage de la chip. `.credit` sans métadonnées (cache froid) rend
    /// un marquee GÉNÉRIQUE « ♫ — » — jamais `.waveform`, qui mentirait sur
    /// la provenance (B3.4, « si et seulement si »).
    public static func display(for announcement: BackgroundAudioAnnouncement) -> AudioChipDisplay {
        switch announcement {
        case .none, .original:
            return .waveform
        case .credit(let title, let username, _):
            return .marquee(text: creditMarqueeText(title: title, username: username))
        }
    }

    private static func creditMarqueeText(title: String?, username: String?) -> String {
        let cleanTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines)
        let author = username?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .drop(while: { $0 == "@" })
        let authorTag = (author?.isEmpty == false) ? "@\(author!)" : nil
        switch (cleanTitle?.isEmpty == false ? cleanTitle : nil, authorTag) {
        case let (t?, a?): return "\(t) · \(a)"
        case let (nil, a?): return a
        case let (t?, nil): return t
        case (nil, nil):   return "♫ —"
        }
    }

    // MARK: - Annonce du fond (B3.4 provenance, B3.5 existence)

    /// Fonction PURE : aucune requête réseau — les métadonnées de
    /// bibliothèque arrivent déjà résolues en paramètres (résolues par
    /// l'appelant, lot E).
    public static func backgroundAnnouncement(sound: BackgroundSoundV3?,
                                               libraryTitle: String?,
                                               libraryUsername: String?,
                                               libraryDuration: TimeInterval?) -> BackgroundAudioAnnouncement {
        guard let sound else { return .none }
        switch sound.source {
        case .original:
            return .original
        case .library:
            return .credit(title: libraryTitle, username: libraryUsername, duration: libraryDuration)
        }
    }

    // MARK: - Temps restant du secteur audio (directive user 2026-08-02, itération 2)

    /// Fin de lecture du secteur — miroir EXACT de la fenêtre du reader
    /// (`AudioForegroundReaderOverlay.visibleAudios`) : un FOND joue jusqu'à
    /// la fin de la slide ; un foreground s'arrête à `start + duration`, ou à
    /// la fin de slide quand il n'a pas de durée propre. `nil` quand aucune
    /// fin n'est résoluble — le marquee n'affiche alors AUCUN segment temps.
    ///
    /// Prêt à recevoir la fenêtre de source (`sourceStart`/`excerptDuration`,
    /// chantier concurrent) : le compteur CONSOMME un temps restant, il ne
    /// connaît pas la mécanique d'extraction.
    public static func playbackEndSeconds(startTime: TimeInterval?,
                                          duration: TimeInterval?,
                                          slideDuration: TimeInterval?,
                                          isBackground: Bool) -> TimeInterval? {
        let end: TimeInterval?
        if isBackground {
            end = slideDuration
        } else if let duration {
            end = (startTime ?? 0) + duration
        } else {
            end = slideDuration
        }
        guard let end, end.isFinite, end > 0 else { return nil }
        return end
    }

    /// Temps restant avant la fin du secteur, borné ≥ 0.
    public static func remainingSeconds(elapsed: TimeInterval,
                                        startTime: TimeInterval?,
                                        duration: TimeInterval?,
                                        slideDuration: TimeInterval?,
                                        isBackground: Bool) -> TimeInterval? {
        guard let end = playbackEndSeconds(startTime: startTime,
                                           duration: duration,
                                           slideDuration: slideDuration,
                                           isBackground: isBackground) else { return nil }
        return max(0, end - elapsed)
    }

    /// Longueur totale du secteur au premier affichage (la chip foreground
    /// apparaît à `startTime`, le fond à 0) — sert à fixer UNE chasse de
    /// compteur par piste : jamais de largeur variable en cours de lecture,
    /// le cycle du modulo doit rester constant.
    public static func countdownTotalSeconds(startTime: TimeInterval?,
                                             duration: TimeInterval?,
                                             slideDuration: TimeInterval?,
                                             isBackground: Bool) -> TimeInterval? {
        guard let end = playbackEndSeconds(startTime: startTime,
                                           duration: duration,
                                           slideDuration: slideDuration,
                                           isBackground: isBackground) else { return nil }
        guard !isBackground, let start = startTime else { return end }
        return max(0, end - start)
    }

    /// 1 chiffre de minutes (« M:SS ») sous 10 minutes, 2 (« MM:SS ») au-delà.
    public static func minuteDigits(forTotal total: TimeInterval) -> Int {
        total >= 600 ? 2 : 1
    }

    /// « M:SS » (ou « MM:SS » pour une piste ≥ 10 min) à chasse fixe : nombre
    /// de chiffres constant + `.monospacedDigit()` côté vue. Les secondes
    /// fractionnaires arrondissent au PLAFOND (« 0:01 » tant que la lecture
    /// n'est pas réellement finie) et un débordement sature (« 9:59 ») plutôt
    /// que d'élargir la chasse.
    public static func formatRemaining(_ seconds: TimeInterval, minuteDigits: Int) -> String {
        let cap = minuteDigits >= 2 ? 99 * 60 + 59 : 9 * 60 + 59
        let whole = seconds.isFinite ? max(0, Int(seconds.rounded(.up))) : cap
        let bounded = min(whole, cap)
        return minuteDigits >= 2
            ? String(format: "%02d:%02d", bounded / 60, bounded % 60)
            : String(format: "%d:%02d", bounded / 60, bounded % 60)
    }
}

/// Fenêtre de lecture du secteur annoncé par la chip — primitives Equatable
/// descendues par le parent (jamais d'objet moteur : le `BackgroundEntry` du
/// mixer reste privé). Prête à accueillir la fenêtre de source
/// (`sourceStart`/`excerptDuration`) quand le chantier concurrent la posera.
public struct AudioChipPlaybackWindow: Equatable, Sendable {
    public let startTime: TimeInterval?
    public let duration: TimeInterval?
    public let isBackground: Bool
    public let slideDuration: TimeInterval?

    public init(startTime: TimeInterval? = nil,
                duration: TimeInterval? = nil,
                isBackground: Bool = false,
                slideDuration: TimeInterval? = nil) {
        self.startTime = startTime
        self.duration = duration
        self.isBackground = isBackground
        self.slideDuration = slideDuration
    }
}

/// Défilement horizontal EN CERCLE du crédit d'un son de bibliothèque
/// (directive user 2026-08-02, itération 2) : deux copies
/// « {titre · @pseudo} · {M:SS} » séparées par `gap`, offset = fonction PURE
/// du temps sur un `TimelineView(.animation)` — patron
/// `AudioForegroundSineWave` : l'animation vit dans l'atome, ZÉRO re-render
/// du parent, insensible aux rebuilds 60 Hz du header. La pause gèle
/// l'offset ; la reprise (dé-mute) dérive une epoch pour repartir exactement
/// où le texte s'était arrêté (`resumeEpoch`). Reduce Motion (système OU
/// override in-app) → texte statique tronqué, compteur conservé (le temps
/// est un contenu, pas un mouvement).
public struct AudioChipMarquee: View {
    let text: String
    let paused: Bool
    let window: AudioChipPlaybackWindow?
    let height: CGFloat
    let fontSize: CGFloat

    public init(text: String,
                paused: Bool = false,
                window: AudioChipPlaybackWindow? = nil,
                height: CGFloat = 18,
                fontSize: CGFloat = 12) {
        self.text = text
        self.paused = paused
        self.window = window
        self.height = height
        self.fontSize = fontSize
    }

    @State private var contentWidth: CGFloat = 0
    /// Origine temporelle du défilement — recalée au changement de texte et à
    /// la reprise post-pause (dérivée de `frozenOffset` : pas de saut).
    @State private var epoch = Date()
    /// Offset gelé au moment de la pause, réinjecté dans `resumeEpoch`.
    @State private var frozenOffset: CGFloat = 0

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion

    private let gap: CGFloat = 24
    private let speed: CGFloat = 28   // points / seconde

    // MARK: - Mécanique pure (testée dans AudioChipDisplayTests)

    /// Position du contenu à l'instant `elapsed` : boucle sans couture sur un
    /// cycle `largeur contenu + gap`, toujours dans `(-cycle, 0]` — quand une
    /// copie est entièrement sortie du cadre, la seconde est exactement là où
    /// la première avait commencé.
    nonisolated public static func scrollOffset(elapsed: TimeInterval,
                                                cycle: CGFloat,
                                                speed: CGFloat) -> CGFloat {
        guard cycle > 0, speed > 0 else { return 0 }
        var offset = (CGFloat(elapsed) * speed).truncatingRemainder(dividingBy: cycle)
        if offset < 0 { offset += cycle }
        return -offset
    }

    /// Epoch dérivée pour que `scrollOffset` à `date` redonne exactement
    /// `frozenOffset` : la reprise post-pause ne saute pas.
    nonisolated public static func resumeEpoch(at date: Date,
                                               frozenOffset: CGFloat,
                                               speed: CGFloat) -> Date {
        guard speed > 0 else { return date }
        return date.addingTimeInterval(TimeInterval(frozenOffset / speed))
    }

    public var body: some View {
        GeometryReader { geo in
            let reduceMotion = MeeshyMotion.shouldReduce(system: systemReduceMotion,
                                                         userForced: userForcedReduceMotion)
            let fits = contentWidth > 0 && contentWidth <= geo.size.width
            Group {
                if reduceMotion {
                    truncatedContent
                        .frame(width: geo.size.width, alignment: .center)
                } else if fits {
                    measuredContent
                        .frame(width: geo.size.width, alignment: .center)
                } else {
                    TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: paused)) { context in
                        HStack(spacing: gap) {
                            measuredContent
                            content.accessibilityHidden(true)
                        }
                        .offset(x: Self.scrollOffset(
                            elapsed: context.date.timeIntervalSince(epoch),
                            cycle: contentWidth + gap,
                            speed: speed))
                        .frame(width: geo.size.width, alignment: .leading)
                        .clipped()
                    }
                }
            }
            .adaptiveOnChange(of: text) { _, _ in
                epoch = Date()
                frozenOffset = 0
            }
            .adaptiveOnChange(of: paused) { _, isPaused in
                if isPaused {
                    frozenOffset = Self.scrollOffset(
                        elapsed: Date().timeIntervalSince(epoch),
                        cycle: contentWidth + gap,
                        speed: speed)
                } else {
                    epoch = Self.resumeEpoch(at: Date(), frozenOffset: frozenOffset, speed: speed)
                }
            }
        }
        .frame(height: height)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
    }

    /// Une copie du contenu défilant : le crédit, puis « · M:SS » quand le
    /// secteur a une fin résoluble. La chasse du compteur est FIXE (nombre de
    /// chiffres constant par piste + `monospacedDigit`), donc la largeur de
    /// cycle reste constante pendant que les chiffres tournent.
    @ViewBuilder
    private var content: some View {
        HStack(spacing: 0) {
            marqueeText(text).fixedSize()
            if let window, let digits = countdownDigits {
                marqueeText(" · ").fixedSize()
                AudioChipRemainingTimeText(window: window,
                                           minuteDigits: digits,
                                           fontSize: fontSize,
                                           dimmed: paused)
            }
        }
    }

    /// Première copie : porte la mesure de largeur (le cycle du modulo). Le
    /// compteur à chasse fixe n'y contribue qu'une largeur constante — la
    /// mesure ne bouge donc qu'au changement de `text`.
    private var measuredContent: some View {
        content
            .background(
                GeometryReader { g in
                    Color.clear.preference(key: MarqueeWidthKey.self, value: g.size.width)
                }
            )
            .onPreferenceChange(MarqueeWidthKey.self) { contentWidth = $0 }
    }

    /// Reduce Motion : pas de défilement — titre tronqué, compteur conservé.
    private var truncatedContent: some View {
        HStack(spacing: 0) {
            marqueeText(text)
                .truncationMode(.tail)
            if let window, let digits = countdownDigits {
                marqueeText(" · ").fixedSize()
                AudioChipRemainingTimeText(window: window,
                                           minuteDigits: digits,
                                           fontSize: fontSize,
                                           dimmed: paused)
            }
        }
    }

    private func marqueeText(_ string: String) -> some View {
        Text(string)
            .font(.system(size: fontSize, weight: .semibold))
            .foregroundColor(.white.opacity(paused ? 0.5 : 0.92))
            .lineLimit(1)
    }

    /// Chasse du compteur, constante par piste. `nil` = pas de fin résoluble,
    /// donc pas de segment temps : le marquee reste « titre · @pseudo ».
    private var countdownDigits: Int? {
        guard let window,
              let total = AudioChipDisplay.countdownTotalSeconds(
                  startTime: window.startTime,
                  duration: window.duration,
                  slideDuration: window.slideDuration,
                  isBackground: window.isBackground)
        else { return nil }
        return AudioChipDisplay.minuteDigits(forTotal: total)
    }
}

/// Compteur « M:SS » du temps restant du secteur — atome AUTONOME : il
/// observe le playhead ICI même (jamais dans le header — doctrine
/// StoryViewerView+Sidebar « le header est reconstruit à chaque tick ») et un
/// `TimelineView(.periodic)` cadence la relecture à la seconde. `elapsed`
/// vient du clock canvas (`StoryReaderPlayheadState`, throttle 30 Hz) : quand
/// la lecture gèle, le compteur gèle avec elle.
struct AudioChipRemainingTimeText: View {
    let window: AudioChipPlaybackWindow
    let minuteDigits: Int
    let fontSize: CGFloat
    let dimmed: Bool

    @ObservedObject private var playhead = StoryReaderPlayheadState.shared

    init(window: AudioChipPlaybackWindow,
         minuteDigits: Int,
         fontSize: CGFloat,
         dimmed: Bool) {
        self.window = window
        self.minuteDigits = minuteDigits
        self.fontSize = fontSize
        self.dimmed = dimmed
    }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            Text(AudioChipDisplay.formatRemaining(
                AudioChipDisplay.remainingSeconds(
                    elapsed: playhead.elapsedSeconds ?? 0,
                    startTime: window.startTime,
                    duration: window.duration,
                    slideDuration: window.slideDuration,
                    isBackground: window.isBackground) ?? 0,
                minuteDigits: minuteDigits))
                .font(.system(size: fontSize, weight: .semibold))
                .monospacedDigit()
                .foregroundColor(.white.opacity(dimmed ? 0.5 : 0.92))
                .lineLimit(1)
                .fixedSize()
        }
    }
}

private struct MarqueeWidthKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}
