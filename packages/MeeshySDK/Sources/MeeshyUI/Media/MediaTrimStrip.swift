import SwiftUI
import UIKit
import MeeshySDK

// MARK: - « Rogner et régler » : ce que le composant décide, hors de toute vue (#17110)

/// **Le relevé « 0:02 / Gardé 0:07 / 0:09 »** : la tête, la durée gardée et
/// la source entière. La tête absente se lit au début de la fenêtre ; une tête
/// hors du fichier ne se lit jamais au-delà.
public nonisolated struct MediaTrimReadout: Equatable, Sendable {
    public let position: String
    public let keptDuration: String
    public let total: String

    public init(playhead: Double?, bounds: MediaTrimBounds, sourceDuration: Double, locale: Locale = .current) {
        let source = sourceDuration.isFinite ? max(0, sourceDuration) : 0
        let tete = min(max(playhead.flatMap { $0.isFinite ? $0 : nil } ?? bounds.start, 0), source)
        position = Self.clock(tete, locale)
        keptDuration = Self.clock(bounds.duration, locale)
        total = Self.clock(source, locale)
    }

    /// « Gardé 0:07 » — lu dans la table `MediaTrim` du module.
    @MainActor public var kept: String { MediaTrimCopy.kept(keptDuration) }

    static func clock(_ secondes: Double, _ locale: Locale) -> String {
        MediaFormat.duration(secondes, rounding: .toNearestOrAwayFromZero, locale: locale)
    }
}

/// **La tête sur la bande** : la largeur rendue représente la source ENTIÈRE.
public nonisolated enum MediaTrimPlayhead {

    public static func fraction(at seconde: Double, sourceDuration: Double) -> Double {
        guard sourceDuration > 0, sourceDuration.isFinite, seconde.isFinite else { return 0 }
        return min(max(seconde / sourceDuration, 0), 1)
    }

    public static func time(atX x: CGFloat, width: CGFloat, sourceDuration: Double) -> Double {
        guard width > 0, sourceDuration > 0, sourceDuration.isFinite, x.isFinite else { return 0 }
        return min(max(Double(x / width), 0), 1) * sourceDuration
    }
}

/// **Les réglages du son d'un média** : Volume, Muet, Boucle, Atténuer sous
/// les voix. Le gain entendu passe par `StoryVolumeResolver`, la source unique
/// que la lecture et l'export lisent déjà.
public nonisolated struct MediaTrimAdjustments: Equatable, Sendable {
    public var volume: Double
    public var isMuted: Bool
    public var loops: Bool
    public var ducksUnderVoices: Bool

    public init(volume: Double, isMuted: Bool, loops: Bool, ducksUnderVoices: Bool) {
        self.volume = volume
        self.isMuted = isMuted
        self.loops = loops
        self.ducksUnderVoices = ducksUnderVoices
    }

    /// Depuis le modèle : `isDuckingDisabled == nil` vaut « atténuation active ».
    public init(volume: Double, isMuted: Bool, loops: Bool, isDuckingDisabled: Bool?) {
        self.init(volume: volume, isMuted: isMuted, loops: loops, ducksUnderVoices: !(isDuckingDisabled ?? false))
    }

    public static let neutral = MediaTrimAdjustments(volume: 1, isMuted: false, loops: false, ducksUnderVoices: true)

    /// Vers le modèle : l'atténuation active ne s'écrit pas, pour garder le
    /// bénéfice rétroactif des stories déjà publiées.
    public var isDuckingDisabled: Bool? { ducksUnderVoices ? nil : true }

    public func audibleGain(slideDucks: Bool) -> Float {
        StoryVolumeResolver.audibleGain(
            volume: Float(volume), isMuted: isMuted,
            isDucking: StoryVolumeResolver.isDucking(slideDucks: slideDucks, isDuckingDisabled: isDuckingDisabled))
    }
}

/// **Ce que chaque surface montre** : le son (A15) ajoute sa langue et
/// Transcrire ; une pièce de conversation (C2) n'a ni boucle ni voix à couvrir.
public nonisolated struct MediaTrimOptions: OptionSet, Sendable {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }

    public static let volume = MediaTrimOptions(rawValue: 1 << 0)
    public static let mute = MediaTrimOptions(rawValue: 1 << 1)
    public static let loop = MediaTrimOptions(rawValue: 1 << 2)
    public static let ducking = MediaTrimOptions(rawValue: 1 << 3)
    public static let language = MediaTrimOptions(rawValue: 1 << 4)
    public static let transcribe = MediaTrimOptions(rawValue: 1 << 5)

    public static let video: MediaTrimOptions = [.volume, .mute, .loop, .ducking]
    public static let sound: MediaTrimOptions = [.volume, .mute, .loop, .ducking, .language, .transcribe]
    public static let piece: MediaTrimOptions = [.volume, .mute]
}

// MARK: - La bande

/// **« Rogner et régler » — LE composant de rognage du dépôt** (#4082, #17110).
///
/// Il sert le son (A15), la vidéo (O8) et la retouche d'une pièce (C2) : mêmes
/// poignées jaunes, même piste (vignettes de `VideoFilmstrip`, onde de
/// `WaveformStrip`), même tête, même relevé, mêmes réglages. Un second rogneur
/// est refusé par la garde `MediaTrimAdjustTests`.
///
/// Il montre la source ENTIÈRE et laisse deux poignées désigner ce qu'on
/// garde : on rogne en regardant ce qu'on RETIRE, assombri mais lisible.
///
/// **Il n'encode rien et ne décide de rien** : le clamp et le plancher vivent
/// dans `MediaTrimRule`, le gain dans `StoryVolumeResolver`. Il remet des
/// bornes et des réglages à chaque image du geste (loi 7 : sans « Appliquer »).
public struct MediaTrimStrip: View {

    /// Ce que la bande donne à VOIR : un son n'a pas de vignettes ; une vidéo
    /// en a, et porte en plus une onde quand sa piste audio a été analysée.
    /// `.audioFile` mesure l'onde lui-même quand l'appelant n'en a pas.
    public nonisolated enum Content: Equatable, Sendable {
        case video(URL)
        case audio
        case audioFile(URL)
    }

    /// Ce que l'hôte branche en plus du rognage. Un contrôle n'est monté que
    /// si son action l'est (loi 4 : jamais un contrôle sans effet).
    public struct Controls {
        public var playhead: Double?
        public var isPlaying: Bool
        public var onTogglePlayback: (() -> Void)?
        public var onSeek: ((Double) -> Void)?
        public var adjustments: MediaTrimAdjustments?
        public var volumeRange: ClosedRange<Double>
        public var options: MediaTrimOptions
        public var onAdjust: ((MediaTrimAdjustments) -> Void)?
        public var soundLanguage: String?
        public var onPickLanguage: (() -> Void)?
        public var onTranscribe: (() -> Void)?

        public init(playhead: Double? = nil,
                    isPlaying: Bool = false,
                    onTogglePlayback: (() -> Void)? = nil,
                    onSeek: ((Double) -> Void)? = nil,
                    adjustments: MediaTrimAdjustments? = nil,
                    volumeRange: ClosedRange<Double> = 0...Double(StoryVolume.maxGain),
                    options: MediaTrimOptions = .video,
                    onAdjust: ((MediaTrimAdjustments) -> Void)? = nil,
                    soundLanguage: String? = nil,
                    onPickLanguage: (() -> Void)? = nil,
                    onTranscribe: (() -> Void)? = nil) {
            self.playhead = playhead
            self.isPlaying = isPlaying
            self.onTogglePlayback = onTogglePlayback
            self.onSeek = onSeek
            self.adjustments = adjustments
            self.volumeRange = volumeRange
            self.options = options
            self.onAdjust = onAdjust
            self.soundLanguage = soundLanguage
            self.onPickLanguage = onPickLanguage
            self.onTranscribe = onTranscribe
        }

        public static var bare: Controls { Controls() }
    }

    private let content: Content
    private let sourceDuration: Double
    private let bounds: MediaTrimBounds
    private let waveform: [Float]
    private let waveformReading: WaveformReading
    private let accent: Color
    private let controls: Controls
    private let onChange: (MediaTrimBounds) -> Void
    private let onCommit: (() -> Void)?

    public init(content: Content,
                sourceDuration: Double,
                bounds: MediaTrimBounds,
                waveform: [Float] = [],
                waveformReading: WaveformReading = .published,
                accent: Color = MeeshyColors.brandPrimary,
                controls: Controls = .bare,
                onChange: @escaping (MediaTrimBounds) -> Void,
                onCommit: (() -> Void)? = nil) {
        self.content = content
        self.sourceDuration = sourceDuration
        self.bounds = bounds
        self.waveform = waveform
        self.waveformReading = waveformReading
        self.accent = accent
        self.controls = controls
        self.onChange = onChange
        self.onCommit = onCommit
    }

    public static let trackHeight: CGFloat = 60
    /// Les poignées sont JAUNES sur les trois surfaces (planches A15, O8, C2).
    public static let handleTint = Color.yellow
    private static let poigneeLargeur: CGFloat = 14

    public var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            releve
            HStack(spacing: MeeshySpacing.sm) {
                if let basculer = controls.onTogglePlayback { boutonLecture(basculer) }
                GeometryReader { geo in
                    piste(largeur: geo.size.width)
                }
                .frame(height: Self.trackHeight)
            }
            .environment(\.layoutDirection, .leftToRight)
            if let reglages = controls.adjustments, let regler = controls.onAdjust {
                MediaTrimAdjustPanel(adjustments: reglages, volumeRange: controls.volumeRange,
                                     options: controls.options, onAdjust: regler)
            }
            if controls.options.contains(.language) || controls.options.contains(.transcribe) { extrasSon }
        }
    }

    // MARK: - La piste

    private func piste(largeur: CGFloat) -> some View {
        let debut = position(ofSecond: bounds.start, in: largeur)
        let fin = position(ofSecond: bounds.end, in: largeur)

        return ZStack(alignment: .leading) {
            MediaTrimSourceTrack(content: content, waveform: waveform, reading: waveformReading,
                                 tint: accent, height: Self.trackHeight)
                .frame(width: largeur, height: Self.trackHeight)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xs, style: .continuous))
                .contentShape(Rectangle())
                .gesture(SpatialTapGesture(count: 1, coordinateSpace: .local).onEnded { toucher in
                    guard let chercher = controls.onSeek else { return }
                    HapticFeedback.light()
                    chercher(MediaTrimPlayhead.time(atX: toucher.location.x, width: largeur,
                                                    sourceDuration: sourceDuration))
                })

            voile(largeur: debut, decalage: 0)
            voile(largeur: max(0, largeur - fin), decalage: fin)

            fenetre(x: debut, largeur: max(0, fin - debut), pisteLargeur: largeur)

            if let tete = controls.playhead { teteDeLecture(tete, largeur: largeur) }
        }
    }

    private func voile(largeur: CGFloat, decalage: CGFloat) -> some View {
        Rectangle()
            .fill(Color.black.opacity(0.62))
            .frame(width: max(0, largeur), height: Self.trackHeight)
            .offset(x: decalage)
            .allowsHitTesting(false)
    }

    /// La fenêtre gardée : un cadre JAUNE fermé par deux languettes, et les
    /// poignées de précision de `ClipTrimHandles` — le composant que les barres
    /// de la timeline partagent, qui convertit la translation CUMULÉE du geste
    /// en deltas INCRÉMENTAUX.
    private func fenetre(x: CGFloat, largeur: CGFloat, pisteLargeur: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.xs, style: .continuous)
            .strokeBorder(Self.handleTint, lineWidth: 3)
            .frame(width: largeur, height: Self.trackHeight)
            .overlay(alignment: .leading) { languette(debut: true) }
            .overlay(alignment: .trailing) { languette(debut: false) }
            .overlay {
                ClipTrimHandles(
                    laneHeight: Self.trackHeight,
                    onTrimStartDelta: { points in appliquer(points, surLeDebut: true, pisteLargeur: pisteLargeur) },
                    onTrimEndDelta: { points in appliquer(points, surLeDebut: false, pisteLargeur: pisteLargeur) },
                    startValue: MediaFormat.duration(bounds.start, style: .spelledOut, rounding: .toNearestOrAwayFromZero),
                    endValue: MediaFormat.duration(bounds.end, style: .spelledOut, rounding: .toNearestOrAwayFromZero)
                )
                .frame(width: largeur, height: Self.trackHeight)
            }
            .offset(x: x)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(Self.fenetreLabel)
            .accessibilityValue(Self.duree(bounds.duration))
    }

    private func languette(debut: Bool) -> some View {
        UnevenRoundedRectangle(topLeadingRadius: debut ? MeeshyRadius.xs : 0,
                               bottomLeadingRadius: debut ? MeeshyRadius.xs : 0,
                               bottomTrailingRadius: debut ? 0 : MeeshyRadius.xs,
                               topTrailingRadius: debut ? 0 : MeeshyRadius.xs,
                               style: .continuous)
            .fill(Self.handleTint)
            .frame(width: Self.poigneeLargeur, height: Self.trackHeight)
            .allowsHitTesting(false)
    }

    /// La tête BLANCHE et son bouton : elle suit la lecture, et la toucher
    /// ailleurs sur la bande l'y pose.
    private func teteDeLecture(_ seconde: Double, largeur: CGFloat) -> some View {
        let x = CGFloat(MediaTrimPlayhead.fraction(at: seconde, sourceDuration: sourceDuration)) * largeur
        return VStack(spacing: 0) {
            Circle().fill(Color.white).frame(width: 10, height: 10)
            Capsule().fill(Color.white).frame(width: 2)
        }
        .frame(width: 10, height: Self.trackHeight + 6)
        .shadow(color: .black.opacity(0.45), radius: 1.5)
        .offset(x: x - 5, y: -3)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func boutonLecture(_ basculer: @escaping () -> Void) -> some View {
        Button {
            basculer()
            HapticFeedback.light()
        } label: {
            Image(systemName: controls.isPlaying ? "pause.fill" : "play.fill")
                .font(.system(size: MeeshyIconSize.md, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                .background(Circle().fill(accent))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(controls.isPlaying ? MediaTrimCopy.pause : MediaTrimCopy.play)
    }

    // MARK: - Les mots à l'écran

    /// « 0:02 / Gardé 0:07 / 0:09 » — la tête, ce qu'on garde, la source.
    private var releve: some View {
        let lu = MediaTrimReadout(playhead: controls.playhead, bounds: bounds, sourceDuration: sourceDuration)
        return HStack(spacing: MeeshySpacing.sm) {
            Text(lu.position).foregroundStyle(.secondary)
            Spacer(minLength: 0)
            Text(lu.kept).foregroundStyle(Self.handleTint)
            Spacer(minLength: 0)
            Text(lu.total).foregroundStyle(.secondary)
        }
        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold).monospacedDigit())
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .accessibilityElement(children: .combine)
    }

    /// A15 : la langue du son et Transcrire, montés seulement quand l'hôte
    /// sait les servir.
    @ViewBuilder
    private var extrasSon: some View {
        let langue = controls.options.contains(.language) ? controls.onPickLanguage : nil
        let transcrire = controls.options.contains(.transcribe) ? controls.onTranscribe : nil
        if langue != nil || transcrire != nil {
            HStack(spacing: MeeshySpacing.sm) {
                if let langue {
                    MediaTrimChip(symbol: "globe",
                                  title: controls.soundLanguage ?? MediaTrimCopy.language,
                                  isOn: false, action: langue)
                }
                if let transcrire {
                    MediaTrimChip(symbol: "text.bubble", title: MediaTrimCopy.transcribe, isOn: false, action: transcrire)
                }
                Spacer(minLength: 0)
            }
        }
    }

    // MARK: - Le geste

    /// La largeur rendue représente la source ENTIÈRE — c'est cette convention,
    /// et elle seule, qui rend la conversion points → secondes exacte.
    private func appliquer(_ points: CGFloat, surLeDebut: Bool, pisteLargeur: CGFloat) {
        guard pisteLargeur > 0 else { return }
        let delta = MediaTrimRule.seconds(forHandleDelta: points,
                                          stripWidth: pisteLargeur,
                                          sourceDuration: sourceDuration)
        let suivant = surLeDebut
            ? MediaTrimRule.movingStart(bounds, by: delta, sourceDuration: sourceDuration)
            : MediaTrimRule.movingEnd(bounds, by: delta, sourceDuration: sourceDuration)
        guard suivant != bounds else { return }
        onChange(suivant)
        onCommit?()
    }

    private func position(ofSecond seconde: Double, in largeur: CGFloat) -> CGFloat {
        CGFloat(MediaTrimPlayhead.fraction(at: seconde, sourceDuration: sourceDuration)) * largeur
    }

    // MARK: - Les mots

    static func duree(_ secondes: Double) -> String {
        MediaFormat.duration(secondes, rounding: .toNearestOrAwayFromZero)
    }

    static let fenetreLabel = String(
        localized: "media.trim.window",
        defaultValue: "Portion conservée",
        bundle: .module)

    static func surLabel(_ total: String) -> String {
        String(format: String(localized: "media.trim.of_total",
                              defaultValue: "sur %@",
                              bundle: .module), total)
    }
}

// MARK: - La piste de la source, partagée par tout rognage

/// **Ce que la source donne à voir** : les vignettes de `VideoFilmstrip`
/// (en cache, extraites UNE fois — jamais pendant un geste) et l'onde de
/// `WaveformStrip`. Le composer de capture monte cette même piste sous ses
/// poignées de précision.
public struct MediaTrimSourceTrack: View {
    private let content: MediaTrimStrip.Content
    private let waveform: [Float]
    private let reading: WaveformReading
    private let tint: Color
    private let height: CGFloat
    private let frameCount: Int
    private let waveformOpacity: Double

    @Environment(\.displayScale) private var displayScale
    @State private var frames: [UIImage] = []
    @State private var measured: [Float] = []

    public init(content: MediaTrimStrip.Content,
                waveform: [Float] = [],
                reading: WaveformReading = .published,
                tint: Color = MeeshyColors.brandPrimary,
                height: CGFloat = MediaTrimStrip.trackHeight,
                frameCount: Int = 8,
                waveformOpacity: Double = 0.75) {
        self.content = content
        self.waveform = waveform
        self.reading = reading
        self.tint = tint
        self.height = height
        self.frameCount = frameCount
        self.waveformOpacity = waveformOpacity
    }

    static let waveformResolution = 256

    public var body: some View {
        source
            .task(id: TaskKey(content: content, scale: displayScale)) { await charger() }
    }

    @ViewBuilder
    private var source: some View {
        switch content {
        case .video:
            if frames.isEmpty {
                enAttente
            } else {
                HStack(spacing: 0) {
                    ForEach(frames.indices, id: \.self) { i in
                        Image(uiImage: frames[i])
                            .resizable()
                            .scaledToFill()
                            .frame(maxWidth: .infinity)
                            .clipped()
                    }
                }
                .overlay(alignment: .bottom) {
                    if !waveform.isEmpty {
                        WaveformStrip(samples: waveform, tint: .white.opacity(waveformOpacity), reading: reading)
                            .frame(height: height * 0.34)
                    }
                }
            }
        case .audio, .audioFile:
            let onde = waveform.isEmpty ? measured : waveform
            if onde.isEmpty {
                enAttente
            } else {
                WaveformStrip(samples: onde, tint: tint, reading: waveform.isEmpty ? .measured : reading)
                    .background(Color.black.opacity(0.28))
            }
        }
    }

    /// **L'attente est DESSINÉE** (loi 6) : on montre qu'on attend, et on le dit.
    private var enAttente: some View {
        ZStack {
            LinearGradient(colors: [tint.opacity(0.18), tint.opacity(0.06)], startPoint: .leading, endPoint: .trailing)
            ProgressView()
                .progressViewStyle(.circular)
                .tint(.white.opacity(0.8))
        }
        .accessibilityLabel(MediaTrimCopy.loading)
    }

    private func charger() async {
        switch content {
        case .video(let url):
            frames = await VideoFilmstrip.frames(url: url, count: frameCount, maxHeight: height, scale: displayScale)
        case .audioFile(let url):
            guard waveform.isEmpty else { return }
            measured = (try? await WaveformCache.shared.samples(from: url, count: Self.waveformResolution)) ?? []
        case .audio:
            return
        }
    }

    private nonisolated struct TaskKey: Equatable, Sendable {
        let content: MediaTrimStrip.Content
        let scale: CGFloat
    }
}

// MARK: - Les réglages

/// **Volume · Muet · Boucle · Atténuer sous les voix** — le panneau unique.
struct MediaTrimAdjustPanel: View {
    let adjustments: MediaTrimAdjustments
    let volumeRange: ClosedRange<Double>
    let options: MediaTrimOptions
    let onAdjust: (MediaTrimAdjustments) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            if options.contains(.volume) { curseur }
            HStack(spacing: MeeshySpacing.sm) {
                if options.contains(.mute) {
                    MediaTrimChip(symbol: adjustments.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill",
                                  title: MediaTrimCopy.mute, isOn: adjustments.isMuted) {
                        changer { $0.isMuted.toggle() }
                    }
                }
                if options.contains(.loop) {
                    MediaTrimChip(symbol: "repeat", title: MediaTrimCopy.loop, isOn: adjustments.loops) {
                        changer { $0.loops.toggle() }
                    }
                }
                if options.contains(.ducking) {
                    MediaTrimChip(symbol: "waveform.badge.minus", title: MediaTrimCopy.ducking,
                                  isOn: adjustments.ducksUnderVoices) {
                        changer { $0.ducksUnderVoices.toggle() }
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }

    private var curseur: some View {
        MediaVolumeSlider(value: Binding(get: { adjustments.volume },
                                         set: { valeur in changer { $0.volume = valeur } }),
                          in: volumeRange,
                          tint: MediaTrimStrip.handleTint,
                          label: MediaTrimCopy.volume)
            .opacity(adjustments.isMuted ? 0.45 : 1)
    }

    private func changer(_ modifier: (inout MediaTrimAdjustments) -> Void) {
        var suivant = adjustments
        modifier(&suivant)
        guard suivant != adjustments else { return }
        onAdjust(suivant)
    }
}

/// **LE curseur de volume du dépôt** (#17110) : le panneau « Rogner et
/// régler » et le cadran N3 « Volume » du composer le montent tous deux.
/// 100 % est le niveau du fichier ; toucher deux fois la valeur l'y remet, et
/// « Réinitialiser » s'offre à VoiceOver dès qu'un libellé lui est donné.
public struct MediaVolumeSlider: View {
    @Binding private var value: Double
    private let range: ClosedRange<Double>
    private let tint: Color
    private let secondary: Color
    private let label: String
    private let neutral: Double
    private let resetLabel: String?

    public init(value: Binding<Double>,
                in range: ClosedRange<Double>,
                tint: Color,
                secondary: Color = .secondary,
                label: String,
                neutral: Double = 1,
                resetLabel: String? = nil) {
        _value = value
        self.range = range
        self.tint = tint
        self.secondary = secondary
        self.label = label
        self.neutral = neutral
        self.resetLabel = resetLabel
    }

    public var body: some View {
        let texte = Self.valueText(value)
        let ecart = Self.valueText(neutral) != texte
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "speaker.fill")
                .font(MeeshyFont.relative(13, weight: .semibold))
                .foregroundStyle(secondary)
                .accessibilityHidden(true)
            Slider(value: $value, in: range)
                .tint(tint)
                .frame(minHeight: MeeshyControlSize.tapTarget)
                .accessibilityLabel(Text(label))
                .accessibilityValue(Text(texte))
                .accessibilityAction(named: Text(resetLabel ?? label)) { reset() }
            Text(texte)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold).monospacedDigit())
                .foregroundStyle(secondary)
                .opacity(ecart ? 1 : 0.7)
                .lineLimit(1)
                .fixedSize()
                .frame(minWidth: 48, minHeight: MeeshyControlSize.tapTarget, alignment: .trailing)
                .contentShape(Rectangle())
                .onTapGesture(count: 2) { reset() }
                .accessibilityHidden(true)
        }
    }

    private func reset() {
        value = neutral
        HapticFeedback.light()
    }

    /// « 140 % » — arrondi au pour-cent, comme partout où un volume s'écrit.
    public nonisolated static func valueText(_ volume: Double) -> String {
        let pourcent = ((volume.isFinite ? volume : 0) * 100).rounded() / 100
        return pourcent.formatted(.percent.precision(.fractionLength(0)))
    }
}

/// Une capsule de réglage, cible de 44 pt, tailles relatives.
struct MediaTrimChip: View {
    let symbol: String
    let title: String
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        Button {
            action()
            HapticFeedback.light()
        } label: {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: symbol).font(MeeshyFont.relative(13, weight: .semibold))
                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(isOn ? Color.black : Color.primary)
            .padding(.horizontal, MeeshySpacing.md)
            .frame(minHeight: MeeshyControlSize.tapTarget)
            .background(Capsule().fill(isOn ? MediaTrimStrip.handleTint : Color.primary.opacity(0.1)))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
    }
}

// MARK: - Les mots (table `MediaTrim`)

/// Isolé au fil principal comme `Bundle.module`, l'accesseur que SPM génère.
enum MediaTrimCopy {
    static var loading: String {
        String(localized: "media.trim.loading", defaultValue: "Chargement de l'aperçu", bundle: .module)
    }
    static func kept(_ duree: String) -> String {
        String(format: String(localized: "media.trim.kept", defaultValue: "Gardé %@",
                              table: "MediaTrim", bundle: .module), duree)
    }
    static var volume: String {
        String(localized: "media.trim.volume", defaultValue: "Volume", table: "MediaTrim", bundle: .module)
    }
    static var mute: String {
        String(localized: "media.trim.mute", defaultValue: "Muet", table: "MediaTrim", bundle: .module)
    }
    static var loop: String {
        String(localized: "media.trim.loop", defaultValue: "Boucle", table: "MediaTrim", bundle: .module)
    }
    static var ducking: String {
        String(localized: "media.trim.ducking", defaultValue: "Atténuer sous les voix",
               table: "MediaTrim", bundle: .module)
    }
    static var language: String {
        String(localized: "media.trim.language", defaultValue: "Langue du son", table: "MediaTrim", bundle: .module)
    }
    static var transcribe: String {
        String(localized: "media.trim.transcribe", defaultValue: "Transcrire", table: "MediaTrim", bundle: .module)
    }
    static var play: String {
        String(localized: "media.trim.play", defaultValue: "Écouter la sélection", table: "MediaTrim", bundle: .module)
    }
    static var pause: String {
        String(localized: "media.trim.pause", defaultValue: "Arrêter", table: "MediaTrim", bundle: .module)
    }
}
