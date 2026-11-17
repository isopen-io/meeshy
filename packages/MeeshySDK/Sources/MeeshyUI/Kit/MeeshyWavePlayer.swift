import SwiftUI
import MeeshySDK

/// **Le lecteur d'onde (K35)** : un disque pour lire, une onde qui se remplit et
/// respire, une durée qui ne bouge pas de place. Le même lecteur pour une voix, un
/// vocal, le son d'une story.
///
/// Agnostique : des valeurs (`samples`, `progress`, `isPlaying`, `duration`), deux
/// gestes (`onToggle`, `onScrub`). Il ne joue rien, ne charge rien, n'ouvre aucun
/// fichier ; l'hôte décide qu'un seul son joue à la fois. Deux éléments pour le
/// lecteur d'écran : le disque (bouton nommé) et l'onde (valeur « 0:05 sur 0:09 »).
public struct MeeshyWavePlayer<Trailing: View>: View {
    private let label: String
    private let samples: [Float]
    private let progress: Double
    private let isPlaying: Bool
    private let duration: Double
    private let tint: Color?
    private let size: MeeshyWavePlayerSize
    private let phase: MeeshyWavePlayerPhase
    private let clock: MeeshyWavePlayerClock
    private let onToggle: () -> Void
    private let onScrub: ((Double) -> Void)?
    private let onScrubbingChange: ((Bool) -> Void)?
    private let trailing: Trailing

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.layoutDirection) private var layoutDirection
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.locale) private var locale
    @State private var scrubFraction: Double?

    public init(label: String,
                samples: [Float] = [],
                progress: Double,
                isPlaying: Bool,
                duration: Double,
                tint: Color? = nil,
                size: MeeshyWavePlayerSize = .row,
                phase: MeeshyWavePlayerPhase = .ready,
                clock: MeeshyWavePlayerClock = .remaining,
                onToggle: @escaping () -> Void,
                onScrub: ((Double) -> Void)? = nil,
                onScrubbingChange: ((Bool) -> Void)? = nil,
                @ViewBuilder trailing: () -> Trailing) {
        self.label = label
        self.samples = samples
        self.progress = progress
        self.isPlaying = isPlaying
        self.duration = duration
        self.tint = tint
        self.size = size
        self.phase = phase
        self.clock = clock
        self.onToggle = onToggle
        self.onScrub = onScrub
        self.onScrubbingChange = onScrubbingChange
        self.trailing = trailing()
    }

    public var body: some View {
        let shown = MeeshyWaveBarsLaw.displayedProgress(progress: progress, scrubFraction: scrubFraction)
        let recipe = MeeshyWavePlayerRecipe.resolve(size: size, phase: phase, isPlaying: isPlaying, progress: shown,
                                                    isScrubbing: scrubFraction != nil, isEnabled: isEnabled,
                                                    reduceMotion: reduceMotion)
        HStack(spacing: recipe.gap) {
            disc(recipe: recipe)
            wave(recipe: recipe, shown: shown)
            Text(verbatim: MeeshyWavePlayerRecipe.clockText(duration: duration, progress: shown, isPlaying: isPlaying, clock: clock))
                .meeshyScaledFont(MeeshyFont.smallSize, design: .monospaced)
                .monospacedDigit()
                .lineLimit(1)
                .frame(minWidth: 34, alignment: .trailing)
                .foregroundStyle(Color.secondary)
                .accessibilityHidden(true)
            trailing
        }
        .frame(minHeight: recipe.rowHeight)
        .opacity(recipe.opacity)
    }

    private var accent: Color { tint ?? .accentColor }
    private var glassTone: MeeshyGlassTone { colorScheme == .dark ? .deep : .onLight }

    // MARK: - Disque

    @ViewBuilder
    private func disc(recipe: MeeshyWavePlayerRecipe) -> some View {
        let diameter = CGFloat(recipe.discDiameter)
        if recipe.showsRing {
            MeeshyProgressRing(progress: nil, label: MeeshyWavePlayerWords.stateWord(.buffering, locale: locale),
                               diameter: diameter, tint: .solid(accent), showsPercent: false,
                               tone: glassTone)
        } else {
            Button(action: onToggle) {
                Image(systemName: recipe.glyph)
                    .font(MeeshyWavePlayerRecipe.glyphFont(size: recipe.glyphSize))
                    .foregroundStyle(MeeshyColors.indigo950)
                    .frame(width: diameter, height: diameter)
                    .background(Circle().fill(accent))
            }
            .buttonStyle(MeeshyWaveDiscStyle(pressedScale: recipe.pressedScale, reduceMotion: reduceMotion))
            .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
            .disabled(!recipe.acceptsToggle)
            .accessibilityLabel(MeeshyWavePlayerWords.toggleLabel(label: label, isPlaying: isPlaying, locale: locale))
            .accessibilityValue(MeeshyWavePlayerWords.stateWord(recipe.phaseState, locale: locale) ?? "")
        }
    }

    // MARK: - Onde

    private func wave(recipe: MeeshyWavePlayerRecipe, shown: Double) -> some View {
        MeeshyWaveBars(samples: samples, progress: shown, isLive: recipe.barsAreLive, tint: accent, height: recipe.waveHeight)
            .scaleEffect(y: recipe.phaseState == .scrubbing ? recipe.scrubScale : 1)
            .frame(maxWidth: .infinity)
            .frame(height: recipe.scrubZoneHeight)
            .contentShape(Rectangle())
            .overlay(GeometryReader { proxy in
                Color.clear.contentShape(Rectangle())
                    .highPriorityGesture(scrubGesture(width: Double(proxy.size.width), recipe: recipe))
                    .allowsHitTesting(onScrub != nil && recipe.acceptsScrub)
            })
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
            .accessibilityValue(MeeshyWavePlayerWords.position(duration: duration, progress: shown, locale: locale))
            .modifier(MeeshyWaveAdjustable(isActive: onScrub != nil && recipe.acceptsScrub, progress: progress, onScrub: onScrub))
    }

    private func scrubGesture(width: Double, recipe: MeeshyWavePlayerRecipe) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                guard onScrub != nil, recipe.acceptsScrub else { return }
                if scrubFraction == nil { onScrubbingChange?(true) }
                scrubFraction = MeeshyWaveBarsLaw.scrubFraction(locationX: Double(value.location.x), width: width,
                                                                isRightToLeft: layoutDirection == .rightToLeft)
            }
            .onEnded { value in
                guard let onScrub, recipe.acceptsScrub else { return }
                onScrub(MeeshyWaveBarsLaw.scrubFraction(locationX: Double(value.location.x), width: width,
                                                        isRightToLeft: layoutDirection == .rightToLeft))
                scrubFraction = nil
                onScrubbingChange?(false)
            }
    }
}

public extension MeeshyWavePlayer where Trailing == EmptyView {
    init(label: String,
         samples: [Float] = [],
         progress: Double,
         isPlaying: Bool,
         duration: Double,
         tint: Color? = nil,
         size: MeeshyWavePlayerSize = .row,
         phase: MeeshyWavePlayerPhase = .ready,
         clock: MeeshyWavePlayerClock = .remaining,
         onToggle: @escaping () -> Void,
         onScrub: ((Double) -> Void)? = nil,
         onScrubbingChange: ((Bool) -> Void)? = nil) {
        self.init(label: label, samples: samples, progress: progress, isPlaying: isPlaying, duration: duration, tint: tint,
                  size: size, phase: phase, clock: clock, onToggle: onToggle, onScrub: onScrub,
                  onScrubbingChange: onScrubbingChange, trailing: { EmptyView() })
    }
}

/// Le disque s'enfonce à 0,94 dès le doigt posé ; rien d'autre ne bouge.
struct MeeshyWaveDiscStyle: ButtonStyle {
    let pressedScale: Double
    let reduceMotion: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? pressedScale : 1)
            .animation(MeeshyMotion.animation(.morph, reduce: reduceMotion), value: configuration.isPressed)
    }
}

/// L'onde se règle au clavier et au lecteur d'écran comme au doigt : par pas de 5 %.
struct MeeshyWaveAdjustable: ViewModifier {
    let isActive: Bool
    let progress: Double
    let onScrub: ((Double) -> Void)?

    func body(content: Content) -> some View {
        if isActive {
            content.accessibilityAdjustableAction { direction in
                let step = direction == .increment ? 0.05 : -0.05
                onScrub?(MeeshyWaveBarsLaw.normalized(progress + step))
            }
        } else {
            content
        }
    }
}
