import SwiftUI
import MeeshyUI
import MeeshySDK

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

/// Maintenir pour parler, partagé par la fiche, l'en-tête et le bandeau : le doigt posé enfonce et vibre aussitôt, la
/// voix qui part vibre une seconde fois, relâcher ou quitter l'écran termine ; un simple toucher rappelle le geste. Une
/// voix partie vibre « réussi » et sonne doucement (coupé par le mode silencieux) ; un refus vibre sans bruit (#19732).
struct TalkieHoldModifier: ViewModifier {
    @ObservedObject var sender: TalkieSender
    let userId: String
    @Binding var pressed: Bool
    @State private var pressedAt: Date?
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    func body(content: Content) -> some View {
        content
            .scaleEffect(pressed && !reduceMotion ? 0.88 : 1)
            .animation(reduceMotion ? nil : .spring(response: 0.16, dampingFraction: 0.6), value: pressed)
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
            .adaptiveOnChange(of: sender.lastSettled) { _, settled in
                guard let settled else { return }
                TalkieCuePlayer.play(TalkieCueLaw.afterRelease(TalkieAftermath.of(settled.outcome)))
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

/// Un talkie depuis un avatar posé parmi d'autres gestes (#19885, épingle de la carte des cercles) : un toucher garde
/// son effet et la carte se déplace toujours ; seul un appui LONG ouvre la voix, qui part tant que le doigt reste posé.
nonisolated enum TalkieLongHold {
    /// L'attente avant que la voix s'ouvre : au-delà d'un toucher, en deçà d'une hésitation.
    static let minimumDuration: TimeInterval = 0.35
    /// Le relâchement qui termine un appui long arrive à l'hôte dans cette fenêtre : il ne compte pas comme un toucher.
    static let releaseWindow: TimeInterval = 0.6

    /// `heldAt` : la fin du dernier appui long, ou `.distantFuture` pendant qu'il dure.
    static func justEnded(at heldAt: Date?, now: Date) -> Bool {
        guard let heldAt else { return false }
        return now.timeIntervalSince(heldAt) < releaseWindow
    }

    /// Le talkie ne se propose qu'à partir de Proche (`TalkieOfferRule`) : sous ce cercle, l'appui long ne fait rien.
    static func offers(circle: RelationLevel?) -> Bool {
        guard let circle else { return false }
        return circle >= .close
    }
}

struct TalkieLongHoldModifier: ViewModifier {
    @ObservedObject var sender: TalkieSender
    let userId: String
    let displayName: String
    /// Prévient l'hôte qu'un appui long commence (`true`) puis finit (`false`) : son `Button`, qui reçoit aussi ce
    /// relâchement, l'ignore (#19885). Un appui long PRIORITAIRE bloquait son toucher simple.
    var onHold: ((Bool) -> Void)? = nil
    @State private var pressed = false
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    func body(content: Content) -> some View {
        content
            .scaleEffect(pressed && !reduceMotion ? 1.12 : 1)
            .animation(reduceMotion ? nil : MeeshyAnimation.springFast, value: pressed)
            .simultaneousGesture(hold)
            .onDisappear { end() }
            .accessibilityAction(named: Text(ProfileTalkieWording.holdA11y(name: displayName))) {
                FeedbackToastManager.shared.showNotice(ProfileTalkieWording.hold)
            }
    }

    private var hold: some Gesture {
        LongPressGesture(minimumDuration: TalkieLongHold.minimumDuration)
            .sequenced(before: DragGesture(minimumDistance: 0))
            .onChanged { value in
                guard case .second(true, _) = value else { return }
                begin()
            }
            .onEnded { _ in end() }
    }

    private func begin() {
        guard !pressed else { return }
        pressed = true
        onHold?(true)
        HapticFeedback.medium()
        sender.press(toUserId: userId)
        Task { await TalkiePushToTalkChannel.shared.activate() }
    }

    private func end() {
        guard pressed else { return }
        pressed = false
        onHold?(false)
        Task { await sender.release() }
    }
}
