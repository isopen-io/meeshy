import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La prise se SENT au moment où elle part** (#16482, porteur :
/// « lorsqu'on prend la photo il faut une animation sur le cadre, un flash, ou
/// sur le bouton de prise de photo »).
///
/// Deux retours, deux horloges, comme l'appareil photo d'Apple :
/// - le BOUTON se contracte au toucher (`CameraModel.shutterPresses`),
///   avant même que l'objectif ne prenne — le doigt sait qu'il a été entendu ;
/// - le CADRE blanchit un instant quand l'obturateur part
///   (`photoOutput(_:willCapturePhotoFor:)` → `CameraModel.shutterCount`),
///   jamais à la fin du traitement, qui arrive des centaines de ms plus tard.
///
/// « Réduire les animations » : le bouton ne bouge pas, il s'atténue ; le
/// flash reste, plus doux — un retour lumineux n'est pas un mouvement.
nonisolated enum ComposerShutterFeedback {

    /// La durée totale du flash du cadre.
    static let flashDuration: TimeInterval = 0.12

    static func flashPeak(reduceMotion: Bool) -> Double {
        reduceMotion ? 0.35 : 0.85
    }

    static func pressedScale(reduceMotion: Bool) -> CGFloat {
        reduceMotion ? 1 : 0.86
    }

    static func pressedOpacity(reduceMotion: Bool) -> Double {
        reduceMotion ? 0.6 : 1
    }

    /// La phrase du geste n'apprend qu'une fois : après la première prise, le
    /// viseur se tait (la vue épurée de l'état de l'art). VoiceOver garde ses
    /// actions nommées.
    static func showsHint(base: Bool, hasTakenAPhoto: Bool) -> Bool {
        base && !hasTakenAPhoto
    }

    static let hintSeenKey = "composer.capture.hintSeen"
}

/// Le flash du cadre, posé SUR l'image de la prise — à chaque tic de l'obturateur.
struct ComposerShutterFlash: View {
    let tick: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var opacity: Double = 0

    var body: some View {
        Color.white
            .opacity(opacity)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .adaptiveOnChange(of: tick) { _, _ in flash() }
    }

    /// Monte en un quart de la durée, redescend sur le reste.
    private func flash() {
        let montee = ComposerShutterFeedback.flashDuration / 4
        withAnimation(.linear(duration: montee)) {
            opacity = ComposerShutterFeedback.flashPeak(reduceMotion: reduceMotion)
        }
        Task { @MainActor in
            _ = await cancellableSleep(for: .milliseconds(Int(montee * 1000)))
            withAnimation(.easeOut(duration: ComposerShutterFeedback.flashDuration - montee)) { opacity = 0 }
        }
    }
}

/// **Le déclencheur : un anneau blanc, vide** (A8, #17109). En filmant (A9),
/// l'anneau devient une piste grise que remplit l'arc rouge du maximum du
/// format, et le centre porte le carré d'arrêt rouge.
struct ComposerShutterRing: View {
    let recording: Bool
    /// La part du maximum déjà prise, `0...1`.
    let progress: Double

    static let diameter: CGFloat = 76
    static let ringWidth: CGFloat = 5
    static let stopSide: CGFloat = 28

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Circle().fill(Color.black.opacity(0.25))
            if recording {
                Circle().stroke(Color.white.opacity(0.35), lineWidth: Self.ringWidth)
                Circle()
                    .trim(from: 0, to: max(0.001, progress))
                    .stroke(MeeshyColors.error, style: StrokeStyle(lineWidth: Self.ringWidth, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                    .fill(MeeshyColors.error)
                    .frame(width: Self.stopSide, height: Self.stopSide)
                    .transition(.scale.combined(with: .opacity))
            } else {
                Circle().stroke(Color.white, lineWidth: Self.ringWidth)
            }
        }
        .frame(width: Self.diameter, height: Self.diameter)
        .animation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.8), value: recording)
        .animation(reduceMotion ? nil : .linear(duration: 0.2), value: progress)
        .accessibilityHidden(true)
    }
}

/// Le déclencheur se contracte puis revient, à chaque toucher qui photographie.
struct ComposerShutterPulse: ViewModifier {
    let tick: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pressed = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(pressed ? ComposerShutterFeedback.pressedScale(reduceMotion: reduceMotion) : 1)
            .opacity(pressed ? ComposerShutterFeedback.pressedOpacity(reduceMotion: reduceMotion) : 1)
            .adaptiveOnChange(of: tick) { _, _ in pulse() }
    }

    private func pulse() {
        withAnimation(.easeOut(duration: 0.07)) { pressed = true }
        Task { @MainActor in
            _ = await cancellableSleep(for: .milliseconds(70))
            withAnimation(.spring(response: 0.28, dampingFraction: 0.6)) { pressed = false }
        }
    }
}

/// **La grammaire haptique de la prise** (CAM-7) : chaque événement a SON retour,
/// au lieu d'un même tic léger partout. La table est pure ; `play` la joue.
nonisolated enum ComposerCaptureHaptic: Equatable {
    case photoTaken
    case recordingStarted
    case recordingEnded
    case locked
    case zoomStep
    case timerTick(secondsLeft: Int)

    enum Feedback: Equatable { case rigid, medium, doubleLightTick, success, selection, none }

    /// Le retardateur ne tique que sur ses trois dernières secondes.
    static let timerTickWindow = 3
    static let doubleTickGap: Duration = .milliseconds(90)

    var feedback: Feedback {
        switch self {
        case .photoTaken: .rigid
        case .recordingStarted: .medium
        case .recordingEnded: .doubleLightTick
        case .locked: .success
        case .zoomStep: .selection
        case .timerTick(let reste): (1...Self.timerTickWindow).contains(reste) ? .selection : .none
        }
    }

    @MainActor
    static func play(_ event: ComposerCaptureHaptic) {
        switch event.feedback {
        case .rigid: HapticFeedback.rigid()
        case .medium: HapticFeedback.medium()
        case .doubleLightTick:
            HapticFeedback.light()
            Task { @MainActor in
                guard await cancellableSleep(for: doubleTickGap) else { return }
                HapticFeedback.light()
            }
        case .success: HapticFeedback.success()
        case .selection: UISelectionFeedbackGenerator().selectionChanged()
        case .none: break
        }
    }
}
