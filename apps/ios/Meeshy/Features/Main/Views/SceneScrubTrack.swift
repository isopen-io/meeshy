import SwiftUI
import MeeshyUI

// =============================================================================
//  Une scène se parcourt au doigt (#7878)
// =============================================================================
//
//  Demande porteur du 2026-09-25 : « pouvoir reculer ou avancer via un curseur
//  sur la barre de progression qui s'agrandit au toucher, et actualisation des
//  frames de la scène en temps réel ». Elle renverse la décision « la scène se
//  rejoue, elle ne se parcourt pas » que portait la barre du réel composé.
//
//  Deux surfaces, UN geste : le réel à scène et la story. Le geste est celui du
//  réel VIDÉO (`ReelScrubBar`) — glissé sans distance minimale, prioritaire sur
//  le pager, la poignée suit le doigt — et la scène se redessine à l'instant
//  pointé par le pont du SDK (`ScenePlaybackScrubber`), qui pousse directement
//  dans le canvas : aucun body de page n'est ré-évalué à la cadence du doigt,
//  l'état du glissé vit dans cette seule barre.

/// La logique du geste, pure : ce qu'un doigt pointe, ce que la barre montre,
/// ce qui est remis à la lecture au relâcher.
struct SceneScrubState: Equatable {
    enum Phase: Equatable {
        case began
        case moved
    }

    /// Le pas d'un geste d'accessibilité (balayage haut / bas de VoiceOver).
    static let accessibilityStep = 0.1

    /// La fraction pointée par le doigt, `nil` au repos.
    private(set) var fraction: Double?

    var isScrubbing: Bool { fraction != nil }

    static func fraction(locationX: CGFloat, width: CGFloat) -> Double {
        guard width > 0, locationX.isFinite else { return 0 }
        return Double(min(max(locationX / width, 0), 1))
    }

    static func seconds(fraction: Double, duration: Double) -> Double {
        guard duration > 0, fraction.isFinite else { return 0 }
        return min(max(fraction, 0), 1) * duration
    }

    static func adjusted(_ fraction: Double, direction: AccessibilityAdjustmentDirection) -> Double {
        switch direction {
        case .increment: return min(1, fraction + accessibilityStep)
        case .decrement: return max(0, fraction - accessibilityStep)
        @unknown default: return fraction
        }
    }

    mutating func track(locationX: CGFloat, width: CGFloat) -> Phase {
        let phase: Phase = isScrubbing ? .moved : .began
        fraction = Self.fraction(locationX: locationX, width: width)
        return phase
    }

    /// Relâcher : rend la fraction choisie et remet TOUJOURS la barre au repos
    /// — un `isScrubbing` resté levé figerait la barre sur une position morte.
    mutating func finish() -> Double? {
        defer { fraction = nil }
        return fraction
    }

    func displayed(playback: Double) -> Double {
        fraction ?? playback
    }
}

/// La barre qu'on parcourt : fine au repos, elle s'épaissit au toucher et
/// montre une poignée ronde à la position du doigt.
///
/// `showsTrackAtRest` : le réel dessine sa barre en permanence ; la story, elle,
/// garde ses segments au repos et ne montre la piste que pendant le glissé
/// (`StoryProgressBarsView`). La zone tactile déborde la barre de
/// `touchInsets` sans changer la mise en page de l'hôte : 44 pt de haut au total.
struct SceneScrubTrack: View {
    let playback: Double
    let fill: AnyShapeStyle
    let scrubber: ScenePlaybackScrubber
    var restThickness: CGFloat = 4
    var showsTrackAtRest = true
    var touchInsets = EdgeInsets(top: 14, leading: 0, bottom: 26, trailing: 0)
    var onScrubbingChanged: (Bool) -> Void = { _ in }
    var onCommit: (Double) -> Void = { _ in }

    @State private var state = SceneScrubState()
    /// Levé tant que le doigt est posé. SwiftUI ne délivre pas `onEnded` quand
    /// un recognizer concurrent emporte la séquence ; un `@GestureState`, lui,
    /// retombe TOUJOURS — c'est ce retour qui solde un glissé orphelin, sans
    /// quoi la scène resterait en pause sous une barre figée.
    @GestureState private var isTouching = false

    static let activeThickness: CGFloat = 11
    static let thumbSize: CGFloat = 16

    private var shown: Double { state.displayed(playback: playback) }

    var body: some View {
        GeometryReader { geo in
            track(width: geo.size.width)
                .frame(width: geo.size.width, height: geo.size.height)
                .padding(touchInsets)
                .contentShape(Rectangle())
                .highPriorityGesture(drag(width: geo.size.width))
                .padding(EdgeInsets(top: -touchInsets.top, leading: -touchInsets.leading,
                                    bottom: -touchInsets.bottom, trailing: -touchInsets.trailing))
        }
        .frame(height: restThickness)
        .animation(.spring(response: 0.25, dampingFraction: 0.75), value: state.isScrubbing)
        .adaptiveOnChange(of: isTouching) { _, touching in
            guard !touching else { return }
            commit()
        }
    }

    @ViewBuilder
    private func track(width: CGFloat) -> some View {
        let thickness = state.isScrubbing ? Self.activeThickness : restThickness
        let filled = width * CGFloat(shown)
        ZStack(alignment: .leading) {
            Capsule().fill(Color.white.opacity(0.3))
                .frame(height: thickness)
            Capsule().fill(fill)
                .frame(width: max(0, filled), height: thickness)
            Circle().fill(Color.white)
                .frame(width: Self.thumbSize, height: Self.thumbSize)
                .shadow(color: .black.opacity(0.35), radius: 3, y: 1)
                .offset(x: min(max(filled - Self.thumbSize / 2, 0), max(0, width - Self.thumbSize)))
                .opacity(state.isScrubbing ? 1 : 0)
                .scaleEffect(state.isScrubbing ? 1 : 0.4)
        }
        .opacity(showsTrackAtRest || state.isScrubbing ? 1 : 0)
    }

    private func drag(width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .updating($isTouching) { _, touching, _ in touching = true }
            .onChanged { value in
                let phase = state.track(locationX: value.location.x, width: width)
                if phase == .began {
                    HapticFeedback.light()
                    onScrubbingChanged(true)
                    scrubber.begin()
                }
                scrubber.scrub(toFraction: state.fraction ?? 0)
            }
            .onEnded { _ in commit() }
    }

    /// Relâcher : la lecture est calée AVANT que la scène reprenne, puis
    /// l'hôte lève sa pause. Idempotent — le relâcher et la retombée du
    /// `@GestureState` peuvent tous deux y passer.
    private func commit() {
        guard let committed = state.finish() else { return }
        onCommit(committed)
        scrubber.end(atFraction: committed)
        onScrubbingChanged(false)
    }
}

extension View {
    /// La barre d'une scène se règle aussi sans le doigt : VoiceOver avance ou
    /// recule de 10 %, et la scène reprend de là.
    func sceneScrubAccessibility(progress: Double,
                                 scrubber: ScenePlaybackScrubber,
                                 onCommit: @escaping (Double) -> Void) -> some View {
        accessibilityAdjustableAction { direction in
            let target = SceneScrubState.adjusted(progress, direction: direction)
            scrubber.begin()
            onCommit(target)
            scrubber.end(atFraction: target)
        }
    }
}
