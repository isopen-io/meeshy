import SwiftUI
import MeeshySDK

/// **La prise se SENT au moment où elle part** (#16482, porteur 2026-11-06 :
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
