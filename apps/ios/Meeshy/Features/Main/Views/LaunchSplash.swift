import SwiftUI
import os

/// **Le splash se pose UNE fois, le temps que l'app démarre — et rien du
/// démarrage ne peut le retenir** (#6744, arbitrage porteur de #6223 : « Dès que
/// prêt »).
///
/// ## Le défaut qu'il ferme
///
/// Le splash tombait à la DERNIÈRE ligne de la `.task` de démarrage, après une
/// chaîne d'attentes en série. Son plafond — « 5 s, on dismiss quand même pour ne
/// JAMAIS bloquer l'utilisateur » — vivait À L'INTÉRIEUR de cette chaîne : il ne
/// bornait que l'attente qui le suivait, celle des sockets. Mesuré sur appareil,
/// deux arrêts forcés, thread principal au repos, splash à l'écran : il suffisait
/// qu'une autre attente ne rende pas la main.
///
/// > **Un plafond posé dans la chaîne qu'il doit borner ne borne que ce qui le
/// > suit.** Celui-ci vit dans SA tâche, montée par le splash lui-même.
///
/// ## Deux sorties, la première gagne
///
/// - `markReady()` — le démarrage a résolu la session et lu la liste en cache ;
///   le rideau tombe dès que le plancher est passé, jamais plus tard.
/// - `holdUntilCeiling()` — au plafond, le rideau tombe quoi que fasse le
///   démarrage, et l'étape où il se trouve part au journal : la prochaine
///   occurrence nomme sa coupable au lieu de la laisser deviner.
///
/// ## #4363 : on ne quitte l'arbre qu'en passant par le fondu
///
/// Pendant un retrait, SwiftUI rend la DERNIÈRE version évaluée de la vue. Le
/// splash ne quitte donc l'arbre que depuis `.fading` — où `fullScreenGate` a déjà
/// coupé touches et VoiceOver — et sans transition : il n'y a rien à interrompre.
/// Ses orbes perpétuelles s'arrêtent avec lui, au lieu de tourner derrière l'app
/// pendant toute la session.
nonisolated enum LaunchSplashTiming {
    /// Assez pour que le logo se pose ; pas assez pour qu'on l'attende.
    static let floor: Duration = .milliseconds(400)
    static let ceiling: Duration = .seconds(2)
    static let fade: Duration = .milliseconds(300)

    static func remainingFloor(elapsed: Duration) -> Duration {
        max(.zero, floor - elapsed)
    }

    static func remainingCeiling(elapsed: Duration) -> Duration {
        max(.zero, ceiling - elapsed)
    }
}

/// Les étapes du démarrage qui attendent un autre acteur, dans l'ordre de la
/// `.task` : celle que le journal du plafond nomme est celle qui n'a pas rendu.
nonisolated enum LaunchBootStep: String, Sendable, Equatable {
    case cache
    case outbox
    case settingsQueue
    case session
    case conversationList
}

@MainActor
final class LaunchSplashController: ObservableObject {
    nonisolated deinit {}

    enum Phase: Equatable {
        case covering
        case fading
        case gone
    }

    enum Reveal: Equatable {
        case ready
        case ceiling(pendingStep: LaunchBootStep?)
    }

    @Published private(set) var phase: Phase = .covering
    private(set) var reveal: Reveal?
    private var pendingStep: LaunchBootStep?

    private let elapsed: () -> Duration
    private let sleep: (Duration) async throws -> Void

    private static let log = Logger(subsystem: "me.meeshy.app", category: "launch")

    init(elapsed: (() -> Duration)? = nil,
         sleep: ((Duration) async throws -> Void)? = nil) {
        let start = ContinuousClock.now
        self.elapsed = elapsed ?? { start.duration(to: .now) }
        self.sleep = sleep ?? { try await Task.sleep(for: $0) }
    }

    func reach(_ step: LaunchBootStep) {
        pendingStep = step
    }

    func markReady() async {
        pendingStep = nil
        guard phase == .covering else { return }
        let wait = LaunchSplashTiming.remainingFloor(elapsed: elapsed())
        if wait > .zero { try? await sleep(wait) }
        await lift(because: .ready)
    }

    func holdUntilCeiling() async {
        let wait = LaunchSplashTiming.remainingCeiling(elapsed: elapsed())
        do {
            if wait > .zero { try await sleep(wait) }
        } catch {
            return
        }
        await lift(because: .ceiling(pendingStep: pendingStep))
    }

    private func lift(because reason: Reveal) async {
        guard phase == .covering else { return }
        reveal = reason
        journal(reason)
        withAnimation(.easeOut(duration: LaunchSplashTiming.fade / .seconds(1))) {
            phase = .fading
        }
        try? await sleep(LaunchSplashTiming.fade)
        var withoutTransition = Transaction()
        withoutTransition.disablesAnimations = true
        withTransaction(withoutTransition) {
            phase = .gone
        }
    }

    private func journal(_ reason: Reveal) {
        let milliseconds = Int(elapsed() / .milliseconds(1))
        switch reason {
        case .ready:
            Self.log.info("splash lifted: boot ready after \(milliseconds, privacy: .public) ms")
        case .ceiling(let step):
            Self.log.error("splash lifted by its CEILING after \(milliseconds, privacy: .public) ms — boot still at step \(step?.rawValue ?? "none", privacy: .public)")
        }
    }
}
