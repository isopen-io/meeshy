import SwiftUI
import MeeshyUI

/// L'apparence d'un bouton talkie (#17093) : enfoncé dès que le doigt se pose, sans attendre le réseau ; vivant tant
/// que la voix part ; au repos sinon.
nonisolated enum TalkieHoldLook: Equatable {
    case idle
    case pressed
    case live

    /// En deçà, l'appui était un toucher : on rappelle qu'il faut maintenir.
    static let quickTapLimit: TimeInterval = 0.3

    static func resolve(pressed: Bool, phase: TalkieSender.Phase) -> TalkieHoldLook {
        if case .talking = phase { return .live }
        if case .recordingCopy = phase { return .live }
        return pressed ? .pressed : .idle
    }

    static func isQuickTap(heldFor duration: TimeInterval) -> Bool {
        duration < quickTapLimit
    }
}

/// Maintenir pour parler, partagé par la fiche et l'en-tête : le doigt posé enfonce et vibre aussitôt, la voix qui
/// part vibre une seconde fois, relâcher ou quitter l'écran termine ; un simple toucher rappelle le geste.
struct TalkieHoldModifier: ViewModifier {
    @ObservedObject var sender: TalkieSender
    let userId: String
    @Binding var pressed: Bool
    @State private var pressedAt: Date?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .scaleEffect(pressed && !reduceMotion ? 0.88 : 1)
            .animation(.spring(response: 0.16, dampingFraction: 0.6), value: pressed)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in begin() }
                    .onEnded { _ in end() }
            )
            .onDisappear { end() }
            .adaptiveOnChange(of: sender.phase) { old, new in
                guard case .talking = new, old != new else { return }
                HapticFeedback.rigid()
            }
    }

    private func begin() {
        guard !pressed else { return }
        pressed = true
        pressedAt = Date()
        HapticFeedback.medium()
        sender.press(toUserId: userId)
        Task { await TalkiePushToTalkChannel.shared.activate() }
    }

    private func end() {
        guard pressed else { return }
        pressed = false
        let quick = pressedAt.map { TalkieHoldLook.isQuickTap(heldFor: Date().timeIntervalSince($0)) } ?? false
        pressedAt = nil
        Task { await sender.release() }
        guard quick else { return }
        FeedbackToastManager.shared.showNotice(ProfileTalkieWording.hold)
    }
}
